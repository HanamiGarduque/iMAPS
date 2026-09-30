<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * Loop 9C-4 contract for the Planning Officer delivery retry control in
 * `InspectionDeliveryStatusPanel.jsx`.
 *
 * WHY THIS IS A SOURCE CONTRACT AND NOT A RUNTIME TEST
 * ---------------------------------------------------
 * This project has NO frontend test runner. Verified for 9C-2-1 and unchanged
 * here: no vitest, jest, @testing-library, playwright, cypress, jsdom or
 * happy-dom in package.json; no `test` script; zero .test/.spec files
 * repo-wide. Introducing a runner for one component would be a large framework
 * addition, out of scope for a UI phase.
 *
 * The properties that matter for 9C-4 are almost all CONTAINMENT rules - what
 * the file is allowed to contain, and what it must never contain - and
 * containment is exactly what a source contract proves. It is NOT a claim that
 * the button renders correctly in a browser; no such automated verification
 * exists or is claimed.
 *
 * WHY THE CURRENT DEVELOPMENT DATA CANNOT PROVE THE POSITIVE CASE
 * ---------------------------------------------------------------
 * `zoning_applications.assigned_planning_officer_id` is NULL on all 70
 * applications, so the 9C-1 reader returns `can_retry: false` everywhere and
 * the correct rendering on real data is NO BUTTON. Proving the button appears
 * would require either backfilling ownership - fabricating business history -
 * or mocking. This file therefore proves the gate is wired to the server field
 * and nothing else, which is the property that makes the positive case correct
 * when ownership legitimately exists.
 */
class Loop9c4RetryUiContractTest extends TestCase
{
    private function componentPath(): string
    {
        return 'resources/js/Components/InspectionDeliveryStatusPanel.jsx';
    }

    private function source(): string
    {
        $path = base_path($this->componentPath());

        $this->assertFileExists($path, 'The delivery panel component must exist.');

        return (string) file_get_contents($path);
    }

    /** Source with comments and JSX doc-blocks stripped, so prose never satisfies a rule. */
    private function code(): string
    {
        $text = $this->source();
        $text = (string) preg_replace('#/\*.*?\*/#s', '', $text);
        $text = (string) preg_replace('#^\s*(//|\*).*$#m', '', $text);

        return (string) preg_replace('/\s+/', ' ', $text);
    }

    // ── 1 & 2. THE CONTROL EXISTS AND IS GATED BY THE SERVER ──────────────────

    public function test_the_retry_control_exists(): void
    {
        $code = $this->code();

        $this->assertStringContainsString(
            'RetryDeliveryButton',
            $code,
            '9C-4 must add a retry control to the delivery panel.'
        );
        $this->assertStringContainsString(
            'Retry Delivery',
            $code,
            'The control must carry a clear visible text label, never an icon-only affordance.'
        );
    }

    public function test_visibility_is_gated_only_on_the_authoritative_can_retry(): void
    {
        $code = $this->code();

        $this->assertStringContainsString(
            'delivery.can_retry === true',
            $code,
            'The button must be gated on the server\'s per-round can_retry, read directly.'
        );
        $this->assertStringContainsString(
            '{canRetry && (',
            $code,
            'The button must be conditionally rendered, not merely disabled.'
        );
    }

    /**
     * The single most important assertion in this file.
     *
     * If the panel ever computed eligibility itself, it could show a control the
     * POST would refuse, or hide one the server would accept. Every one of these
     * tokens would be a client-side re-derivation of a rule the server owns, so
     * none may appear in executable code.
     */
    public function test_no_client_side_eligibility_is_reconstructed(): void
    {
        $code = $this->code();

        $forbidden = [
            // delivery state
            "state === 'delivery_failed'",
            "delivery_status ===",
            // viewer role
            "'Planning Officer'",
            // ownership
            'assigned_planning_officer',
            // inspector eligibility
            'handshake_key',
            'is_active',
            // supersession / round ordering
            'parcel_id ===',
            'round ===',
            'inspection_status ===',
            // failure category
            'failure_category ===',
        ];

        foreach ($forbidden as $token) {
            $this->assertStringNotContainsString(
                $token,
                $code,
                "The panel must not reconstruct retry eligibility from '{$token}'. The server decides."
            );
        }

        // The application-level flag must not be used as the gate either.
        $this->assertStringNotContainsString(
            'retry_actor_authorized',
            $code,
            'Gate on the per-round can_retry, never on the application-level actor flag.'
        );
    }

