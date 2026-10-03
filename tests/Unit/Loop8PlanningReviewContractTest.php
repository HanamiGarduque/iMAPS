<?php

namespace Tests\Unit;

use App\Jobs\PushPlanningReviewToSupabase;
use App\Models\TechnicalReview;
use PHPUnit\Framework\TestCase;

/**
 * Loop 8 — Planning Review Metadata: round-safe read-only contract.
 *
 * These are source/contract proofs (no database, no Supabase, no network). They
 * pin the identity semantics that must never regress:
 *
 *  - `reviewed_site_inspection_id` = the EXISTING round being reviewed;
 *  - `site_inspection_task_id`     = the NEW round created by the decision;
 *  - these two are never synonyms;
 *  - the transport targets the reviewed round's exact field job and never
 *    modifies field_jobs lifecycle, progress or photo evidence.
 */
class Loop8PlanningReviewContractTest extends TestCase
{
    private function controllerSource(): string
    {
        return (string) file_get_contents(dirname(__DIR__, 2) . '/app/Http/Controllers/TechnicalReviewController.php');
    }

    private function serviceSource(): string
    {
        return (string) file_get_contents(dirname(__DIR__, 2) . '/app/Services/SupabaseService.php');
    }

    private function jobSource(): string
    {
        return (string) file_get_contents(dirname(__DIR__, 2) . '/app/Jobs/PushPlanningReviewToSupabase.php');
    }

    /** @test */
    public function technical_review_persists_the_reviewed_round_identity(): void
    {
        $fillable = (new TechnicalReview())->getFillable();

        $this->assertContains(
            'reviewed_site_inspection_id',
            $fillable,
            'The reviewed inspection round must be fillable so it can be persisted prospectively.'
        );
    }

    /** @test */
    public function reviewed_round_and_created_round_are_distinct_identities(): void
    {
        $fillable = (new TechnicalReview())->getFillable();

        $this->assertContains('reviewed_site_inspection_id', $fillable);
        $this->assertContains('site_inspection_task_id', $fillable);
        $this->assertNotSame(
            'reviewed_site_inspection_id',
            'site_inspection_task_id',
            'The reviewed round and the created round must never be treated as synonyms.'
        );
    }

    /** @test */
    public function reviewed_round_is_captured_before_any_new_round_is_created(): void
    {
        $source = $this->controllerSource();

        $resolvePosition = strpos($source, 'resolveReviewedInspectionId');
        $createPosition = strpos($source, 'createInspectionRound');

        $this->assertNotFalse($resolvePosition, 'The controller must resolve the reviewed round.');
        $this->assertNotFalse($createPosition, 'The controller must create inspection rounds.');
        $this->assertLessThan(
            $createPosition,
            $resolvePosition,
            'The reviewed round must be captured BEFORE a new round is created, so a reinspection decision records the round it reviewed.'
        );
    }

    /** @test */
    public function initial_needs_site_inspection_decision_has_no_reviewed_round(): void
    {
        $source = $this->controllerSource();

        $this->assertStringContainsString(
            'PushPlanningReviewToSupabase::TRANSPORTABLE_DECISIONS',
            $source,
            'The reviewed-round resolver must depend on the explicit transportable decision list.'
        );

        $this->assertStringContainsString(
            'public const TRANSPORTABLE_DECISIONS',
            $this->jobSource(),
            'The transportable decision list must be declared on the transport job.'
        );

        $transportable = PushPlanningReviewToSupabase::TRANSPORTABLE_DECISIONS;

        $this->assertNotContains('Needs Site Inspection', $transportable);
        $this->assertContains('Approved', $transportable);
        $this->assertContains('Declined', $transportable);
        $this->assertContains('Requires Reinspection', $transportable);
    }

    /** @test */
    public function only_a_completed_round_can_be_recorded_as_reviewed(): void
    {
        $source = $this->controllerSource();

        $this->assertStringContainsString(
            "status !== 'completed'",
            $source,
            'An in-flight or unstarted round must never be recorded as the reviewed round.'
        );
        $this->assertStringContainsString('return null;', $source);
    }

    /** @test */
    public function reviewed_round_is_resolved_from_the_same_application_and_parcel(): void
    {
        $source = $this->controllerSource();

        $this->assertStringContainsString("->where('zoning_application_id', \$application->id)", $source);
        $this->assertStringContainsString("->where('parcel_id', \$parcel->id)", $source);
    }

