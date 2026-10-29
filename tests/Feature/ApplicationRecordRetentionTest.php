<?php

namespace Tests\Feature;

use App\Models\GeneratedPermit;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * MPDO keeps application records for 10 years, so nothing is deleted: a closed
 * application is archived out of the working registry, and an application
 * encoded by mistake is voided and drops out of every count.
 */
class ApplicationRecordRetentionTest extends TestCase
{
    use RefreshDatabase;

    private User $po;
    private User $otherPo;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('pgsql', config('database.default'), 'This suite requires the disposable PostgreSQL.');
        Http::fake(['*' => Http::response([], 200)]);
        Queue::fake();
        $this->withoutVite();

        $this->po = User::factory()->create(['role' => 'Planning Officer', 'is_active' => true]);
        $this->otherPo = User::factory()->create(['role' => 'Planning Officer', 'is_active' => true]);
        $this->admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
    }

    private function application(array $attributes = []): ZoningApplication
    {
        return ZoningApplication::factory()->create($attributes + ['encoded_by' => $this->po->id]);
    }

    public function test_owner_archives_a_released_application_and_it_leaves_the_active_registry(): void
    {
        $app = $this->application(['status' => 'Released']);

        $this->actingAs($this->po)->post("/applications/{$app->id}/archive")->assertSessionHasNoErrors();

        $app->refresh();
        $this->assertNotNull($app->archived_at);
        $this->assertSame($this->po->id, $app->archived_by);
        $this->assertDatabaseHas('audit_trail', ['application_id' => $app->id, 'action' => 'APPLICATION_ARCHIVED']);

        $this->actingAs($this->po)->get('/applications')
            ->assertInertia(fn (Assert $page) => $page
                ->where('registry_view', 'active')
                ->where('applications.total', 0)
                ->where('view_counts.archived', 1));

        $this->actingAs($this->po)->get('/applications?view=archived')
            ->assertInertia(fn (Assert $page) => $page
                ->where('registry_view', 'archived')
                ->where('applications.data.0.id', $app->id));

        // Archived records are still part of the official counts.
        $this->assertSame(1, ZoningApplication::count());
    }

    public function test_an_open_application_cannot_be_archived(): void
    {
        $app = $this->application(['status' => 'Technical Review']);

        $this->actingAs($this->po)->post("/applications/{$app->id}/archive")->assertSessionHasErrors('archive');

        $this->assertNull($app->refresh()->archived_at);
    }

    public function test_admin_can_archive_and_unarchive_but_another_planning_officer_cannot(): void
    {
        $app = $this->application(['status' => 'Denied']);

        $this->actingAs($this->otherPo)->post("/applications/{$app->id}/archive")->assertForbidden();

        $this->actingAs($this->admin)->post("/applications/{$app->id}/archive")->assertSessionHasNoErrors();
        $this->assertNotNull($app->refresh()->archived_at);

        $this->actingAs($this->admin)->post("/applications/{$app->id}/unarchive")->assertSessionHasNoErrors();
        $this->assertNull($app->refresh()->archived_at);
        $this->assertDatabaseHas('audit_trail', ['application_id' => $app->id, 'action' => 'APPLICATION_UNARCHIVED']);
    }

    public function test_owner_voids_a_mistaken_application_and_it_drops_out_of_every_count(): void
    {
        $app = $this->application(['status' => 'Received', 'form_number' => 'F-0001']);

        $this->actingAs($this->po)
            ->post("/applications/{$app->id}/void", ['reason' => 'Duplicate of an application encoded earlier today.'])
            ->assertSessionHasNoErrors();

        $row = DB::table('zoning_applications')->where('id', $app->id)->first();
        $this->assertNotNull($row->voided_at, 'The voided row is kept, not deleted.');
        $this->assertSame($this->po->id, (int) $row->voided_by);
        $this->assertSame('Duplicate of an application encoded earlier today.', $row->void_reason);
        $this->assertDatabaseHas('audit_trail', ['application_id' => $app->id, 'action' => 'APPLICATION_VOIDED']);

        $this->assertSame(0, ZoningApplication::count());
        $this->assertSame(1, ZoningApplication::withVoided()->count());

        $this->actingAs($this->po)->get('/applications?view=voided')
            ->assertInertia(fn (Assert $page) => $page
                ->where('applications.data.0.id', $app->id)
                ->where('view_counts.voided', 1));

        // Still readable, but read-only.
        $this->actingAs($this->po)->get("/applications/{$app->id}")
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('recordRetention.void_reason', 'Duplicate of an application encoded earlier today.')
                ->where('recordRetention.can_void', false));
        $this->actingAs($this->po)
            ->post('/applications/update-status', ['id' => $app->id, 'new_status' => 'Technical Review'])
            ->assertSessionHasErrors();
        $this->assertSame('Received', DB::table('zoning_applications')->where('id', $app->id)->value('status'));
    }

    public function test_a_voided_application_frees_its_form_number(): void
    {
        $voided = $this->application(['form_number' => 'F-0002']);
        $voided->forceFill(['voided_at' => now(), 'voided_by' => $this->po->id, 'void_reason' => 'Encoded twice by mistake.'])->save();
        $this->application(['form_number' => 'F-0003']);

        $rule = fn (string $form) => validator(
            ['form_number' => $form],
            ['form_number' => [\Illuminate\Validation\Rule::unique('zoning_applications', 'form_number')->whereNull('voided_at')]]
        );

        $this->assertTrue($rule('F-0002')->passes());
        $this->assertTrue($rule('F-0003')->fails());
    }

    public function test_void_needs_a_reason_and_the_owning_planning_officer(): void
    {
        $app = $this->application();

        $this->actingAs($this->po)->post("/applications/{$app->id}/void", ['reason' => 'oops'])->assertSessionHasErrors('reason');
        $this->actingAs($this->otherPo)->post("/applications/{$app->id}/void", ['reason' => 'Not my application at all.'])->assertForbidden();
        $this->actingAs($this->admin)->post("/applications/{$app->id}/void", ['reason' => 'Admin cannot void records.'])->assertForbidden();

        $this->assertNull($app->refresh()->voided_at);
    }

    public function test_decided_inspected_or_permitted_applications_cannot_be_voided(): void
    {
        $denied = $this->application(['status' => 'Denied']);
        $inspected = $this->application(['status' => 'Technical Review']);
        SiteInspection::factory()->create(['zoning_application_id' => $inspected->id]);
        $permitted = $this->application(['status' => 'For Release']);
        GeneratedPermit::create([
            'zoning_application_id' => $permitted->id,
            'permit_type' => 'lc',
            'permit_name' => 'Locational Clearance',
            'file_name' => 'lc.pdf',
            'file_path' => 'permits/lc.pdf',
            'file_format' => 'pdf',
            'generated_by' => $this->po->id,
        ]);

        foreach ([$denied, $inspected, $permitted] as $app) {
            $this->actingAs($this->po)
                ->post("/applications/{$app->id}/void", ['reason' => 'Trying to void a real record.'])
                ->assertSessionHasErrors('void');
            $this->assertNull($app->refresh()->voided_at);
        }
    }

    public function test_removing_a_saved_permit_keeps_the_row_and_the_file(): void
    {
        Storage::fake(config('filesystems.permits_disk'));
        Storage::disk(config('filesystems.permits_disk'))->put('permits/lc.pdf', 'pdf');

        $app = $this->application(['status' => 'For Release']);
        $permit = GeneratedPermit::create([
            'zoning_application_id' => $app->id,
            'permit_type' => 'lc',
            'permit_name' => 'Locational Clearance',
            'file_name' => 'lc.pdf',
            'file_path' => 'permits/lc.pdf',
            'file_format' => 'pdf',
            'generated_by' => $this->po->id,
        ]);

        $this->actingAs($this->po)->deleteJson("/applications/{$app->id}/saved-permits/{$permit->id}")->assertOk();

        $this->assertSoftDeleted('generated_permits', ['id' => $permit->id, 'deleted_by' => $this->po->id]);
        Storage::disk(config('filesystems.permits_disk'))->assertExists('permits/lc.pdf');
        $this->assertSame(0, $app->generatedPermits()->count());
    }
}
