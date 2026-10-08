<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * PHASE 2A - scoped manual reverse sync for the Admin Site Inspection page.
 *
 * THE DEFECT BEING LOCKED OUT
 * --------------------------
 * The Site Inspection list carried a button labelled "Refresh Data" that posted
 * to `POST /site-inspections/sync` -> `SiteInspectionController::forceSync()`,
 * which called `Artisan::call('sync:pull-inspections')` with NO
 * `--local-inspection-id`. The command is namespace-scoped but NOT round-scoped
 * in that call, so one click could write EVERY completed inspection in the
 * namespace. The label also implied a read, which is the worst combination: an
 * invisible bulk write.
 *
 * THE CONTRACT
 * ------------
 * Manual support sync is allowed for Admin, but only as a recovery action
 * scoped to exactly ONE explicitly selected inspection round. It is
 * synchronization, not a business decision: it may not approve, decline, request
 * a reinspection, assign an inspector, schedule or create a round, or edit
 * findings. Those stay Planning Officer / FieldSync.
 *
 * These are source-contract tests. They deliberately do not touch the shared
 * Supabase fixture or the frozen Loop 10 job, because proving this contract must
 * never depend on production data.
 */
class SiteInspectionScopedSyncContractTest extends TestCase
{
    private const ROUTES = 'routes/web.php';

    private const CONTROLLER = 'app/Http/Controllers/SiteInspectionController.php';

    private const COMMAND = 'app/Console/Commands/PullCompletedInspections.php';

    private const LIST_VIEW = 'resources/js/Pages/Site Inspections/Index.jsx';

    private const DETAIL_VIEW = 'resources/js/Pages/Site Inspections/Show.jsx';

    // ==================================================================
    // 1 - Admin can invoke a scoped manual sync for ONE inspection
    // ==================================================================

    public function test_admin_scoped_sync_route_exists(): void
    {
        $routes = $this->read(self::ROUTES);

        $this->assertMatchesRegularExpression(
            "/Route::post\('\/site-inspections\/\{inspection\}\/sync-from-fieldsync'/",
            $routes,
            'The scoped support route must exist and take the inspection as a path parameter.'
        );
        $this->assertStringContainsString("->name('site-inspections.sync-from-fieldsync')", $routes);
        $this->assertStringContainsString('syncOneFromFieldSync', $routes);
    }

    // ==================================================================
    // 2 / 3 - Planning Officer and Site Inspector are NOT granted access
    // ==================================================================

    public function test_scoped_sync_is_admin_only(): void
    {
        $routes = $this->stripPhpComments($this->read(self::ROUTES));

        $start = strpos($routes, "Route::post('/site-inspections/{inspection}/sync-from-fieldsync'");
        $this->assertIsInt($start, 'The scoped sync route must exist.');

        // Assert on the whole route block up to its terminating semicolon rather
        // than on a single line, so the guard cannot be moved to another line to
        // slip past the test.
        $end = strpos($routes, ';', $start);
        $block = substr($routes, $start, $end - $start);

        $this->assertStringContainsString(
            "->middleware('role:Admin')",
            $block,
            'The scoped sync route must be guarded by role:Admin exactly.'
        );
        $this->assertStringNotContainsString(
            'Planning Officer',
            $block,
            'Planning Officer must not be granted the Admin support route.'
        );
    }
    public function test_scoped_sync_is_not_offered_to_site_inspector(): void
    {
        $routes = $this->read(self::ROUTES);

        $this->assertStringNotContainsString(
            "role:Admin,Site Inspector",
            $routes,
            'Site Inspector must never appear in a role guard.'
        );
        $this->assertDoesNotMatchRegularExpression(
            "/sync-from-fieldsync'(?:[^;]*;){0,6}->middleware\([^)]*Site Inspector/s",
            $routes,
            'Site Inspector must not be able to reach the sync route.'
        );
    }

    public function test_po_technical_review_and_assignment_routes_are_untouched(): void
    {
        $routes = $this->read(self::ROUTES);

        // The scope of this change is one root cause. These must remain exactly
        // as they were, PO-only.
        foreach ([
            "/technical-review\/assign-inspector'.*?role:Planning Officer/s",
            "/technical-review\/submit-batch'.*?role:Planning Officer/s",
            "/technical-review\/update-status'.*?role:Planning Officer/s",
            "/site-inspections\/reassign-inspector'.*?role:Planning Officer/s",
            "/site-inspections\/\{inspection\}\/retry-delivery'.*?role:Planning Officer/s",
        ] as $pattern) {
            $this->assertMatchesRegularExpression(
                $pattern,
                $routes,
                'Planning Officer authority must be unchanged by Phase 2A.'
            );
        }
    }