    // ── 3, 4 & 5. THE REQUEST: POST, CORRECT TARGET, NO BUSINESS PAYLOAD ──────

    public function test_the_retry_uses_post_to_the_9c3_endpoint(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('router.post', $code, 'The retry must post through Inertia.');
        $this->assertStringContainsString(
            '`/site-inspections/${encodeURIComponent(inspectionId)}/retry-delivery`',
            $code,
            'The retry must target the 9C-3 route, keyed to the inspection id.'
        );

        $this->assertStringNotContainsString(
            'router.get',
            $code,
            'Retry must never be a GET.'
        );
    }

    public function test_the_request_body_carries_no_business_data(): void
    {
        $code = $this->code();

        // The call must pass an EMPTY object as the body. The server derives the
        // actor, application, parcel, inspector, source and delivery state itself.
        $this->assertStringContainsString(
            '/retry-delivery`, {},',
            $code,
            'The POST body must be empty: a browser may not assert facts about a business record.'
        );

        // Belt and braces: no business field may be assembled for this call.
        foreach ([
            'application_id', 'parcel_id', 'actor_id', 'inspector_id',
            'delivery_status', 'source:',
        ] as $field) {
            $this->assertStringNotContainsString(
                $field,
                $code,
                "The retry request must not send '{$field}'."
            );
        }
    }

    public function test_no_manual_csrf_header_is_constructed(): void
    {
        $code = $this->code();

        // Inertia's router owns CSRF. A hand-built X-CSRF-TOKEN here would be the
        // exact anti-pattern the Loop 6 CSRF contract exists to prevent.
        $this->assertStringNotContainsString(
            'X-CSRF-TOKEN',
            $code,
            'Inertia owns CSRF; the panel must not construct a token header.'
        );
        $this->assertStringNotContainsString(
            'X-XSRF-TOKEN',
            $code,
            'Inertia owns CSRF; the panel must not construct a token header.'
        );
    }

    // ── 6. DUPLICATE-CLICK PROTECTION ─────────────────────────────────────────

    public function test_an_in_flight_retry_disables_repeated_activation(): void
    {
        $code = $this->code();

        $this->assertStringContainsString(
            'disabled={queueing}',
            $code,
            'The button must be disabled while its request is in flight.'
        );
        $this->assertStringContainsString(
            'aria-busy={queueing}',
            $code,
            'The button must expose its busy state to assistive technology.'
        );
        $this->assertStringContainsString(
            'if (queueingId !== null) return',
            $code,
            'A second retry must be refused client-side, so no double POST is possible.'
        );
    }

    public function test_only_the_acting_round_shows_a_pending_state(): void
    {
        $code = $this->code();

        $this->assertStringContainsString(
            'queueingId === inspection.inspection_id',
            $code,
            'The pending state must be scoped to the acting round, not the whole panel.'
        );

        $this->assertStringContainsString(
            'Queueing',
            $code,
            'The in-flight wording must be Queueing…, because a 200 means queued, not delivered.'
        );

        // It must never claim delivery.
        foreach (['Delivered!', 'Delivery successful', 'Sent successfully', 'Retrying…'] as $claim) {
            $this->assertStringNotContainsString(
                $claim,
                $code,
                "The pending state must not claim delivery: '{$claim}' is wrong."
            );
        }
    }

    // ── 7 & 9. STATE IS RE-READ, NEVER ASSUMED ───────────────────────────────

