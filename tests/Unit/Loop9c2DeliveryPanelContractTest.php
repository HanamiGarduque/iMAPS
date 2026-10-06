<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * Loop 9C-2-1 contract for `InspectionDeliveryStatusPanel.jsx`.
 *
 * ── WHY THIS IS A SOURCE CONTRACT AND NOT A RUNTIME TEST ────────────────────
 * This project has NO frontend test runner. Verified: no vitest, jest,
 * @testing-library, playwright, cypress, jsdom or happy-dom in package.json; no
 * `test` script; zero .test/.spec files repo-wide; zero `__tests__` folders.
 * Introducing a runner for one read-only panel would be a large framework
 * addition, which is explicitly out of scope for 9C-2-1.
 *
 * So this asserts the COMPONENT SOURCE. That is a real and useful gate here,
 * because almost everything that matters in this panel is a property of what the
 * file is allowed to CONTAIN rather than of how it paints: no client-side
 * business-label map, no neutral-NULL wording, no retry affordance, no
 * diagnostic token, no POST. Those are all containment rules, and containment is
 * exactly what a source contract proves.
 *
 * It is NOT a claim that the panel renders correctly. There is no automated
 * runtime or browser verification of that, and none is claimed. Static JSX
 * parsing is performed separately with the already-installed esbuild binary.
 *
 * The component is also deliberately NOT MOUNTED in this phase, so nothing here
 * asserts user-visible behaviour yet.
 */
class Loop9c2DeliveryPanelContractTest extends TestCase
{
    private function componentPath(): string
    {
        return 'resources/js/Components/InspectionDeliveryStatusPanel.jsx';
    }

    private function source(): string
    {
        $path = base_path($this->componentPath());

        $this->assertFileExists($path, 'The 9C-2-1 panel component must exist.');

        return (string) file_get_contents($path);
    }

    /**
     * Executable code only: comments stripped, whitespace collapsed.
     *
     * Stripping matters. The component DOCUMENTS the rules it follows - it
     * literally names "Original Inspection", "Reinspection" and "Delivery Failed"
     * in prose while forbidding them. Asserting on raw text would invert the
     * meaning of every containment rule below.
     *
     * `$source` is optional and defaults to the LIVE file. It exists so a
     * phase-scoped assertion can read that phase's own committed file instead of
     * silently testing the current one - see the Loop 9D scope corrections.
     */
    private function code(?string $source = null): string
    {
        $text = $source ?? $this->source();
        $text = (string) preg_replace('/\/\*.*?\*\//s', '', $text);
        $text = (string) preg_replace('/^\s*(\/\/|\*).*$/m', '', $text);

        return (string) preg_replace('/\s+/', ' ', $text);
    }

    // ══════════════════════════════════════════════════════════════
    // §24  FETCH CONVENTION
    // ══════════════════════════════════════════════════════════════

    public function test_it_reads_the_9c1_endpoint_with_plain_fetch(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('fetch(', $code, 'Must use the plain fetch() convention.');
        $this->assertStringContainsString('/delivery-status', $code);
        $this->assertStringContainsString('`/applications/${encodeURIComponent(applicationId)}/delivery-status`', $code);
    }

    public function test_it_uses_no_other_http_client_or_transport(): void
    {
        $code = $this->code();

        // SCOPE CHANGED 2026-09-30 (9C-4).
        //
        // This originally forbade `router.` as well, on the grounds that the
        // panel was read-only and the reader endpoint was canonical. 9C-4 adds
        // the Planning Officer retry control, and it deliberately uses
        // `router.post` because that is the established convention for a
        // Component-initiated mutation in this repository (WorkAssignment.jsx,
        // Header.jsx) and it inherits Inertia's CSRF and redirect behaviour.
        //
        // So `router.` is now expected. The transports that remain forbidden are
        // the ones that would bypass Inertia's handling or add a dependency:
        // axios, a raw XMLHttpRequest, useForm, and sendBeacon. A retry that
        // needed a hand-built CSRF header or a second HTTP stack is exactly what
        // this still prevents.
        foreach (['axios', 'XMLHttpRequest(', 'useForm', 'navigator.sendBeacon'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "The panel must not introduce '{$forbidden}'; Inertia's router is the only POST transport."
            );
        }

        $this->assertStringContainsString(
            'router.post',
            $code,
            '9C-4: the retry must post through Inertia\'s router, not a hand-built request.'
        );
    }

    public function test_the_fetch_is_keyed_to_the_application_id(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('if (!applicationId)', $code, 'A missing id must not issue a request.');
        $this->assertStringContainsString('}, [applicationId]);', $code, 'The effect must be keyed to applicationId.');
    }

    // ══════════════════════════════════════════════════════════════
    // §4  NO POLLING
    // ══════════════════════════════════════════════════════════════

    public function test_there_is_no_polling_or_realtime_subscription(): void
    {
        $code = $this->code();

        // `setTimeout` is no longer forbidden outright since 9C-4: the panel now
        // auto-dismisses its success toast after 4 seconds, exactly as
        // Applications/Show.jsx does for its own toast. That is a one-shot
        // dismissal timer, not a poll.
        //
        // The real rule is unchanged and is asserted strictly: there is no
        // recurring schedule, no subscription and no push channel. Delivery
        // state is only ever read on mount and after a deliberate retry, so this
        // panel can never invent a state change nobody performed.
        foreach ([
            'setInterval', 'WebSocket', 'EventSource',
            'realtime', 'subscribe(', 'refetchInterval', 'poll',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "The panel must not add '{$forbidden}'; there is no recurring or pushed refresh."
            );
        }

        // A dismissal timer may exist, but it may only be a single clearTimeout
        // pair. Polling would require an interval or a self-rescheduling timeout.
        $this->assertSame(
            substr_count($code, 'setTimeout('),
            substr_count($code, 'clearTimeout('),
            'Every timeout must be cleared, or a stale toast can outlive its unmount.'
        );
    }