    // ==================================================================
    // 4 - the id is passed to the existing command
    // ==================================================================

    public function test_controller_passes_local_inspection_id_to_the_existing_command(): void
    {
        $controller = $this->read(self::CONTROLLER);

        $this->assertStringContainsString("Artisan::call('sync:pull-inspections'", $controller);
        $this->assertStringContainsString(
            "'--local-inspection-id' => \$localInspectionId",
            $controller,
            'The selected local inspection id must be passed through to the command.'
        );
    }

    public function test_id_passed_is_the_loaded_row_not_raw_user_input(): void
    {
        $controller = $this->read(self::CONTROLLER);

        // The id must come from the row that was actually found, not straight from
        // the URL, so the value is bound to a real record before it is used.
        $this->assertStringContainsString('SiteInspection::find($inspection)', $controller);
        $this->assertStringContainsString('$localInspectionId = (int) $target->id;', $controller);
    }

    // ==================================================================
    // 5 - no unscoped invocation remains in the UI or the controller
    // ==================================================================

    public function test_no_unscoped_command_invocation_remains_in_the_controller(): void
    {
        $controller = $this->read(self::CONTROLLER);

        $this->assertStringNotContainsString('function forceSync', $controller, 'The unscoped method must be gone.');
        $this->assertDoesNotMatchRegularExpression(
            "/Artisan::call\('sync:pull-inspections'\)\s*;/",
            $controller,
            'A bare Artisan::call with no options would be an unscoped bulk pull.'
        );
    }

    public function test_global_sync_route_is_removed(): void
    {
        $routes = $this->read(self::ROUTES);

        $this->assertStringNotContainsString(
            "'/site-inspections/sync'",
            $routes,
            'The global unscoped route must be removed, not merely hidden from the UI.'
        );
        $this->assertStringNotContainsString("name('site-inspections.sync')", $routes);
        $this->assertStringNotContainsString('forceSync', $routes);
    }

    public function test_global_refresh_button_no_longer_triggers_bulk_sync(): void
    {
        $list = $this->read(self::LIST_VIEW);

        $this->assertStringNotContainsString(
            '/site-inspections/sync',
            $list,
            'The list must not call the removed global route.'
        );
        $this->assertStringNotContainsString(
            'router.post(\'/site-inspections/sync\')',
            $list,
            'No unscoped sync call may remain in the list UI.'
        );
    }

    public function test_refresh_data_label_is_gone_from_the_list(): void
    {
        $list = $this->read(self::LIST_VIEW);

        // "Refresh Data" implied a read while performing a write.
        $this->assertStringNotContainsString('>Refresh Data<', $list);
    }

    // ==================================================================
    // 6 - inspection A cannot update inspection B
    // ==================================================================

    public function test_command_filters_on_the_exact_local_inspection_id(): void
    {
        $command = $this->read(self::COMMAND);

        $this->assertStringContainsString(
            "\$filters['local_inspection_id'] = 'eq.'.(int) \$localInspectionId;",
            $command,
            'The command must filter the remote read to the one requested id.'
        );
    }

    public function test_command_iterates_the_scoped_response_only(): void
    {
        $command = $this->read(self::COMMAND);

        $this->assertStringContainsString('foreach ($completedJobs as $job) {', $command);
        $this->assertStringContainsString(
            'SiteInspection::find($localInspectionId)',
            $command,
            'Only the id carried by the scoped remote row is resolved locally.'
        );
    }

    // ==================================================================
    // 7 - bridge_source_id enforcement is untouched
    // ==================================================================

    public function test_bridge_source_scope_is_still_enforced(): void
    {
        $command = $this->read(self::COMMAND);

        $this->assertStringContainsString(
            "\$supabase->scopedFilters(['status' => 'eq.completed'])",
            $command,
            'Namespace scoping must remain in place; it fails closed without a bridge source.'
        );
    }

    public function test_no_alternative_identity_mechanism_was_introduced(): void
    {
        $command = $this->read(self::COMMAND);

        // The bridge read must never be resolved from an application reference.
        $this->assertStringNotContainsString('reference_number', $command);
        $this->assertStringNotContainsString('zoning_application_id', $command);
        $this->assertStringNotContainsString('parcel_id', $command);

        // The controller may read reference_number elsewhere, but the SYNC method
        // must be scoped by the local inspection id alone.
        $code = $this->stripPhpComments($this->read(self::CONTROLLER));
        $start = strpos($code, 'public function syncOneFromFieldSync');
        $end = strpos($code, 'private function describeSyncOutcome');
        $this->assertIsInt($start);
        $this->assertIsInt($end);

        $syncMethod = substr($code, $start, $end - $start);

        foreach (['reference_number', 'zoning_application_id', 'parcel_id'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $syncMethod,
                "The scoped sync method must not use {$forbidden} to resolve identity."
            );
        }
    }
    public function test_synced_count_only_counts_real_writes(): void
    {
        $command = $this->read(self::COMMAND);

        // The old code incremented for every row it merely scanned.
        $this->assertMatchesRegularExpression(
            '/if \(\$localInspection->isDirty\(\)\) \{\s*\$localInspection->save\(\);\s*\$syncedCount\+\+;/s',
            $command,
            'The synced counter must increment only when a row is actually written.'
        );
    }

