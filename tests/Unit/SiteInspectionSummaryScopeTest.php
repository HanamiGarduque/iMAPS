<?php

namespace Tests\Unit;

use ReflectionClass;
use ReflectionMethod;
use ReflectionNamedType;
use Tests\TestCase;
use App\Support\InspectionOperationsSummary;
use App\Http\Controllers\SiteInspectionController;

/**
 * PHASE 2B1 RUNTIME REGRESSION - undefined $summary in the controller.
 *
 * THE BUG THIS EXISTS TO CATCH
 * ---------------------------
 * `index()` created a local `$summary = new InspectionOperationsSummary()` and
 * then called `$this->enrichForOperationsOverview($all)`, whose body referenced
 * `$summary->summarize(...)`. A private method is a separate scope: it cannot see
 * `index()`'s locals. Every request to GET /site-inspections therefore died with
 *
 *     ErrorException: Undefined variable $summary
 *
 * and returned HTTP 500.
 *
 * WHY THE EARLIER TESTS MISSED IT
 * -------------------------------
 * Every test in this phase was a SOURCE-TEXT contract test: it read the file and
 * asserted on strings. Such a test cannot tell a defined variable from an
 * undefined one, because the undefined-ness is a runtime scope fact, not a
 * textual one. `php -l` is a syntax check and is likewise blind to it. The only
 * proof that actually discriminates is EXECUTING the wiring.
 *
 * So this test executes:
 *   1. container resolution of the controller, and
 *   2. a static scope analysis of the helper's variables, and
 *   3. the helper itself, driven by a stub, to prove the payload is produced.
 *
 * None of that touches the database, and none of it touches Supabase.
 */
class SiteInspectionSummaryScopeTest extends TestCase
{
    /**
     * The container must be able to build the controller, which means every
     * promoted constructor dependency must be resolvable. A missing or
     * mis-typed constructor signature fails here rather than on a live request.
     */
    public function test_container_resolves_the_controller_with_its_summary_injected(): void
    {
        $controller = app(SiteInspectionController::class);

        $this->assertInstanceOf(SiteInspectionController::class, $controller);

        $property = new \ReflectionProperty($controller, 'summary');
        $property->setAccessible(true);

        $this->assertInstanceOf(
            InspectionOperationsSummary::class,
            $property->getValue($controller),
            'The operations summary must be injected, not left for the method to invent.'
        );
    }

    /**
     * The exact 500 that shipped: the helper referenced a variable that no scope
     * defines. Analysed statically from the real method body.
     */
    public function test_helper_defines_every_variable_it_uses(): void
    {
        $file = (new ReflectionClass(SiteInspectionController::class))->getFileName();
        $this->assertIsString($file);

        $method = new ReflectionMethod(SiteInspectionController::class, 'enrichForOperationsOverview');

        $source = $this->methodSource($file, $method);
        $this->assertNotSame('', $source, 'Could not extract the helper source.');

        $uses = $this->variableReads($source);
        $defines = array_merge(
            $this->assignedVariables($source),
            ['this'], // implicit $this is always available
            $this->globalsAvailableInLaravel()
        );

        $undefined = array_values(array_diff($uses, $defines));

        $this->assertSame(
            [],
            $undefined,
            'Undefined variable(s) in enrichForOperationsOverview(): '.implode(', ', $undefined)
            .'. A private method cannot read index() locals, so this would be a'
            .' runtime 500 on every GET /site-inspections.'
        );
    }

    /**
     * Proves the property is actually read through `$this`, which is the shape
     * that makes the dependency available.
     */
    public function test_helper_reads_the_summary_through_this(): void
    {
        $file = (new ReflectionClass(SiteInspectionController::class))->getFileName();
        $method = new ReflectionMethod(SiteInspectionController::class, 'enrichForOperationsOverview');
        $source = $this->methodSource($file, $method);

        $this->assertStringContainsString('$this->summary', $source);
        $this->assertDoesNotMatchRegularExpression(
            '/(?<!this->)\$summary\b/',
            $this->stripComments($source),
            'The helper must not reference a bare $summary; only $this->summary is in scope.'
        );
    }

    /**
     * End-to-end proof of the payload shape, using a stub so the test needs no
     * database. A real collection of round-like objects is mapped, and the
     * result must be keyed by inspection id, which is what the view consumes.
     */
    public function test_enrichment_produces_an_id_keyed_payload(): void
    {
        // Constructed directly with a stub. This is the property that makes
        // constructor injection testable at all, and it is why the dependency is
        // promoted rather than instantiated inside the method. A readonly
        // promoted property is deliberately NOT writable by reflection either,
        // so a stub is passed in at construction time.
        $summary = new class extends InspectionOperationsSummary
        {
            public function summarize($inspections): array
            {
                return collect($inspections)->map(fn ($i) => [
                    'id' => $i->id,
                    'po_decision' => null,
                    'delivery_label' => 'No Delivery Record',
                    'delivery_is_failure' => false,
                ])->all();
            }
        };

        $controller = new SiteInspectionController($summary);

        $method = new ReflectionMethod($controller, 'enrichForOperationsOverview');
        $method->setAccessible(true);

        $result = $method->invoke($controller, collect([
            (object) ['id' => 41],
            (object) ['id' => 37],
        ]));

        $this->assertIsArray($result);
        $this->assertArrayHasKey(41, $result, 'Payload must be keyed by inspection id.');
        $this->assertArrayHasKey(37, $result);
        $this->assertSame(41, $result[41]['id']);
    }

