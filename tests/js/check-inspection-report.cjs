const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Run the real report JSX. Skip browser effects (photo/map reads and clock),
// fail on transport during rendering, and replace only unrelated imported UI.
const source = fs.readFileSync(path.join(__dirname, '../../resources/js/Pages/Site Inspections/Show.jsx'), 'utf8');
const compiled = transformSync(source, { loader: 'jsx', format: 'cjs' }).code;
const emptyWidget = () => null;
const unexpected = () => { throw new Error('Unexpected transport or browser operation'); };
const checklist = [
    { item: 'Structure matches declared use', checked: false },
    { item: 'Setback distances compliant', checked: false },
    { item: 'Accessibility & road frontage', checked: false },
    { item: 'Surrounding developments noted', checked: false },
    { item: 'Signage / commercial activity present', checked: false },
];

function render(inspection = {}, props = {}, role = 'Admin') {
    const input = { id: 900001, status: 'completed', submitted_at: '2026-10-20T01:00:00Z',
        completed_at: '2026-10-20T01:00:00Z', findings: 'Synthetic field record', ...inspection };
    const before = JSON.stringify(input);
    const imports = {
        react: { ...React, useEffect: () => {}, useCallback: (fn) => fn,
            useRef: (value) => ({ current: value }),
            useState: (value) => [typeof value === 'function' ? value() : value, unexpected] },
        '@inertiajs/react': { Head: emptyWidget,
            Link: ({ children, href }) => React.createElement('a', { href }, children),
            usePage: () => ({ props, url: '/site-inspections/900001' }),
            router: { post: unexpected, put: unexpected, patch: unexpected, delete: unexpected } },
        '@/Components/Header': emptyWidget,
        '@/Components/Sidebar': emptyWidget,
        '@/Components/Modal': emptyWidget,
        '@/Components/PhotoLightbox': emptyWidget,
        '@/Components/Maps/MapSkeleton': emptyWidget,
        '@/Components/RetryDeliveryButton': emptyWidget,
        '@/Components/folderOrigin': { readRegistryQuery: () => '',
            resolveBackTarget: () => ({ href: '/site-inspections', label: 'All Inspections' }) },
        '@/utils/signOut': { confirmSignOut: unexpected },
        'react-leaflet': { MapContainer: emptyWidget, TileLayer: emptyWidget, GeoJSON: emptyWidget, useMap: unexpected },
        leaflet: { geoJSON: unexpected },
        'leaflet/dist/leaflet.css': {},
    };
    const module = { exports: {} };
    vm.runInNewContext(compiled, { module, exports: module.exports, console,
        fetch: unexpected, XMLHttpRequest: unexpected, WebSocket: unexpected,
        setInterval: unexpected, setTimeout: unexpected,
        require: (id) => {
            assert.ok(Object.hasOwn(imports, id), `Unexpected page import: ${id}`);
            return imports[id];
        } });
    const html = renderToStaticMarkup(React.createElement(module.exports.default, {
        auth: { user: { name: 'Synthetic reviewer', role } }, inspection: input,
        applicationSupport: { ok: true, total: 0 },
    }));
    assert.equal(JSON.stringify(input), before, 'Rendering must not mutate recorded evidence');
    const report = html.match(/<article\b[^>]*aria-label="Site inspection report"[^>]*>([\s\S]*?)<\/article>/)?.[1] || '';
    return { html, report, text: text(report) };
}

