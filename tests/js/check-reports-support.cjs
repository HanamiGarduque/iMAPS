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
let componentReact = React;
const requests = [], reloads = [];
let reply = { status: 201, data: { outcome: 'opened', message: 'Escalation opened.' } };
const axios = { post: async (url, body) => { requests.push({ url, body }); return reply; } };
inertia.router.reload = options => reloads.push(options);
inertia.router.flushAll = () => {};
const cache = {};
function load(name) {
    if (cache[name]) return cache[name];
    const filename = path.resolve('resources/js/Pages/Diagnostics', name + '.jsx');
    const code = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code;
    const mod = { exports: {} };
    vm.runInNewContext(code, { module: mod, exports: mod.exports, require: (id) => {
        if (id === 'react') return componentReact;
        if (id === '@inertiajs/react') return inertia;
        if (id.startsWith('@/Components/')) return () => null;
        if (id === 'sweetalert2') return {};
        if (id === '@/utils/signOut') return { confirmSignOut: () => {} };
        if (id === './DevelopmentSupport') return load('DevelopmentSupport');
        if (id === 'axios') return axios;
        if (id === './ReportUi') return load('ReportUi');
        if (id === './Show') return load('Show');
        throw new Error('Unexpected import ' + id);
    } }, { filename });
    cache[name] = mod.exports;
    return mod.exports;
}
let checks = 0;
const failures = [];
const check = (condition, label) => { checks++; if (!condition) failures.push(label); };
const render = (name, p) => renderToStaticMarkup(React.createElement(load(name).default, p));
const report = { id: '30000000-0000-4000-8000-000000000001', reference_code: 'DR-2026-123456', title: 'Safe title', status: 'submitted', report_type: 'technical_issue', summary: '<script>not markup</script>', repro_steps: 'Inspector steps', technical_description: 'Admin review', inspector: { label: 'Unresolved inspector' } };
const context = { resolved: true, application: { reference_number: 'APP-2026-123456', applicant_name: 'Applicant', barangay: 'Barangay' }, owner: { id: 2, name: 'Exact Current PO' }, origin: { label: 'Unavailable — originating FieldSync job no longer exists.' } };
let html = render('Show', { report, canNotify: false });
check(!html.includes('Notify '), 'Technical detail has no notification control');
check(!html.includes('Planning Officer'), 'Technical detail has no PO relationship');
check(html.includes('&lt;script&gt;not markup&lt;/script&gt;'), 'Remote text renders inertly');
// Conversation + properties layout: the inspector's problem leads the
// conversation, and the properties pane that follows opens with Report identity,
// then the technical context and review.
check(html.indexOf('Problem') > -1
    && html.indexOf('Problem') < html.indexOf('Report identity')
    && html.indexOf('Report identity') < html.indexOf('Issue context')
    && html.indexOf('Issue context') < html.indexOf('Technical review'), 'Technical hierarchy');
check(html.indexOf('Reproduction steps (inspector-authored)') < html.indexOf('Technical review'), 'Reproduction belongs to inspector problem section');
check(!/Development \/ support contact/i.test(html) && !/has not been configured/i.test(html),
    'the development/support contact section is not rendered');
// The actual panel is rendered below; server-side prop scope is covered by PHP routes.
check(!/Diagnostics(?!&amp;)/.test(html), 'no stale visible DIAGNOSTICS branding on the detail page');

html = render('Show', { report, handlingActions: ['in_review', 'resolved', 'wont_fix'] });
check(html.includes('Mark In Review') && html.includes('Resolve') && html.includes('Won’t fix'), 'authorized submitted handler sees all three actions');
check(html.includes('Official response') && html.includes('<textarea') && html.includes('required=""'), 'terminal actions require a labeled official-response field');
check(html.includes('for="official-response"') && html.includes('aria-describedby="response-help response-error"'), 'response input has accessible label and error/help association');
html = render('Show', { report: { ...report, status: 'in_review' }, handlingActions: ['resolved', 'wont_fix'] });
check(!html.includes('Mark In Review') && html.includes('<textarea'), 'in-review handler sees terminal actions only');
html = render('Show', { report: { ...report, status: 'resolved', response_message: '<b>Official plain text</b>', responded_by_name: 'Official Admin', responded_at: '2026-10-04T09:30:00Z' }, handlingActions: ['in_review', 'resolved', 'wont_fix'] });
check(!html.includes('<textarea') && !html.includes('Mark In Review'), 'terminal status hides controls even if a stale capability is supplied');
check(html.includes('&lt;b&gt;Official plain text&lt;/b&gt;') && html.includes('Resolved by') && html.includes('Official Admin') && !html.includes('Responded at'), 'terminal response renders as plain text, attributed once on the divider');
check(!html.includes('Reopen') && !html.includes('Edit response'), 'terminal lifecycle offers no editing');

