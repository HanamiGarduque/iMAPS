<?php

namespace App\Services;

use App\Models\ZoningApplication;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\RichText\RichText;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use RuntimeException;

/**
 * Generates permits from the office's Excel workbook so the printed layout is
 * exactly the one staff already use. See config/permits.php.
 *
 *   1. load the workbook, take the sheet of the requested permit
 *   2. apply the configured cell overrides, freeze every formula to its value
 *   3. replace every ${TAG} with the application data + modal input
 *   4. drop every other sheet, set paper size / print area
 *   5. convert to PDF (LibreOffice, Microsoft Excel or dompdf — see PermitPdfConverter)
 */
class PermitExcelService
{
    private const TAG_PATTERN = '/(\$?)\{\s*([A-Za-z0-9_ ]+?)\s*\}/';
    private const CHECK = '√';

    public function __construct(private PermitPdfConverter $pdf)
    {
    }

    /** Which converter produced the last PDF (libreoffice | excel | dompdf). */
    public function lastPdfDriver(): ?string
    {
        return $this->pdf->lastDriver;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────

    public function documents(): array
    {
        return collect(config('permits.documents'))
            ->map(fn ($d, $type) => ['type' => $type, 'label' => $d['label'], 'paper' => $d['paper']])
            ->values()
            ->all();
    }

    /**
     * Everything the Generate Permit modal needs for one permit type:
     * the fields used by that sheet (with defaults) and its dropdown cells.
     */
    public function schema(ZoningApplication $application, string $type): array
    {
        $doc = $this->document($type);
        $meta = $this->templateMeta();
        $sheetMeta = $meta['sheets'][$doc['sheet']] ?? ['tags' => [], 'dropdowns' => []];
        $defaults = $this->defaults($application);

        // Tags used by this sheet (cells + overrides), mapped to canonical names
        $used = collect($sheetMeta['tags'])
            ->merge(collect($doc['cells'])->flatMap(fn ($tpl) => $this->tagsIn($tpl)))
            ->map(fn ($t) => $this->canonical($t))
            ->unique();

        // Some tags are derived from editable fields — expose the source field instead
        $sources = [
            'YEAR_TODAY' => 'DATE_TODAY', 'MONTH_TODAY' => 'DATE_TODAY', 'DAY_TODAY' => 'DATE_TODAY',
            'GIVEN_DATE' => 'DATE_ISSUED',
            'ROL_OWNER_MARK' => 'RIGHT_OVER_LAND', 'ROL_LESSEE_MARK' => 'RIGHT_OVER_LAND', 'ROL_OTHERS_MARK' => 'RIGHT_OVER_LAND',
        ];
        $used = $used->map(fn ($t) => $sources[$t] ?? $t)->unique();

        $fields = [];
        foreach (config('permits.fields') as $key => $def) {
            if (!$used->contains($key)) {
                continue;
            }
            $type_ = $def['type'] ?? 'text';
            $field = [
                'key'     => $key,
                'label'   => $def['label'],
                'group'   => $def['group'],
                'type'    => $type_,
                'default' => $defaults[$key] ?? '',
                'readonly' => $def['readonly'] ?? false,
            ];
            if (isset($def['options'])) {
                $field['options'] = is_array($def['options'])
                    ? $def['options']
                    : ($meta['ranges'][$def['options']] ?? []);
            }
            if ($type_ === 'allowed_use') {
                $field['sections'] = $meta['allowed_uses'];
                $field['default_section'] = $this->guessAllowedUseSection($meta['allowed_uses'], $defaults['ZONING_CLASSIFICATION'] ?? '');
            }
            $fields[] = $field;
        }

        // Unbound dropdown cells in the sheet (checklists etc.)
        $bound = array_keys($doc['bind'] ?? []);
        $dropdowns = collect($sheetMeta['dropdowns'])
            ->reject(fn ($d) => in_array($d['cell'], $bound, true) || isset($doc['cells'][$d['cell']]))
            ->values()
            ->all();

        return [
            'type'      => $type,
            'label'     => $doc['label'],
            'paper'     => $doc['paper'],
            'fields'    => $fields,
            'dropdowns' => $dropdowns,
        ];
    }

    /**
     * Fill the permit and return the absolute path of the generated file.
     *
     * @param array $input  ['fields' => [TAG => value], 'cells' => [A32 => value]]
     */
    public function generate(ZoningApplication $application, string $type, array $input = [], string $format = 'pdf'): string
    {
        $doc = $this->document($type);
        $values = $this->values($application, $input['fields'] ?? []);
        $cellInput = $input['cells'] ?? [];

        $spreadsheet = $this->loadTemplate();
        $sheet = $spreadsheet->getSheetByName($doc['sheet'])
            ?? throw new RuntimeException("Sheet \"{$doc['sheet']}\" was not found in the permit template.");

        $this->fillSheet($sheet, $doc, $values, $cellInput);
        $this->isolateSheet($spreadsheet, $sheet);
        $this->applyPageSetup($sheet, $doc);

        $dir = storage_path('app/generated_permits');
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $base = sprintf(
            '%s_%s_%s',
            Str::slug($doc['label'], '_'),
            preg_replace('/[^A-Za-z0-9_\-]/', '_', (string) $application->reference_number),
            Str::random(6)
        );
        $xlsxPath = "{$dir}/{$base}.xlsx";

        IOFactory::createWriter($spreadsheet, 'Xlsx')->save($xlsxPath);
        $spreadsheet->disconnectWorksheets();

        if ($format === 'xlsx') {
            return $xlsxPath;
        }

        try {
            return $this->convertToPdf($xlsxPath, $dir);
        } finally {
            @unlink($xlsxPath);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Values
    // ─────────────────────────────────────────────────────────────────────

    /** Default value of every field, straight from the application record. */
    public function defaults(ZoningApplication $application): array
    {
        $parcels = $application->parcels ?? collect();
        $first = $parcels->first();
        $up = fn ($v) => mb_strtoupper(trim((string) $v));
        $join = fn (string $col) => $parcels->pluck($col)->filter()->unique()->implode(', ');

        $lotArea = (float) $parcels->sum('lot_area_sqm');
        $barangay = $up($application->barangay);
        $lotBarangay = $up($first?->barangay ?: $application->barangay);
        $lotStreet = $this->street($up($first?->location_address ?: $application->street_address), $lotBarangay);

        $applicantBarangay = $up($application->applicant_barangay);
        $applicantStreet = $this->street($up($application->applicant_street), $applicantBarangay);
        $address = $applicantStreet || $applicantBarangay
            ? implode(', ', array_filter([$applicantStreet, $applicantBarangay ? "BRGY. {$applicantBarangay}" : null, 'ROSARIO, BATANGAS']))
            : implode(', ', array_filter([$this->street($up($first?->location_address), $barangay), $barangay ? "BRGY. {$barangay}" : null, 'ROSARIO, BATANGAS']));

        $taxDecs = $join('tax_dec_number');
        $arps = $join('arp_number');

        $officer = $up($application->encodedBy?->name ?? auth()->user()?->name ?? '');
        $landUse = $application->target_land_use_class ?: $application->land_use_class ?: $first?->land_use_class;
        $zoning = $this->matchZone((string) $landUse);
        $rol = $up($application->right_over_land ?: 'OWNER');

        $meta = $this->templateMeta();
        $zcAmount = (float) ($application->zoning_certificate_fee ?? 0);

        $count = max($parcels->count(), 1);

        return [
            'APPLICATION_NO'  => (string) $application->reference_number,
            // Same as the workbook formula: YEAR-0MONTH-0-INITIALS (e.g. 2026-010-0-JD)
            'ZE_NO'           => sprintf('%s-0%d-0-%s', now()->format('Y'), now()->month, $this->initials($officer)),
            'LC_DN'           => '',
            'ZC_DN'           => '',
            'DP_DN'           => '',
            'DATE_TODAY'      => now()->toDateString(),
            'DATE_ISSUED'     => now()->toDateString(),
            'BRGY_RESOLUTION' => 'N/A',
            'SB_RESOLUTION'   => $application->sb_ordinance_number ?: 'N/A',
            'DATE_APPROVED'   => 'N/A',

            'APPLICANT_NAME'      => $up($application->applicant_name),
            'STREET_APP'          => $applicantStreet,
            'BARANGAY_APP'        => $applicantBarangay,
            'ADDRESS'             => $address,
            'CONTACT_NUMBER'      => (string) $application->contact_number,
            'CORPORATION_NAME'    => $up($application->corporation_name) ?: 'N/A',
            'CORPORATION_ADDRESS' => $up(implode(' / ', array_filter([$application->corporation_address, $application->corporation_contact]))) ?: 'N/A',
            'PROJECT_NAME'        => $up(($application->business_name ?? $application->project_type_business_name ?? null) ?: $application->purpose),
            'PROJECT_TYPE'        => $up($application->purpose),
            'PROPOSED_USE'        => $up($application->purpose),
            'PROJECT_AREA'        => $this->num($application->area_to_develop ?: $lotArea),
            'BUILDING_AREA'       => $this->num($application->building_area),
            'SALEABLE_LOTS'       => $application->number_of_saleable_lots ? (string) $application->number_of_saleable_lots : 'N/A',

            'PARCEL_OWNER'      => $up($join('owner_name') ?: $application->applicant_name),
            'PARCEL_COUNT'      => $this->countWords($count),
            'LOT_NO'            => $join('lot_number') ?: 'N/A',
            'STREET_LOT'        => $lotStreet,
            'BARANGAY_LOT'      => $lotBarangay,
            'BARANGAY'          => $barangay,
            'PROJECT_LOCATION'  => implode(', ', array_filter([$lotStreet, $lotBarangay ? "BRGY. {$lotBarangay}" : null, 'ROSARIO, BATANGAS'])),
            'LOT_AREA'          => $this->num($lotArea ?: $application->area_to_develop),
            'TD_ARP'            => implode(' / ', array_filter([$taxDecs, $arps])) ?: 'N/A',
            'PROPERTY_INDEX_NO' => $join('property_index_number') ?: 'N/A',
            'RIGHT_OVER_LAND'   => str_contains($rol, 'OWN') ? 'OWNER' : (str_contains($rol, 'LESS') ? 'LESSEE' : 'OTHERS'),
            'BUILDING_SETBACK'  => '-',

            'EVALUATION_OF_FACTS'   => 'CONFORMING',
            'ZONING_CLASSIFICATION' => $zoning,
            'ZONING_REQUIREMENT'    => $zoning,
            'ALLOWABLE_USE'         => '',
            'CERTIFICATION_PURPOSE' => $this->firstMatching($meta['ranges']['LIST!K2:K5'] ?? [], (string) $application->application_type) ?: 'LOCATIONAL CLEARANCE',
            'REF_LOT_PLAN'          => true,
            'REF_SKETCH_PLAN'       => true,
            'REF_TITLE'             => true,
            'REF_OTHERS'            => false,

            'OR_NUMBER'       => (string) $application->or_number,
            'ASSESSMENT_FEE'  => $this->num($application->assessment_fee),
            'DEVELOPMENT_FEE' => $this->num($application->development_permit_fee),
            'ZC_AMOUNT'       => $zcAmount > 0 ? rtrim(rtrim(number_format($zcAmount, 2, '.', ''), '0'), '.') : '720',

            'PLANNING_OFFICER' => $officer,
            'PO_INITIALS'      => $this->initials($officer),
            'ADMIN'            => mb_strtoupper((string) config('permits.zoning_administrator')),
        ];
    }

    /** Defaults + modal input + derived tags, formatted for printing. */
    private function values(ZoningApplication $application, array $input): array
    {
        $values = $this->defaults($application);
        foreach ($input as $key => $value) {
            if (array_key_exists($key, $values)) {
                $values[$key] = is_bool($value) ? $value : (is_scalar($value) || $value === null ? trim((string) $value) : $values[$key]);
            }
        }

        $evalDate = $this->date($values['DATE_TODAY']);
        $issued = $this->date($values['DATE_ISSUED']);

        foreach (['REF_LOT_PLAN', 'REF_SKETCH_PLAN', 'REF_TITLE', 'REF_OTHERS'] as $k) {
            $values[$k] = filter_var($values[$k], FILTER_VALIDATE_BOOLEAN) ? self::CHECK : '';
        }

        $rol = $values['RIGHT_OVER_LAND'];
        $values += [
            'YEAR_TODAY'      => $evalDate->format('Y'),
            'MONTH_TODAY'     => $evalDate->format('m'),
            'DAY_TODAY'       => $evalDate->format('d'),
            'GIVEN_DATE'      => sprintf('Given this %s day of %s.', $issued->format('jS'), $issued->format('F Y')),
            'ROL_OWNER_MARK'  => $rol === 'OWNER' ? self::CHECK : '',
            'ROL_LESSEE_MARK' => $rol === 'LESSEE' ? self::CHECK : '',
            'ROL_OTHERS_MARK' => !in_array($rol, ['OWNER', 'LESSEE'], true) ? self::CHECK : '',
        ];
        $values['DATE_TODAY'] = $evalDate->format('F d, Y');
        $values['DATE_ISSUED'] = $issued->format('F d, Y');

        foreach (config('permits.aliases') as $alias => $target) {
            $values[$alias] = $values[$target] ?? '';
        }

        return $values;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Workbook manipulation
    // ─────────────────────────────────────────────────────────────────────

    private function fillSheet(Worksheet $sheet, array $doc, array $values, array $cellInput): void
    {
        $overrides = $doc['cells'] ?? [];
        $boundCells = array_keys($doc['bind'] ?? []);

        // Dropdown cells the user set in the modal (only real dropdown cells are accepted)
        $allowedDropdowns = collect($this->templateMeta()['sheets'][$doc['sheet']]['dropdowns'] ?? [])->keyBy('cell');

        foreach (array_unique(array_merge($sheet->getCoordinates(), array_keys($overrides))) as $coord) {
            $cell = $sheet->getCell($coord);

            if (isset($overrides[$coord])) {
                $this->writeString($cell, $this->replaceTags($overrides[$coord], $values));
                continue;
            }

            if (!in_array($coord, $boundCells, true) && isset($allowedDropdowns[$coord]) && array_key_exists($coord, $cellInput)) {
                $this->writeString($cell, (string) $cellInput[$coord]);
                continue;
            }

            $raw = $cell->getValue();

            if ($raw instanceof RichText) {
                $changed = false;
                foreach ($raw->getRichTextElements() as $el) {
                    $text = $el->getText();
                    if (preg_match(self::TAG_PATTERN, $text)) {
                        $el->setText($this->replaceTags($text, $values));
                        $changed = true;
                    }
                }
                if ($changed) {
                    $cell->setValue($raw);
                }
                continue;
            }

            if ($cell->isFormula()) {
                // Freeze: other sheets are about to be removed, so keep the last value
                $cached = $cell->getOldCalculatedValue();
                if (is_string($cached) && preg_match(self::TAG_PATTERN, $cached)) {
                    $this->writeString($cell, $this->replaceTags($cached, $values));
                } elseif (is_numeric($cached)) {
                    $cell->setValueExplicit($cached, DataType::TYPE_NUMERIC);
                } else {
                    $this->writeString($cell, (string) $cached);
                }
                continue;
            }

            if (is_string($raw) && preg_match(self::TAG_PATTERN, $raw)) {
                $this->writeString($cell, $this->replaceTags($raw, $values));
            }
        }

        // Dropdown lists point at the LIST sheet, which is removed
        foreach (array_keys($sheet->getDataValidationCollection()) as $range) {
            $sheet->setDataValidation($range, null);
        }
    }

    private function writeString(Cell $cell, string $value): void
    {
        $cell->setValueExplicit($value, DataType::TYPE_STRING);

        // Long names/addresses shrink to fit their (merged) box instead of being clipped
        $alignment = $cell->getStyle()->getAlignment();
        if ($cell->isInMergeRange() && !$alignment->getWrapText()) {
            $alignment->setShrinkToFit(true);
        }
    }

    private function replaceTags(string $text, array $values): string
    {
        $out = preg_replace_callback(self::TAG_PATTERN, function ($m) use ($values) {
            $key = $this->normalizeTag($m[2]);
            if (array_key_exists($key, $values)) {
                return (string) $values[$key];
            }
            // ${UNKNOWN} prints blank; plain {braces} that aren't tags stay as typed
            return $m[1] === '$' ? '' : $m[0];
        }, $text);

        // Tags were often typed with trailing spaces / line breaks
        $out = rtrim($out);

        // A missing number would otherwise print just the unit, e.g. " SQ.M"
        return preg_match('/^\s*SQ\.?\s*M\.?$/i', $out) ? '' : $out;
    }

    private function isolateSheet(Spreadsheet $spreadsheet, Worksheet $keep): void
    {
        foreach ($spreadsheet->getSheetNames() as $name) {
            if ($name !== $keep->getTitle()) {
                $spreadsheet->removeSheetByIndex($spreadsheet->getIndex($spreadsheet->getSheetByName($name)));
            }
        }
        foreach (array_keys($spreadsheet->getDefinedNames()) as $name) {
            $spreadsheet->removeDefinedName($name);
        }
        $spreadsheet->setActiveSheetIndex(0);
    }

    private function applyPageSetup(Worksheet $sheet, array $doc): void
    {
        $setup = $sheet->getPageSetup();
        $setup->setPaperSize($doc['paper'] === 'FOLIO' ? PageSetup::PAPERSIZE_FOLIO : PageSetup::PAPERSIZE_A4);
        $setup->setOrientation(PageSetup::ORIENTATION_PORTRAIT);
        if (!empty($doc['print_area'])) {
            $setup->setPrintArea($doc['print_area']);
        }
        $setup->setFitToPage(true);
        $setup->setFitToWidth(1);
        $setup->setFitToHeight($doc['fit_height'] ?? 0);
        $setup->setHorizontalCentered(true);

        $margins = $sheet->getPageMargins();
        $margins->setTop(0.5);
        $margins->setBottom(0.5);
        $margins->setLeft(0.9);
        $margins->setRight(0.9);
    }

    private function convertToPdf(string $xlsxPath, string $outDir): string
    {
        return $this->pdf->convert($xlsxPath, $outDir);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Template metadata (cached until the template file changes)
    // ─────────────────────────────────────────────────────────────────────

    private function loadTemplate(): Spreadsheet
    {
        $path = config('permits.template');
        if (!is_file($path)) {
            throw new RuntimeException("Permit template not found at: {$path}");
        }

        return IOFactory::createReader('Xlsx')->load($path);
    }

    /**
     * Tags + dropdown cells per sheet, option lists of the LIST sheet ranges
     * and the allowed uses list.
     */
    public function templateMeta(): array
    {
        $path = config('permits.template');
        $key = 'permit_template_meta_' . md5($path . '|' . (is_file($path) ? filemtime($path) : 0) . '|' . md5(serialize(config('permits'))));

        return Cache::rememberForever($key, function () {
            $book = $this->loadTemplate();
            $meta = ['sheets' => [], 'ranges' => [], 'allowed_uses' => []];

            $ranges = collect(config('permits.fields'))->pluck('options')->filter(fn ($o) => is_string($o));

            foreach (config('permits.documents') as $doc) {
                $sheet = $book->getSheetByName($doc['sheet']);
                if (!$sheet) {
                    continue;
                }
                $tags = [];
                foreach ($sheet->getCoordinates() as $coord) {
                    $cell = $sheet->getCell($coord);
                    $v = $cell->getValue();
                    $text = $v instanceof RichText ? $v->getPlainText() : ($cell->isFormula() ? $cell->getOldCalculatedValue() : $v);
                    if (is_string($text)) {
                        array_push($tags, ...$this->tagsIn($text));
                    }
                }

                $dropdowns = [];
                foreach ($sheet->getDataValidationCollection() as $sqref => $dv) {
                    $source = ltrim((string) $dv->getFormula1(), '=');
                    $source = str_replace('$', '', $source);
                    $ranges->push($source);
                    foreach (explode(' ', $sqref) as $range) {
                        foreach (Coordinate::extractAllCellReferencesInRange($range) as $coord) {
                            $dropdowns[] = [
                                'cell'    => $coord,
                                'label'   => $this->labelFor($sheet, $coord),
                                'section' => $this->sectionFor($sheet, $coord),
                                'source'  => $source,
                                'default' => $this->plain($sheet->getCell($coord)),
                            ];
                        }
                    }
                }

                $meta['sheets'][$doc['sheet']] = ['tags' => array_values(array_unique($tags)), 'dropdowns' => $dropdowns];
            }

            foreach ($ranges->unique() as $ref) {
                $meta['ranges'][$ref] = $this->readRange($book, $ref);
            }
            foreach ($meta['sheets'] as &$s) {
                foreach ($s['dropdowns'] as &$d) {
                    $d['options'] = $meta['ranges'][$d['source']] ?? [];
                }
            }
            unset($s, $d);

            $meta['allowed_uses'] = $this->readAllowedUses($book);
            $book->disconnectWorksheets();

            return $meta;
        });
    }

    private function readRange(Spreadsheet $book, string $ref): array
    {
        if (!str_contains($ref, '!')) {
            return [];
        }
        [$sheetName, $range] = explode('!', $ref, 2);
        $sheet = $book->getSheetByName(trim($sheetName, "'"));
        if (!$sheet) {
            return [];
        }
        $out = [];
        foreach (Coordinate::extractAllCellReferencesInRange($range) as $coord) {
            $v = trim($this->plain($sheet->getCell($coord)));
            if ($v !== '' && !in_array($v, $out, true)) {
                $out[] = $v;
            }
        }

        return $out;
    }

    /** [['section' => 'Section 12.7 Commercial C-1 Zone', 'uses' => ['SEC 12.7.01.a ...']], ...] */
    private function readAllowedUses(Spreadsheet $book): array
    {
        $sheet = $book->getSheetByName(config('permits.allowed_uses_sheet'));
        if (!$sheet) {
            return [];
        }
        $out = [];
        $highestCol = Coordinate::columnIndexFromString($sheet->getHighestDataColumn());
        $highestRow = $sheet->getHighestDataRow();
        for ($c = 1; $c <= $highestCol; $c++) {
            $header = trim($this->plain($sheet->getCell([$c, 1])));
            if ($header === '') {
                continue;
            }
            preg_match('/Section\s+([\d.]+)/i', $header, $m);
            $secNo = $m[1] ?? '';
            $uses = [];
            for ($r = 2; $r <= $highestRow; $r++) {
                $text = trim(preg_replace('/\s+/', ' ', $this->plain($sheet->getCell([$c, $r]))));
                if ($text === '') {
                    continue;
                }
                if (preg_match('/^(\d+(?:\.[a-z0-9]+)?)\.?\s+(.*)$/i', $text, $mm)) {
                    $uses[] = mb_strtoupper("SEC {$secNo}.{$mm[1]}. {$mm[2]}");
                } else {
                    $uses[] = mb_strtoupper("SEC {$secNo}. {$text}");
                }
            }
            $out[] = ['section' => $header, 'uses' => $uses];
        }

        return $out;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────

    private function document(string $type): array
    {
        $doc = config('permits.documents.' . strtolower($type));
        if (!$doc) {
            throw new \InvalidArgumentException("Unknown permit type: {$type}");
        }

        return $doc;
    }

    private function tagsIn(string $text): array
    {
        preg_match_all(self::TAG_PATTERN, $text, $m, PREG_SET_ORDER);
        $fields = config('permits.fields');

        return collect($m)
            ->filter(fn ($x) => $x[1] === '$' || isset($fields[$this->normalizeTag($x[2])]))
            ->map(fn ($x) => $this->normalizeTag($x[2]))
            ->unique()
            ->values()
            ->all();
    }

    private function normalizeTag(string $tag): string
    {
        return strtoupper(preg_replace('/\s+/', '_', trim($tag)));
    }

    private function canonical(string $tag): string
    {
        return config('permits.aliases.' . $tag, $tag);
    }

    private function plain(Cell $cell): string
    {
        $v = $cell->getValue();
        if ($v instanceof RichText) {
            return $v->getPlainText();
        }
        if ($cell->isFormula()) {
            return (string) $cell->getOldCalculatedValue();
        }

        return is_float($v) && floor($v) == $v ? (string) (int) $v : (string) $v;
    }

    /** Text nearest to the left on the same row, else to the right. */
    private function labelFor(Worksheet $sheet, string $coord): string
    {
        [$col, $row] = Coordinate::coordinateFromString($coord);
        $idx = Coordinate::columnIndexFromString($col);
        for ($c = $idx - 1; $c >= 1; $c--) {
            $t = trim($this->plain($sheet->getCell([$c, $row])));
            if ($t !== '' && !preg_match(self::TAG_PATTERN, $t) && mb_strlen($t) > 2) {
                return $t;
            }
        }
        for ($c = $idx + 1; $c <= $idx + 12; $c++) {
            $t = trim($this->plain($sheet->getCell([$c, $row])));
            if ($t !== '' && mb_strlen($t) > 2) {
                return $t;
            }
        }

        return $coord;
    }

    /** Closest heading above (a row whose column A is text spanning the row). */
    private function sectionFor(Worksheet $sheet, string $coord): string
    {
        [, $row] = Coordinate::coordinateFromString($coord);
        for ($r = $row - 1; $r >= 1; $r--) {
            $a = trim($this->plain($sheet->getCell([1, $r])));
            $b = trim($this->plain($sheet->getCell([2, $r])));
            if ($a !== '' && mb_strlen($a) > 4 && $b === '') {
                return $a;
            }
        }

        return 'Other';
    }

    /** "C1-Z" → "COMMERCIAL-1 ZONE (C1-Z)" using the LIST sheet zone names. */
    private function matchZone(string $landUse): string
    {
        $landUse = trim($landUse);
        if ($landUse === '') {
            return '';
        }
        $zones = $this->templateMeta()['ranges']['LIST!D2:D26'] ?? [];
        $norm = fn ($s) => strtolower(preg_replace('/[^a-z0-9]/i', '', $s));
        foreach ($zones as $z) {
            if (preg_match('/\(([^)]+)\)/', $z, $m) && $norm($m[1]) === $norm($landUse)) {
                return $z;
            }
        }
        foreach ($zones as $z) {
            if (str_contains($norm($z), $norm($landUse))) {
                return $z;
            }
        }

        return mb_strtoupper($landUse);
    }

    private function guessAllowedUseSection(array $sections, string $zone): ?string
    {
        if (!preg_match('/\(([A-Za-z]+)(\d?)/', $zone, $m)) {
            return null;
        }
        $needle = strtolower($m[1] . $m[2]) . 'zone';
        foreach ($sections as $s) {
            if (str_contains(strtolower(preg_replace('/[^a-z0-9]/i', '', $s['section'])), $needle)) {
                return $s['section'];
            }
        }

        return null;
    }

    private function firstMatching(array $options, string $haystack): ?string
    {
        foreach ($options as $o) {
            if ($haystack !== '' && stripos($haystack, $o) !== false) {
                return $o;
            }
        }

        return null;
    }

    /** "PUROK 4, BRGY. ALUPAY, ROSARIO, BATANGAS" → "PUROK 4" (the rest is printed separately). */
    private function street(string $street, string $barangay): string
    {
        $patterns = ['/\bBATANGAS\b/', '/\bROSARIO\b/'];
        if ($barangay !== '') {
            $patterns[] = '/\b(BRGY\.?|BARANGAY)?\s*' . preg_quote($barangay, '/') . '\b/';
        }
        $patterns[] = '/\b(BRGY\.?|BARANGAY)\s*$/';
        $clean = preg_replace($patterns, '', $street);

        return trim(preg_replace('/(\s*,\s*)+/', ', ', $clean), " ,");
    }

    private function initials(string $name): string
    {
        $name = preg_replace('/^(ENGR|ARCH|ATTY|DR|MR|MS|MRS|HON)\.?\s+/i', '', trim($name));

        return collect(preg_split('/\s+/', $name))->filter()->map(fn ($p) => mb_substr($p, 0, 1))->implode('');
    }

    private function num($value): string
    {
        $n = (float) ($value ?? 0);

        return $n > 0 ? number_format($n, 2) : '';
    }

    private function date($value): Carbon
    {
        try {
            return $value ? Carbon::parse($value) : now();
        } catch (\Throwable) {
            return now();
        }
    }

    /** 1 → "ONE (1)" (as the office writes it). */
    private function countWords(int $n): string
    {
        $words = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
            'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN', 'TWENTY'];

        return ($words[$n] ?? (string) $n) . " ({$n})";
    }
}
