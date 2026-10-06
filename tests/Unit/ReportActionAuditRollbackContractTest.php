<?php

namespace Tests\Unit;

use Tests\TestCase;

class ReportActionAuditRollbackContractTest extends TestCase
{
    public function test_81_down_has_no_parameters_or_executable_bypass_and_guard_order_is_locked(): void
    {
        $file = base_path('database/migrations/2026_10_04_000000_create_report_action_audit_table.php');
        $migration = require $file;
        $method = new \ReflectionMethod($migration, 'down');
        $this->assertSame(0, $method->getNumberOfParameters());
        $source = implode('', array_slice(file($file), $method->getStartLine() - 1, $method->getEndLine() - $method->getStartLine() + 1));
        $tokens = token_get_all('<?php '.$source);
        $code = '';
        foreach ($tokens as $token) {
            if (is_array($token)) {
                if (in_array($token[0], [T_COMMENT, T_DOC_COMMENT, T_WHITESPACE, T_OPEN_TAG], true)) {
                    continue;
                }
                // The refusal message can evolve; it cannot introduce executable logic.
                $code .= $token[0] === T_CONSTANT_ENCAPSED_STRING || $token[0] === T_ENCAPSED_AND_WHITESPACE ? 'STRING' : $token[1];
            } else {
                $code .= $token;
            }
        }
        $this->assertMatchesRegularExpression(
            '/^publicfunctiondown\(\):void\{if\(!Schema::hasTable\(STRING\)\)\{return;\}'
            .'DB::statement\(STRING\);\$auditRows=DB::table\(STRING\)->count\(\);'
            .'if\(\$auditRows>0\)\{thrownewRuntimeException\((?:STRING|[."{}]|\$auditRows)+\);\}'
            .'Schema::dropIfExists\(STRING\);\}$/', $code,
            'Every executable token must belong to the absent/lock/count/refuse/empty-drop path.'
        );
        // The approved schema artifact itself stays immutable in Phase 2B.
        $this->assertSame('8ebf310835abd03ef88cd31b09a71341a93619d3fb44d29141263fe3e5a25db9', hash_file('sha256', $file));
    }
}
