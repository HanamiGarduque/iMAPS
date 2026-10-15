<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

/**
 * Regression: the header polls /api/notifications in the background. When that
 * poll landed between the encoding POST's redirect and the page it leads to, it
 * used up the flashed reference_number and the form reported "Submission not
 * confirmed" for an application that had been saved.
 */
class FlashSurvivesBackgroundRequestsTest extends TestCase
{
    use RefreshDatabase;

    private const BACKGROUND = ['Sec-Fetch-Mode' => 'cors', 'Accept' => 'application/json'];

    private User $officer;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(['*' => Http::response([], 200)]);
        Queue::fake();
        $this->withoutVite();

        $this->officer = User::forceCreate(['name' => 'Flash Officer', 'email' => 'flash-'.uniqid().'@example.test',
            'password' => 'test-only', 'role' => 'Planning Officer', 'is_active' => true]);
    }

    public function test_encoding_confirmation_survives_a_poll_before_the_redirected_page(): void
    {
        $this->encode();

        // The notification poll wins the race to the server.
        $this->withHeaders(self::BACKGROUND)->get(route('api.notifications.unread'))->assertOk();

        $this->flushHeaders()
            ->get(route('applications.create'))
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('flash.reference_number', fn ($ref) => is_string($ref) && str_starts_with($ref, 'APP-'))
                ->where('flash.application_id', fn ($id) => is_int($id)));
    }

    public function test_the_page_still_consumes_the_flash_once(): void
    {
        $this->encode();

        $this->get(route('applications.create'))
            ->assertInertia(fn (AssertableInertia $page) => $page->where('flash.reference_number', fn ($ref) => $ref !== null));

        // Neither a later poll nor a later page sees it again.
        $this->withHeaders(self::BACKGROUND)->get(route('api.notifications.unread'))->assertOk();
        $this->flushHeaders()->get(route('applications.create'))
            ->assertInertia(fn (AssertableInertia $page) => $page->where('flash.reference_number', null));
    }

    public function test_a_navigation_between_still_consumes_the_flash(): void
    {
        $this->encode();

        $this->withHeaders(['Sec-Fetch-Mode' => 'navigate'])->get(route('notifications.index'))->assertOk();

        $this->flushHeaders()->get(route('applications.create'))
            ->assertInertia(fn (AssertableInertia $page) => $page->where('flash.reference_number', null));
    }

    private function encode(): void
    {
        $this->actingAs($this->officer)->post(route('applications.store'), [
            'application_stream'     => 'permit',
            'application_type'       => 'Locational Clearance',
            'form_number'            => 'F-'.uniqid(),
            'purpose'                => 'Flash race coverage.',
            'applicant_name'         => 'Flash Applicant',
            'contact_number'         => '09171234567',
            'email'                  => 'flash.applicant@example.test',
            'barangay'               => 'Bagong Pook',
            'assessment_fee'         => 500,
            'or_number'              => 'OR-'.str_pad((string) random_int(0, 99999), 5, '0', STR_PAD_LEFT),
            'preferred_release_mode' => 'Pick-up at Office',
            'date_of_receipt'        => now()->toDateString(),
            'parcels'                => [[
                'parcel_code'           => 'P-01',
                'barangay'              => 'Bagong Pook',
                'owner_name'            => 'Flash Applicant',
                'property_index_number' => 'PIN-'.uniqid(),
                'lot_area_sqm'          => 500,
                'land_use_class'        => 'Residential',
                'coordinates'           => '13.1234, 121.4567',
            ]],
        ])->assertRedirect()->assertSessionHasNoErrors();
    }
}
