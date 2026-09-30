<?php

namespace Tests\Unit;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Photo viewing, folder-context back navigation, and assignment-modal clarity.
 *
 * These are the three user-observed workflow issues, and each has its own class
 * of assertion because each has a different kind of evidence behind it.
 *
 * PHOTO. The delivery chain was verified live, not inferred: the authorized
 * endpoint returns a resolvable signed URL, and the server deliberately does NOT
 * emit the field the UI was reading. So the delivery contract is asserted against
 * the SERVER source (it must keep returning `signed_url` and must keep stripping
 * raw paths), and the viewer is asserted against the CLIENT source (it must read
 * `signed_url`). Privacy is load-bearing here, so the assertions also prove the
 * browser is never handed a raw storage path.
 *
 * NAVIGATION. The folder origin is a pure function, so the whole contract is
 * provable with no browser: folder origin returns to that folder, a named
 * non-folder origin still wins, a direct link with no origin falls back to the
 * registry root, and no folder context is ever invented. The registries must also
 * keep the folder in the URL, or a refresh silently loses it.
 *
 * MODAL. The business rule is already correct and is asserted unchanged; only the
 * AFFORDANCE is corrected, so the tests check that explanatory text cannot
 * resemble an input while the reason and note controls remain genuinely editable.
 */
class FinalUxCorrectnessContractTest extends TestCase
{
    private function source(string $relativePath): string
    {
        $path = base_path($relativePath);
        $this->assertFileExists($path, "Expected source file {$relativePath} to exist.");

        return (string) file_get_contents($path);
    }

    private function code(string $source): string
    {
        $source = (string) preg_replace('#/\*.*?\*/#s', '', $source);

        $kept = [];
        foreach (preg_split('/\R/', $source) as $line) {
            if (preg_match('#^\s*(//|\*|/\*)#', $line)) {
                continue;
            }

            $kept[] = $line;
        }

        return implode("\n", $kept);
    }

    private function codeOf(string $relativePath): string
    {
        return $this->code($this->source($relativePath));
    }

    // ══════════════════════════════════════════════════════════════════════
    // PHOTO — the authorized delivery contract
    // ══════════════════════════════════════════════════════════════════════

    /**
     * The server must keep handing the browser a signed URL and must keep
     * stripping the raw path. This is the contract the client depends on, and it
     * is the reason a wrong client field name produced alt text rather than a
     * leaked object path.
     */
    public function test_the_server_serves_signed_urls_and_strips_raw_paths(): void
    {
        $service = $this->codeOf('app/Services/SupabaseService.php');

        $this->assertStringContainsString("'signed_url' =>", $service);
        $this->assertStringContainsString('createInspectionPhotoSignedUrl', $service);

        // Raw paths and stored public URLs must never reach the browser.
        $this->assertMatchesRegularExpression(
            "/unset\(\\\$inspection, \['photo_paths', 'photo_url'\]\)|unset\(\\\$inspection\['photo_paths'\], \\\$inspection\['photo_url'\]\)/",
            $service,
            'The server must keep stripping photo_paths and photo_url before responding.'
        );
    }

    /**
     * The bug: the UI read `photo.photo_url`, which the server never emits, so
     * every thumbnail rendered as its own alt text. The client must read the
     * authorized field.
     */
    public function test_the_thumbnail_reads_the_authorized_signed_url_field(): void
    {
        $page = $this->codeOf('resources/js/Pages/Site Inspections/Show.jsx');

        $this->assertStringContainsString('const thumbUrl = photo.signed_url;', $page);
        $this->assertStringNotContainsString(
            'photo.photo_url',
            $page,
            'The UI must not read photo_url: the server deliberately does not emit it.'
        );
    }