    public function test_no_change_is_reported_distinctly_from_change(): void
    {
        $command = $this->read(self::COMMAND);

        $this->assertStringContainsString('SYNC_RESULT=CHANGED', $command);
        $this->assertStringContainsString('SYNC_RESULT=NO_CHANGE', $command);
        $this->assertMatchesRegularExpression(
            '/\$syncedCount > 0 \? \'SYNC_RESULT=CHANGED\' : \'SYNC_RESULT=NO_CHANGE\'/',
            $command,
            'The reported result must follow whether anything was actually written.'
        );
    }

    public function test_controller_distinguishes_every_outcome(): void
    {
        $controller = $this->read(self::CONTROLLER);

        foreach ([
            'SYNC_RESULT=CHANGED',
            'SYNC_RESULT=NO_CHANGE',
            'SYNC_RESULT=NO_REMOTE_RESULT',
            'SYNC_RESULT=FAILED',
        ] as $token) {
            $this->assertStringContainsString($token, $controller);
        }

        // An unrecognised result must never be reported as a success.
        $this->assertMatchesRegularExpression(
            '/no change was confirmed/',
            $controller,
            'An unknown outcome must be reported as unconfirmed, not as success.'
        );
    }

    // ==================================================================
    // 9 - a missing inspection is refused
    // ==================================================================

    public function test_missing_inspection_is_refused_without_syncing(): void
    {
        $controller = $this->read(self::CONTROLLER);

        $this->assertMatchesRegularExpression(
            '/if \(! \$target\) \{\s*return back\(\)->with\(/s',
            $controller,
            'A nonexistent inspection must be refused before the command runs.'
        );

        // The guard must precede the Artisan call.
        // Comments are stripped first: the method docblock quotes the command by
        // name, so a raw position lookup would match the PROSE instead of the call.
        $code = $this->stripPhpComments($controller);
        $guardPos = strpos($code, 'if (! $target)');
        $callPos = strpos($code, "Artisan::call('sync:pull-inspections'");
        $this->assertIsInt($guardPos);
        $this->assertIsInt($callPos);
        $this->assertLessThan(
            $callPos,
            $guardPos,
            'The existence check must run BEFORE the command is invoked.'
        );
    }

    public function test_command_still_rejects_a_non_positive_id(): void
    {
        $command = $this->read(self::COMMAND);

        $this->assertStringContainsString(
            'The --local-inspection-id option must be a positive integer.',
            $command,
            'The command keeps its own input validation.'
        );
    }

    // ==================================================================
    // 10 - the UI presents it as support, not as a refresh
    // ==================================================================

    public function test_detail_page_offers_the_scoped_support_action(): void
    {
        $show = $this->read(self::DETAIL_VIEW);

        $this->assertStringContainsString('/site-inspections/${ins.id}/sync-from-fieldsync', $show);
        $this->assertStringContainsString('Sync from FieldSync', $show);
        $this->assertStringContainsString('Admin Support Actions', $show);
    }

    public function test_support_action_states_it_cannot_take_business_decisions(): void
    {
        $show = $this->read(self::DETAIL_VIEW);

        $this->assertMatchesRegularExpression(
            '/does not approve,\s*decline, request a reinspection, reassign an inspector,\s*schedule a round, or edit findings/s',
            $show,
            'The control must state on screen that it holds no PO business authority.'
        );
    }

    public function test_support_action_confirms_before_writing(): void
    {
        $show = $this->read(self::DETAIL_VIEW);

        // UPDATED: this used to assert `window.confirm(`. The native dialog is
        // browser chrome, so the confirmation now goes through the shared Modal
        // component. The contract being protected is unchanged - the Admin must
        // confirm, and the confirmation must state the single-round scope and
        // the absence of PO authority.
        //
        // Asserted against comment-stripped source: the page carries a note
        // explaining that the native dialog was removed, and that prose names
        // `window.confirm(` without calling it.
        $this->assertStringNotContainsString(
            'window.confirm(',
            $this->stripJsComments($show),
            'The scoped sync must not use the browser-native confirmation dialog.'
        );

        $this->assertStringContainsString(
            '<Modal show={syncConfirmOpen}',
            $show,
            'The confirmation must be rendered with the shared Modal component.'
        );

        // The request is issued from the confirm control only, so cancelling
        // cannot write.
        $this->assertMatchesRegularExpression(
            '/onClick=\{runScopedSync\}/',
            $show,
            'Only the confirm control may issue the scoped sync request.'
        );

        // \s* because the JSX text wraps mid-sentence.
        $this->assertMatchesRegularExpression(
            '/Only this inspection round can be\s+(updated|changed)/',
            $show,
            'The confirmation must state the single-round scope.'
        );
    }

