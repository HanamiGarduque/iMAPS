const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Executable check for Inertia page modules.
//
// THE DEFECT CLASS THIS CATCHES
// ----------------------------
// A JSX-expression block placed at MODULE top level - e.g. above the imports.
// That is NOT a syntax error: `{expr}` is a valid expression statement, so
// esbuild and the production Vite/Rollup build both accept it happily. It fails
// only when the browser EVALUATES the module, because the component-scoped
// identifiers it references do not exist there:
//     ReferenceError: counters is not defined
// Page components are loaded through a dynamic import, so that rejection happens
// before React mounts and the browser shows a completely blank page - no layout,
// no sidebar, no content - while the backend returns a perfectly healthy 200.
//
// No parser can catch that, so this asserts the structural invariant that makes
// such a module evaluable: a page module must begin with its imports. A JSX
// block above them is the signature of the defect.
//
// This is deliberately narrow. An earlier version also rejected `{...}` before
// `export default`, which produced 13 false positives on healthy files because
// module-level constants are full of such statements.

const root = path.join(process.cwd(), 'resources', 'js', 'Pages');
const files = [];
(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.jsx$/.test(entry.name)) files.push(p);
    }
})(root);

/** Replace comment bodies with spaces so line numbers stay accurate. */
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

let failed = 0;

for (const f of files) {
    const raw = fs.readFileSync(f, 'utf8');
    const rel = path.relative(process.cwd(), f);
    const problems = [];

    // 1. must parse as JSX at all
    try {
        esbuild.transformSync(raw, { loader: 'jsx' });
    } catch (e) {
        problems.push('parse error: ' + String(e.message).split('\n')[0]);
    }

    // 2. must begin with an import statement
    const first = stripComments(raw)
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l !== '');

    if (first && !/^import\b/.test(first)) {
        problems.push(
            'module does not begin with an import - a top-level JSX block above the ' +
            'imports throws ReferenceError at load and renders a blank page. First line: ' +
            first.slice(0, 80)
        );
    }

    if (problems.length) {
        failed++;
        console.log('FAIL: ' + rel);
        problems.forEach((p) => console.log('   - ' + p));
    }
}

console.log(`checked ${files.length} page component(s), ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