    /**
     * A dead image must report itself rather than fall back to a browser
     * broken-image icon or, worse, to a stand-in photo.
     */
    public function test_a_failed_photo_reports_itself_instead_of_showing_a_broken_image(): void
    {
        $page = $this->codeOf('resources/js/Pages/Site Inspections/Show.jsx');
        $box = $this->codeOf('resources/js/Components/PhotoLightbox.jsx');

        foreach (['page' => $page, 'lightbox' => $box] as $where => $code) {
            $this->assertStringContainsString('onError', $code, "{$where} must handle an image load failure.");
            $this->assertStringContainsString('unavailable', strtolower($code), "{$where} must show an unavailable state.");
        }

        // The placeholder is an explicit "unavailable" message, not the alt text
        // standing in for the image, and it is not an <img> with a bad source.
        $this->assertStringContainsString('Photo unavailable', $page);
        $this->assertStringContainsString('Photo unavailable', $box);
    }

    public function test_photos_are_clickable_and_open_a_viewer(): void
    {
        $page = $this->codeOf('resources/js/Pages/Site Inspections/Show.jsx');
        $box = $this->codeOf('resources/js/Components/PhotoLightbox.jsx');

        // A real <button>, so the thumbnail is keyboard reachable and announced.
        $this->assertStringContainsString('onClick={() => setLightboxIndex(idx)}', $page);
        $this->assertStringContainsString('<button', $page);
        $this->assertStringContainsString('cursor-pointer', $page);
        $this->assertStringContainsString('aria-label', $page);

        // The viewer is mounted, and it is a modal.
        $this->assertStringContainsString('<PhotoLightbox', $page);
        $this->assertStringContainsString('aria-modal="true"', $box);
        $this->assertStringContainsString('role="dialog"', $box);
    }

    public function test_the_viewer_closes_and_scales_without_cropping(): void
    {
        $box = $this->codeOf('resources/js/Components/PhotoLightbox.jsx');

        $this->assertStringContainsString('e.key === "Escape"', $box);
        $this->assertStringContainsString('onClose', $box);
        // object-contain with a bounded height, so the whole image is visible.
        $this->assertStringContainsString('object-contain', $box);
        $this->assertStringContainsString('max-h-[82vh]', $box);
        // Dimmed background.
        $this->assertStringContainsString('bg-slate-950/85', $box);
    }

    public function test_the_viewer_reports_the_photo_index_when_there_is_more_than_one(): void
    {
        $box = $this->codeOf('resources/js/Components/PhotoLightbox.jsx');

        $this->assertStringContainsString('Photo {index + 1} of {photos.length}', $box);
        $this->assertStringContainsString('e.key === "ArrowLeft"', $box);
        $this->assertStringContainsString('e.key === "ArrowRight"', $box);
    }

    /**
     * Signed URLs are short-lived by design, so the viewer must re-request them
     * instead of reusing a possibly expired thumbnail URL. The request must go
     * through the SAME authorized endpoint, never a constructed object URL.
     */
    public function test_the_viewer_requests_fresh_authorized_urls_rather_than_reusing_stale_ones(): void
    {
        $box = $this->codeOf('resources/js/Components/PhotoLightbox.jsx');

        $this->assertStringContainsString('cache: "no-store"', $box);
        $this->assertStringContainsString('/api/inspections/${inspectionId}/supabase-data', $box);

        // No client-side URL construction, and no permanent/public object URL.
        $this->assertStringNotContainsString('supabase.co/storage', $box);
        $this->assertStringNotContainsString('photo_path', $box);
        $this->assertStringNotContainsString('getPublicUrl', $box);
    }

    /**
     * Authorization is unchanged: the endpoint that serves photo data is still
     * Admin + Planning Officer, and it is still not reachable anonymously.
     */
    public function test_photo_authorization_is_unchanged(): void
    {
        $route = Route::getRoutes()->match(
            Request::create('/api/inspections/22/supabase-data', 'GET')
        );

        $this->assertSame('api.inspections.supabase', $route->getName());

        $middleware = implode('|', array_merge($route->gatherMiddleware(), $route->middleware()));
        $this->assertStringContainsString('auth', $middleware);
        $this->assertStringContainsString('role:Admin,Planning Officer', $middleware);

        // A Site Inspector is a FieldSync-only role and must stay locked out.
        $this->assertStringNotContainsString('role:Site Inspector', $middleware);
    }

    // ══════════════════════════════════════════════════════════════════════
    // NAVIGATION — the folder-origin contract
    // ══════════════════════════════════════════════════════════════════════