// The upper-left context chip derives its label from `activePage`, which is the
// route-compatible value "diagnostics". The chip must still read SUPPORT DESK,
// on every resolution path the header can take.
const header = fs.readFileSync('resources/js/Components/Header.jsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const chipLabels = [...header.matchAll(/return '([A-Z][A-Z &]+)';/g)].map((m) => m[1]);
check(chipLabels.includes('SUPPORT DESK'), 'the header resolves a SUPPORT DESK chip label');
// Four resolution paths: explicit activePage, URL segment, Inertia component
// name, and the path-only fallback. All four must name the product, because the
// pages here always pass activePage="diagnostics" but a caller that does not
// must still never see the retired name.
check((header.match(/return 'SUPPORT DESK';/g) || []).length === 4,
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
html = render('Show', { report, context: { ...context, owner: null }, canNotify: false, handlingActions: [] });
check(!html.includes('Mark In Review') && !html.includes('<textarea') && !html.includes('>Resolve<') && !html.includes('>Won’t fix<'), 'unowned Admin is read-only');
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

const technical = { ...report, report_type: 'technical_issue' };
const panel = { open: null, closed: [], escalatable: true, contactConfigured: true,
    contact: { email: 'ralphlaurexo01@gmail.com' }, composeEmailHref: 'mailto:ralphlaurexo01%40gmail.com?subject=Technical%20Issue&body=Reference%3A%20DR-2026-123456' };
props.auth.user.role = 'Admin';
html = render('Show', { report: technical, developmentSupport: panel });
check(html.includes('Open Developer Escalation') && !html.includes('Send to dev team'), 'internal opening never claims email dispatch');
check(html.includes('Compose Email') && html.includes('href="mailto:'), 'email composition is a separate native link');
check(html.includes('draft') && html.includes('manually') && html.includes('does not send'), 'email hint explains draft-only and manual attachment behavior');
const openedPanel = { ...panel, open: { id: 1, created_at: '2026-10-13T00:00:00Z', recommendation: null } };
for (const status of ['submitted', 'in_review']) {
    html = render('Show', { report: { ...technical, status }, handlingActions: status === 'submitted' ? ['in_review'] : [], developmentSupport: openedPanel });
    check(html.includes('Developer escalation open') && !html.includes('Waiting for a Planning Officer') && !html.includes('must be assigned'), `${status} escalation explains the real terminal blocker`);
    check(!html.includes('id="official-response"'), `${status} open escalation hides terminal response input`);
}
for (const role of ['Planning Officer', 'Site Inspector']) {
    props.auth.user.role = role;
    html = render('Show', { report: technical, developmentSupport: panel });
    check(!html.includes('Compose Email') && !html.includes('ralphlaurexo01'), `${role} receives no developer contact control even with stale props`);
}
props.auth.user.role = 'Admin';
html = render('Show', { report, context, developmentSupport: panel });
check(!html.includes('Compose Email') && !html.includes('Open Developer Escalation'), 'Application Support never mounts the developer panel');
html = render('DevelopmentSupport', { report: technical, panel: { ...panel, composeEmailHref: null } });
check(!html.includes('Compose Email') && html.includes('Open Developer Escalation'), 'missing valid email never blocks internal escalation');
html = render('DevelopmentSupport', { report: { ...technical, status: 'resolved' }, panel: { ...openedPanel, escalatable: false,
    closed: [{ id: 9, recommendation: '<b>Recorded advice</b>', closure_note: 'Recorded closure.', closed_at: '2026-10-13T00:00:00Z' }] } });
check(html.includes('&lt;b&gt;Recorded advice&lt;/b&gt;') && html.includes('Recorded closure.'), 'terminal history renders retained plain-text advice and closure');
check(!html.includes('<form') && !html.includes('Open Developer Escalation'), 'terminal history exposes no mutation forms even with stale open props');
props.auth.user.role = 'Planning Officer';
html = render('Index', { allowedTypes: ['application_support'], filters: { type: 'application_support' }, loadError: 'Application support context could not be loaded.' });
check(html.includes('role="alert"') && html.includes('Try again') && !html.includes('No application support'), 'context failure is a retryable alert instead of a successful empty inbox');
props.auth.user.role = 'Admin';

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
// Invoke real event handlers with only hooks and HTTP/navigation boundaries stubbed.
// No live app, server, email client, or network is used.
function nodes(tree) {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    if (!React.isValidElement(tree)) return [];
    return [tree, ...nodes(tree.props.children)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
componentReact = { ...React, useState: initial => [initial, () => {}], useRef: current => ({ current }), useEffect: () => {} };
for (const name of ['Show', 'DevelopmentSupport', 'Index']) delete cache[name];
const Show = load('Show'), DevelopmentSupport = load('DevelopmentSupport').default;

async function actions() {
    const selected = { report: technical, handlingActions: ['in_review'], developmentSupport: panel };
    const standalone = find(Show.default(selected), node => node.type === Show.ReportWorkspace);
    const embedded = find(load('Index').default({ selected, reports: [technical], allowedTypes: ['technical_issue', 'application_support'], filters: { type: 'technical_issue' } }), node => node.type === Show.ReportWorkspace);
    for (const [label, workspace, expected] of [
        ['standalone', standalone, ['report', 'context', 'canNotify', 'handlingActions', 'developmentSupport']],
        ['embedded', embedded, ['selected', 'reports', 'counts', 'pagination', 'loadError']],
    ]) {
        const workspaceTree = Show.ReportWorkspace(workspace.props);
        const child = find(workspaceTree, node => node.type === DevelopmentSupport);
        check(Boolean(child), `${label} workspace mounts its real developer panel`);
        for (const [operation, operationPanel] of [['open', panel], ['recommend', openedPanel], ['close', openedPanel]]) {
            const tree = DevelopmentSupport({ ...child.props, panel: operationPanel });
            const event = operation === 'open'
                ? find(tree, node => node.type === 'button' && node.props.onClick)
                : nodes(tree).filter(node => node.type === 'form')[operation === 'recommend' ? 0 : 1];
            reply = { status: 200, data: { outcome: operation === 'open' ? 'opened' : operation === 'recommend' ? 'recommended' : 'closed', message: 'Recorded.' } };
            reloads.length = 0;
            await (operation === 'open' ? event.props.onClick() : event.props.onSubmit({ preventDefault() {} }));
            await new Promise(setImmediate); // Native form handlers do not return their async POST.
            check(JSON.stringify(reloads[0]?.only) === JSON.stringify(expected), `${label} ${operation} reloads the page-specific authoritative props`);
            check(reloads[0]?.preserveScroll === true, `${label} ${operation} preserves scroll`);
            check(requests.at(-1).url === `/diagnostics/${technical.id}/escalations${operation === 'open' ? '' : `/1/${operation === 'recommend' ? 'recommendation' : 'close'}`}`, `${label} ${operation} retains the existing endpoint`);
        }
        reply = { status: 200, data: { outcome: 'success', remote_updated: true, audit_recorded: true, notification_status: 'not_applicable' } };
        reloads.length = 0;
        await find(workspaceTree, node => node.type === 'button' && nodes(node).length > 1 && node.props.onClick && !node.props['aria-label']).props.onClick();
        check(JSON.stringify(reloads[0]?.only) === JSON.stringify(expected), `${label} handling reload includes the developer panel as well`);
        if (label === 'embedded') {
            // Inertia merges only requested props. Render the real inbox after
            // failure/recovery so a missing loadError cannot look like a true zero.
            props.auth.user.role = 'Planning Officer';
            const error = 'Application support context could not be loaded. Please try again.';
            for (const [scenario, previousError, freshError] of [['failure', null, error], ['recovery', error, null]]) {
                const previous = { selected: { report, context, handlingActions: [] }, reports: [],
                    allowedTypes: ['application_support'], filters: { type: 'application_support', status: 'all' },
                    counts: { application_support: 0 }, pagination: { page: 1, last: 1, total: 0 }, loadError: previousError };
                const partial = { selected: previous.selected, reports: [], counts: previous.counts,
                    pagination: previous.pagination, loadError: freshError };
                const merged = { ...previous, ...Object.fromEntries(reloads[0].only.map(key => [key, partial[key]])) };
                const view = render('Index', merged);
                check(scenario === 'failure'
                    ? view.includes('role="alert"') && view.includes(error) && !view.includes('No support reports for this selection.')
                    : !view.includes('role="alert"') && view.includes('No support reports for this selection.'),
                    `embedded partial reload ${scenario} refreshes the real inbox error/empty-state rendering`);
            }
            props.auth.user.role = 'Admin';
        }
    }
}
actions().then(() => {
    if (failures.length) {
        failures.forEach(label => console.error('FAIL: ' + label));
        console.error(`Support Desk UI: ${checks - failures.length} passed, ${failures.length} failed`);
        process.exitCode = 1;
    } else console.log(`Support Desk rendered UI and actions: ${checks} assertions PASS`);
}).catch(error => { console.error(error); process.exitCode = 1; });
