<?php

namespace Tests\Unit;

use Illuminate\Http\Client\Factory;
use PHPUnit\Framework\TestCase;
use Tests\Support\FakePostgRest;

class FakePostgRestMutationTest extends TestCase
{
    private function client(FakePostgRest $rest): Factory
    {
        $http = new Factory();
        $http->preventStrayRequests();
        $http->fake(['https://fictional.test/*'=>fn ($request) => $rest->handle($request)]);
        return $http;
    }

    public function test_ignore_duplicates_returns_no_row_and_does_not_merge(): void
    {
        $rest = new FakePostgRest();
        $rest->seed('field_jobs', ['id'=>'a','bridge_source_id'=>'test','local_inspection_id'=>1,'status'=>'completed'], [['bridge_source_id','local_inspection_id']]);
        $response = $this->client($rest)->withHeaders(['Prefer'=>'return=representation,resolution=ignore-duplicates'])
            ->post('https://fictional.test/rest/v1/field_jobs?on_conflict=bridge_source_id,local_inspection_id',
                ['bridge_source_id'=>'test','local_inspection_id'=>1,'status'=>'assigned']);
        $this->assertSame([], $response->json());
        $this->assertSame('completed', $rest->rows('field_jobs')[0]['status']);
    }

    public function test_patch_writes_only_exact_guarded_row_and_returns_new_revision(): void
    {
        $rest = new FakePostgRest();
        $rest->seed('field_jobs', ['id'=>'a','updated_at'=>'revision-one','status'=>'assigned','findings'=>'keep']);
        $rest->seed('field_jobs', ['id'=>'b','updated_at'=>'revision-one','status'=>'completed']);
        $response = $this->client($rest)->patch('https://fictional.test/rest/v1/field_jobs?id=eq.a&updated_at=eq.revision-one', ['status'=>'in_progress']);
        $this->assertCount(1, $response->json());
        $this->assertSame('in_progress', $response->json('0.status'));
        $this->assertNotSame('revision-one', $response->json('0.updated_at'));
        $this->assertSame('keep', $rest->rows('field_jobs')[0]['findings']);
        $this->assertSame('completed', $rest->rows('field_jobs')[1]['status']);
        $this->assertSame([], $this->client($rest)->patch('https://fictional.test/rest/v1/field_jobs?id=eq.a&updated_at=eq.revision-one', ['status'=>'assigned'])->json());
    }

    public function test_unsupported_filters_fail_instead_of_matching_every_row(): void
    {
        $rest = new FakePostgRest();
        $rest->seed('field_jobs', ['id'=>'a']);
        $this->expectException(\LogicException::class);
        $this->client($rest)->get('https://fictional.test/rest/v1/field_jobs?id=unsupported.a');
    }

    public function test_first_duplicate_resolution_preference_wins_like_postgrest(): void
    {
        $rest = new FakePostgRest();
        $rest->seed('field_jobs', ['id'=>'a','bridge_source_id'=>'test','local_inspection_id'=>1,'status'=>'completed'], [['bridge_source_id','local_inspection_id']]);
        $response = $this->client($rest)->withHeaders(['Prefer'=>['return=representation,resolution=merge-duplicates', 'resolution=ignore-duplicates']])
            ->post('https://fictional.test/rest/v1/field_jobs?on_conflict=bridge_source_id,local_inspection_id',
                ['bridge_source_id'=>'test','local_inspection_id'=>1,'status'=>'assigned']);
        $this->assertSame('assigned', $rest->rows('field_jobs')[0]['status']);
        $this->assertSame('assigned', $response->json('0.status'));
    }
}