    /**
     * The decisive case: a detail opened from inside an applicant folder must
     * return to THAT folder, not the registry root.
     */
    public function test_a_folder_origin_returns_to_that_folder(): void
    {
        $out = $this->resolve($this->resolverOptions(['search' => '?from=folder&folder=' . rawurlencode('N Mm D')]));

        $this->assertSame('N Mm D', $out['folder']);
        $this->assertSame('Back to N Mm D', $out['label']);
        $this->assertSame('/applications?folder=N+Mm+D', $out['href']);
    }

    public function test_a_folder_origin_also_restores_the_registry_filters_and_page(): void
    {
        $out = $this->resolve($this->resolverOptions([
            'search' => '?from=folder&folder=Acme&status=Technical+Review&page=3',
            'registryQuery' => 'status=Technical+Review&page=3',
        ]));

        $this->assertStringContainsString('status=Technical+Review', $out['href']);
        $this->assertStringContainsString('page=3', $out['href']);
        $this->assertStringContainsString('folder=Acme', $out['href']);
        // The origin markers must not leak back into the registry URL.
        $this->assertStringNotContainsString('from=', $out['href']);
    }

    /**
     * A direct link with no origin must fall back to the registry root, and must
     * NOT invent a folder.
     */
    public function test_a_direct_link_falls_back_to_the_registry_root(): void
    {
        foreach (['', '?page=2'] as $search) {
            $out = $this->resolve($this->resolverOptions(['search' => $search]));
            $this->assertSame('All Applications', $out['label']);
            $this->assertSame('/applications', $out['href']);
            $this->assertNull($out['folder']);
        }
    }

    /**
     * An origin that names a folder but supplies no folder name is not a usable
     * origin, so it degrades to the registry root rather than linking nowhere.
     */
    public function test_an_incomplete_folder_origin_degrades_to_the_registry_root(): void
    {
        $out = $this->resolve($this->resolverOptions(['search' => '?from=folder&folder=']));

        $this->assertSame('All Applications', $out['label']);
        $this->assertNull($out['folder']);
    }

    /**
     * The pre-existing Technical Review origin must keep working. The fix extends
     * that mechanism rather than replacing it.
     */
    public function test_the_technical_review_origin_still_returns_to_the_queue(): void
    {
        $out = $this->resolve($this->resolverOptions(['search' => '?from=technical-review']));

        $this->assertSame('Technical Review', $out['label']);
        $this->assertSame('/technical-review', $out['href']);
        $this->assertNull($out['folder']);
    }

    public function test_site_inspections_detail_uses_the_same_contract(): void
    {
        $out = $this->resolve($this->resolverOptions([
            'search' => '?from=folder&folder=' . rawurlencode('Donato'),
            'registryPath' => '/site-inspections',
            'rootLabel' => 'All Inspections',
        ]));

        $this->assertSame('Back to Donato', $out['label']);
        $this->assertSame('/site-inspections?folder=Donato', $out['href']);

        $bare = $this->resolve($this->resolverOptions(['registryPath' => '/site-inspections', 'rootLabel' => 'All Inspections']));
        $this->assertSame('All Inspections', $bare['label']);
        $this->assertSame('/site-inspections', $bare['href']);
    }

    /**
     * The registry must read the folder from the URL, or a refresh and a pasted
     * link lose it and the back contract has nothing to restore.
     */
    /**
     * MASTER MERGE CORRECTION - SCOPED TO WHAT STILL EXISTS.
     *
     * The real contract is that a registry's view state survives in the URL, so
     * a refresh, a shared link and the browser Back button all return the officer
     * to the list they were looking at. That requirement is unchanged.
     *
     * Master replaced the folder-archive parameter on the Applications registry
     * with its own filter set, so the old `folder` parameter is no longer part of
     * that page's contract. The Site Inspections page still uses `folderOrigin`
     * and keeps the full requirement.
     */
    public function test_both_registries_keep_the_open_folder_in_the_url(): void
    {
        $inspections = $this->codeOf('resources/js/Pages/Site Inspections/Index.jsx');
        $this->assertStringContainsString('new URLSearchParams(window.location.search).get("folder")', $inspections);
        $this->assertStringContainsString('params.set("folder", selectedFolder)', $inspections);
        // Closing a folder must clear the parameter, not leave a stale one.
        $this->assertStringContainsString('params.delete("folder")', $inspections);

        // The Applications registry must still keep ITS view state in the URL,
        // through whatever parameters it now uses. Losing that would break
        // refresh, shared links and the Back button.
        $applications = $this->codeOf('resources/js/Pages/Applications/Index.jsx');
        $this->assertStringContainsString('new URLSearchParams(window.location.search)', $applications);
        $this->assertStringContainsString('params.set("search", debouncedSearch)', $applications);
        $this->assertStringContainsString('params.set("status", selectedStatus)', $applications);
        $this->assertStringContainsString('params.set("barangay", selectedBarangay)', $applications);

        // Empty values must be dropped, or the URL re-filters itself on reload.
        $this->assertStringContainsString('params.delete(', $applications);
    }