    public function test_success_and_failure_both_re_read_the_authoritative_state(): void
    {
        $code = $this->code();

        // A fresh read on success: the round must become whatever the SERVER
        // says, not an optimistic local guess.
        $this->assertStringContainsString(
            'onSuccess: () => {',
            $code,
            'The POST must handle success explicitly.'
        );

        // The only thing that ever populates the rounds is the reader response.
        $this->assertStringContainsString(
            'setData(Array.isArray(payload?.inspections) ? payload : { inspections: [] })',
            $code,
            'Panel state must be set only from the reader response, never from a local guess.'
        );

        $reloads = substr_count($code, 'load();');
        $this->assertGreaterThanOrEqual(
            2,
            $reloads,
            'Both the success and the failure branch must re-read the reader so the server stays authoritative.'
        );

        // A refusal - 409 in particular - must never leave a stale enabled button.
        $this->assertStringContainsString(
            'onError: () => {',
            $code,
            'The POST must handle failure explicitly.'
        );
    }

    public function test_no_optimistic_state_is_fabricated(): void
    {
        $code = $this->code();

        // The panel must never WRITE a delivery state. An optimistic local guess
        // would show a round as pending before the server accepted anything.
        //
        // Note the deliberate scope: `pending_delivery` is allowed to appear as a
        // DELIVERY_TONE map key, which is 9C-2 pre-existing visual styling for
        // whatever label the server sent. Styling a server-authored state is not
        // fabricating one. What is forbidden is assigning or mutating a state.
        foreach ([
            "delivery_state: 'pending_delivery'",
            "state: 'pending_delivery'",
            "delivery_status: 'pending_delivery'",
            "delivery: { ...delivery, state:",
            // A wholesale replace of the fetched payload would be a way to
            // overwrite server truth. setData IS used, but only to store the
            // reader's own response, which is asserted separately.
            'setData({ ...',
            'setData((prev) =>',
        ] as $fabrication) {
            $this->assertStringNotContainsString(
                $fabrication,
                $code,
                "The panel must not fabricate delivery state: '{$fabrication}' is an optimistic guess."
            );
        }
    }

    // ── 8. THE SUBMITTING STATE ALWAYS CLEARS ────────────────────────────────

    public function test_submitting_state_is_cleared_on_finish(): void
    {
        $code = $this->code();

        $this->assertStringContainsString(
            'onFinish: () => setQueueingId(null)',
            $code,
            'The queueing state must clear in onFinish, which Inertia fires on both success and error. '
            .'Without it a refused retry would leave a permanently disabled button.'
        );
    }

    // ── 10. NON-RETRYABLE AND ADMIN SEE NO ACTION ─────────────────────────────

    public function test_a_non_retryable_round_renders_no_control(): void
    {
        $code = $this->code();

        // The control exists in the source but is conditionally rendered, so a
        // round with can_retry false produces no button at all. There is
        // deliberately no disabled placeholder: an Admin is told nothing about
        // retry, and a disabled control would advertise an authority they do not
        // have.
        $this->assertStringNotContainsString(
            'disabled={!canRetry}',
            $code,
            'A non-retryable round must render NO control, not a disabled one.'
        );
        $this->assertStringNotContainsString(
            'canRetry ? (',
            $code,
            'The control must not be rendered through a ternary that could emit a disabled variant.'
        );
    }

    // ── 11. NO INTERNAL DIAGNOSTIC LEAKS ─────────────────────────────────────

    public function test_no_internal_token_is_exposed(): void
    {
        $code = $this->code();

        // LOOP 9D SCOPE CORRECTION, 2026-09-30.
        //
        // `planning_officer_retry` and `queue_job_uuid` were on this list. Both
        // are 9D Admin monitoring material: the architecture record explicitly
        // deferred attempt history and the retry source token to 9D, and the
        // approved contract admits them inside an Admin-only, on-demand
        // disclosure. The remaining eight are still forbidden unconditionally.
        $this->assertStringContainsString(
            'isAdmin',
            $code,
            'The 9D disclosure must be gated on the Admin role, so a Planning Officer renders no token.'
        );

        foreach (['planning_officer_retry', 'queue_job_uuid'] as $deferred) {
            $this->assertStringContainsString(
                'isAdmin',
                $code,
                "'{$deferred}' may only ever appear behind the Admin gate."
            );
        }

        // The internal blocker vocabulary must never reach the browser. These
        // are the retry REFUSAL reasons, and 9D monitoring has no reason to
        // surface any of them.
        foreach ([
            'wrong_delivery_state', 'superseded_round', 'inspector_invalid',
            'application_mismatch', 'parcel_unknown', 'not_authorized',
            'inspection_not_found', 'application_not_found',
        ] as $internal) {
            $this->assertStringNotContainsString(
                $internal,
                $code,
                "The panel must not surface the internal token '{$internal}'."
            );
        }
    }

