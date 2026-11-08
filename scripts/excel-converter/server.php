<?php

/**
 * IMAPS Excel → PDF converter. Run on a WINDOWS machine that has desktop Microsoft Excel.
 *
 * The cloud app (Railway) POSTs a filled permit workbook (.xlsx) here and gets back the PDF
 * exported by Excel itself, so it is identical to printing the template from Excel.
 *
 *   POST /convert   header  X-Converter-Key: <IMAPS_CONVERTER_KEY>
 *                   body    raw .xlsx bytes          → 200 application/pdf
 *   GET  /health    → "ok"
 *
 * Start with start.bat (php -S 127.0.0.1:8787 server.php). Dependency-free: no composer needed.
 */

if (PHP_OS_FAMILY !== 'Windows') {
    http_response_code(500);
    exit('This converter must run on Windows with Microsoft Excel installed.');
}

$key = (string) getenv('IMAPS_CONVERTER_KEY');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if ($path === '/health') {
    exit('ok');
}

$fail = function (int $code, string $message): never {
    http_response_code($code);
    header('Content-Type: text/plain');
    exit($message);
};

if ($key === '' || strlen($key) < 16) {
    $fail(500, 'IMAPS_CONVERTER_KEY is not set (use at least 16 characters).');
}
if ($path !== '/convert' || ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    $fail(404, 'Not found.');
}
if (!hash_equals($key, (string) ($_SERVER['HTTP_X_CONVERTER_KEY'] ?? ''))) {
    $fail(403, 'Forbidden.');
}

$body = file_get_contents('php://input');
if ($body === false || strlen($body) < 100 || strlen($body) > 25 * 1024 * 1024 || !str_starts_with($body, 'PK')) {
    $fail(422, 'Body must be an .xlsx file (max 25 MB).');
}

$systemRoot = getenv('SystemRoot') ?: (getenv('windir') ?: 'C:\\Windows');
$temp = rtrim(sys_get_temp_dir(), '\\/');
$id = bin2hex(random_bytes(6));
$xlsx = "{$temp}\\imaps_conv_{$id}.xlsx";
$pdf = "{$temp}\\imaps_conv_{$id}.pdf";
$vbs = "{$temp}\\imaps_conv_{$id}.vbs";

file_put_contents($xlsx, $body);
file_put_contents($vbs, <<<'VBS'
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
If Err.Number = 0 Then wb.ExportAsFixedFormat 0, sh.ExpandEnvironmentStrings("%IMAPS_PDF%"), 0, True, False
failed = (Err.Number <> 0)
msg = Err.Description
Err.Clear
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
VBS);

try {
    $env = array_merge(getenv(), ['SystemRoot' => $systemRoot, 'windir' => $systemRoot, 'IMAPS_XLSX' => $xlsx, 'IMAPS_PDF' => $pdf]);
    $proc = proc_open(
        [$systemRoot . '\\System32\\cscript.exe', '//nologo', '//B', $vbs],
        [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes,
        null,
        $env
    );
    if (!is_resource($proc)) {
        $fail(500, 'Could not start Excel.');
    }
    $out = stream_get_contents($pipes[1]);
    $err = stream_get_contents($pipes[2]);
    proc_close($proc);

    if (!str_contains($out, 'IMAPS_PDF_OK') || !is_file($pdf) || filesize($pdf) === 0) {
        $fail(500, trim($err) ?: 'Excel could not export the PDF.');
    }

    header('Content-Type: application/pdf');
    header('Content-Length: ' . filesize($pdf));
    readfile($pdf);
} finally {
    @unlink($xlsx);
    @unlink($pdf);
    @unlink($vbs);
}