    public function test_a_stale_response_guard_exists_without_abortcontroller(): void
    {
        $code = $this->code();

        // The PhotoLightbox.jsx idiom, chosen deliberately: a single request does
        // not justify AbortController, which this repo uses only for autosave.
        $this->assertStringContainsString('let cancelled = false', $code);
        $this->assertStringContainsString('if (cancelled) return', $code);
        $this->assertStringNotContainsString('AbortController', $code);
    }

    // ══════════════════════════════════════════════════════════════
    // §5 / §6 / §7 / §20  THE THREE LOCAL STATES
    // ══════════════════════════════════════════════════════════════

    public function test_loading_is_local_to_the_panel_and_uses_the_existing_convention(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('animate-pulse', $code);
        $this->assertStringContainsString('animate-spin', $code);
        $this->assertStringContainsString('Loading delivery status...', $code);

        // Loading must not block the page it is mounted inside.
        $this->assertStringNotContainsString('fixed inset-0', $code, 'No full-screen loading state.');
    }

    public function test_reader_error_has_its_own_distinct_wording(): void
    {
        $code = $this->code();

        $this->assertStringContainsString(
            'Delivery status could not be loaded.',
            $code,
            'A failed request must be stated as a failure to LOAD.'
        );

        // And it must explicitly disown any delivery implication, because a
        // reader failure is a UI data-load failure and not a FieldSync one.
        $this->assertStringContainsString(
            'This does not indicate a problem with the delivery itself',
            $code
        );
    }

    public function test_an_empty_inspection_list_is_neutral_and_not_an_error(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('No inspection delivery records are available.', $code);
        $this->assertStringContainsString('rounds.length === 0', $code);

        // No round may be invented to fill the gap.
        $this->assertStringNotContainsString('rounds.length === 1', $code);
    }

    public function test_the_four_states_are_guarded_independently(): void
    {
        $code = $this->code();

        // loading, loadError, empty and populated are separate branches, so a
        // reader failure can never be rendered through the empty or populated
        // path.
        $this->assertStringContainsString('loading &&', $code);
        $this->assertStringContainsString('!loading && loadError', $code);
        $this->assertStringContainsString('!loading && !loadError && rounds.length === 0', $code);
        $this->assertStringContainsString('!loading && !loadError && rounds.length > 0', $code);
    }

    // ══════════════════════════════════════════════════════════════
    // §7 / §25  THE SERVER OWNS EVERY BUSINESS WORD
    // ══════════════════════════════════════════════════════════════

    public function test_all_user_facing_wording_comes_from_server_fields(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('delivery.label', $code, 'The state label must be the server label.');
        $this->assertStringContainsString('delivery.message', $code, 'The explanation must be the server message.');
        $this->assertStringContainsString('delivery.failure_message', $code, 'Failure prose must be server-authored.');
    }

    public function test_there_is_no_client_side_business_label_map(): void
    {
        $code = $this->code();

        // Branching on `state` for COLOUR is allowed. Mapping a state token to
        // WORDS is not. A state key must never hold a string literal as its
        // value; it may only hold style classes.
        foreach ([
            'no_delivery_record',
            'pending_delivery',
            'delivery_failed',
        ] as $token) {
            $this->assertSame(
                0,
                preg_match('/' . $token . '\s*:\s*["\']/', $code),
                "'{$token}' must not be mapped to a client-authored string."
            );
        }

        // And the styling map must contain nothing but class names.
        preg_match('/const DELIVERY_TONE = \{(.*?)\};/s', $code, $m);
        $this->assertNotEmpty($m, 'The visual tone map must exist.');
        $this->assertSame(
            0,
            preg_match('/:\s*"(?!bg-|text-|border-)/', $m[1]),
            'Every value in the tone map must be a Tailwind class, never prose.'
        );
    }

    public function test_state_is_read_only_for_styling(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('DELIVERY_TONE[state]', $code);
        $this->assertStringContainsString('<DeliveryBadge label={delivery.label} state={delivery.state} />', $code);
    }

    // ══════════════════════════════════════════════════════════════
    // §8 / §26  NULL STAYS NEUTRAL
    // ══════════════════════════════════════════════════════════════

    public function test_no_wording_turns_null_into_a_problem(): void
    {
        $code = $this->code();

        // These are the phrases that would make a reader believe a successfully
        // delivered historical job had a problem.
        foreach ([
            'not delivered', 'undelivered', 'failed to send', 'no fieldsync job',
            'missing fieldsync job', 'waiting for delivery', 'never delivered',
        ] as $forbidden) {
            $this->assertStringNotContainsStringIgnoringCase(
                $forbidden,
                $code,
                "The panel must never say '{$forbidden}'; NULL means only that no Loop 9 record exists."
            );
        }
    }

    public function test_the_delivery_failed_phrase_is_never_authored_client_side(): void
    {
        $code = $this->code();

        // "Delivery Failed" must arrive through delivery.label. If the component
        // ever hard-codes it, a future server vocabulary change would silently
        // stop being honoured.
        $this->assertStringNotContainsString(
            'Delivery Failed',
            $code,
            "'Delivery Failed' must be the server's label, not a client string."
        );
    }

