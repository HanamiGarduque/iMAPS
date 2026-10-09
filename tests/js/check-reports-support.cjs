const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');
const parser = require('@babel/parser');
let props = { auth: { user: { name: 'Admin', role: 'Admin' } }, flash: {} };
const Link = ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);
const inertia = { Link, Head: () => null, usePage: () => ({ props }), router: {} };
const cache = {};
function load(name) {
    if (cache[name]) return cache[name];
    const filename = path.resolve('resources/js/Pages/Diagnostics', name + '.jsx');
    const code = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code;
    const mod = { exports: {} };
    vm.runInNewContext(code, { module: mod, exports: mod.exports, require: (id) => {
        if (id === 'react') return React;
        if (id === '@inertiajs/react') return inertia;
        if (id.startsWith('@/Components/')) return () => null;
        if (id === 'sweetalert2') return {};
        if (id === '@/utils/signOut') return { confirmSignOut: () => {} };
        if (id === './DevelopmentSupport') return () => null;
        if (id === 'axios') return {};
        if (id === './ReportUi') return load('ReportUi');
        throw new Error('Unexpected import ' + id);
    } }, { filename });
    cache[name] = mod.exports;
    return mod.exports;
}
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const render = (name, p) => renderToStaticMarkup(React.createElement(load(name).default, p));
const report = { id: '30000000-0000-4000-8000-000000000001', reference_code: 'DR-2026-123456', title: 'Safe title', status: 'submitted', report_type: 'technical_issue', summary: '<script>not markup</script>', repro_steps: 'Inspector steps', technical_description: 'Admin review', inspector: { label: 'Unresolved inspector' } };
const context = { resolved: true, application: { reference_number: 'APP-2026-123456', applicant_name: 'Applicant', barangay: 'Barangay' }, owner: { id: 2, name: 'Exact Current PO' }, origin: { label: 'Unavailable — originating FieldSync job no longer exists.' } };
let html = render('Show', { report, canNotify: false });
check(!html.includes('Notify '), 'Technical detail has no notification control');
check(!html.includes('Planning Officer'), 'Technical detail has no PO relationship');
check(html.includes('&lt;script&gt;not markup&lt;/script&gt;'), 'Remote text renders inertly');
// Two-column layout: the inspector's problem leads the content column, and
// Report identity sits in the status/handling column that follows it.
check(html.indexOf('Problem') < html.indexOf('Issue context')
    && html.indexOf('Issue context') < html.indexOf('Technical review')
    && html.indexOf('Technical review') < html.indexOf('Report identity'), 'Technical hierarchy');
check(html.indexOf('Reproduction steps (inspector-authored)') < html.indexOf('Technical review'), 'Reproduction belongs to inspector problem section');
check(!/Development \/ support contact/i.test(html) && !/has not been configured/i.test(html),
    'the development/support contact section is not rendered');
