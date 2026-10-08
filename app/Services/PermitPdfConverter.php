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
 *   - excel       : Microsoft Excel via VBScript COM      (Windows + desktop Excel only)
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

        // Full path: the `php artisan serve` worker has no PATH (its allow-list is upper-case,
        // Windows names these Path/SystemRoot), so a bare `reg` is not found there
        static $installed = null;
        return $installed ??= Process::timeout(10)
            ->env(['SystemRoot' => $this->systemRoot()])
            ->run([$this->systemRoot() . '\\System32\\reg.exe', 'query', 'HKEY_CLASSES_ROOT\\Excel.Application\\CLSID'])
            ->successful();
    }

    private function systemRoot(): string
    {
        return getenv('SystemRoot') ?: (getenv('windir') ?: 'C:\\Windows');
    }

    private function viaExcel(string $xlsxPath, string $pdfPath): void
    {
        if (!$this->excelInstalled()) {
            throw new RuntimeException('Microsoft Excel is not installed (Windows desktop Excel is required).');
        }

        // VBScript, not PowerShell: same Excel export (identical PDF) in ~3 s instead of ~7 s.
        // PowerShell spends ~0.5 s starting and ~2.5 s tearing down its COM link before it exits.
        // Paths go through env vars so quotes/spaces in them can't break the script.
        $script = <<<'VBS'
Option Explicit
Dim sh, excel, wb, failed, msg
Set sh = CreateObject("WScript.Shell")
Set wb = Nothing
On Error Resume Next
Set excel = CreateObject("Excel.Application")
If Err.Number <> 0 Then
    WScript.StdErr.WriteLine "Excel could not start: " & Err.Description
    WScript.Quit 1
End If
excel.Visible = False
excel.DisplayAlerts = False
excel.ScreenUpdating = False
excel.AskToUpdateLinks = False
Set wb = excel.Workbooks.Open(sh.ExpandEnvironmentStrings("%IMAPS_XLSX%"), 0, True)
' Type 0 = PDF, Quality 0 = standard, include doc props, respect the print area
If Err.Number = 0 Then wb.ExportAsFixedFormat 0, sh.ExpandEnvironmentStrings("%IMAPS_PDF%"), 0, True, False
failed = (Err.Number <> 0)
msg = Err.Description
Err.Clear
' Always close and quit, so no hidden EXCEL.EXE is left behind
If Not wb Is Nothing Then wb.Close False
Set wb = Nothing
excel.Quit
Set excel = Nothing
If failed Then
    WScript.StdErr.WriteLine "Excel could not export the PDF: " & msg
    WScript.Quit 1
End If
WScript.StdOut.WriteLine "IMAPS_PDF_OK"
WScript.Quit 0
VBS;

        $win = fn (string $p) => str_replace('/', '\\', $p);

        // `php artisan serve` strips the web worker's environment (no SystemRoot, no PATH),
        // so Windows tools are called by full path and get the variables they need.
        $systemRoot = $this->systemRoot();
        $temp = $win(sys_get_temp_dir());
        $scriptPath = $temp . '\\imaps_xlsx2pdf_' . Str::random(8) . '.vbs';
        file_put_contents($scriptPath, $script);

        try {
            $result = Process::timeout(90)
                ->env([
                    'SystemRoot' => $systemRoot,
                    'windir'     => $systemRoot,
                    'TEMP'       => getenv('TEMP') ?: $temp,
                    'TMP'        => getenv('TMP') ?: $temp,
                    'IMAPS_XLSX' => $win($xlsxPath),
                    'IMAPS_PDF'  => $win($pdfPath),
                ])
                // //B: never show a script error dialog on the server; errors go to stderr
                ->run([$systemRoot . '\\System32\\cscript.exe', '//nologo', '//B', $scriptPath]);
        } finally {
            @unlink($scriptPath);
        }

        $ok = $result->successful() && str_contains($result->output(), 'IMAPS_PDF_OK') && is_file($pdfPath) && filesize($pdfPath) > 0;
        if (!$ok) {
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
