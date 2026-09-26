<?php

namespace Tests\Unit;

use App\Http\Controllers\ApplicationController;
use Illuminate\Support\Facades\DB;
use Mockery;
use ReflectionMethod;
use Tests\TestCase;

class ApplicationReferenceSequenceTest extends TestCase
{
    public function test_next_reference_continues_after_highest_existing_canonical_reference(): void
    {
        DB::shouldReceive('table')->once()->with('zoning_applications')
            ->andReturn($this->query(['value' => 'APP-2026-00024']));

        $this->assertSame(25, $this->nextSequence('APP', '2026'));
    }

    public function test_next_reference_starts_at_one_when_no_canonical_reference_exists(): void
    {
        DB::shouldReceive('table')->once()->with('zoning_applications')
            ->andReturn($this->query(['value' => null]));

        $this->assertSame(1, $this->nextSequence('APP', '2026'));
    }

    public function test_sequencing_reads_canonical_rows_under_a_row_lock_inside_the_transaction(): void
    {
        $query = $this->query(['value' => 'APP-2026-00007']);
        DB::shouldReceive('table')->once()->with('zoning_applications')->andReturn($query);

        $this->nextSequence('APP', '2026');

        $query->shouldHaveReceived('where')
            ->with('reference_number', 'like', 'APP-2026-%');
        $query->shouldHaveReceived('lockForUpdate');
        $query->shouldHaveReceived('orderBy')->with('reference_number', 'desc');
    }

    public function test_legacy_sequence_table_is_retained_but_has_no_runtime_dependency(): void
    {
        DB::shouldReceive('table')->once()->with('zoning_applications')
            ->andReturn($this->query(['value' => 'APP-2026-00003']));

        $this->assertSame(4, $this->nextSequence('APP', '2026'));

        // The legacy table is physically retained in the database, but the
        // runtime sequencing path must not read or write it.
        $source = (string) file_get_contents(dirname(__DIR__, 2) . '/app/Http/Controllers/ApplicationController.php');
        preg_match('/private function getNextSequence\([\s\S]*?\n    \}/', $source, $matches);
        $body = $matches[0] ?? '';

        $this->assertNotSame('', $body, 'getNextSequence must exist');
        $this->assertSame(0, preg_match_all('/DB::table\(\s*\'application_sequences\'/', $body),
            'getNextSequence must not read or write the legacy application_sequences table');
    }

    private function query(array $terminal = []): Mockery\MockInterface
    {
        $query = Mockery::mock();
        $query->shouldReceive('where')->zeroOrMoreTimes()->andReturnSelf();
        $query->shouldReceive('lockForUpdate')->zeroOrMoreTimes()->andReturnSelf();
        $query->shouldReceive('orderBy')->zeroOrMoreTimes()->andReturnSelf();

        foreach ($terminal as $method => $value) {
            $query->shouldReceive($method)->once()->andReturn($value);
        }

        return $query;
    }

    private function nextSequence(string $typeCode, string $year): int
    {
        $method = new ReflectionMethod(ApplicationController::class, 'getNextSequence');

        return $method->invoke(new ApplicationController(), $typeCode, $year);
    }
}
