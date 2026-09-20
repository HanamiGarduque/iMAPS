<?php

namespace Tests\Unit;

use App\Jobs\PushInspectionToSupabase;
use PHPUnit\Framework\TestCase;

class Loop3AssigningPlanningOfficerOwnershipTest extends TestCase
{
    public function test_site_inspection_fillable_contains_assignment_provenance_fields(): void
    {
        $source = $this->siteInspectionSource();

        $this->assertStringContainsString("'assigned_by_imaps_user_id'", $source);
        $this->assertStringContainsString("'assigned_by_name'", $source);
    }

    public function test_additive_migration_uses_guarded_schema_and_non_destructive_down(): void
    {
        $source = $this->migrationSource();

        $this->assertMatchesRegularExpression('/Schema::hasColumn\(\s*\'site_inspections\',\s*\'assigned_by_imaps_user_id\'/s', $source);
        $this->assertMatchesRegularExpression('/Schema::hasColumn\(\s*\'site_inspections\',\s*\'assigned_by_name\'/s', $source);
        $this->assertStringContainsString('public function down(): void', $source);
    }

    public function test_valid_pair_is_forwarded(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(
            ['status' => 'assigned'],
            '17',
            '  Engr. Reyes  ',
        );

        $this->assertSame(17, $payload['assigned_by_imaps_user_id']);
        $this->assertSame('Engr. Reyes', $payload['assigned_by_name']);
    }

    public function test_numeric_string_id_is_normalized_to_int(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(
            ['status' => 'assigned'],
            '00042',
            'Officer B',
        );

        $this->assertSame(42, $payload['assigned_by_imaps_user_id']);
    }

    public function test_padded_name_is_trimmed(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(
            ['status' => 'assigned'],
            '17',
            '  Officer  B  ',
        );

        $this->assertSame('Officer  B', $payload['assigned_by_name']);
    }

    public function test_null_null_provenance_is_omitted_and_not_classified_as_corrupt(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(['status' => 'assigned'], null, null);

        $this->assertArrayNotHasKey('assigned_by_imaps_user_id', $payload);
        $this->assertArrayNotHasKey('assigned_by_name', $payload);
        $this->assertFalse($this->isUnusableAssigningOfficerProvenance(null, null));
    }

    public function test_id_only_adds_neither_key(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(['status' => 'assigned'], '17', null);

        $this->assertArrayNotHasKey('assigned_by_imaps_user_id', $payload);
        $this->assertArrayNotHasKey('assigned_by_name', $payload);
        $this->assertTrue($this->isUnusableAssigningOfficerProvenance('17', null));
    }

    public function test_name_only_adds_neither_key(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(['status' => 'assigned'], null, 'Officer A');

        $this->assertArrayNotHasKey('assigned_by_imaps_user_id', $payload);
        $this->assertArrayNotHasKey('assigned_by_name', $payload);
        $this->assertTrue($this->isUnusableAssigningOfficerProvenance(null, 'Officer A'));
    }

    public function test_blank_name_adds_neither_key(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(['status' => 'assigned'], '17', '   ');

        $this->assertArrayNotHasKey('assigned_by_imaps_user_id', $payload);
        $this->assertArrayNotHasKey('assigned_by_name', $payload);
        $this->assertTrue($this->isUnusableAssigningOfficerProvenance('17', '   '));
    }

    public function test_nonnumeric_id_adds_neither_key(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(['status' => 'assigned'], 'abc', 'Officer A');

        $this->assertArrayNotHasKey('assigned_by_imaps_user_id', $payload);
        $this->assertArrayNotHasKey('assigned_by_name', $payload);
        $this->assertTrue($this->isUnusableAssigningOfficerProvenance('abc', 'Officer A'));
    }

    public function test_decimal_id_adds_neither_key(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(['status' => 'assigned'], '17.5', 'Officer A');

        $this->assertArrayNotHasKey('assigned_by_imaps_user_id', $payload);
        $this->assertArrayNotHasKey('assigned_by_name', $payload);
        $this->assertTrue($this->isUnusableAssigningOfficerProvenance('17.5', 'Officer A'));
    }

    public function test_negative_id_adds_neither_key(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(['status' => 'assigned'], '-7', 'Officer A');

        $this->assertArrayNotHasKey('assigned_by_imaps_user_id', $payload);
        $this->assertArrayNotHasKey('assigned_by_name', $payload);
        $this->assertTrue($this->isUnusableAssigningOfficerProvenance('-7', 'Officer A'));
    }

    public function test_unusable_pair_leaves_existing_payload_unchanged(): void
    {
        $payload = [
            'status' => 'assigned',
            'assignment_instructions' => 'Keep me',
            'existing_key' => 'remain',
        ];

        $result = PushInspectionToSupabase::withAssigningOfficerProvenance($payload, 'abc', 'Officer A');

        $this->assertSame($payload, $result);
    }

    public function test_latest_valid_pair_supplied_is_the_pair_forwarded(): void
    {
        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(
            ['status' => 'assigned'],
            '11',
            'Officer A',
        );

        $payload = PushInspectionToSupabase::withAssigningOfficerProvenance(
            $payload,
            '99',
            'Officer B',
        );

        $this->assertSame(99, $payload['assigned_by_imaps_user_id']);
        $this->assertSame('Officer B', $payload['assigned_by_name']);
    }

    public function test_queue_job_does_not_use_auth_lookup_for_assigning_actor(): void
    {
        $source = $this->jobSource();

        $this->assertStringNotContainsString('auth()', $source);
        $this->assertStringNotContainsString('Auth::', $source);
        $this->assertStringNotContainsString('Admin', $source);
    }

    public function test_loop1_status_preservation_is_unchanged(): void
    {
        $source = $this->jobSource();

        $this->assertMatchesRegularExpression('/\'status\'\s*=>\s*\$existingJob\[\'status\'\]\s*\?\?\s*\'assigned\'/s', $source);
    }

    public function test_loop2_assignment_instructions_remain_unchanged(): void
    {
        $source = $this->jobSource();

        $this->assertMatchesRegularExpression('/\'assignment_instructions\'\s*=>\s*\$this->inspection->assigned_notes/', $source);
    }

    public function test_inspector_notes_stays_absent_from_assignment_push(): void
    {
        $source = $this->jobSource();

        $this->assertDoesNotMatchRegularExpression('/\'inspector_notes\'\s*=>/', $source);
    }

    private function isUnusableAssigningOfficerProvenance($userId, $name): bool
    {
        $method = new \ReflectionMethod(PushInspectionToSupabase::class, 'isUnusableAssigningOfficerProvenance');
        $method->setAccessible(true);

        return $method->invoke(null, $userId, $name);
    }

    private function jobSource(): string
    {
        $path = dirname(__DIR__, 2) . '/app/Jobs/PushInspectionToSupabase.php';
        $source = file_get_contents($path);
        $this->assertNotFalse($source, "Could not read $path");

        return $source;
    }

    private function siteInspectionSource(): string
    {
        $path = dirname(__DIR__, 2) . '/app/Models/SiteInspection.php';
        $source = file_get_contents($path);
        $this->assertNotFalse($source, "Could not read $path");

        return $source;
    }

    private function migrationSource(): string
    {
        $path = dirname(__DIR__, 2) . '/database/migrations/2026_09_19_000000_add_assignment_provenance_to_site_inspections_table.php';
        $source = file_get_contents($path);
        $this->assertNotFalse($source, "Could not read $path");

        return $source;
    }
}