    public function test_detail_page_renders_the_flash_outcome(): void
    {
        $show = $this->read(self::DETAIL_VIEW);

        // UPDATED: the banner used to be derived from `usePage().props.flash`
        // during render, which made the outcome a side effect of a re-render
        // rather than a consequence of the request that caused it - so a
        // completed run could leave the Admin with no visible answer. The
        // outcome is now set from the request's own success/error callback.
        $this->assertMatchesRegularExpression(
            '/onSuccess:\s*\(page\)\s*=>/',
            $show,
            'The scoped sync must read its outcome from the request itself.'
        );

        $this->assertStringContainsString(
            'page?.props?.flash',
            $show,
            'The wording must still come from the flash the controller set, so the '
            .'server remains the single source of truth for the outcome.'
        );

        $this->assertMatchesRegularExpression('/\{syncOutcome && \(/', $show);

        // An unrecognised result and a failed request must both report
        // themselves rather than finishing silently.
        $this->assertMatchesRegularExpression(
            '/onError:\s*\(\)\s*=>/',
            $show,
            'A failed run must still produce visible feedback.'
        );
    }

    // ==================================================================
    // 11 - the recent visibility fix is preserved
    // ==================================================================

    public function test_inspection_card_visibility_fix_is_preserved(): void
    {
        $list = $this->read(self::LIST_VIEW);

        // Assert on the element that actually renders the application reference,
        // rather than on the whole file: the explanatory comment block names the
        // removed class while describing it, so a file-wide search would match
        // that prose instead of the markup.
        $this->assertSame(
            1,
            preg_match(
                '/<span className="([^"]*)">\s*\{item\.display_reference/',
                $list,
                $m
            ),
            'The application reference must be rendered by exactly one element.'
        );

        $this->assertStringNotContainsString(
            'line-clamp',
            $m[1],
            'The application reference must not be clamped; a truncated unique key is not acceptable.'
        );
        $this->assertStringContainsString('break-words', $m[1], 'The reference must be allowed to wrap.');

        $this->assertStringContainsString('INS-{item.id}', $list);
        $this->assertStringContainsString('grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', $list);
    }
    public function test_completed_checkmark_and_folder_navigation_are_preserved(): void
    {
        $list = $this->read(self::LIST_VIEW);

        $this->assertStringContainsString("item.status === 'completed'", $list);
        $this->assertStringContainsString('detailUrlFromFolder(', $list);
        $this->assertStringContainsString('setSelectedFolder(', $list);
    }

    // ==================================================================
    // helpers
    // ==================================================================

    /**
     * PHP comments removed, so an assertion about what the code EXECUTES cannot be
     * satisfied or broken by its own explanatory prose.
     */
    private function stripPhpComments(string $source): string
    {
        $source = preg_replace('#/\*.*?\*/#s', '', $source) ?? $source;

        return preg_replace('#^\s*//.*$#m', '', $source) ?? $source;
    }

    /** JSX comment blocks removed, for the same reason. */
    private function stripJsxComments(string $source): string
    {
        return preg_replace('#\{\s*/\*.*?\*/\s*\}#s', '', $source) ?? $source;
    }

    private function read(string $relative): string
    {
        $path = dirname(__DIR__, 2) . '/' . $relative;

        $this->assertFileExists($path, 'Missing file: ' . $relative);

        $contents = (string) file_get_contents($path);
        $this->assertNotSame('', $contents, 'Empty file: ' . $relative);

        return $contents;
    }

    /**
     * Blank comment bodies so an explanatory note cannot satisfy an assertion.
     *
     * Several of these contracts assert on the ABSENCE of something (a native
     * dialog, a busy latch). A note documenting that the thing was removed
     * names it in prose, so an unstripped source would make the page look like
     * it still contains it.
     */
    private function stripJsComments(string $source): string
    {
        $stripped = preg_replace('#/\*[\s\S]*?\*/#', '', $source) ?? $source;

        return preg_replace('#^\s*//.*$#m', '', $stripped) ?? $stripped;
    }
}