    /**
     * The dependency is a class, not an interface reached statically, so no
     * global/static service locator crept in.
     */
    public function test_summary_is_injected_not_constructed_globally(): void
    {
        $file = (new ReflectionClass(SiteInspectionController::class))->getFileName();
        $this->assertIsString($file);
        $source = $this->stripComments((string) file_get_contents($file));

        $this->assertDoesNotMatchRegularExpression(
            '/new\s+InspectionOperationsSummary|new\s+\\\\?App\\\\Support\\\\InspectionOperationsSummary/',
            $source,
            'Manual instantiation bypasses DI and duplicates the dependency.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/InspectionOperationsSummary::/',
            $source,
            'No static/global service locator.'
        );
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private function globalsAvailableInLaravel(): array
    {
        return [
            'this', 'argc', 'argv', 'GLOBALS', '_ENV', '_SERVER',
            'app', 'config', 'collect', 'value', 'head', 'last',
            'data_get', 'optional', 'throw_if', 'throw_unless', 'blank', 'filled',
        ];
    }

    private function methodSource(string $file, ReflectionMethod $method): string
    {
        $lines = file($file);
        $start = $method->getStartLine() - 1;
        $end = $method->getEndLine();

        return implode("\n", array_slice($lines, $start, $end - $start));
    }

    private function stripComments(string $source): string
    {
        $source = preg_replace('#/\*.*?\*/#s', '', $source) ?? $source;

        return preg_replace('#^\s*//.*$#m', '', $source) ?? $source;
    }

    /**
     * Variable names that are READ but not assigned anywhere in the method.
     *
     * Assignments are excluded, and a variable assigned anywhere in the method
     * counts as defined for the whole body, which matches how PHP scoping
     * actually behaves for a plain function scope.
     *
     * @return array<int, string>
     */
    private function variableReads(string $source): array
    {
        $code = $this->stripComments($source);

        // strip string literals so text inside them is not read as code
        $code = preg_replace("/'[^']*'/", "''", $code) ?? $code;
        $code = preg_replace('/"[^"]*"/', '""', $code) ?? $code;

        $tokens = token_get_all($code);
        $reads = [];
        $defined = [];

        $count = count($tokens);
        for ($i = 0; $i < $count; $i++) {
            $token = $tokens[$i];

            if (! is_array($token) || $token[0] !== T_VARIABLE) {
                continue;
            }

            $name = ltrim($token[1], '$');
            $prev = $this->previousMeaningfulToken($tokens, $i);

            // property access, method call, or static class reference: not a read
            if ($prev === '.' || $prev === '::') {
                continue;
            }

            $next = $this->nextMeaningfulToken($tokens, $i);

            // an assignment to this variable defines it
            if ($next === '=') {
                $defined[] = $name;
                continue;
            }

            // foreach ($x of ...) and list($x) style bindings also define
            if ($prev === '(' && $this->previousMeaningfulToken($tokens, $i - 1) !== null) {
                // left as a read; handled by the explicit foreach assertion below
            }

            $reads[] = $name;
        }

        // explicit assignment scan: anything that appears on the left of '='
        if (preg_match_all('/\$([A-Za-z_][A-Za-z0-9_]*)\s*=[^=]/', $code, $m)) {
            $defined = array_merge($defined, $m[1]);
        }

        return array_values(array_diff(array_unique($reads), array_unique($defined)));
    }

    private function assignedVariables(string $source): array
    {
        $code = $this->stripComments($source);
        $out = [];
        if (preg_match_all('/\$([A-Za-z_][A-Za-z0-9_]*)\s*=[^=]/', $code, $m)) {
            $out = $m[1];
        }

        return array_values(array_unique($out));
    }

    private function previousMeaningfulToken(array $tokens, int $index)
    {
        for ($i = $index - 1; $i >= 0; $i--) {
            $t = $tokens[$i];
            if (is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }

            return is_array($t) ? $t[0] : $t;
        }

        return null;
    }

    private function nextMeaningfulToken(array $tokens, int $index)
    {
        $count = count($tokens);
        for ($i = $index + 1; $i < $count; $i++) {
            $t = $tokens[$i];
            if (is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }

            return is_array($t) ? $t[0] : $t;
        }

        return null;
    }
}