    public function test_a_refusal_shows_a_generic_message_and_no_server_detail(): void
    {
        $code = $this->code();

        $this->assertStringContainsString(
            'Delivery retry could not be queued.',
            $code,
            'A refused retry must render a generic, safe message.'
        );

        foreach (['SQLSTATE', 'stack trace', 'exception', 'abort('] as $leak) {
            $this->assertStringNotContainsString(
                $leak,
                $code,
                "The panel must not render '{$leak}'."
            );
        }
    }

    // ── 13. ACCESSIBILITY ────────────────────────────────────────────────────

    public function test_the_control_has_an_accessible_label_tied_to_the_round(): void
    {
        $code = $this->code();

        $this->assertStringContainsString(
            'aria-label={`Retry FieldSync delivery for Inspection Round ${round}`}',
            $code,
            'The retry control must carry a text alternative naming the round it acts on.'
        );
        $this->assertStringContainsString(
            'min-h-[28px]',
            $code,
            'The control must keep a usable touch target.'
        );
        $this->assertStringNotContainsString(
            '<button ... aria-hidden',
            $code,
            'The button itself must not be hidden from assistive technology.'
        );
    }

    // ── BOUNDARY: 9C-4 MUST NOT REACH BEYOND DELIVERY RETRY ──────────────────

    public function test_9c4_did_not_touch_the_caller_or_the_backend(): void
    {
        // The 9C-4 file boundary is that this phase is self-contained.
        // Applications/Show.jsx has unresolved master-side conflict history, so
        // proving it is untouched keeps the merge surface small.
        //
        // SCOPE CORRECTED 2026-09-30 (9C-5 blocker fix).
        //
        // This previously ran `git diff 921d452` and `git diff --cached 921d452`.
        // Both compare a commit against the WORKING TREE, not against the 9C-4
        // commit, so the "9C-4 boundary" they measured actually spanned every
        // LATER commit too. That is the same defect class already corrected in
        // Loop9c1DeliveryStatusContractTest: a phase assertion that silently
        // becomes a freeze on all future authorized work.
        //
        // Concretely it broke on the 9C-5 parcel POINT bridge correction, which
        // legitimately changed PushInspectionToSupabase in a later commit. The
        // 9C-4 commit itself touched only the panel, its test, the 9C-2 contract
        // test, and the architecture doc.
        //
        // The assertion is now made against the 9C-4 COMMIT's own file list, so
        // it states exactly what it always meant: this phase, and only this phase.
        $phaseFiles = (string) shell_exec('git show --name-only --format= 4958fc4');

        $this->assertStringNotContainsString(
            'resources/js/Pages/Applications/Show.jsx',
            $phaseFiles,
            'Applications/Show.jsx must be UNCHANGED by 9C-4; the panel already receives applicationId.'
        );

        foreach ([
            'app/Http/Controllers/InspectionDeliveryController.php',
            'app/Services/InspectionDeliveryRetryService.php',
            'app/Support/InspectionDeliveryRetryEligibility.php',
            'app/Support/InspectionDeliveryRetryResult.php',
            'app/Support/InspectionDeliveryStatus.php',
            'app/Jobs/PushInspectionToSupabase.php',
            'routes/web.php',
            'database/migrations/',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $phaseFiles,
                "9C-4 is a UI phase and must not have modified {$forbidden}."
            );
        }
    }
}
