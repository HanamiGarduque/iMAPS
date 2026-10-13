const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const React = require('react');

// Execute the real page's JSX and event handlers. Stub only unrelated imported
// widgets, effects/network, and the hook scheduler; no production helpers are copied.
const source = fs.readFileSync(path.join(__dirname, '../../resources/js/Pages/Applications/Show.jsx'), 'utf8');
const compiled = transformSync(source, { loader: 'jsx', format: 'cjs' }).code;
const emptyWidget = () => null;
const assignmentIds = ['inspector-105', 'sched-105', 'deadline-105', 'notes-105'];
const reinspectionReason = 'Controlled Issue D reinspection context test';

function mount({ decision = 'Needs Site Inspection', completed = true } = {}) {
    const slots = [];
    const posts = [];
    let cursor = 0;
    const hook = (initial) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    };
    const react = { ...React, useState: hook, useMemo: (fn) => fn(), useEffect: () => {},
        useRef: (value) => hook({ current: value })[0] };
    const imports = {
        react,
        sweetalert2: emptyWidget,
        '@/Components/Header': emptyWidget,
        '@/Components/Sidebar': emptyWidget,
        '@/Components/ParcelInspectionStatus': emptyWidget,
        '@/Components/InspectionDeliveryStatusPanel': emptyWidget,
        './Components/ApplicationMap': emptyWidget,
        './Components/SiteMapPrint': emptyWidget,
        '@inertiajs/react': { Head: emptyWidget, Link: emptyWidget,
            usePage: () => ({ props: {}, url: '/applications/1?from=technical-review' }),
            router: { post: (url, data) => posts.push({ url, data }) } },
        '@/Components/MapKit': { getZoningCheck: () => ({ key: 'ok', label: 'Compatible' }),
            CHECK_COLORS: { ok: '#008000' }, AreaComparison: emptyWidget },
        '@/utils/clupZones': { getZoneInfo: () => ({ label: 'Test zone' }) },
        '@/Components/WorkAssignment': { PlanningOfficerAssignment: emptyWidget, InspectorRoundAssignment: emptyWidget },
        '@/utils/mapData': { loadBarangayBoundaries: async () => null },
        '@/utils/signOut': { confirmSignOut: emptyWidget },
        './Components/GeneratePermitModal': { PermitExportPanel: emptyWidget,
            getMissingRecommendedPermits: () => [], getPermitChecklist: () => [] },
    };
    const module = { exports: {} };
    vm.runInNewContext(compiled + '\nmodule.exports.inner = ShowInner;', {
        module, exports: module.exports, console, setTimeout: () => 0,
        require: (id) => {
            assert.ok(id in imports, `Unexpected page import: ${id}`);
            return imports[id];
        },
    });
    const inspection = completed ? { id: 35, status: 'completed', inspector_id: 2,
        scheduled_date: '2026-09-21T00:00:00.000000Z', deadline_date: '2026-09-25T00:00:00.000000Z',
        assigned_notes: 'Round 1 instructions', findings: 'Round 1 findings',
        confirmed_latitude: 13.845, confirmed_longitude: 121.206 } : null;
    const props = { auth: { user: { name: 'Synthetic PO', role: 'Planning Officer' } },
        application: { id: 1, status: 'Technical Review', application_stream: 'standard',
            parcels: [{ id: 105, parcel_code: 'P-01', site_inspection: inspection }] },
        inspectors: [{ id: 2, name: 'Old inspector' }, { id: 3, name: 'New inspector' }],
        technicalReviews: completed ? [{ parcel_id: 105, review_round: 1, decision,
            decision_reason: 'Historical reason', findings: 'Historical evaluation' }] : [] };
    const snapshot = JSON.stringify(props);
    let nodes;
    function render() {
        cursor = 0;
        nodes = [];
        function walk(node) {
            if (Array.isArray(node)) return node.forEach(walk);
            if (!React.isValidElement(node)) return;
            nodes.push(node);
            walk(node.props.children);
        }
        walk(module.exports.inner(props));
    }
    render();
    return {
        posts, props, snapshot,
        nodes: () => nodes,
        field: (id) => nodes.find((n) => n.props.id === id),
        choose(value) {
            const radio = nodes.find((n) => n.type === 'input' && n.props.type === 'radio' && n.props.value === value);
            assert.ok(radio, `Decision ${value} must be available`);
            radio.props.onChange();
            render();
        },
        change(id, value) {
            const field = nodes.find((n) => n.props.id === id);
            assert.ok(field, `${id} must be visible`);
            field.props.onChange({ target: { value } });
            render();
        },
        submit() {
            nodes.find((n) => n.type === 'button' && n.props.children === 'Submit evaluation').props.onClick();
            render();
        },
    };
}

for (const decision of ['Needs Site Inspection', 'Requires Reinspection', 'Approved', 'Declined']) {
    test(`historical ${decision} starts a fresh draft without phantom assignment controls`, () => {
        const page = mount({ decision });
        assert.equal(page.nodes().filter((n) => n.type === 'input' && n.props.type === 'radio' && n.props.checked).length, 0);
        for (const id of assignmentIds) assert.equal(page.field(id), undefined);
        assert.equal(page.field('reason-105'), undefined);
        assert.equal(page.field('findings-105').props.value, '');
        page.submit();
        assert.equal(page.posts.length, 0, 'A historical decision must not submit as a new evaluation');
        assert.equal(JSON.stringify(page.props), page.snapshot);
    });
}