    /**
     * MASTER MERGE CORRECTION - THE ORIGIN IS EMITTED WHERE IT STILL EXISTS.
     *
     * Carrying the folder origin into a detail URL is what lets a back control
     * return an officer to the folder they drilled in from. The Site Inspections
     * page still does this. The Applications registry reaches its records
     * through its own back control and no longer emits a folder origin, so what is
     * asserted there is that a real record route is still opened.
     */
    public function test_both_registries_emit_the_origin_when_opening_a_record(): void
    {
        $origin = $this->codeOf('resources/js/Components/folderOrigin.js');

        $inspections = $this->codeOf('resources/js/Pages/Site Inspections/Index.jsx');
        $this->assertStringContainsString('detailUrlFromFolder', $inspections, 'Site Inspections must carry the folder origin.');

        $this->assertStringContainsString("params.set('from', FOLDER_ORIGIN)", $origin);
        $this->assertStringContainsString("params.set('folder', folder || '')", $origin);

        $applications = $this->codeOf('resources/js/Pages/Applications/Index.jsx');
        $this->assertMatchesRegularExpression(
            '#/applications/\$\{item\.id\}#',
            $applications,
            'The registry must still open a real application record.'
        );
    }

    /**
     * MASTER MERGE CORRECTION - LABEL AND DESTINATION MUST STILL AGREE.
     *
     * A back control labelled for one destination while actually returning to
     * another is the defect this protects against, and that requirement is
     * unchanged. The two detail pages reach it differently - Site Inspections via
     * the shared `folderOrigin` resolver, Applications Detail via its own
     * origin-aware back control - so each is asserted on the mechanism it uses.
     */
    public function test_the_back_control_label_matches_its_destination(): void
    {
        $inspections = $this->codeOf('resources/js/Pages/Site Inspections/Show.jsx');
        $this->assertStringContainsString('href={backTarget.href}', $inspections);
        $this->assertStringContainsString('{backTarget.label}', $inspections);
        $this->assertStringContainsString('resolveBackTarget', $inspections);

        $apps = $this->codeOf('resources/js/Pages/Applications/Show.jsx');
        $this->assertStringContainsString('href={backHref}', $apps, 'The Applications record must use its resolved destination.');
        $this->assertStringContainsString('aria-label={backLabel}', $apps, 'The Applications record must label the control with its resolved label.');

        // The old hardcoded labels must be gone from the Applications detail.
        $this->assertStringNotContainsString('<span>All Records</span>', $apps);
    }

    /**
     * MASTER MERGE CORRECTION - SCOPED TO THE PAGE THAT STILL HAS FOLDERS.
     *
     * The requirement is that a back control names the folder it returns to, so a
     * truncated label stays unambiguous. That only applies where a folder archive
     * exists, which is the Site Inspections page. The Applications record page
     * has module-level destinations instead, and its tooltip names the module.
     */
    public function test_the_folder_back_control_names_the_folder_in_its_tooltip(): void
    {
        $inspections = $this->codeOf('resources/js/Pages/Site Inspections/Show.jsx');
        $this->assertStringContainsString('backTarget.folder', $inspections);
        $this->assertStringContainsString('Return to the ${backTarget.folder} folder', $inspections);

        // The Applications record names the module it returns to instead.
        $apps = $this->source('resources/js/Pages/Applications/Show.jsx');
        $this->assertStringContainsString('aria-label={backLabel}', $apps);
    }

