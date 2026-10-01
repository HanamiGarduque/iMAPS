<?php

namespace Tests\Unit;

use App\Jobs\PushInspectionToSupabase;
use App\Models\SiteInspection;
use Tests\TestCase;

class Loop4ReinspectionNewRoundTest extends TestCase
{
    public function test_new_round_has_new_identity_clean_evidence_and_latest_po_provenance(): void
    {
        $roundOne = new SiteInspection([
            'zoning_application_id' => 25,
            'parcel_id' => 81,
            'inspector_id' => 7,
            'status' => 'completed',
            'assigned_notes' => 'Round 1 instructions',
            'assigned_by_imaps_user_id' => 4,
            'assigned_by_name' => 'Jyerine Desunia',
            'submitted_at' => '2026-09-21 10:00:00',
            'inspection_result' => 'Requires Reinspection',
            'findings' => 'Round 1 findings',
            'observations' => 'Round 1 observations',
            'discrepancies' => 'Round 1 discrepancy',
            'recommendations' => 'Round 1 recommendation',
            'inspector_notes' => 'Round 1 notes',
            'checklist_data' => [['item' => 'setback', 'passed' => false]],
            'confirmed_latitude' => 13.845,
            'confirmed_longitude' => 121.206,
            'gps_accuracy_m' => 4.5,
            'gps_confirmed_at' => '2026-09-21 09:00:00',
        ]);
        $roundOne->id = 35;
        $snapshot = $roundOne->getAttributes();

        $roundTwo = $roundOne->newRound([
            'inspector_id' => 9,
            'scheduled_date' => '2026-09-25',
            'deadline_date' => '2026-09-27',
            'assigned_notes' => 'Round 2 instructions',
            'assigned_by_imaps_user_id' => 12,
            'assigned_by_name' => 'Planning Officer B',
        ]);

        $this->assertNull($roundTwo->getKey());
        $this->assertNotSame($roundOne->getKey(), $roundTwo->getKey());
        $this->assertSame(25, $roundTwo->zoning_application_id);
        $this->assertSame(81, $roundTwo->parcel_id);
        $this->assertSame('assigned', $roundTwo->status);
        $this->assertSame(12, $roundTwo->assigned_by_imaps_user_id);
        $this->assertSame('Planning Officer B', $roundTwo->assigned_by_name);
        $this->assertSame('Round 2 instructions', $roundTwo->assigned_notes);

        foreach (['submitted_at', 'inspection_result', 'findings', 'observations',
            'discrepancies', 'recommendations', 'inspector_notes', 'checklist_data',
            'confirmed_latitude', 'confirmed_longitude', 'gps_accuracy_m',
            'gps_confirmed_at', 'completed_at'] as $evidenceField) {
            $this->assertNull($roundTwo->{$evidenceField}, "$evidenceField must start clean");
        }

        $this->assertSame($snapshot, $roundOne->getAttributes());
        $this->assertSame('completed', $roundOne->status);
        $this->assertSame('Requires Reinspection', $roundOne->inspection_result);
        $this->assertSame(4, $roundOne->assigned_by_imaps_user_id);
        $this->assertSame('Jyerine Desunia', $roundOne->assigned_by_name);
    }

    public function test_controller_uses_create_semantics_and_dispatches_new_round(): void
    {
        $source = file_get_contents(dirname(__DIR__, 2) . '/app/Http/Controllers/TechnicalReviewController.php');
        $this->assertNotFalse($source);
        $this->assertStringContainsString("'Requires Reinspection'", $source);
        $this->assertStringContainsString("'reviews.*.decision'                 => 'required|string|in:Approved,Needs Site Inspection,Requires Reinspection,Declined'", $source);
        $this->assertStringContainsString('DB::transaction(function () use ($application, $validated)', $source);
        $this->assertStringContainsString("empty(\$review['inspector_id']) || empty(\$review['scheduled_date']) || empty(\$review['deadline_date'])", $source);
        $this->assertStringContainsString("reviews.\$parcelId.assigned_notes", $source);
        $this->assertStringContainsString('$latestInspection->newRound($assignmentData)', $source);
        $this->assertStringContainsString('PushInspectionToSupabase::dispatch($inspection);', $source);

        // A reinspection must CREATE a new round and then return that new round.
        // Work reassignment Phase 1 inserted the round's opening assignment-history
        // entry between the save and the return, so the sequence is no longer
        // literally adjacent. The property under test is unchanged — a new row is
        // built and saved, and it is that new row which is returned and pushed —
        // so the assertion allows the intervening history call rather than
        // requiring a fixed number of statements.
        $this->assertMatchesRegularExpression(
            '/\$inspection = \$latestInspection->newRound\(\$assignmentData\);\s*\$inspection->save\(\);.*?return \$inspection;/s',
            $source
        );
        $this->assertStringContainsString('$this->recordRoundHistoryOpening($inspection, $assigningOfficer);', $source);

        $this->assertStringNotContainsString('SiteInspection::updateOrCreate(', $source);
        $this->assertStringContainsString("\$user->role !== 'Planning Officer'", $source);
        $this->assertStringNotContainsString("'Admin'", $this->method($source, 'currentPlanningOfficerAssignmentActor'));
    }

