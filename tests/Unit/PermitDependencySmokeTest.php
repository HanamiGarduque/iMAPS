<?php

namespace Tests\Unit;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * PERMIT DEPENDENCY SMOKE TEST.
 *
 * The master sync added permit Excel/Word/PDF generation, which pulls in
 * `phpoffice/phpspreadsheet`, `phpoffice/phpword` and the transitive
 * `maennchen/zipstream-php`. No focused test existed for them.
 *
 * ZipStream 3.2.x requires PHP 8.3, while this project's declared platform is
 * `php: ^8.2`, so the lock was pinned back to ZipStream 3.1.2 (which requires
 * `php-64bit: ^8.2`). This test is what proves that repair holds: it asserts the
 * exact classes the application imports actually autoload, and that the repair
 * did not disturb Reports & Support authority.
 *
 * It deliberately performs NO permit generation and writes no permit data: the
 * libraries are proven loadable and constructible, not exercised end to end.
 */
class PermitDependencySmokeTest extends TestCase
{
    /** Exactly the PhpSpreadsheet symbols `PermitExcelService` imports. */
    private const SPREADSHEET_SYMBOLS = [
        \PhpOffice\PhpSpreadsheet\Spreadsheet::class,
        \PhpOffice\PhpSpreadsheet\IOFactory::class,
        \PhpOffice\PhpSpreadsheet\Cell\Cell::class,
        \PhpOffice\PhpSpreadsheet\Cell\Coordinate::class,
        \PhpOffice\PhpSpreadsheet\Cell\DataType::class,
        \PhpOffice\PhpSpreadsheet\RichText\RichText::class,
        \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet::class,
        \PhpOffice\PhpSpreadsheet\Worksheet\PageSetup::class,
    ];

    /** The writer `PermitPdfConverter` imports. */
    private const PDF_WRITER = \PhpOffice\PhpSpreadsheet\Writer\Pdf\Dompdf::class;

    public function test_required_phpspreadsheet_classes_autoload(): void
    {
        foreach (self::SPREADSHEET_SYMBOLS as $symbol) {
            $this->assertTrue(
                class_exists($symbol),
                "PhpSpreadsheet symbol {$symbol} must autoload; the permit services import it directly."
            );
        }
    }

    public function test_the_pdf_writer_permit_converter_imports_autoloads(): void
    {
        $this->assertTrue(
            class_exists(self::PDF_WRITER),
            'PermitPdfConverter imports PhpSpreadsheet\Writer\Pdf\Dompdf directly.'
        );
    }

    public function test_required_phpword_class_autoloads(): void
    {
        // phpword is a declared dependency of the permit feature; IOFactory is its
        // entry point. It is not yet imported by the services, so this proves the
        // package is genuinely installed rather than merely declared.
        $this->assertTrue(
            class_exists(\PhpOffice\PhpWord\IOFactory::class),
            'phpoffice/phpword must autoload for the declared permit Word support.'
        );
    }

    public function test_the_zipstream_release_supports_this_php_runtime(): void
    {
        $this->assertTrue(
            class_exists(\ZipStream\ZipStream::class),
            'ZipStream must autoload: PhpSpreadsheet resolves it at runtime for streaming output.'
        );

        $version = \Composer\InstalledVersions::getPrettyVersion('maennchen/zipstream-php');
        $this->assertNotNull($version, 'ZipStream must be installed.');

        // The regression this test exists for: 3.2.x requires php-64bit ^8.3 and
        // cannot install on this project's declared php ^8.2 platform.
        $this->assertTrue(
            version_compare(ltrim((string) $version, 'v'), '3.2.0', '<'),
            "ZipStream {$version} requires PHP 8.3; the lock must stay on the 3.1.x line for php ^8.2."
        );
    }