// Executable code only: comments and docblocks are stripped, because this file
// legitimately NAMES the removed block in prose to record why it is gone, and
// asserting on raw text would invert the meaning of the rule.
const controller = fs.readFileSync('app/Http/Controllers/DiagnosticReportController.php', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
check(!/escalation|imaps\.contact/.test(controller),
    'the escalation prop is not produced at all; the section is removed, not merely hidden');
check(!/Diagnostics(?!&amp;)/.test(html), 'no stale visible DIAGNOSTICS branding on the detail page');

html = render('Show', { report, handlingActions: ['in_review', 'resolved', 'wont_fix'] });
check(html.includes('Mark In Review') && html.includes('Resolve') && html.includes('Won’t fix'), 'authorized submitted handler sees all three actions');
check(html.includes('Official response') && html.includes('<textarea') && html.includes('required=""'), 'terminal actions require a labeled official-response field');
check(html.includes('for="official-response"') && html.includes('aria-describedby="response-help response-error"'), 'response input has accessible label and error/help association');
html = render('Show', { report: { ...report, status: 'in_review' }, handlingActions: ['resolved', 'wont_fix'] });
check(!html.includes('Mark In Review') && html.includes('<textarea'), 'in-review handler sees terminal actions only');
html = render('Show', { report: { ...report, status: 'resolved', response_message: '<b>Official plain text</b>', responded_by_name: 'Official Admin', responded_at: '2026-10-04T09:30:00Z' }, handlingActions: ['in_review', 'resolved', 'wont_fix'] });
check(!html.includes('<textarea') && !html.includes('Mark In Review'), 'terminal status hides controls even if a stale capability is supplied');
check(html.includes('&lt;b&gt;Official plain text&lt;/b&gt;') && html.includes('Official Admin') && html.includes('Responded at'), 'terminal response and attribution render as plain text');
check(!html.includes('Reopen') && !html.includes('Edit response'), 'terminal lifecycle offers no editing');

// The upper-left context chip derives its label from `activePage`, which is the
// route-compatible value "diagnostics". The chip must still read REPORTS &
// SUPPORT, on every resolution path the header can take.
const header = fs.readFileSync('resources/js/Components/Header.jsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const chipLabels = [...header.matchAll(/return '([A-Z][A-Z &]+)';/g)].map((m) => m[1]);
check(chipLabels.includes('REPORTS & SUPPORT'), 'the header resolves a REPORTS & SUPPORT chip label');
// Four resolution paths: explicit activePage, URL segment, Inertia component
// name, and the path-only fallback. All four must name the product, because the
// pages here always pass activePage="diagnostics" but a caller that does not
// must still never see the retired name.
check((header.match(/return 'REPORTS & SUPPORT';/g) || []).length === 4,
    'every header resolution path handles the diagnostics module: activePage, URL segment, component name, and path fallback');
check(!chipLabels.includes('DIAGNOSTICS'), 'the retired product name is never a chip label');
report.report_type = 'application_support';
html = render('Show', { report, context, canNotify: true });
check(html.includes('Notify Exact Current PO'), 'Button names exact current PO');
check(!html.includes('<textarea') && !html.includes('Mark In Review'), 'Admin owned support remains monitor/notify only');
check(html.includes(context.origin.label), 'Retained state wording survives rendering');
check(html.includes('APP-2026-123456'), 'Full application reference visible');
html = render('Show', { report, context: { ...context, owner: null }, canNotify: false });
check(html.includes('No current Planning Officer assigned.') && !html.includes('Notify '), 'Unowned support has no notification control');
html = render('Show', { report, context: { ...context, owner: null }, canNotify: false, handlingActions: ['in_review'] });
check(html.includes('Mark In Review') && !html.includes('<textarea') && !html.includes('>Resolve<') && !html.includes('>Won’t fix<'), 'unowned Admin gets administrative review only');
html = render('Show', { report, context: { resolved: false }, canNotify: false });
check(html.includes('Application context unavailable.') && !html.includes('Notify '), 'Unresolved state is honest and non-notifiable');
html = render('Index', { allowedTypes: ['technical_issue', 'application_support'], filters: { type: 'technical_issue' }, counts: { technical_issue: 1, application_support: 0 } });
check(html.includes('Technical Issues') && html.includes('Application Support'), 'Admin has both tab links');
check(html.includes('No technical issues reported.'), 'Technical empty state');
props.auth.user.role = 'Planning Officer';
html = render('Index', { allowedTypes: ['application_support'], filters: { type: 'application_support' }, counts: { application_support: 0 } });
check(!html.includes('Technical Issues') && !html.includes('technical_issue'), 'PO has no Technical UI');
check(!html.includes('aria-label="Report types"'), 'Single legal surface has no tab bar');
html = render('Show', { report, context, canNotify: false });
check(!html.includes('Notify ') && html.includes('Exact Current PO'), 'PO sees ownership but no Admin action');
html = render('Show', { report, context, canNotify: false, handlingActions: ['in_review', 'resolved', 'wont_fix'] });
check(html.includes('<textarea') && html.includes('Mark In Review') && !html.includes('Notify '), 'current PO gets handling without Notify');

// Render the real Site Inspection support section, isolated from its map dependencies.
const source = fs.readFileSync('resources/js/Pages/Site Inspections/Show.jsx', 'utf8');
const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
let node;
function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'JSXElement' && n.openingElement.name.name === 'section' && n.openingElement.attributes.some(a => a.name?.name === 'aria-label' && a.value?.value === 'Application Support')) node = n;
    for (const [key, value] of Object.entries(n)) if (!['loc', 'tokens', 'comments'].includes(key)) {
        if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }
}
walk(ast.program);
assert.ok(node, 'Support section exists');
const supportCode = transformSync(`module.exports = ({applicationSupport}) => (${source.slice(node.start, node.end)});`, { loader: 'jsx', format: 'cjs' }).code;
const mod = { exports: {} };
vm.runInNewContext(supportCode, { module: mod, React, Link });
const summary = { ok: true, total: 0, latest: null, url: null };
html = renderToStaticMarkup(React.createElement(mod.exports, { applicationSupport: summary }));
check(html.includes('No support reports for this application.'), 'Inspection zero state');
check(!html.includes('View Application Support'), 'ZERO STATE RENDERS NO NAVIGATION CONTROL');

// A zero count must suppress the button even if a URL is somehow still present,
// so the guarantee does not depend on the server having nulled it.
html = renderToStaticMarkup(React.createElement(mod.exports, { applicationSupport: { ...summary, url: '/diagnostics?type=application_support' } }));
check(!html.includes('View Application Support'), 'count 0 suppresses the link regardless of url');
summary.url = '/diagnostics?type=application_support&application=10000000-0000-4000-8000-000000000001';
summary.total = 1; summary.latest = { ...report, context, support_category_label: 'Clarification Needed' };
html = renderToStaticMarkup(React.createElement(mod.exports, { applicationSupport: summary }));
check(html.includes('Clarification Needed') && html.includes('Exact Current PO'), 'Inspection data state');
check(html.includes('View Application Support'), 'data state offers the navigation control');
check(html.includes('application=10000000-0000-4000-8000-000000000001'), 'Exact durable UUID in inspection link');
check(!html.includes('technical_issue') && !html.includes('Round '), 'No technical metadata or round inference');
const executable = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check(executable.indexOf('Round History') < executable.indexOf('aria-label="Application Support"') && executable.indexOf('aria-label="Application Support"') < executable.indexOf('Admin Support Actions'), 'Support follows history and precedes operational recovery');
console.log(`Reports & Support rendered UI: ${checks} assertions PASS`);