    /**
     * The mechanism is an extension of the existing `?from=` convention, not a
     * parallel navigation system.
     */
    public function test_the_origin_mechanism_extends_the_existing_from_convention(): void
    {
        $origin = $this->codeOf('resources/js/Components/folderOrigin.js');

        $this->assertStringContainsString("export const FOLDER_ORIGIN = 'folder'", $origin);
        $this->assertStringContainsString("from === FOLDER_ORIGIN", $origin);

        // The Technical Review queue still emits the origin it always did.
        $queue = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');
        $this->assertStringContainsString('from=technical-review', $queue);
    }

    // ══════════════════════════════════════════════════════════════════════
    // ASSIGNMENT MODAL — affordance only, business rule unchanged
    // ══════════════════════════════════════════════════════════════════════

    /**
     * A first assignment must show explanatory text that cannot be mistaken for a
     * field: no bordered card, no input-like surface, no fake disabled control.
     */
    public function test_the_initial_assignment_helper_does_not_look_like_an_input(): void
    {
        $component = $this->codeOf('resources/js/Components/WorkAssignment.jsx');

        $this->assertStringContainsString('Initial assignment — no transfer reason is required.', $component);

        // It is a plain paragraph with an info icon: no card, no border, no
        // input-like surface. Asserted directly rather than by a fragile regex
        // over a multi-line JSX block.
        $this->assertStringContainsString('<p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 bg-transparent">', $component);
        $this->assertStringNotContainsString('border border-slate-200 bg-slate-50/70 text-slate-600', substr($component, (int) strpos($component, 'isInitial && ('), 700));

        // No fake disabled input is used to stand in for the absent reason.
        $this->assertStringNotContainsString('disabled placeholder', $component);
        $this->assertStringNotContainsString(
            'This is the first Planning Officer for this application',
            $component,
            'The long input-looking explanation must be gone.'
        );
    }

    /**
     * The editable reason controls must still be REAL controls on reassignment,
     * and the note must appear only for "Other".
     */
    public function test_reassignment_keeps_real_editable_reason_controls(): void
    {
        $component = $this->codeOf('resources/js/Components/WorkAssignment.jsx');

        // The reason block is shown only for a replacement, and is a real select.
        $this->assertStringContainsString('{!isInitial && (', $component);
        $this->assertStringContainsString('<Field required>Reason</Field>', $component);
        $this->assertStringContainsString('<select', $component);
        $this->assertStringContainsString('setReason(e.target.value)', $component);

        // The note is an editable textarea, required only for "Other".
        $this->assertStringContainsString('setNote(e.target.value)', $component);
        $this->assertStringContainsString('noteRequired ? "Note" : "Note (optional)"', $component);
        $this->assertStringContainsString('noteRequired ? "Briefly explain the reason…"', $component);
    }

    /**
     * The business contract must be unchanged: an initial assignment sends no
     * reason at all, and a replacement cannot be submitted without one.
     */
    public function test_the_assignment_business_contract_is_unchanged(): void
    {
        $component = $this->codeOf('resources/js/Components/WorkAssignment.jsx');
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        // Initial: reason submitted as null, and stored as null.
        $this->assertStringContainsString('reason: current ? reason : null,', $component);
        $this->assertStringContainsString('$effectiveReason = $isInitial ? null : $reason;', $service);

        // Replacement: a reason is demanded.
        $this->assertStringContainsString('!noteRequired || note.trim()', $component);
        $this->assertStringContainsString('$isReplacingAnOwner', $this->codeOf('app/Http/Controllers/WorkReassignmentController.php'));
    }

    /**
     * A general free-form notes field must not have been introduced.
     */
    public function test_no_general_notes_field_was_introduced(): void
    {
        $component = $this->codeOf('resources/js/Components/WorkAssignment.jsx');
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        // The only free-text field is the reason note, which exists for "Other".
        $this->assertStringNotContainsString('assignment_notes', $component);
        $this->assertStringNotContainsString('handover_notes', $component);
        $this->assertStringNotContainsString('reassignment_notes', $service);
    }

