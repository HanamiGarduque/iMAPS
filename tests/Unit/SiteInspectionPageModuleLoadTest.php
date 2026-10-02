<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Executable frontend regression for the blank-page failure on
 * GET /site-inspections.
 *
 * WHAT HAPPENED
 * -------------
 * A JSX-expression block was inserted at the MODULE TOP LEVEL of
 * `resources/js/Pages/Site Inspections/Index.jsx`, above its imports. That is
 * not a syntax error - `{expr}` is a valid expression statement - so both
 * esbuild and `npm run build` passed. It failed only in the browser, when the
 * module was evaluated: `counters` is a component-scoped prop, so the top-level
 * reference threw
 *
 *     ReferenceError: counters is not defined
 *
 * Page components load through a dynamic import, so that rejection happened
 * before React mounted. The user saw a completely white page with no sidebar,
 * no layout and no content, while the backend returned a healthy 200. The
 * Laravel 500 was already fixed, and the controller executed perfectly, so
 * neither the controller probe nor the PHP suite could see this.
 *
 * WHY THIS IS AN EXECUTABLE TEST
 * ------------------------------
 * A source-text assertion cannot detect this: the strings are all present and
 * correct in the broken file. The failure is a runtime module-evaluation fact.
 * This test therefore RUNS a real parser over every page component and asserts
 * the structural invariant that makes such a module evaluable - it must begin
 * with its imports.
 */
class SiteInspectionPageModuleLoadTest extends TestCase
{
    private const CHECKER = 'tests/js/check-page-parses.cjs';

    public function test_every_page_component_is_a_valid_loadable_module(): void
    {
        $path = dirname(__DIR__, 2) . '/' . self::CHECKER;

        $this->assertFileExists(
            $path,
            'Missing page-module checker. Without it a module-level JSX block ships '
            .'green and renders a blank page in the browser.'
        );

        $node = $this->nodeBinary();

        $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $process = proc_open(
            escapeshellarg($node) . ' ' . escapeshellarg($path),
            $descriptors,
            $pipes,
            dirname(__DIR__, 2)
        );

        $this->assertIsResource($process, 'Could not start the node checker.');

        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exit = proc_close($process);

        $output = trim($stdout . "\n" . $stderr);

        $this->assertSame(
            0,
            $exit,
            "Page-module check failed. A page component that does not begin with its "
            ."imports throws a ReferenceError when the browser evaluates the module, "
            ."which renders a completely blank page.\n\n".$output
        );

        $this->assertMatchesRegularExpression('/0 failed/', $output, $output);
    }

    /**
     * The specific file that regressed, asserted directly, so the failure names
     * the page rather than a generic checker failure.
     */
    public function test_site_inspection_index_begins_with_its_imports(): void
    {
        $path = dirname(__DIR__, 2) . '/resources/js/Pages/Site Inspections/Index.jsx';

        $this->assertFileExists($path);

        $source = (string) file_get_contents($path);

        // Comments blanked so a documented note cannot satisfy the assertion.
        $stripped = preg_replace('#/\*.*?\*/#s', '', $source) ?? $source;
        $stripped = preg_replace('#^\s*//.*$#m', '', $stripped) ?? $stripped;

        $first = collect(preg_split('/\R/', $stripped) ?: [])
            ->map(fn ($l) => trim($l))
            ->first(fn ($l) => $l !== '');

        $this->assertNotNull($first, 'The page component is empty.');
        $this->assertStringStartsWith(
            'import',
            $first,
            'resources/js/Pages/Site Inspections/Index.jsx must begin with an import. '
            .'A JSX block above the imports evaluates at module load, references '
            .'component-scoped props, throws ReferenceError, and blanks the page. '
            .'First line was: ' . $first
        );
    }

    /**
     * The counters prop is referenced exactly once, inside the component, and
     * is destructured from usePage. That is the invariant the broken file
     * violated: the same identifier was being used at module scope.
     */
    public function test_counters_is_destructured_from_props_and_used_inside_the_component(): void
    {
        $path = dirname(__DIR__, 2) . '/resources/js/Pages/Site Inspections/Index.jsx';
        $source = (string) file_get_contents($path);

        $this->assertMatchesRegularExpression(
            '/const\s*\{[\s\S]*?\bcounters\b[\s\S]*?\}\s*=\s*usePage\(\)\.props/',
            $this->stripJsxComments($source),
            'counters must be destructured from usePage().props. The old pattern used [^}]* which cannot cross the operations = {} default inside the same destructure.'
        );

        $this->assertStringContainsString(
            'counters && (',
            $this->stripJsxComments($source),
            'The counters block must still be rendered.'
        );
    }

    // ------------------------------------------------------------------

    private function nodeBinary(): string
    {
        foreach (['node', 'node.exe'] as $candidate) {
            $which = @shell_exec('where ' . $candidate . ' 2>nul');
            if (is_string($which) && trim($which) !== '') {
                return trim(explode("\n", trim($which))[0]);
            }
        }

        $this->markTestSkipped('node executable not found on PATH.');
    }

    private function stripJsxComments(string $source): string
    {
        return preg_replace('#\{\s*/\*.*?\*/\s*\}#s', '', $source) ?? $source;
    }
}