function text(html) {
    return html.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function row(html, label) {
    const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [];
    return rows.find((value) => /<th scope="row"/.test(value) && text(value).startsWith(`${label} `)) || '';
}

for (const result of ['Compliant', 'With Discrepancy', 'For Review', 'Requires Reinspection']) {
    test(`${result} remains the primary result for open/completed rounds regardless of the binary flag`, () => {
        for (const status of ['assigned', 'completed']) {
            for (const binary of [true, false, null, 0, 1, 'false']) {
                const page = render({ status, inspection_result: result, is_compliant: binary,
                    submitted_at: status === 'assigned' ? null : '2026-10-20T01:00:00Z',
                    completed_at: status === 'assigned' ? null : '2026-10-20T01:00:00Z' });
                assert.doesNotMatch(page.text, /not compliant/i, 'A derived binary flag must never add a verdict');
                const assessment = page.report.match(/<div\b[^>]*aria-label="Inspector&#x27;s result"[^>]*>([\s\S]*?)<\/div>/)?.[1];
                assert.ok(assessment, 'The inspector result must stay primary, including completed records');
                assert.ok(text(assessment).includes(result));
                if (['For Review', 'Requires Reinspection'].includes(result)) {
                    assert.doesNotMatch(assessment, /text-red-|bg-red-/);
                }
            }
        }
    });
}

test('missing, unknown and legacy binary-only records never acquire a four-state result', () => {
    for (const result of [undefined, null, '', 'obsolete', 'toString', { invalid: true }]) {
        for (const binary of [true, false, 0, 1]) {
            const page = render({ inspection_result: result, is_compliant: binary });
            assert.match(page.text, /Inspector's result Not recorded/);
            assert.doesNotMatch(page.text, /not compliant|With Discrepancy|For Review|Requires Reinspection|\bCompliant\b/i);
        }
    }
});

for (const [result, label] of [['For Review', 'Explanation for review'], ['Requires Reinspection', 'Explanation for reinspection'],
    ['With Discrepancy', 'Discrepancies']]) {
    test(`${result} keeps its explanation even when other evidence contains identical text`, () => {
        const reason = 'Synthetic reason: verify the recorded road access.';
        const page = render({ inspection_result: result, discrepancies: reason, findings: reason, inspector_notes: reason });
        assert.ok(text(row(page.report, label)).includes(reason));
        assert.ok(text(row(page.report, 'Inspector observations')).includes(reason));
        if (result !== 'With Discrepancy') assert.doesNotMatch(row(page.report, label), /text-red-|text-rose-/);
    });
}

test('generated site summaries and opaque legacy observations never impersonate inspector observations', () => {
    const note = 'Road: inspected directly. Access: further documents needed.';
    for (const summary of ['Actual land use: Residential. Boundary status: Verified on-site.',
        'Land use: Residential. GPS offset: 10 m.']) {
        const page = render({ inspection_result: 'For Review', observations: summary, inspector_notes: note });
        assert.ok(row(page.report, 'Generated site summary'));
        assert.ok(text(row(page.report, 'Inspector observations')).includes(note), 'Inspector prose must remain intact');
    }
    const page = render({ observations: 'Opaque historical observation', notes: 'Legacy inspector note' });
    assert.ok(text(row(page.report, 'Stored observations')).includes('Opaque historical observation'));
    assert.ok(text(row(page.report, 'Inspector observations')).includes('Legacy inspector note'));
    assert.doesNotMatch(page.text, /Generated site summary/);
});

test('all five canonical unchecked answers render as neutral recorded checklist evidence', () => {
    for (const data of [checklist, JSON.stringify(checklist)]) {
        const page = render({ inspection_result: 'For Review', checklist_data: data });
        for (const { item } of checklist) {
            const answer = row(page.report, item);
            assert.match(text(answer), /Not checked$/);
            assert.doesNotMatch(answer, /text-red-|text-rose-|failed|non-compliant/i);
        }
    }
});

test('a checklist-only historical report remains visible, with explicit boolean/numeric legacy answers', () => {
    const page = render({ findings: null, submitted_at: null, completed_at: null, status: 'assigned', checklist_data: [
        { item: 'Legacy unchecked', checked: 0 }, { item: 'Legacy checked', checked: 1 },
        { item: 'Legacy passed flag', passed: false }, { item: 'Explicit check', checked: true },
        { item: 'Explicit unchecked wins', checked: false, passed: true },
    ] });
    for (const item of ['Legacy unchecked', 'Legacy passed flag', 'Explicit unchecked wins']) {
        assert.match(text(row(page.report, item)), /Not checked$/);
    }
    for (const item of ['Legacy checked', 'Explicit check']) assert.match(text(row(page.report, item)), /Checked$/);
    assert.doesNotMatch(page.html, /No inspection report yet/);
});

test('structured checklist answers render exact PO labels instead of raw tokens', () => {
    const data = [
        { item: 'Existing project or development on site', answer: 'yes' },
        { item: 'Extension of an existing structure', answer: 'not_applicable' },
        { item: 'Still at the project proposal stage', answer: 'unable' },
        { item: 'Existing mojon or property marker observed', answer: 'no' },
    ];
    for (const checklistData of [data, JSON.stringify(data)]) {
        const page = render({ inspection_result: 'For Review', checklist_data: checklistData });
        const expected = {
            'Existing project or development on site': /Yes$/,
            'Extension of an existing structure': /Not Applicable$/,
            'Still at the project proposal stage': /Unable to Verify$/,
            'Existing mojon or property marker observed': /No$/,
        };
        for (const [item, label] of Object.entries(expected)) {
            const answer = row(page.report, item);
            assert.match(text(answer), label);
            assert.doesNotMatch(answer, /text-red-|text-rose-|failed|non-compliant/i);
        }
        assert.doesNotMatch(page.text, /\bnot_applicable\b|\[object Object\]/);
    }
});

test('missing structured answers stay Not recorded while explicit No is not inferred', () => {
    const page = render({ checklist_data: [
        { item: 'Existing project or development on site' },
        { item: 'Extension of an existing structure', answer: null },
        { item: 'Still at the project proposal stage', answer: '   ' },
    ] });
    for (const item of ['Existing project or development on site', 'Extension of an existing structure',
        'Still at the project proposal stage']) {
        assert.match(text(row(page.report, item)), /Not recorded$/);
    }
    assert.doesNotMatch(text(page.report), /\bNo\b/);

    const explicit = render({ checklist_data: [{ item: 'Existing project or development on site', answer: 'no' }] });
    assert.match(text(row(explicit.report, 'Existing project or development on site')), /No$/);
});

test('declared-use free text renders exactly and remains escaped', () => {
    const page = render({ checklist_data: [
        { item: "Existing project's declared use", answer: 'Fictional residential' },
    ] });
    assert.match(text(row(page.report, "Existing project's declared use")), /Fictional residential$/);

    const injection = '<script>alert("synthetic")</script>';
    const escaped = render({ checklist_data: [{ item: "Existing project's declared use", answer: injection }] });
    assert.doesNotMatch(escaped.report, /<script>/);
    assert.ok(escaped.report.includes('&lt;script&gt;'));
});

test('declared-use text stays literal even when it resembles a reserved answer', () => {
    const item = "Existing project's declared use";
    for (const answer of ['yes', 'no', 'unable', 'not_applicable', 'Unable to Verify', '  no\n  fictional clinic  ']) {
        const page = render({ checklist_data: [{ item, answer }] });
        const cell = row(page.report, item).match(/<td\b[^>]*>([\s\S]*?)<\/td>/)?.[1];
        assert.equal(cell, answer, 'Free text must not be translated, trimmed or reclassified');
    }
});

test('long checklist labels and raw/free-text answers retain intrinsic wrapping and whitespace', () => {
    const item = "Existing project's declared use";
    const long = 'synthetic'.repeat(128);
    const answer = `  ${long}\n  literal `;
    const unknown = { item: long, answer: long };
    const page = render({ checklist_data: [{ item, answer }, unknown] });
    for (const label of [item, long]) {
        const record = row(page.report, label);
        for (const cell of ['th', 'td']) {
            const classes = record.match(new RegExp(`<${cell}\\b[^>]*class="([^"]*)"`))?.[1] || '';
            assert.ok(classes.split(/\s+/).includes('[overflow-wrap:anywhere]'), `${cell} must allow intrinsic wrapping`);
            if (cell === 'td') assert.match(classes, /\bwhitespace-pre-wrap\b/);
        }
    }
    assert.ok(page.report.includes(answer), 'Whitespace and long literal text must not be rewritten');
    assert.ok(text(row(page.report, long)).includes(JSON.stringify(unknown)), 'Long raw evidence must remain intact');
});

const triStateQuestions = [
    'Existing project or development on site',
    'Still at the project proposal stage',
    'Trees present on the lot',
    'Canal or waterway on or adjoining the lot',
    'Existing mojon or property marker observed',
];

test('each structured choice accepts only its own canonical options', () => {
    for (const item of [...triStateQuestions, 'Extension of an existing structure']) {
        for (const [answer, expected] of [['yes', 'Yes'], ['no', 'No'], ['unable', 'Unable to Verify']]) {
            assert.ok(text(row(render({ checklist_data: [{ item, answer }] }).report, item)).endsWith(` ${expected}`));
        }
        for (const answer of ['maybe', 'YES', 'unable to verify', 'not applicable', 'not_applicable']) {
            if (item === 'Extension of an existing structure' && answer === 'not_applicable') continue;
            const cell = text(row(render({ checklist_data: [{ item, answer }] }).report, item));
            assert.match(cell, /Unknown answer/);
            assert.ok(cell.includes(JSON.stringify(answer)), 'The unrecognized recorded value must remain visible');
            assert.doesNotMatch(cell, /Not checked$/);
        }
    }
    const extension = 'Extension of an existing structure';
    assert.match(text(row(render({ checklist_data: [{ item: extension, answer: 'not_applicable' }] }).report, extension)), /Not Applicable$/);
});

test('missing, malformed and unknown structured answers remain distinct from explicit No', () => {
    const item = 'Existing project or development on site';
    for (const entry of [{ item }, { item, answer: null }, { item, answer: '' }, { item, answer: '   ' }]) {
        assert.match(text(row(render({ checklist_data: [entry] }).report, item)), /Not recorded$/);
    }
    for (const answer of [false, 0, 1, [], { unexpected: 'synthetic' }]) {
        const cell = text(row(render({ checklist_data: [{ item, answer }] }).report, item));
        assert.match(cell, /Malformed answer/);
        assert.ok(cell.includes(JSON.stringify(answer)));
        assert.doesNotMatch(cell, /(?:No|Not checked)$/);
    }
    assert.match(text(row(render({ checklist_data: [{ item, answer: 'maybe' }] }).report, item)), /Unknown answer/);
    assert.match(text(row(render({ checklist_data: [{ item, answer: 'no' }] }).report, item)), /No$/);
    for (const entry of [{ item, checked: false }, { item, answer: 'no', passed: true }, { item, answer: 'maybe', checked: false }]) {
        const cell = text(row(render({ checklist_data: [entry] }).report, item));
        assert.match(cell, /Malformed structured entry/);
        assert.ok(cell.includes(JSON.stringify(entry)), 'Mixed-format evidence must not be hidden by a fallback');
    }
});

test('only established labels interpret structured tokens while historical booleans remain readable', () => {
    for (const item of ['Future structured question', 'toString', 'Existing project or development on site ']) {
        const cell = text(row(render({ checklist_data: [{ item, answer: 'yes' }] }).report, item.trim()));
        assert.match(cell, /Unknown question/);
        assert.ok(cell.includes('"answer":"yes"'));
        assert.doesNotMatch(cell, / Yes$/);
    }
    assert.match(text(row(render({ checklist_data: [{ item: 'Historical custom boolean', passed: false }] }).report,
        'Historical custom boolean')), /Not checked$/);
});

test('duplicate known questions retain every raw entry without choosing a winner', () => {
    const questions = [...triStateQuestions, 'Extension of an existing structure', "Existing project's declared use"];
    for (const item of questions) {
        for (const values of [['yes', 'no'], ['yes', 'yes'], [null, 'no']]) {
            const entries = values.map((answer) => ({ item, answer }));
            const input = { checklist_data: [...checklist, ...entries], checklist_completed_count: 0, checklist_total_count: 5 };
            const page = render(input);
            const duplicates = (page.report.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [])
                .filter((record) => /<th scope="row"/.test(record) && text(record).startsWith(`${item} `));
            assert.equal(duplicates.length, 2);
            duplicates.forEach((record, index) => {
                assert.match(text(record), /Ambiguous duplicate/);
                assert.ok(text(record).includes(JSON.stringify(entries[index])));
            });
            for (const legacy of checklist) assert.match(text(row(page.report, legacy.item)), /Not checked$/);
            assert.equal(input.checklist_total_count, 5);
            assert.equal(input.checklist_completed_count, 0);
        }
    }
});

test('contradictory conditional answers are exposed without discarding historical evidence', () => {
    for (const [item, answer, parent, parentAnswer] of [
        ["Existing project's declared use", 'Fictional clinic', 'Existing project or development on site', 'no'],
        ['Trees present on the lot', 'yes', 'Still at the project proposal stage', 'no'],
        ['Canal or waterway on or adjoining the lot', 'unable', 'Still at the project proposal stage', 'unable'],
    ]) {
        const entry = { item, answer };
        const page = render({ checklist_data: [entry, { item: parent, answer: parentAnswer }] });
        const child = text(row(page.report, item));
        assert.match(child, /Contradictory conditional answer/);
        assert.ok(child.includes(JSON.stringify(entry)));
        assert.ok(text(row(page.report, parent)).endsWith(parentAnswer === 'no' ? ' No' : ' Unable to Verify'));
    }
    const child = 'Trees present on the lot';
    const parent = 'Still at the project proposal stage';
    const ambiguous = render({ checklist_data: [
        { item: parent, answer: 'yes' }, { item: child, answer: 'yes' }, { item: parent, answer: 'no' },
    ] });
    assert.match(text(row(ambiguous.report, child)), /Ambiguous parent answer/);
    const unverifiable = render({ checklist_data: [{ item: child, answer: 'no' }, { item: parent, answer: 'maybe' }] });
    assert.match(text(row(unverifiable.report, child)), /Unverifiable parent answer/);
});

test('historical boolean rows keep their meaning and order beside structured answers', () => {
    const page = render({ checklist_data: [
        { item: 'Structure matches declared use', checked: true },
        { item: 'Existing project or development on site', answer: 'yes' },
        { item: 'Setback distances compliant', passed: false },
        { item: 'Existing mojon or property marker observed', answer: 'no' },
    ] });
    assert.match(text(row(page.report, 'Structure matches declared use')), /Checked$/);
    assert.match(text(row(page.report, 'Setback distances compliant')), /Not checked$/);
    assert.match(text(row(page.report, 'Existing project or development on site')), /Yes$/);
    assert.match(text(row(page.report, 'Existing mojon or property marker observed')), /No$/);
    for (const [earlier, later] of [
        ['Structure matches declared use', 'Existing project or development on site'],
        ['Existing project or development on site', 'Setback distances compliant'],
        ['Setback distances compliant', 'Existing mojon or property marker observed'],
    ]) {
        assert.ok(page.text.indexOf(earlier) < page.text.indexOf(later));
    }
});

test('conditional questions render only the rows actually recorded', () => {
    const page = render({ checklist_data: [
        { item: 'Existing project or development on site', answer: 'yes' },
        { item: "Existing project's declared use", answer: 'Fictional residential' },
        { item: 'Extension of an existing structure', answer: 'no' },
        { item: 'Still at the project proposal stage', answer: 'yes' },
        { item: 'Trees present on the lot', answer: 'yes' },
        { item: 'Canal or waterway on or adjoining the lot', answer: 'unable' },
    ] });
    const expected = {
        'Existing project or development on site': /Yes$/,
        "Existing project's declared use": /Fictional residential$/,
        'Extension of an existing structure': /No$/,
        'Still at the project proposal stage': /Yes$/,
        'Trees present on the lot': /Yes$/,
        'Canal or waterway on or adjoining the lot': /Unable to Verify$/,
    };
    for (const [item, label] of Object.entries(expected)) assert.match(text(row(page.report, item)), label);

    const parentOnly = render({ checklist_data: [
        { item: 'Existing project or development on site', answer: 'no' },
        { item: 'Still at the project proposal stage', answer: 'no' },
    ] });
    for (const hidden of ["Existing project's declared use", 'Extension of an existing structure',
        'Trees present on the lot', 'Canal or waterway on or adjoining the lot']) {
        assert.equal(row(parentOnly.report, hidden), '', `${hidden} must not be invented`);
    }
});

test('missing/malformed evidence is safe and never interpreted through truthiness', () => {
    for (const data of [undefined, null, '']) {
        const page = render({ checklist_data: data, observations: {}, findings: [], discrepancies: { invalid: true },
            inspector_notes: 7, recommendations: {}, inspection_result: null });
        assert.match(page.text, /Checklist not recorded/);
        assert.match(page.text, /Inspector's result Not recorded/);
        assert.doesNotMatch(page.text, /\[object Object\]|undefined/);
    }
    for (const data of ['not JSON', {}, false, [null, 7, 'old entry', { item: {} }]]) {
        const page = render({ checklist_data: data, inspection_result: null });
        assert.match(page.text, /Malformed checklist/);
        assert.match(page.text, /Inspector's result Not recorded/);
        assert.doesNotMatch(page.text, /\[object Object\]|undefined/);
        for (const recorded of Array.isArray(data) ? data : [data]) {
            assert.ok(page.text.includes(JSON.stringify(recorded)), 'Malformed raw evidence must remain visible');
        }
    }
    const page = render({ checklist_data: [{ item: 'Unknown answer', checked: 'false' }] });
    assert.match(text(row(page.report, 'Unknown answer')), /Malformed answer/);
    assert.doesNotMatch(text(row(page.report, 'Unknown answer')), /Not checked$/);
});

test('untrusted explanation, observation and checklist labels remain escaped', () => {
    const injection = '<script>alert("synthetic")</script>';
    const page = render({ inspection_result: 'Requires Reinspection', inspector_notes: injection,
        discrepancies: injection, observations: injection, checklist_data: [{ item: injection, checked: false }] });
    assert.doesNotMatch(page.report, /<script>/);
    assert.ok(page.report.includes('&lt;script&gt;'));
    const ambiguous = render({ checklist_data: [
        { item: 'Existing project or development on site', answer: injection },
        { item: 'Existing project or development on site', answer: 'yes' },
    ] });
    assert.match(ambiguous.text, /Ambiguous duplicate/);
    assert.doesNotMatch(ambiguous.report, /<script>/);
    assert.ok(ambiguous.report.includes('&lt;script&gt;'));
});

test('the server-linked PO decision stays separate, labelled and unchanged for either authorized viewing role', () => {
    for (const role of ['Admin', 'Planning Officer']) {
        for (const decision of ['Approved', 'Declined', 'Requires Reinspection']) {
            const page = render({ inspection_result: 'For Review', is_compliant: false }, { poReview: {
                po_decision: decision, po_decision_reviewer: 'Synthetic PO', po_decision_date: '2026-10-20',
            } }, role);
            const decisionRow = row(page.report, 'Planning Officer');
            assert.ok(text(decisionRow).includes(decision));
            assert.ok(text(decisionRow).includes('Synthetic PO'));
            assert.ok(page.text.indexOf("Inspector's result") < page.text.indexOf('Planning Officer'));
            assert.doesNotMatch(page.html, /<button\b[^>]*>\s*(Approve|Decline|Requires Reinspection)\s*<\/button>/);
        }
    }
});

test('existing delivery failure evidence remains visible without issuing any render-time transport', () => {
    const page = render({ inspection_result: 'For Review', is_compliant: false }, { delivery: {
        state: 'delivery_failed', label: 'Delivery Failed', message: 'A recorded delivery attempt failed.',
        is_failure: true, attempt_count: 2, last_attempt_at: '2026-10-19', delivered_at: null,
        failure_category: 'supabase_unreachable', failure_message: 'FieldSync could not be reached.',
    }, canRetry: false });
    assert.match(text(page.html), /Delivery Failed/);
    assert.match(text(page.html), /FieldSync could not be reached/);
    assert.match(text(page.html), /Attempts 2/);
});
