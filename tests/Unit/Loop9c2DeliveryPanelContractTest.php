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
     */
    private function code(): string
    {
        $text = $this->source();
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

        foreach (['axios', 'router.', 'XMLHttpRequest(', 'useForm', 'navigator.sendBeacon'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "The panel must not introduce '{$forbidden}'; the reader endpoint is canonical."
            );
        }
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

        foreach ([
            'setInterval', 'setTimeout', 'WebSocket', 'EventSource',
            'realtime', 'subscribe(', 'refetchInterval', 'poll',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "9C-2-1 must not add '{$forbidden}'. Fetch once per applicationId."
            );
        }
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

    public function test_the_round_label_is_chronology_only(): void
    {
        $code = $this->code();

        $this->assertStringContainsString('Inspection Round {inspection.round}', $code);

        // "Original Inspection" / "Reinspection" are not derivable here: the
        // server does not send round_kind, and inferring it from array position
        // would be a client-side business inference.
        foreach (['Original Inspection', 'Reinspection', 'round_kind'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "'{$forbidden}' must not be inferred; the server sends chronology only."
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

        foreach ([
            'failure_category', 'queue_job_uuid', 'attempt_number', 'safe_message',
            'failed_jobs', 'SQLSTATE', 'PDOException', 'handshake_key', 'token=',
            'supabase.co', 'eyJ', 'Bearer',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "'{$forbidden}' is operational detail and must never be rendered."
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

    public function test_no_retry_field_is_referenced_at_all(): void
    {
        $code = $this->code();

        foreach ([
            'can_retry', 'retry_actor_authorized', 'retry_actor_unavailable_reason',
            'retry-delivery', 'Retry Delivery', 'planning_officer_retry',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "'{$forbidden}' is a 9C-4 concern. 9C-2-1 must not reference it."
            );
        }
    }

    public function test_the_panel_contains_no_action_control_at_all(): void
    {
        $code = $this->code();

        $this->assertStringNotContainsString('<button', $code, 'A read-only panel must render no button.');
        $this->assertStringNotContainsString('<a ', $code, 'A read-only panel must render no link.');
        $this->assertStringNotContainsString('<form', $code);
        $this->assertStringNotContainsString('onClick', $code, 'No interaction in 9C-2-1.');
        $this->assertStringNotContainsString('onSubmit', $code);
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
    // §33 / §34  PHASE BOUNDARY
    // ══════════════════════════════════════════════════════════════

    public function test_applications_show_jsx_is_byte_identical_to_the_baseline(): void
    {
        // 9C-2-1 proves the component in isolation. Wiring is 9C-2-2.
        $diff = (string) shell_exec(
            'git diff e71bd02 -- resources/js/Pages/Applications/Show.jsx'
        );

        $this->assertSame('', trim($diff), 'Applications/Show.jsx must not be touched in 9C-2-1.');
    }

    public function test_no_backend_or_route_production_file_is_touched(): void
    {
        $changed = trim((string) shell_exec('git status --porcelain'));

        foreach (explode("\n", $changed === '' ? [] : $changed) as $line) {
            $path = trim(substr($line, 3));

            foreach ([
                'app/Http/Controllers/', 'app/Services/', 'app/Models/', 'app/Jobs/',
                'routes/', 'database/', 'resources/js/Pages/',
            ] as $forbidden) {
                $this->assertStringStartsNotWith(
                    $forbidden,
                    $path,
                    "9C-2-1 must not modify '{$path}'."
                );
            }
        }
    }

    public function test_the_component_is_not_yet_mounted_anywhere(): void
    {
        // Nothing may import the panel until 9C-2-2 wires it, and canonical docs
        // must not claim UI visibility before then.
        $hits = (string) shell_exec(
            'git grep -l "InspectionDeliveryStatusPanel" -- resources/js/Pages 2>&1'
        );

        $this->assertSame(
            '',
            trim($hits),
            'The panel must stay unmounted in 9C-2-1.'
        );
    }
}