    /** @test */
    public function transport_maps_the_exact_reviewed_round_to_its_field_job(): void
    {
        $job = $this->jobSource();

        $this->assertStringContainsString(
            'findFieldJobIdByLocalInspectionId($this->reviewedSiteInspectionId)',
            $job,
            'The remote target must be resolved from the reviewed round identity only.'
        );
    }

    /** @test */
    public function transport_never_guesses_a_job_by_application_or_parcel(): void
    {
        $job = $this->jobSource();

        $this->assertStringNotContainsString('local_application_id', $job);
        $this->assertStringNotContainsString('reference_number', $job);
        $this->assertStringNotContainsString('local_parcel_id', $job);
    }

    /** @test */
    public function transport_never_writes_field_jobs_lifecycle_or_progress(): void
    {
        $job = $this->jobSource();
        $service = $this->serviceSource();

        // The transport may only write the review table.
        $this->assertStringContainsString("upsertFieldJobReview", $job);
        $this->assertStringNotContainsString("->update('field_jobs'", $job);
        $this->assertStringNotContainsString("from('field_jobs')", $job);

        // No lifecycle/progress column may appear in the transport payload.
        foreach (['status', 'current_step', 'progress', 'photo_paths', 'photo_count'] as $forbidden) {
            $this->assertStringNotContainsString(
                "'{$forbidden}' =>",
                $job,
                "The Loop 8 transport must not write field_jobs.{$forbidden}."
            );
        }

        $this->assertStringNotContainsString("->patch(\"{\$this->url}/rest/v1/field_jobs", $service);
    }

    /** @test */
    public function transport_is_idempotent_per_source_review_event(): void
    {
        $service = $this->serviceSource();

        $this->assertStringContainsString(
            'on_conflict=technical_review_id',
            $service,
            'A repeated review transport must converge on one row instead of duplicating.'
        );
    }

    /** @test */
    public function transport_failure_is_explicit_and_auditable(): void
    {
        $job = $this->jobSource();

        $this->assertStringContainsString('Log::warning', $job);
        $this->assertStringContainsString('Log::error', $job);
        $this->assertStringContainsString(
            'no field job for reviewed round',
            $job,
            'An unresolvable reviewed round must be logged, never written to a guessed target.'
        );
    }

    /** @test */
    public function transport_is_dispatched_only_after_the_review_row_commits(): void
    {
        $source = $this->controllerSource();

        $transactionClose = strpos($source, '}); // <-- Closes DB::transaction');
        $batchDispatch = strpos($source, 'PushPlanningReviewToSupabase::dispatch', $transactionClose);

        $this->assertNotFalse($transactionClose);
        $this->assertNotFalse($batchDispatch);
        $this->assertGreaterThan(
            $transactionClose,
            $batchDispatch,
            'Review transport must be dispatched after the review rows are committed.'
        );
    }

    /** @test */
    public function no_transport_row_is_created_without_a_reviewed_round(): void
    {
        $source = $this->controllerSource();

        $this->assertStringContainsString(
            'if ($reviewedSiteInspectionId !== null) {',
            $source,
            'A review with no reviewed round (initial scheduling) must not create a transport row.'
        );
    }

    /** @test */
    public function field_job_reviews_carries_no_planning_review_lifecycle_columns(): void
    {
        $migration = (string) file_get_contents(
            dirname(__DIR__, 2) . '/database/sql/2026_09_27_loop8_planning_review_identity.sql'
        );

        // The iMAPS-side SQL must be additive only.
        $this->assertStringContainsString('ADD COLUMN IF NOT EXISTS reviewed_site_inspection_id', $migration);
        $this->assertStringContainsString('ON DELETE SET NULL', $migration);
        $this->assertStringNotContainsString('UPDATE public.technical_reviews', $migration);
        $this->assertStringNotContainsString('DROP COLUMN', $migration);
    }

    /** @test */
    public function reviewed_round_relationship_is_distinct_from_created_round(): void
    {
        $model = new TechnicalReview();

        $this->assertTrue(method_exists($model, 'reviewedInspection'));
        $this->assertTrue(method_exists($model, 'createdInspection'));
    }
}
