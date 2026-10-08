<?php

namespace Tests\Unit;

use App\Http\Controllers\Auth\RegisteredUserController;
use Illuminate\Auth\GenericUser;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Mockery;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use Tests\TestCase;

#[RunTestsInSeparateProcesses]
#[PreserveGlobalState(false)]
class InspectorProvisioningTest extends TestCase
{
    private const UUID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    private array $created = [];
    private string $mode = 'success';
    private bool $localFails = false;
    private array $logs = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.supabase.url' => 'https://provisioning.example.test',
            'services.supabase.service_key' => 'isolated-service-fixture']);
        Event::fake();
        Log::shouldReceive('error')->andReturnUsing(function ($message, $context) {
            $this->logs[] = [$message, $context];
        });
        Mockery::mock('alias:App\Models\User')->shouldReceive('create')
            ->andReturnUsing(function ($attributes) {
                if ($this->localFails) {
                    throw new \RuntimeException('isolated-secret local database failure');
                }
                $this->created[] = $attributes;
                return new GenericUser($attributes + ['id' => 123]);
            });
        Mockery::mock('alias:App\Models\AppNotification')->shouldReceive('notifyRoles')->andReturnNull();
        Http::preventStrayRequests();
        Http::fake(function ($request) {
            $this->assertStringStartsWith('https://provisioning.example.test/', $request->url());
            if ($request->method() === 'POST') {
                $this->assertSame('https://provisioning.example.test/auth/v1/admin/users', $request->url());
                if ($this->mode === 'network') {
                    throw new ConnectionException('isolated-secret transport failure');
                }
                if ($this->mode === 'api') {
                    return Http::response(['msg' => 'isolated-secret upstream failure'], 500);
                }
                return Http::response(['id' => $this->mode === 'missing_uuid' ? null : self::UUID], 201);
            }
            $this->assertSame('PATCH', $request->method());
            $this->assertSame('https://provisioning.example.test/rest/v1/profiles?id=eq.'.self::UUID, $request->url());
            if ($this->mode === 'profile_network') {
                throw new ConnectionException('isolated-secret profile transport failure');
            }
            $row = ['id' => self::UUID] + $request->data();
            if ($this->mode === 'empty') {
                return Http::response([], 200);
            }
            if ($this->mode === 'minimal') {
                return Http::response('', 204);
            }
            if ($this->mode === 'wrong_role') { $row['role'] = 'admin'; }
            if ($this->mode === 'wrong_handshake') { $row['handshake_key'] = 'different'; }
            if ($this->mode === 'wrong_uuid') { $row['id'] = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'; }
            if ($this->mode === 'empty_name') { $row['full_name'] = ' '; }
            return Http::response([$row], 200);
        });
    }

    private function provision(): \Illuminate\Http\RedirectResponse
    {
        // Validation's unique-email query is an external DB boundary; role/auth
        // authority is covered by the existing contract tests. No DB is opened.
        $request = Mockery::mock(Request::class)->makePartial();
        $request->initialize();
        $request->replace(['name' => 'Test Inspector', 'email' => 'INSPECTOR@example.test',
            'role' => 'Site Inspector', 'password' => 'isolated-passcode',
            'password_confirmation' => 'isolated-passcode']);
        $request->shouldReceive('validate')->once()->andReturn($request->all());
        return (new RegisteredUserController())->store($request);
    }

    private function assertSafeFailure(string $stage, string $messageFragment): void
    {
        try {
            $this->provision();
            $this->fail('Provisioning must not return success.');
        } catch (ValidationException $error) {
            $message = implode(' ', $error->errors()['email']);
            $this->assertStringContainsString($messageFragment, $message);
            foreach (['isolated-secret', 'isolated-service-fixture', 'isolated-passcode', self::UUID] as $secret) {
                $this->assertStringNotContainsString($secret, $message);
                if ($secret !== self::UUID) {
                    $this->assertStringNotContainsString($secret, json_encode($this->logs));
                }
            }
        }
        $this->assertSame([], $this->created);
        $this->assertSame($stage, $this->logs[0][1]['PROVISIONING_STAGE']);
        Http::assertNotSent(fn ($request) => $request->method() === 'DELETE');
    }

    public function test_success_requires_matching_remote_profile_and_local_completion(): void
    {
        $response = $this->provision();
        $this->assertSame('User account successfully provisioned!', $response->getSession()->get('success'));
        $this->assertCount(1, $this->created);
        $this->assertSame('Site Inspector', $this->created[0]['role']);
        $this->assertSame('inspector@example.test', $this->created[0]['email']);
        $this->assertNotSame('isolated-passcode', $this->created[0]['password']);
        Http::assertSent(fn ($request) => $request->method() === 'PATCH'
            && $request->hasHeader('Prefer', 'return=representation')
            && $request['handshake_key'] === $this->created[0]['handshake_key']);
        Http::assertSentCount(2);
    }

    public function test_zero_updated_rows_fail_closed(): void
    {
        $this->mode = 'empty';
        $this->assertSafeFailure('PROFILE_VERIFY', 'profile could not be verified');
    }

    public function test_success_status_without_a_representation_fails_closed(): void
    {
        $this->mode = 'minimal';
        $this->assertSafeFailure('PROFILE_VERIFY', 'profile could not be verified');
    }

    public function test_wrong_role_fails_closed(): void
    {
        $this->mode = 'wrong_role';
        $this->assertSafeFailure('PROFILE_VERIFY', 'profile could not be verified');
    }

    public function test_wrong_handshake_fails_closed(): void
    {
        $this->mode = 'wrong_handshake';
        $this->assertSafeFailure('PROFILE_VERIFY', 'profile could not be verified');
    }

    public function test_wrong_profile_uuid_fails_closed(): void
    {
        $this->mode = 'wrong_uuid';
        $this->assertSafeFailure('PROFILE_VERIFY', 'profile could not be verified');
    }

    public function test_unusable_profile_name_fails_closed(): void
    {
        $this->mode = 'empty_name';
        $this->assertSafeFailure('PROFILE_VERIFY', 'profile could not be verified');
    }

    public function test_missing_auth_uuid_prevents_profile_and_local_writes(): void
    {
        $this->mode = 'missing_uuid';
        $this->assertSafeFailure('AUTH_CREATE', 'could not be confirmed');
        Http::assertSentCount(1);
    }

    public function test_local_failure_surfaces_partial_remote_provisioning(): void
    {
        $this->localFails = true;
        $this->assertSafeFailure('LOCAL_CREATE', 'local account could not be completed');
    }

    public function test_network_failure_exposes_no_remote_details(): void
    {
        $this->mode = 'network';
        $this->assertSafeFailure('AUTH_CREATE', 'could not be confirmed');
    }

    public function test_api_failure_exposes_no_remote_details(): void
    {
        $this->mode = 'api';
        $this->assertSafeFailure('AUTH_CREATE', 'could not be confirmed');
    }

    public function test_profile_network_failure_surfaces_partial_state(): void
    {
        $this->mode = 'profile_network';
        $this->assertSafeFailure('PROFILE_VERIFY', 'profile could not be verified');
    }
}