test('explicit reinspection exposes blank new assignment fields and submits the new schedule', () => {
    const page = mount();
    page.choose('Requires Reinspection');
    for (const id of assignmentIds) assert.equal(page.field(id)?.props.value, '');
    const reason = page.field('reason-105');
    assert.equal(reason?.props.value, '', 'The PO reason must be a separate blank field');
    assert.equal(reason.props.required, true);
    assert.equal(reason.props['aria-required'], true);
    assert.equal(reason.props['aria-describedby'], 'reason-help-105');
    const label = page.nodes().find((n) => n.type === 'label' && n.props.htmlFor === 'reason-105');
    assert.ok(JSON.stringify(label.props.children).includes('Reason for Reinspection'));
    assert.match(page.field('reason-help-105').props.children, /why another inspection round is needed/i);
    assert.match(page.field('reason-help-105').props.children, /instructions/i);
    assert.equal(page.field('notes-105').props['aria-required'], true);
    page.change('reason-105', reinspectionReason);
    page.submit();
    assert.equal(page.posts.length, 0, 'New assignment inputs are required');
    page.change('inspector-105', '3');
    page.change('sched-105', '2026-10-14');
    page.change('deadline-105', '2026-10-18');
    page.submit();
    assert.equal(page.posts.length, 0, 'Reinspection instructions are required');
    page.change('notes-105', 'Reverify setback with new photos');
    page.submit();
    assert.deepEqual(JSON.parse(JSON.stringify(page.posts)), [{ url: '/technical-review/submit-batch', data: {
        application_id: 1, reviews: { 105: { decision: 'Requires Reinspection', decision_reason: reinspectionReason, findings: '',
            inspector_id: '3', scheduled_date: '2026-10-14', deadline_date: '2026-10-18',
            assigned_notes: 'Reverify setback with new photos' } },
    } }]);
    assert.equal(JSON.stringify(page.props), page.snapshot, 'Round 1 presentation data remains intact');
});

for (const reason of ['', ' \t\n ']) {
    test(`reinspection rejects ${reason ? 'whitespace' : 'missing'} PO reason even with complete inspector instructions`, () => {
        const page = mount();
        page.choose('Requires Reinspection');
        page.change('inspector-105', '3');
        page.change('sched-105', '2026-10-14');
        page.change('deadline-105', '2026-10-18');
        page.change('notes-105', 'Reverify setback with new photos');
        // The Declined control can seed this state before the UI correction;
        // the assertion specifically exercises the real reinspection guard.
        page.choose('Declined');
        page.change('reason-105', reason);
        page.choose('Requires Reinspection');
        page.submit();
        assert.equal(page.posts.length, 0, 'Instructions cannot substitute for the PO reason');
        assert.equal(JSON.stringify(page.props), page.snapshot);
    });
}

for (const scheduling of ['Needs Site Inspection', 'Requires Reinspection']) {
    for (const decision of ['Approved', 'Declined']) {
        test(`${decision} omits assignment data after switching away from ${scheduling}`, () => {
            const page = mount({ completed: scheduling === 'Requires Reinspection' });
            page.choose(scheduling);
            page.change('inspector-105', '3');
            page.change('sched-105', '2026-09-21');
            page.change('deadline-105', '2026-09-25');
            page.change('notes-105', 'Draft instructions');
            page.choose(decision);
            for (const id of assignmentIds) assert.equal(page.field(id), undefined);
            if (decision === 'Declined') {
                assert.equal(page.field('reason-105').props.value, '');
                page.submit();
                assert.equal(page.posts.length, 0, 'Decline still requires a current reason');
                page.change('reason-105', ' \t\n ');
                page.submit();
                assert.equal(page.posts.length, 0, 'Decline still rejects whitespace reasons');
                page.change('reason-105', 'Current regulatory reason');
            }
            page.change('findings-105', 'Current evaluation');
            page.submit();
            const review = JSON.parse(JSON.stringify(page.posts[0].data.reviews[105]));
            assert.deepEqual(review, { decision, decision_reason: decision === 'Declined' ? 'Current regulatory reason' : '',
                findings: 'Current evaluation' });
        });
    }
}

test('initial inspection controls appear only after explicitly choosing Needs Site Inspection', () => {
    const page = mount({ completed: false });
    for (const id of assignmentIds) assert.equal(page.field(id), undefined);
    page.choose('Needs Site Inspection');
    assert.equal(page.field('reason-105'), undefined, 'Initial inspection has no mandatory PO reinspection reason');
    for (const id of assignmentIds) assert.equal(page.field(id)?.props.value, '');
    assert.equal(page.field('notes-105').props['aria-required'], false);
    page.change('inspector-105', '3');
    page.change('sched-105', '2026-10-14');
    page.change('deadline-105', '2026-10-18');
    page.submit();
    assert.equal(page.posts.length, 1, 'Initial inspection instructions remain optional');
    assert.equal(page.posts[0].data.reviews[105].decision_reason, '');
});