    public function test_permit_services_resolve_from_the_container(): void
    {
        // Construction only. No permit is generated and no permit data is written.
        foreach ([\App\Services\PermitExcelService::class, \App\Services\PermitPdfConverter::class] as $service) {
            $this->assertTrue(class_exists($service), "{$service} must exist.");
            $this->assertInstanceOf($service, app($service), "{$service} must resolve from the container.");
        }

        $this->assertTrue(class_exists(\App\Models\GeneratedPermit::class), 'GeneratedPermit model must exist.');
    }

    public function test_a_phpspreadsheet_instance_can_be_created_in_memory(): void
    {
        // Proves the library is functional, not merely autoloadable, without ever
        // touching storage, the database, or a permit workflow.
        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setCellValue('A1', 'smoke');

        $this->assertSame('smoke', $sheet->getCell('A1')->getValue());
    }

    public function test_the_six_permit_routes_remain_registered_and_authenticated(): void
    {
        $expected = [
            'GET' => ['applications/{id}/permit-schema/{type}', 'applications/{id}/saved-permits'],
            'POST' => ['applications/{id}/export-preview/{type}', 'applications/{id}/export-document/{type}'],
            'DELETE' => ['applications/{id}/saved-permits/{permitId}'],
        ];

        $found = 0;
        foreach (Route::getRoutes() as $route) {
            $uri = $route->uri();
            foreach ($expected as $method => $uris) {
                if (! in_array($uri, $uris, true)) {
                    continue;
                }
                $this->assertContains($method, $route->methods(), "{$uri} must still accept {$method}.");
                $middleware = $route->gatherMiddleware();
                $this->assertContains('web', $middleware, "{$uri} must keep the web group.");
                $this->assertContains('auth', $middleware, "{$uri} must stay authenticated.");
                $found++;
            }
        }

        // plus the download route, which is a GET with its own uri
        $download = collect(Route::getRoutes())->first(
            fn ($r) => $r->uri() === 'applications/{id}/saved-permits/{permitId}/download'
        );
        $this->assertNotNull($download, 'The saved-permit download route must remain registered.');
        $this->assertContains('auth', $download->gatherMiddleware());

        $this->assertSame(5, $found, 'All five primary permit routes must be present.');
    }

    public function test_this_dependency_repair_did_not_disturb_reports_and_support_authority(): void
    {
        // The repair touched composer.lock only. Reports & Support authority must be
        // unchanged in behaviour: escalation stays Admin-only.
        $escalationRoutes = collect(Route::getRoutes())
            ->filter(fn ($r) => str_contains($r->uri(), 'escalations'));

        $this->assertCount(3, $escalationRoutes, 'The three escalation routes must remain registered.');

        foreach ($escalationRoutes as $route) {
            $middleware = implode(',', $route->gatherMiddleware());
            $this->assertStringContainsString('role:Admin', $middleware);
            $this->assertStringNotContainsString(
                'Planning Officer',
                $middleware,
                'Development Support escalation must never be reachable by a Planning Officer.'
            );
        }

        foreach ([
            \App\Services\ReportEscalationService::class,
            \App\Services\ReportLifecycleLock::class,
            \App\Support\ReportEscalationGate::class,
            \App\Support\ReportingVisibility::class,
        ] as $class) {
            $this->assertTrue(class_exists($class), "{$class} must remain autoloadable.");
        }
    }

    public function test_composer_lock_still_declares_the_project_php_platform(): void
    {
        // The lock must keep advertising php ^8.2. If a future broad update ever
        // rewrites the platform, this is where it shows up first.
        $lock = json_decode((string) file_get_contents(base_path('composer.lock')), true);

        $this->assertSame('^8.2', $lock['platform']['php'] ?? null);
        $this->assertSame('5.10.0', $this->lockedVersion($lock, 'phpoffice/phpspreadsheet'));
        $this->assertSame('1.4.0', $this->lockedVersion($lock, 'phpoffice/phpword'));
    }

    private function lockedVersion(array $lock, string $package): ?string
    {
        foreach ($lock['packages'] ?? [] as $entry) {
            if ($entry['name'] === $package) {
                return $entry['version'];
            }
        }

        return null;
    }
}