$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$data = Join-Path $env:LOCALAPPDATA ('Temp\opencode\reports-phase2b-pg-' + [guid]::NewGuid().ToString('N'))
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$started = $false
$exitCode = 1
Push-Location $root
try {
    & initdb -D $data -U postgres -A trust --encoding=UTF8 --locale=C > "$data-init.log" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Disposable initdb failed; see $data-init.log" }
    & pg_ctl -D $data -l "$data-server.log" -o "-h 127.0.0.1 -p $port" -w start
    if ($LASTEXITCODE -ne 0) { throw "Disposable server start failed; see $data-server.log" }
    $started = $true
    & createdb -h 127.0.0.1 -p $port -U postgres reports_support_phase2b_test
    if ($LASTEXITCODE -ne 0) { throw 'Disposable database creation failed.' }
    $env:REPORTS_TEST_PG_PORT = "$port"
    $env:REPORTS_TEST_PG_DATA = $data
    & php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/phpunit tests/Integration/ReportActionAuditPostgresTest.php
    $exitCode = $LASTEXITCODE
} finally {
    Remove-Item Env:REPORTS_TEST_PG_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:REPORTS_TEST_PG_DATA -ErrorAction SilentlyContinue
    if ($started) { & pg_ctl -D $data -m fast -w stop }
    Pop-Location
    Write-Output "Disposable cluster (stopped) and logs retained at $data"
}
exit $exitCode
