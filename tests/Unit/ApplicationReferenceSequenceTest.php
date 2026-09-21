<?php

namespace Tests\Unit;

use App\Http\Controllers\ApplicationController;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Mockery;
use ReflectionMethod;
use Tests\TestCase;

class ApplicationReferenceSequenceTest extends TestCase
{
    public function test_empty_sequence_starts_after_highest_existing_canonical_reference(): void
    {
        $sequenceLookup = $this->query(['exists' => false]);
        $references = $this->query([
            'pluck' => new Collection(array_map(
                fn (int $sequence): string => sprintf('APP-2026-%05d', $sequence),
                range(1, 24)
            )),
        ]);
        $upsert = $this->query();
        $result = $this->query(['value' => 25]);

        DB::shouldReceive('table')->once()->with('application_sequences')->andReturn($sequenceLookup);
        DB::shouldReceive('table')->once()->with('zoning_applications')->andReturn($references);
        DB::shouldReceive('raw')->once()->with('application_sequences.last_seq + 1')->andReturn('increment-expression');
        DB::shouldReceive('table')->once()->with('application_sequences')->andReturn($upsert);
        DB::shouldReceive('table')->once()->with('application_sequences')->andReturn($result);

        $upsert->shouldReceive('upsert')->once()->with(
            ['type_code' => 'APP', 'year' => '2026', 'last_seq' => 25],
            ['type_code', 'year'],
            ['last_seq' => 'increment-expression']
        );

        $this->assertSame(25, $this->nextSequence('APP', '2026'));
    }

    public function test_existing_sequence_row_continues_incrementing_normally(): void
    {
        $sequenceLookup = $this->query(['exists' => true]);
        $upsert = $this->query();
        $result = $this->query(['value' => 25]);

        DB::shouldReceive('table')->once()->with('application_sequences')->andReturn($sequenceLookup);
        DB::shouldReceive('raw')->once()->with('application_sequences.last_seq + 1')->andReturn('increment-expression');
        DB::shouldReceive('table')->once()->with('application_sequences')->andReturn($upsert);
        DB::shouldReceive('table')->once()->with('application_sequences')->andReturn($result);

        $upsert->shouldReceive('upsert')->once()->with(
            ['type_code' => 'APP', 'year' => '2026', 'last_seq' => 1],
            ['type_code', 'year'],
            ['last_seq' => 'increment-expression']
        );

        $this->assertSame(25, $this->nextSequence('APP', '2026'));
    }

    private function query(array $terminal = []): Mockery\MockInterface
    {
        $query = Mockery::mock();
        $query->shouldReceive('where')->zeroOrMoreTimes()->andReturnSelf();

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