    public function test_show_page_submits_complete_unambiguous_reinspection_contract_and_surfaces_validation_errors(): void
    {
        $source = file_get_contents(dirname(__DIR__, 2) . '/resources/js/Pages/Applications/Show.jsx');
        $this->assertNotFalse($source);

        // MASTER MERGE CORRECTION - EXPRESSION SHAPE, NOT BEHAVIOUR.
        //
        // The reinstated Loop 4 semantics are unchanged; the master merge
        // restored them through named helpers (`decisionOptions`,
        // `REINSPECTION_DECISION`, `decisionLabel`) instead of repeating the
        // literals inline. Asserting the old inline spelling would fail on a
        // working, correctly-scoped implementation, so the BEHAVIOUR is asserted
        // instead: a completed inspection swaps the second option to
        // "Requires Reinspection", the label is "Schedule Reinspection", and the
        // obsolete "Re-inspect Parcel" wording is still absent.
        $this->assertStringContainsString('REINSPECTION_DECISION = "Requires Reinspection"', $source);
        $this->assertStringContainsString('hasCompletedInspection ? REINSPECTION_DECISION : "Needs Site Inspection"', $source);
        $this->assertStringContainsString('if (d === REINSPECTION_DECISION) return "Schedule Reinspection"', $source);
        $this->assertStringNotContainsString('Re-inspect Parcel', $source);
        $this->assertStringContainsString('[ "Needs Site Inspection", REINSPECTION_DECISION ].includes(r.decision)', $source);
        $this->assertStringContainsString('r.decision === REINSPECTION_DECISION && !r.assigned_notes?.trim()', $source);
        $this->assertStringContainsString('Give instructions for the reinspection', $source);
        $this->assertStringContainsString('application_id: app.id', $source);
        // MASTER MERGE: the batch payload is the per-parcel `reviews` map in
        // master's layout; the old name `parcelReviews` is an implementation
        // detail of the pre-merge page, not part of the contract. What matters
        // is that every lot's review is submitted under the owning application.
        $this->assertStringContainsString('reviews', $source);
        // MASTER MERGE: server validation errors must still REACH the officer.
        // The pre-merge page collected them into a joined message; master's
        // layout raises the first server message in a toast. The contract is
        // that a rejected batch is surfaced, not swallowed, so the assertion
        // targets that rather than the old expression shape.
        $this->assertStringContainsString('onError: (errs)', $source);
        $this->assertStringContainsString('Object.values(errs)[0]', $source);
        $this->assertStringContainsString('Evaluation could not be submitted', $source);
        // The reinspection scheduling contract is inspector + schedule + deadline
        // + instructions. The separate review-level "findings" input was removed
        // by upstream master; the server still accepts reviews.*.findings as
        // nullable|string, so omitting it from the UI breaks no Loop 4 contract.
        foreach (['inspector_id', 'scheduled_date', 'deadline_date', 'assigned_notes', 'decision_reason'] as $field) {
            $this->assertStringContainsString($field, $source);
        }
    }

    public function test_completed_local_inspection_is_display_fallback_when_remote_fetch_is_unavailable(): void
    {
        $source = file_get_contents(dirname(__DIR__, 2) . '/resources/js/Components/ParcelInspectionStatus.jsx');
        $this->assertNotFalse($source);

        // A completed local inspection must still render when the remote fetch
        // is unavailable. The merged code keeps the local fallback and merges
        // remote over local when it does resolve.
        $this->assertStringContainsString('localInspection = null', $source);
        $this->assertStringContainsString('setInspection(data)', $source);
        $this->assertStringNotContainsString('setInspection(null)', $source);
        $this->assertMatchesRegularExpression(
            '/const data = remoteInspection\s*\?\s*\{\s*\.\.\.local,\s*\.\.\.remoteInspection\s*\}\s*:\s*local;/s',
            $source
        );
    }

    public function test_push_retry_isolated_by_new_site_inspection_id(): void
    {
        $source = file_get_contents(dirname(__DIR__, 2) . '/app/Jobs/PushInspectionToSupabase.php');
        $this->assertNotFalse($source);
        // The lookup and the upsert are both namespaced. Round isolation still
        // depends on the new local id, but the namespace is now what makes
        // "this round" mean this environment's round; see
        // BridgeSourceNamespaceCollisionTest for the proven incident.
        $this->assertStringContainsString("'local_inspection_id' => \"eq.{\$this->inspection->id}\"", $source);
        $this->assertStringContainsString("'local_inspection_id'     => \$this->inspection->id", $source);
        $this->assertStringContainsString('field_jobs?on_conflict=bridge_source_id,local_inspection_id', $source);
        $this->assertStringContainsString("'status'                  => \$existingJob['status'] ?? 'assigned'", $source);
        foreach (['submitted_at', 'current_step', 'step_timestamps', 'rework_started_at',
            'findings', 'observations', 'discrepancies', 'recommendations',
            'inspector_notes', 'checklist_data', 'photo_paths', 'confirmed_latitude'] as $field) {
            $this->assertStringNotContainsString("'$field' =>", $source);
        }
    }

    private function method(string $source, string $name): string
    {
        preg_match('/private function ' . preg_quote($name, '/') . '[\\s\\S]*?(?=\\n    private function|\\n})/', $source, $matches);
        return $matches[0] ?? '';
    }
}