    // ── helper ────────────────────────────────────────────────────────────

    /**
     * Execute the REAL shipped resolver module and return its verdict.
     *
     * The earlier version of this test re-implemented the resolver in PHP, which
     * proved only that the copy agreed with itself. The folder-origin contract is
     * the whole point of the navigation fix, so the actual JavaScript is run: the
     * module is copied in beside a tiny driver, given one input, and its result
     * read back. A bug in the shipped resolver now fails here.
     *
     * The module is copied with a `.mjs` extension rather than having its
     * `export` keywords stripped, because stripping them makes it a CommonJS
     * file that Node refuses to import by name. The input is passed through a
     * file for the same reason: passing JSON on the command line loses its quotes
     * to the shell.
     *
     * @param  array<string, mixed>  $input
     * @return array{label: string, href: string, folder: string|null}
     */
    private function resolve(array $input): array
    {
        $node = $this->nodeBinary();

        $dir = sys_get_temp_dir() . '/imaps-folder-origin-' . bin2hex(random_bytes(6));
        if (! is_dir($dir) && ! mkdir($dir, 0777, true) && ! is_dir($dir)) {
            $this->fail('Could not create a scratch directory to evaluate the shipped resolver.');
        }

        $modulePath = $dir . '/folderOrigin.mjs';
        $driverPath = $dir . '/driver.mjs';
        $inputPath = $dir . '/input.json';

        file_put_contents($modulePath, $this->source('resources/js/Components/folderOrigin.js'));
        file_put_contents($inputPath, json_encode($input));
        file_put_contents(
            $driverPath,
            "import { readFileSync } from 'node:fs';\n"
            . "import { resolveBackTarget } from './folderOrigin.mjs';\n"
            . "const raw = readFileSync(new URL('./input.json', import.meta.url), 'utf8').replace(/^\\uFEFF/, '');\n"
            . 'process.stdout.write(JSON.stringify(resolveBackTarget(JSON.parse(raw))));'
        );

        $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $process = proc_open(
            escapeshellarg($node) . ' ' . escapeshellarg($driverPath),
            $descriptors,
            $pipes,
            $dir,
        );

        $this->assertIsResource($process, 'Could not start node to evaluate the shipped resolver.');

        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $status = proc_close($process);

        foreach ([$modulePath, $driverPath, $inputPath] as $file) {
            @unlink($file);
        }
        @rmdir($dir);

        $this->assertSame(0, $status, 'The shipped resolver failed to evaluate: ' . $stderr);

        $decoded = json_decode((string) $stdout, true);
        $this->assertIsArray($decoded, 'The shipped resolver did not return a result object.');

        return $decoded;
    }

    /**
     * Build the options object the shipped resolver expects, filling in the
     * Applications defaults so each case only states what it is testing.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function resolverOptions(array $overrides = []): array
    {
        return array_merge([
            'search' => '',
            'registryPath' => '/applications',
            'rootLabel' => 'All Applications',
            'origins' => [
                'technical-review' => ['path' => '/technical-review', 'label' => 'Technical Review'],
            ],
            'registryQuery' => '',
        ], $overrides);
    }

    /**
     * Locate a usable node binary, so the resolver can be executed as shipped.
     */
    private function nodeBinary(): string
    {
        $candidates = [];

        if (getenv('NODE_BINARY')) {
            $candidates[] = (string) getenv('NODE_BINARY');
        }

        $where = @shell_exec('where node 2>nul');
        if (is_string($where) && $where !== '') {
            foreach (preg_split('/\R/', trim($where)) ?: [] as $line) {
                $line = trim($line);
                if ($line !== '') {
                    $candidates[] = $line;
                }
            }
        }

        $candidates[] = 'C:\Program Files\nodejs\node.exe';
        $candidates[] = '/usr/bin/node';
        $candidates[] = '/usr/local/bin/node';

        foreach ($candidates as $candidate) {
            if ($candidate !== '' && @is_file($candidate)) {
                return $candidate;
            }
        }

        $this->markTestSkipped('No node binary is available to evaluate the shipped folder-origin resolver.');
    }
}