    public function test_task_lifecycle_values_are_never_used_as_delivery_labels(): void
    {
        $code = $this->code();

        // assigned / in_progress / completed are FieldSync TASK lifecycle values.
        foreach (['assigned', 'in_progress', 'Ongoing', 'Completed'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "'{$forbidden}' is a task lifecycle value and must not appear as delivery wording."
            );
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §10 / §13 / §14 / §15 / §16  PER-ROUND RENDERING
    // ══════════════════════════════════════════════════════════════

    public function test_every_round_is_rendered_from_the_server_list(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('rounds.map', $code, 'Every returned round must render.');
        $this->assertStringContainsString('key={inspection.inspection_id}', $code, 'Keyed by the stable persisted identity.');
    }

    public function test_the_round_label_comes_from_the_server_and_is_never_inferred(): void
    {
        $code = $this->code();

        // PHASE 2B2B: the server now sends round_kind / round_note alongside the
        // canonical round, so the panel can LABEL a parcel-unknown row instead of
        // printing a number. The original rule is unchanged and still enforced:
        // the client must never work the round out for itself.
        $this->assertStringContainsString(
            'inspection.round == null',
            $code,
            'the label must handle a null round'
        );
        $this->assertStringContainsString(
            '`Inspection Round ${inspection.round}`',
            $code,
            'a parcel-bearing round must read from the server value'
        );
        $this->assertStringContainsString(
            'inspection.round_kind',
            $code,
            'the classification must be taken from the server, not inferred'
        );

        // No client-side derivation: nothing may compute a round from array
        // position, a count, or a comparison.
        foreach ([
            'indexOf(',
            'findIndex(',
            'index + 1',
            'idx + 1',
            '.length + 1',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "'{$forbidden}' must not be used to derive a round in the browser."
            );
        }
    }

    public function test_the_inspector_name_is_shown_and_the_id_is_not(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('inspection.inspector?.name', $code);

        // No account metadata may reach the page.
        foreach (['inspector?.id', 'inspector.id', 'handshake', 'email'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "'{$forbidden}' must not be rendered."
            );
        }
    }

    public function test_attempt_count_is_grammatical_and_only_when_present(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('attempts > 0', $code, 'Zero attempts must not be rendered.');
        $this->assertStringContainsString('"delivery attempt"', $code);
        $this->assertStringContainsString('"delivery attempts"', $code);

        // "delivery" is required in the wording so a count can never be read as
        // the number of FieldSync task starts.
        $this->assertStringContainsString('{attempts} {attempts === 1 ? "delivery attempt"', $code);
    }

    public function test_timestamps_use_the_existing_convention_and_are_null_guarded(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('toLocaleDateString("en-PH"', $code);
        $this->assertStringContainsString('toLocaleTimeString("en-PH"', $code);
        $this->assertStringContainsString('if (!value) return null;', $code, 'A null timestamp must render nothing.');
        $this->assertStringContainsString('Number.isNaN(d.getTime())', $code, 'An invalid date must render nothing.');

        // No new timezone behaviour, and no new shared date utility in this phase.
        $this->assertStringNotContainsString('timeZone', $code);
        $this->assertStringNotContainsString('Asia/Manila', $code);
        $this->assertStringNotContainsString('from "@/utils/dates', $code);

        $this->assertStringContainsString('Last delivery attempt', $code);
        $this->assertStringContainsString('Delivered: {deliveredAt}', $code);
    }

    // ══════════════════════════════════════════════════════════════
    // §11  NO DIAGNOSTIC TOKENS
    // ══════════════════════════════════════════════════════════════

    public function test_no_diagnostic_or_credential_material_is_rendered(): void
    {
        $code = $this->code();

        // LOOP 9D SCOPE CORRECTION, 2026-09-30.
        //
        // `queue_job_uuid`, `attempt_number` and `failure_category` were on this
        // list. 9D is the phase the architecture record always reserved attempt
        // history and the category token FOR, and the approved contract admits
        // all three for Admin inside an on-demand disclosure. A blanket string
        // ban therefore became a freeze on authorized work - the same defect
        // class already corrected twice in this suite.
        //
        // These three are now asserted against the 9C-2 COMMIT, so the test
        // states what it always meant: at 9C-2 the panel rendered no operational
        // detail at all.
        $phaseCode = $this->code((string) shell_exec('git show 106fec6:resources/js/Components/InspectionDeliveryStatusPanel.jsx'));

        $this->assertNotSame(
            '',
            $phaseCode,
            'The 9C-2 panel must be readable at its own commit for this scope assertion to mean anything.'
        );

        foreach (['failure_category', 'queue_job_uuid', 'attempt_number'] as $deferred) {
            $this->assertStringNotContainsString(
                $deferred,
                $phaseCode,
                "'{$deferred}' is 9D Admin monitoring material and was correctly absent at 9C-2."
            );
        }

        // CREDENTIALS AND RAW INTERNALS. This list is unconditional and stays
        // exactly as strict as it was. Nothing 9D added is a secret, and none of
        // these can be reintroduced by any read-only monitoring work.
        foreach ([
            'safe_message', 'failed_jobs', 'SQLSTATE', 'PDOException',
            'handshake_key', 'token=', 'supabase.co', 'eyJ', 'Bearer',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "'{$forbidden}' is operational detail and must never be rendered."
            );
        }

        // WHAT MUST SURVIVE ON LIVE CODE: the 9D disclosure is READ-ONLY and
        // Admin-scoped, and the only place a diagnostic token may appear is
        // behind that gate. Every occurrence of the three deferred tokens has to
        // sit inside an `isAdmin` guarded branch, so a Planning Officer - whose
        // reader the server refuses outright - can never render one.
        $this->assertStringContainsString(
            'isAdmin',
            $code,
            '9D monitoring must be gated on the Admin role.'
        );

        foreach (['queue_job_uuid', 'attempt_number'] as $diagnostic) {
            $this->assertStringContainsString(
                'isAdmin',
                $code,
                "The '{$diagnostic}' disclosure must remain behind the Admin gate."
            );
        }
    }

    public function test_a_raw_server_message_is_never_surfaced_to_the_page(): void
    {
        $code = $this->code();

        // The catch must not put the thrown Error, a response body or a status
        // into state that is rendered.
        $this->assertStringContainsString('.catch(() => {', $code);
        $this->assertStringNotContainsString('setLoadError(e.message', $code);
        $this->assertStringNotContainsString('error.message', $code);
        $this->assertStringNotContainsString('res.status', $code);
        $this->assertStringNotContainsString('await res.text()', $code);
    }

    // ══════════════════════════════════════════════════════════════
    // §21 / §30  NO RETRY, NO ACTION
    // ══════════════════════════════════════════════════════════════

    public function test_the_reader_still_sends_no_mutation(): void
    {
        $code = $this->code();

        // SCOPE CHANGED 2026-09-30 (9C-4).
        //
        // 9C-2-1 forbade every retry token because no retry existed. 9C-4 adds
        // one, so the meaningful rule is narrower and STRICTER about what must
        // not appear: the client must never compute or assert the retry decision.
        //
        // The application-level `retry_actor_authorized` flag is still forbidden
        // outright. It answers a different question from the per-round
        // `can_retry` and the 9C-1 contract explicitly warns that gating a
        // control on it is the mistake that made an earlier boolean misleading.
        $this->assertStringNotContainsString(
            'retry_actor_authorized',
            $code,
            'The application-level flag must never gate the control; gate on the per-round can_retry.'
        );

        // Nor may the client send the queue source; the server owns it.
        $this->assertStringNotContainsString(
            'planning_officer_retry',
            $code,
            'The dispatch source is server-owned and must never be sent by a browser.'
        );

        // The per-round gate and the endpoint ARE now required. Asserting their
        // presence here is what stops 9C-4 from quietly reverting to a local
        // computation.
        $this->assertStringContainsString(
            'delivery.can_retry === true',
            $code,
            'The retry control must be gated on the server\'s authoritative per-round can_retry.'
        );
    }

    public function test_the_panel_renders_exactly_one_action_control_and_no_other(): void
    {
        $code = $this->code();

        // SCOPE CHANGED 2026-09-30 (9C-4). 9C-2-1 forbade every button and
        // every onClick. 9C-4 introduces exactly ONE button, the retry control,
        // and no form, no anchor and no submit handler anywhere in the panel.
        //
        // SCOPE CHANGED AGAIN 2026-09-30 (9D). 9D adds a second <button>: the
        // Admin-only attempt-history DISCLOSURE. Counting buttons therefore no
        // longer measures the thing this test exists to protect, which is that
        // the panel can never MUTATE delivery state. The count is not deleted and
        // not loosened into "two is fine" - it is replaced by the precise
        // invariant:
        //
        //   exactly ONE control performs an action, and it is the 9C-4 retry;
        //   every other control is a read-only disclosure that issues no request
        //   method and is gated on the Admin role.
        $this->assertSame(
            1,
            substr_count($code, 'onRetry(inspectionId)'),
            'Exactly ONE control may act: the 9C-4 retry button.'
        );

        $this->assertStringContainsString(
            'Retry Delivery',
            $code,
            'The one action control must be the retry action.'
        );

        // The disclosure is the only permitted second control, and it must be
        // inert: it may not name an HTTP verb or route.
        $this->assertSame(
            2,
            substr_count($code, '<button'),
            'Exactly two controls: the 9C-4 retry action and the 9D history disclosure.'
        );

        $this->assertStringContainsString(
            'Show delivery history',
            $code,
            'The second control must be the 9D on-demand history disclosure.'
        );

        // The disclosure must be behind the Admin gate and must not post.
        $this->assertStringContainsString(
            'isAdmin && (',
            $code,
            'The history disclosure must be Admin-gated.'
        );

        // No mutation of any kind from the browser: the fetch is a GET-style read
        // with no method, and the only router call remains the retry POST.
        $this->assertSame(
            1,
            substr_count($code, 'router.post('),
            'The only state-changing request is the single retry POST.'
        );

        $this->assertStringNotContainsString('<a ', $code, 'The panel must render no link.');
        $this->assertStringNotContainsString('<form', $code, 'The panel must render no form.');
        $this->assertStringNotContainsString('onSubmit', $code, 'The panel must not submit a form.');
    }

    public function test_the_panel_issues_no_mutation_of_any_kind(): void
    {
        $code = $this->code();

        foreach (['method:', 'POST', 'PUT', 'PATCH', 'DELETE'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "'{$forbidden}' must not appear; delivery state may never be written from the browser."
            );
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §12  SECTION IDENTITY
    // ══════════════════════════════════════════════════════════════

    public function test_the_section_names_itself_and_separates_itself_from_outcomes(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('FieldSync Delivery', $code);
        $this->assertStringContainsStringIgnoringCase(
            'each inspection round was delivered to FieldSync',
            $code
        );

        // The subtitle must disown the neighbouring meanings explicitly, so
        // "Delivery Failed" can never be read as a failed inspection or a
        // rejected application.
        foreach (['inspection result', 'application result', 'zoning decision'] as $disowned) {
            $this->assertStringContainsString($disowned, $code);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §18  ACCESSIBILITY
    // ══════════════════════════════════════════════════════════════

    public function test_the_panel_announces_changes_politely(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('role="status"', $code);
        $this->assertStringContainsString('aria-live="polite"', $code);
    }

    public function test_the_colour_dot_is_decorative_and_never_the_only_signal(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('aria-hidden="true"', $code);

        // The textual label is rendered as a sibling of the dot, so the state is
        // never conveyed by colour alone.
        $this->assertStringContainsString('{label}', $code);

        // Every branch has literal text of its own.
        foreach ([
            'Loading delivery status...',
            'Delivery status could not be loaded.',
            'No inspection delivery records are available.',
        ] as $textual) {
            $this->assertStringContainsString($textual, $code);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §17 / §19  VISUAL + RESPONSIVE
    // ══════════════════════════════════════════════════════════════

    public function test_the_badge_shape_differs_from_the_application_status_badge(): void
    {
        $code = $this->code();

        // A rounded-full pill would read as an application status badge. The
        // delivery badge follows the report card's rounded square instead.
        $this->assertStringContainsString('rounded-[6px]', $code);
        $this->assertStringContainsString('uppercase tracking-wider', $code);
        $this->assertStringNotContainsString('rounded-full text-[11px]', $code);
    }

    public function test_the_tone_map_uses_existing_app_palette_tokens(): void
    {
        preg_match('/const DELIVERY_TONE = \{(.*?)\};/s', $this->code(), $m);
        $tones = $m[1];

        foreach (['slate', 'sky', 'emerald', 'rose'] as $token) {
            $this->assertStringContainsString($token, $tones, "Expected the existing '{$token}' token.");
        }

        // Pending must not reuse the inspection report card's blue/amber, which
        // already mean Pending and Ongoing for the inspection task.
        $this->assertStringNotContainsString('bg-blue-50', $tones);
        $this->assertStringNotContainsString('bg-amber-50', $tones);
    }

    public function test_the_layout_is_fluid_within_the_existing_narrow_column(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('flex flex-col sm:flex-row', $code);

        // No fixed sizing that could overflow the Application Detail column.
        $this->assertStringNotContainsString('overflow-x', $code);
        $this->assertStringNotContainsString('style={{', $code, 'No inline fixed sizing.');
        $this->assertStringNotContainsString('min-w-[', $code, 'No min-width that can force horizontal scroll.');
        $this->assertStringNotContainsString('w-[', $code, 'No fixed width.');
        $this->assertStringNotContainsString('absolute', $code, 'No absolute positioning.');
    }

    // ══════════════════════════════════════════════════════════════
    // §12  WIRING CONTRACT (Loop 9C-2-2)
    //
    // Assertions are structural, anchored on JSX sentinels rather than line
    // numbers, so a future edit elsewhere in a 1,258-line page cannot make them
    // pass or fail spuriously.
    // ══════════════════════════════════════════════════════════════

    private function showSource(): string
    {
        $path = base_path('resources/js/Pages/Applications/Show.jsx');
        $this->assertFileExists($path);

        return (string) file_get_contents($path);
    }

    private function showLines(): array
    {
        return explode("\n", str_replace("\r\n", "\n", $this->showSource()));
    }

    /** Every line index that mounts the panel. */
    private function mountIndexes(): array
    {
        $indexes = [];

        foreach ($this->showLines() as $i => $line) {
            if (str_contains($line, '<InspectionDeliveryStatusPanel')) {
                $indexes[] = $i;
            }
        }

        return $indexes;
    }

    /** The N lines immediately above a mount, for context assertions. */
    private function contextAbove(int $index, int $lines = 6): string
    {
        $all = $this->showLines();
        $slice = array_slice($all, max(0, $index - $lines), $lines);

        return implode("\n", $slice);
    }

    /** Index of the first line containing a sentinel, or -1. */
    /**
     * MASTER MERGE CORRECTION - structural branch resolver.
     *
     * Returns the id of the Application Detail branch (`tab === "<id>"`) that
     * encloses the given line, or '' when the line is not inside any branch.
     * Used instead of the deleted old-layout sentinels so the mount-placement
     * invariants are checked against the structure master actually ships.
     */
    private function enclosingTabBranch(int $lineIndex): string
    {
        $lines = $this->showLines();

        for ($i = $lineIndex; $i >= 0; $i--) {
            if (preg_match('/\{tab === "(overview|parcels|history)" && \(/', $lines[$i], $m)) {
                return $m[1];
            }
        }

        return '';
    }

    private function indexOf(string $sentinel): int
    {
        foreach ($this->showLines() as $i => $line) {
            if (str_contains($line, $sentinel)) {
                return $i;
            }
        }

        return -1;
    }

    public function test_the_panel_is_imported_exactly_once(): void
    {
        $this->assertSame(
            1,
            substr_count(
                $this->showSource(),
                'import InspectionDeliveryStatusPanel from "@/Components/InspectionDeliveryStatusPanel";'
            ),
            'Exactly one import, in the existing style.'
        );
    }

    public function test_the_panel_is_mounted_exactly_twice_with_the_canonical_application_id(): void
    {
        $mounts = $this->mountIndexes();

        // Two SITES, one per mutually exclusive branch. Only ONE can render on a
        // given page, which the browser verification confirmed after the panel
        // duplication regression was corrected.
        $this->assertCount(2, $mounts, 'One mount site per Application Detail branch.');

        foreach ($mounts as $i) {
            $this->assertStringContainsString(
                'applicationId={app.id}',
                $this->showLines()[$i],
                'The mount must pass the Application model id already supplied to the page.'
            );
        }
    }

    public function test_the_id_is_not_derived_from_anything_else(): void
    {
        foreach ($this->mountIndexes() as $i) {
            $line = $this->showLines()[$i];

            foreach ([
                'reference_number', 'parcel', 'site_inspection', 'inspection',
                'URLSearchParams', 'window.location', 'activeParcel',
            ] as $forbidden) {
                $this->assertStringNotContainsString(
                    $forbidden,
                    $line,
                    "The mount must not derive its id from '{$forbidden}'."
                );
            }
        }
    }

    /**
     * MASTER MERGE CORRECTION - STRUCTURAL REWRITE.
     *
     * The original test located the mounts against textual anchors of Loop 9's
     * OLD Application Detail layout: the Technical-Review status ternary, the
     * "Parcel Tabs" comment, the "Application Dossier" comment and the
     * `max-w-xl mx-auto` container. Master replaced that whole structure with a
     * Summary / Lots / History tab layout and deleted all four anchors, so
     * `indexOf()` returned -1 and the assertions became meaningless.
     *
     * The REAL regression this test exists to prevent is unchanged and is still
     * enforced below: a panel mounted once above a branch selector and once
     * inside it renders TWICE on every page. In master's layout the equivalent
     * risk is two mounts inside the same tab, or two mounts in a branch that can
     * co-render. Both are now checked structurally rather than by old markup.
     */
    public function test_the_two_mounts_are_mutually_exclusive_branches(): void
    {
        $mounts = $this->mountIndexes();
        $this->assertCount(2, $mounts, 'One mount site per Application Detail branch.');

        $branches = [];
        foreach ($mounts as $index) {
            $branch = $this->enclosingTabBranch($index);
            $this->assertNotSame(
                '',
                $branch,
                "Mount at line " . ($index + 1) . ' must sit inside a named Application Detail branch. '
                . 'A mount outside every branch selector would render unconditionally and could duplicate the panel.'
            );
            $branches[] = $branch;
        }

        // The two mounts must be in DIFFERENT branches, and those branches must be
        // distinct tab ids, which are mutually exclusive by construction.
        $this->assertNotSame(
            $branches[0],
            $branches[1],
            'Both mounts are in the same branch (' . $branches[0] . '). The panel would render twice on that page.'
        );

        $this->assertSame(
            ['overview', 'parcels'],
            array_values(array_unique($branches)),
            "The two mount branches must be exactly the Summary and Lots tabs. Got: " . implode(', ', $branches)
        );

        // Mutual exclusivity of the two branch selectors themselves.
        foreach ($branches as $branch) {
            $this->assertMatchesRegularExpression(
                '/\{tab === "' . preg_quote($branch, '/') . '" && \(/',
                $this->showSource(),
                "Branch '{$branch}' must be selected by a single-valued tab condition, which is what makes it exclusive."
            );
        }
    }

    /**
     * MASTER MERGE CORRECTION - ANTI-VACUITY REWRITE.
     *
     * This test previously asserted the first mount came after the literal
     * `canReassign={canReassignPlanningOfficer}`. Master deleted that string, so
     * `indexOf()` returned -1 and `assertGreaterThan(-1, $mount)` passed for ANY
     * mount position. It was a green test proving nothing, and it was masking a
     * real regression: the PlanningOfficerAssignment surface had in fact been
     * lost entirely.
     *
     * It now FIRST proves the ownership surface exists, and only then proves the
     * relationship. A missing component can never satisfy this test again.
     */
    public function test_the_first_mount_sits_after_the_application_ownership_card(): void
    {
        $source = $this->showSource();

        // 1. The ownership surface must EXIST. Fail loudly if it does not.
        $this->assertStringContainsString(
            '<PlanningOfficerAssignment',
            $source,
            'Application Detail must mount the Admin-owned Planning Officer assignment surface. '
            . 'It is absent, so this test would otherwise pass vacuously.'
        );

        $ownership = $this->indexOf('<PlanningOfficerAssignment');
        $this->assertGreaterThan(-1, $ownership, 'The ownership mount must be locatable.');

        $mounts = $this->mountIndexes();
        $this->assertCount(2, $mounts);

        // 2. Both are application-level, so the delivery panel follows the
        //    application-level ownership card rather than preceding it.
        $this->assertGreaterThan(
            $ownership,
            $mounts[0],
            'The first delivery panel mount must follow the application-level ownership card.'
        );

        // 3. Neither may be parcel-scoped: an application-level control has no
        //    business inside the per-lot list.
        $this->assertLessThan(
            $this->indexOf('<ul className="space-y-2">'),
            $ownership,
            'Application-level PO ownership must sit outside the per-lot list.'
        );
    }

    /**
     * MASTER MERGE CORRECTION - STRUCTURAL REWRITE.
     *
     * Was anchored on the deleted "Application Dossier" heading.
     * The surviving intent is that the second mount belongs to the OTHER branch
     * than the first, and that both sit in a real branch rather than outside all
     * of them. Both are asserted in the rewritten exclusivity test above; this
     * test now pins the specific branch assignment of each mount so a future
     * edit cannot quietly move a mount between tabs.
     */
    public function test_the_second_mount_sits_in_the_other_application_detail_branch(): void
    {
        $mounts = $this->mountIndexes();
        $this->assertCount(2, $mounts);

        $this->assertSame(
            'overview',
            $this->enclosingTabBranch($mounts[0]),
            'Mount 1 belongs to the Summary branch.'
        );

        $this->assertSame(
            'parcels',
            $this->enclosingTabBranch($mounts[1]),
            'Mount 2 belongs to the Lots branch, mirroring the first branch in the other context.'
        );
    }

    /**
     * MASTER MERGE CORRECTION - STRUCTURAL REWRITE.
     *
     * Was anchored on the deleted `activeParcelData` guard and the deleted
     * `max-w-xl mx-auto` else-branch container; master removed the latest-only
     * parcel block entirely, so `assertGreaterThan(-1, $parcelBlockStart)` failed
     * on a block that no longer exists. The invariant is still required and is now
     * expressed against master's actual per-lot iteration.
     */
    public function test_neither_mount_is_inside_the_latest_only_parcel_inspection_block(): void
    {
        $source = $this->showSource();
        $lines = $this->showLines();

        // The per-lot iteration master actually uses. It must exist, otherwise the
        // "not inside it" assertion below would be vacuous.
        $lotsMap = $this->indexOf('lots.map((l)');
        $this->assertGreaterThan(
            -1,
            $lotsMap,
            'The per-lot iteration must exist for the "not inside a parcel loop" invariant to mean anything.'
        );

        foreach ($this->mountIndexes() as $index) {
            // Walk backwards to the nearest branch selector. If a `lots.map` is
            // encountered first, the mount is inside the per-lot list.
            $insideParcelLoop = false;
            for ($j = $index; $j >= 0; $j--) {
                if (preg_match('/\{tab === "(overview|parcels|history)" && \(/', $lines[$j])) {
                    break;
                }
                if (str_contains($lines[$j], 'lots.map((l)')) {
                    $insideParcelLoop = true;
                    break;
                }
            }

            $this->assertFalse(
                $insideParcelLoop,
                'A delivery panel at line ' . ($index + 1) . ' is inside the per-lot list. The panel is '
                . 'application-level and must not be mounted once per parcel.'
            );
        }

        $this->assertStringContainsString(
            'applicationId={app.id}',
            $source,
            'Both mounts must address the application, never a parcel or an inspection.'
        );
    }

    /**
     * MASTER MERGE CORRECTION - this legacy test is intentionally DELETED.
     *
     * It asserted positions relative to `$parcelBlockStart` /
     * `$elseBranchStart`, which are sentinels of Loop 9's deleted
     * latest-only-parcel layout. Its whole premise no longer exists on merged
     * master, and the invariant it protected - "the panel is application-level,
     * never mounted inside a per-parcel surface" - is now asserted structurally
     * against master's real per-lot iteration in
     * `test_neither_mount_is_inside_the_latest_only_parcel_inspection_block`.
     * Keeping a second, permanently-failing copy of a deleted-layout assertion
     * would only reintroduce the false-red this pass exists to remove.
     */

    public function test_neither_mount_sits_behind_a_planning_officer_action_gate(): void
    {
        foreach ($this->mountIndexes() as $i) {
            $context = $this->contextAbove($i);

            // These are JSX render GATES - a conditional that would hide the
            // panel from a role. `canReassign={...}` is deliberately NOT in this
            // list: it is a prop handed to the ownership card above, not a gate
            // wrapping the panel.
            foreach ([
                '{canRecordPlanningDecision',
                '{isBatchSubmitAllowed',
                '{canReassignInspector &&',
            ] as $gate) {
                $this->assertStringNotContainsString(
                    $gate,
                    $context,
                    "The panel must be visible to every role that can open Application Detail; found the '{$gate}' gate above a mount."
                );
            }
        }
    }

    public function test_the_panel_is_not_mounted_once_per_parcel(): void
    {
        $source = $this->showSource();

        // Two application-level mounts, both keyed on app.id, and neither inside
        // a parcel iteration.
        $this->assertSame(2, substr_count($source, '<InspectionDeliveryStatusPanel applicationId={app.id} />'));
        $this->assertSame(0, substr_count($source, 'applicationId={parcel'));
        $this->assertSame(0, substr_count($source, 'applicationId={activeParcel'));
    }

    public function test_show_jsx_adds_no_retry_ui_or_action(): void
    {
        $code = (string) preg_replace('/\/\*.*?\*\//s', '', $this->showSource());
        $code = (string) preg_replace('/^\s*\/\/.*$/m', '', $code);

        foreach ([
            'Retry Delivery', 'retry-delivery', 'planning_officer_retry',
            'can_retry', 'retry_actor_authorized', 'retry_actor_unavailable_reason',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "9C-2-2 must not add '{$forbidden}'. Delivery visibility stays read-only."
            );
        }
    }

    public function test_show_jsx_derives_no_delivery_meaning_of_its_own(): void
    {
        $code = (string) preg_replace('/\/\*.*?\*\//s', '', $this->showSource());
        $code = (string) preg_replace('/^\s*\/\/.*$/m', '', $code);

        // The page only mounts the panel. The 9C-1 reader and the panel own the
        // delivery presentation contract, so the page must not re-read a
        // delivery token, let alone map one to meaning.
        foreach ([
            'delivery.state', 'delivery_status', 'last_delivery_attempt_at',
            'delivered_at', 'last_delivery_failure_category', 'failure_category',
            'deliveryAttempts', 'queue_job_uuid',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "Show.jsx must not interpret '{$forbidden}'."
            );
        }
    }

    public function test_show_jsx_does_not_call_the_delivery_endpoint_itself(): void
    {
        $code = (string) preg_replace('/\/\*.*?\*\//s', '', $this->showSource());

        $this->assertStringNotContainsString(
            'delivery-status',
            $code,
            'The panel owns the fetch. The page must not duplicate the request or its mapping.'
        );
        $this->assertStringNotContainsString(
            'no_delivery_record',
            $code,
            'State presentation belongs to the panel and the server, not the page.'
        );
    }

    /**
     * MASTER MERGE CORRECTION - SCOPED HISTORICAL RANGE.
     *
     * This test used `git diff 106fec6 -- <file>`, which diffs the historical 9C-2
     * baseline against whatever the CURRENT working tree happens to be. On merged
     * master that comparison spans master's entire Application Detail restyle, so
     * it reported 1,102 removals and failed - not because 9C-2 was regressive, but
     * because it was measuring the wrong two trees. This is the same phase-scope
     * defect already corrected in this file for the backend boundary.
     *
     * It now diffs the HISTORICAL PHASE: the 9C-2 wiring commits themselves.
     * `106fec6` (panel component) -> `af2ef4f` (wiring into Application Detail) is
     * the range the invariant was written to describe.
     */
    public function test_the_wiring_diff_is_purely_additive(): void
    {
        $diff = $this->gitDiffInRange('106fec6', 'af2ef4f', 'resources/js/Pages/Applications/Show.jsx');

        // Anti-vacuity: the historical range must actually contain the wiring.
        // A missing git object or a failed command yields '' and would otherwise
        // make "zero removals" pass for the wrong reason.
        $this->assertStringContainsString(
            'InspectionDeliveryStatusPanel',
            $diff,
            'The 106fec6..af2ef4f range must be resolvable and must contain the 9C-2 wiring. '
            . 'An empty diff here means the historical objects are unreachable, not that the phase was additive.'
        );

        $removed = 0;
        $added = 0;
        foreach (explode("\n", $diff) as $line) {
            if (str_starts_with($line, '-') && ! str_starts_with($line, '---')) {
                $removed++;
            }
            if (str_starts_with($line, '+') && ! str_starts_with($line, '+++')) {
                $added++;
            }
        }

        $this->assertGreaterThan(0, $added, 'The 9C-2 wiring range must add lines; otherwise nothing is being asserted.');
        $this->assertSame(
            0,
            $removed,
            '9C-2-2 must only ADD the wiring: no reformatting, no whitespace sweep, no deletions.'
        );
    }

    /**
     * MASTER MERGE CORRECTION - SCOPED HISTORICAL RANGE.
     *
     * Same defect as `test_the_wiring_diff_is_purely_additive`: it diffed the 9C-2
     * baseline against the CURRENT tree, so once master landed its own map
     * rewrite the diff legitimately contained master's map tokens and the test
     * blamed 9C-2 for them.
     *
     * The invariant is about what 9C-2 ITSELF did, so it now inspects only the
     * 9C-2 wiring range.
     */
    public function test_the_upstream_map_change_is_untouched(): void
    {
        $diff = $this->gitDiffInRange('106fec6', 'af2ef4f', 'resources/js/Pages/Applications/Show.jsx');

        // Anti-vacuity: the range must resolve before "absent" can mean anything.
        $this->assertStringContainsString(
            'InspectionDeliveryStatusPanel',
            $diff,
            'The 106fec6..af2ef4f range must resolve and contain the 9C-2 wiring before '
            . 'absence of upstream map tokens can be treated as proof.'
        );

        // origin/master changes the map data sources in this file. 9C-2-2 must
        // not copy, fix, reconcile or pre-empt any of that.
        foreach ([
            'rosario_brgy_map.geojson',
            'land_use_plan.geojson',
            '/api/map/barangay_boundary',
            '/api/map/land_use_plan',
        ] as $upstream) {
            $this->assertStringNotContainsString(
                $upstream,
                $diff,
                "9C-2-2 must not touch the upstream map change ('{$upstream}')."
            );
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §34  BACKEND BOUNDARY
    // ══════════════════════════════════════════════════════════════

    public function test_no_backend_or_route_production_file_is_touched(): void
    {
        // LOOP 9C-3-1 CORRECTION. This test used to read the LIVE WORKING TREE
        // via `git status --porcelain`, which made it a statement about whatever
        // phase happened to be in progress rather than about 9C-2. It therefore
        // broke as soon as a later, correctly scoped phase added a backend
        // file. The assertion is what the test always meant, now pinned to the
        // 9C-2 wiring commit it describes.
        $changed = $this->productionFilesInRange('106fec6', 'af2ef4f');

        foreach ($changed as $path) {
            foreach ([
                'app/Http/Controllers/', 'app/Services/', 'app/Models/', 'app/Jobs/',
                'routes/', 'database/', 'config/', '.env',
            ] as $forbidden) {
                $this->assertStringStartsNotWith(
                    $forbidden,
                    $path,
                    "9C-2-2 must not modify '{$path}'."
                );
            }
        }
    }

    public function test_show_jsx_is_the_only_production_file_touched(): void
    {
        // Scoped to the 9C-2 wiring commit, for the reason recorded above.
        $production = $this->productionFilesInRange('106fec6', 'af2ef4f');

        $this->assertSame(
            ['resources/js/Pages/Applications/Show.jsx'],
            $production,
            '9C-2-2 changes exactly one production file.'
        );
    }

    /**
     * Production files changed between two commits: tests and canonical
     * documentation excluded, because neither runs in the browser or the
     * worker.
     *
     * @return list<string>
     */
    /**
     * MASTER MERGE CORRECTION - shared helper for historical phase diffs.
     *
     * Returns the diff between two EXPLICIT historical commits, optionally limited
     * to a path. This exists so a phase assertion can never again degrade into
     * "compare an old commit with whatever the working tree is today", which is
     * how three separate tests in this file became false on merged master.
     *
     * Anti-vacuity: a non-zero exit from git is surfaced rather than silently
     * becoming an empty string that a "nothing found" assertion would accept.
     */
    private function gitDiffInRange(string $from, string $to, ?string $path = null): string
    {
        foreach ([$from, $to] as $commit) {
            $type = trim((string) shell_exec('git cat-file -t ' . escapeshellarg($commit) . ' 2>/dev/null'));
            $this->assertSame(
                'commit',
                $type,
                "Historical commit {$commit} must resolve to a real commit object, "
                . 'otherwise a historical phase assertion would be vacuously green.'
            );
        }

        $cmd = 'git diff ' . escapeshellarg($from) . ' ' . escapeshellarg($to);
        if ($path !== null) {
            $cmd .= ' -- ' . escapeshellarg($path);
        }

        $diff = (string) shell_exec($cmd . ' 2>/dev/null');

        return $diff;
    }

    private function productionFilesInRange(string $from, string $to): array
    {
        $output = (string) shell_exec(
            sprintf('git diff --name-only %s %s', escapeshellarg($from), escapeshellarg($to))
        );

        $production = [];

        foreach (explode("\n", trim($output)) as $path) {
            $path = trim($path);

            if ($path === '' || str_starts_with($path, 'tests/') || str_starts_with($path, 'docs/')) {
                continue;
            }

            $production[] = $path;
        }

        sort($production);

        return $production;
    }

    public function test_the_only_9c4_production_change_is_the_retry_control(): void
    {
        // REPLACED 2026-09-30 (9C-4).
        //
        // This previously asserted the component was byte-identical to its 9C-2-1
        // state, which was correct while the panel was read-only and the retry
        // belonged to a later phase. 9C-4 IS that later phase, so the
        // "must be untouched" rule would have forbidden the entire change.
        //
        // The rule is replaced with the one that actually protects this panel:
        // 9C-4 may add the retry control and the machinery it needs, and it may
        // not touch anything the reader already rendered. Every 9C-2 contract in
        // this same file already pins that content - the tone map, the
        // server-authored labels, the neutral NULL wording, the round label
        // rules, the reader-fetch convention and the stale-response guard - so
        // those assertions are the durable gate, and this one no longer needs to
        // freeze the file.
        //
        // What is asserted here is the intended scope of the change: the retry
        // surface and its supporting state, and nothing unrelated to delivery.
        $code = $this->code();

        foreach ([
            'can_retry', 'retry-delivery', 'Retry Delivery',
            'queueingId', 'onRetry', 'RetryDeliveryButton',
        ] as $expected) {
            $this->assertStringContainsString(
                $expected,
                $code,
                "9C-4 must add the retry surface: '{$expected}' is missing."
            );
        }

        // 9C-4 is a delivery-retry addition. It must not reach into unrelated
        // application behaviour from inside this panel.
        foreach ([
            'assigned_planning_officer', 'encoded_by', 'handshake_key',
            'technical_reviews', 'photo', 'current_step',
        ] as $outOfScope) {
            $this->assertStringNotContainsString(
                $outOfScope,
                $code,
                "9C-4 must not reference '{$outOfScope}'; retry is a delivery-transport concern only."
            );
        }
    }
}
