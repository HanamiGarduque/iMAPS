<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportFormulaInjectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_csv_export_prefixes_formula_values(): void
    {
        $admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        foreach (['=HYPERLINK("http://evil","x")', 'Juan Dela Cruz'] as $i => $name) {
            DB::table('zoning_applications')->insert([
                'reference_number' => "ZC-TEST-$i",
                'application_type' => 'Zoning Certificate',
                'purpose' => '@SUM(1)',
                'applicant_name' => $name,
                'contact_number' => '0',
                'barangay' => 'Alupay',
            ]);
        }

        $csv = $this->actingAs($admin)->postJson('/api/analytics/report', [
            'format' => 'csv',
            'variables' => ['name', 'purpose'],
        ])->assertOk()->streamedContent();

        $this->assertStringContainsString("\"'=HYPERLINK", $csv);
        $this->assertStringNotContainsString("\n\"=HYPERLINK", $csv);
        $this->assertStringContainsString('Juan Dela Cruz', $csv);
    }
}
