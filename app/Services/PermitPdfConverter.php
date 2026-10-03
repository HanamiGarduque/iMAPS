<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Writer\Pdf\Dompdf as DompdfWriter;
use RuntimeException;
use Symfony\Component\Process\ExecutableFinder;

/**
 * Converts a filled permit workbook (.xlsx) to PDF.
 *
 * Drivers (config/permits.php → pdf_driver, env PERMIT_PDF_DRIVER):
 *   - libreoffice : soffice --headless --convert-to pdf  (best on Linux/macOS/servers)
 *   - excel       : Microsoft Excel via PowerShell COM    (Windows + desktop Excel only)
 *   - dompdf      : PhpSpreadsheet's Dompdf writer        (no install needed, draft quality)
 *   - auto        : first one that is available, in the order above (default)
 */
class PermitPdfConverter
{
    public const DRIVERS = ['libreoffice', 'excel', 'dompdf'];

    /** Driver that produced the last PDF (exposed to the UI as a header). */
    public ?string $lastDriver = null;

    public function convert(string $xlsxPath, string $outDir): string
    {
        $driver = strtolower((string) config('permits.pdf_driver', 'auto'));
        $pdfPath = preg_replace('/\.xlsx$/i', '.pdf', $xlsxPath);

        $candidates = $driver === 'auto'
            ? array_filter(self::DRIVERS, fn ($d) => $this->available($d))
            : [$driver];

        if (!in_array($driver, ['auto', ...self::DRIVERS], true)) {
            throw new RuntimeException("Unknown PERMIT_PDF_DRIVER \"{$driver}\". Use auto, libreoffice, excel or dompdf.");
        }

        $errors = [];
        foreach ($candidates as $candidate) {
            try {
                if (is_file($pdfPath)) {
                    unlink($pdfPath);
                }
                match ($candidate) {
                    'libreoffice' => $this->viaLibreOffice($xlsxPath, $outDir),
                    'excel'       => $this->viaExcel($xlsxPath, $pdfPath),
                    'dompdf'      => $this->viaDompdf($xlsxPath, $pdfPath),
                };
                if (!is_file($pdfPath) || filesize($pdfPath) === 0) {
                    throw new RuntimeException('no PDF was produced.');
                }
                $this->lastDriver = $candidate;
                return $pdfPath;
            } catch (\Throwable $e) {
                $errors[] = "{$candidate}: " . $e->getMessage();
                Log::warning("Permit PDF via {$candidate} failed: " . $e->getMessage());
            }
        }

        throw new RuntimeException('PDF conversion failed. ' . implode(' | ', $errors));
    }

    public function available(string $driver): bool
    {
        return match ($driver) {
            'libreoffice' => $this->sofficeBinary() !== null,
            'excel'       => $this->excelInstalled(),
            'dompdf'      => class_exists(\Dompdf\Dompdf::class),
            default       => false,
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // LibreOffice
    // ─────────────────────────────────────────────────────────────────────

    public function sofficeBinary(): ?string
    {
        $configured = (string) config('permits.soffice', 'soffice');

        // An explicit path in .env wins
        if ($configured !== '' && $configured !== 'soffice') {
            return is_file($configured) ? $configured : null;
        }

        $finder = new ExecutableFinder();
        foreach (['soffice', 'libreoffice'] as $name) {
            if ($found = $finder->find($name)) {
                return $found;
            }
        }

        $known = [
            'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
            'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
            '/Applications/LibreOffice.app/Contents/MacOS/soffice',
            '/usr/bin/soffice',
            '/usr/lib/libreoffice/program/soffice',
            '/opt/libreoffice/program/soffice',
            '/snap/bin/libreoffice',
        ];
        foreach ($known as $path) {
            if (is_file($path)) {
                return $path;
            }
        }

        return null;
    }

    private function viaLibreOffice(string $xlsxPath, string $outDir): void
    {
        $bin = $this->sofficeBinary() ?? throw new RuntimeException('LibreOffice is not installed.');

        // Separate profile per call so concurrent requests don't collide.
        // Must be a valid file URI on every OS (file:///C:/... on Windows).
        $profile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'imaps_lo_' . Str::random(8);
        $profileUri = 'file:///' . ltrim(str_replace('\\', '/', $profile), '/');

        try {
            $result = Process::timeout(120)
                ->env(['HOME' => sys_get_temp_dir()])
                ->run([
                    $bin,
                    '-env:UserInstallation=' . $profileUri,
                    '--headless', '--norestore', '--nolockcheck',
                    '--convert-to', 'pdf',
                    '--outdir', $outDir,
                    $xlsxPath,
                ]);
        } finally {
            File::deleteDirectory($profile);
        }

        if (!$result->successful()) {
            throw new RuntimeException(trim($result->errorOutput()) ?: 'soffice exited with an error.');
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Microsoft Excel (Windows only)
    // ─────────────────────────────────────────────────────────────────────

    public function excelInstalled(): bool
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return false;
        }

        static $installed = null;
        return $installed ??= Process::timeout(10)
            ->run(['reg', 'query', 'HKEY_CLASSES_ROOT\\Excel.Application\\CLSID'])
            ->successful();
    }

    private function viaExcel(string $xlsxPath, string $pdfPath): void
    {
        if (!$this->excelInstalled()) {
            throw new RuntimeException('Microsoft Excel is not installed (Windows desktop Excel is required).');
        }

        // Paths go through env vars so quotes/spaces in them can't break the script.
        $script = <<<'PS'
$ErrorActionPreference = 'Stop'
$excel = $null; $wb = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false
    $excel.AskToUpdateLinks = $false
    $wb = $excel.Workbooks.Open($env:IMAPS_XLSX, 0, $true)
    # Type 0 = PDF, Quality 0 = standard, include doc props, respect the print area
    $wb.ExportAsFixedFormat(0, $env:IMAPS_PDF, 0, $true, $false)
} finally {
    if ($wb) { $wb.Close($false); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    if ($excel) { $excel.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
PS;

        $encoded = base64_encode(mb_convert_encoding($script, 'UTF-16LE', 'UTF-8'));
        $win = fn (string $p) => str_replace('/', '\\', $p);

        $result = Process::timeout(90)
            ->env(['IMAPS_XLSX' => $win($xlsxPath), 'IMAPS_PDF' => $win($pdfPath)])
            ->run(['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded]);

        if (!$result->successful()) {
            throw new RuntimeException(trim($result->errorOutput()) ?: 'Excel could not export the PDF.');
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Dompdf (fallback — no external software, rougher layout)
    // ─────────────────────────────────────────────────────────────────────

    private function viaDompdf(string $xlsxPath, string $pdfPath): void
    {
        $spreadsheet = IOFactory::createReader('Xlsx')->load($xlsxPath);
        try {
            $writer = new DompdfWriter($spreadsheet);
            $writer->setPreCalculateFormulas(false);
            $writer->save($pdfPath);
        } finally {
            $spreadsheet->disconnectWorksheets();
        }
    }
}
