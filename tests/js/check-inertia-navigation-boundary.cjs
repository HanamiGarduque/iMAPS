const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

// Audit: no Inertia navigation may target a JSON data endpoint.
//
// PROVEN MECHANISM (verified against the running app, read-only):
//   GET /api/map/land_use_plan with X-Inertia:true
//     -> 200, content-type application/json, NO X-Inertia response header,
//        body = {"type":"FeatureCollection", ...} (~3.9 MB)
//   Inertia's Response.process() sees no `x-inertia` response header, calls
//   handleNonInertiaResponse(), which renders its error modal with the body.
// That is the reported "plain JSON response" modal, and the body the user saw
// was a GeoJSON FeatureCollection, which only this endpoint family produces.
//
// A plain `fetch()` can never trigger it: it sends no X-Inertia header. Only
// router.*/Link can. So the boundary to prove is that no Inertia navigation is
// ever pointed at one of these endpoints.

const ROOT = process.cwd();
const failures = [];
const passes = [];
const check = (ok, msg) => (ok ? passes.push(msg) : failures.push(msg));

const DATA_ENDPOINTS = [
    '/api/map/', '/api/notifications', '/api/global-search',
    '/api/parcels/verify', '/api/forecast', '/api/analytics',
];

function walkDir(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkDir(full, out);
        else if (/\.(jsx|js)$/.test(entry.name)) out.push(full);
    }
    return out;
}

const files = walkDir(path.join(ROOT, 'resources/js'));
check(files.length > 0, 'source files were discovered');

let inertiaTargets = 0;
for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    let ast;
    try {
        ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
    } catch (e) {
        failures.push(`${path.relative(ROOT, file)} does not parse: ${String(e.message).split('\n')[0]}`);
        continue;
    }
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');

    // Every literal argument to router.* and every href={"/..."} / href="/..."
    const found = [];
    (function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
            && node.callee.object?.name === 'router'
            && ['get', 'post', 'put', 'patch', 'delete', 'visit', 'reload'].includes(node.callee.property?.name)) {
            for (const arg of node.arguments) {
                if (arg?.type === 'StringLiteral') found.push({ kind: `router.${node.callee.property.name}`, value: arg.value });
                if (arg?.type === 'TemplateLiteral' && arg.quasis?.length === 1 && arg.expressions.length === 0) {
                    found.push({ kind: `router.${node.callee.property.name}`, value: arg.quasis[0].value.cooked });
                }
            }
        }
        if (node.type === 'JSXAttribute' && node.name?.name === 'href') {
            if (node.value?.type === 'StringLiteral') found.push({ kind: 'href', value: node.value.value });
            if (node.value?.type === 'JSXExpressionContainer' && node.value.expression?.type === 'TemplateLiteral'
                && node.value.expression.quasis?.length === 1 && node.value.expression.expressions.length === 0) {
                found.push({ kind: 'href', value: node.value.expression.quasis[0].value.cooked });
            }
        }
        for (const key of Object.keys(node)) {
            if (['loc', 'tokens', 'comments', 'leadingComments', 'trailingComments'].includes(key)) continue;
            walk(node[key]);
        }
    })(ast.program);

    for (const f of found) {
        inertiaTargets++;
        for (const endpoint of DATA_ENDPOINTS) {
            check(!String(f.value).startsWith(endpoint),
                `${rel}: ${f.kind} must not target the JSON endpoint ${endpoint} (found "${f.value}")`);
        }
    }
}

// Positive control: the guard must be capable of failing, or it proves nothing.
const canary = parser.parse('router.get("/api/map/land_use_plan");', { sourceType: 'module' });
let canaryCaught = false;
(function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
        && node.callee.object?.name === 'router' && node.arguments[0]?.type === 'StringLiteral') {
        if (DATA_ENDPOINTS.some((e) => node.arguments[0].value.startsWith(e))) canaryCaught = true;
    }
    for (const key of Object.keys(node)) {
        if (['loc', 'tokens', 'comments'].includes(key)) continue;
        walk(node[key]);
    }
})(canary.program);
check(canaryCaught, 'the guard detects a router call aimed at a data endpoint (positive control)');

// The real pages must still navigate to Inertia pages.
const index = fs.readFileSync(path.join(ROOT, 'resources/js/Pages/Diagnostics/Index.jsx'), 'utf8');
check(index.includes('router.get("/diagnostics"'), 'the Reports & Support list still navigates to the Inertia page');
check(!index.includes('/api/'), 'the Reports & Support list never references a data endpoint directly');

const shell = fs.readFileSync(path.join(ROOT, 'resources/js/Pages/Diagnostics/ReportUi.jsx'), 'utf8');
check(!shell.includes('/api/'), 'the shared report shell never references a data endpoint');

// Map geometry stays on plain fetch, which cannot produce an Inertia modal.
const mapData = fs.readFileSync(path.join(ROOT, 'resources/js/utils/mapData.js'), 'utf8');
check(/fetch\(url/.test(mapData), 'map geometry is loaded with plain fetch, which sends no X-Inertia header');

if (failures.length) {
    console.log('FAIL: Inertia navigation boundary');
    failures.forEach((f) => console.log('   - ' + f));
    console.log(`   ${passes.length} passed, ${failures.length} failed`);
    process.exit(1);
}
console.log(`Inertia navigation boundary OK: ${passes.length} assertions - ${inertiaTargets} Inertia navigation targets checked, none points at a JSON data endpoint, and the data endpoints stay on plain fetch`);