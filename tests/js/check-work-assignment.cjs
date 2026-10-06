// ADMIN INITIAL PLANNING OFFICER ASSIGNMENT — confirm-button enablement.
//
// THE DEFECT THIS EXISTS TO CATCH
// -------------------------------
// The shared modal hides its Reason <select> behind `{!isInitial && ...}` because
// a first assignment has nobody to take work away from, so a reason would have to
// be invented. Its readiness gate nevertheless required `reason` UNCONDITIONALLY:
//
//     const ready = Boolean(targetId && reason && (!noteRequired || note.trim()));
//
// On an initial assignment `reason` is therefore permanently "" (falsy), `ready`
// is permanently false, and the "Assign Planning Officer" button can never be
// clicked no matter which officer is selected. The submit payload already sent
// `reason: current ? reason : null`, so the gate was the only place still
// assuming a reassignment.
//
// This renders the REAL component and reads the REAL `disabled` attribute. It
// does not grep the source, so it fails only on behaviour: re-introducing an
// unconditional `reason` requirement, or breaking the reassignment gate, both
// fail here.

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');

let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };

const filename = path.resolve('resources/js/Components/WorkAssignment.jsx');
const code = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code;
const mod = { exports: {} };
vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: (id) => {
        if (id === 'react') return React;
        if (id === '@inertiajs/react') return { router: { post() {} } };
        throw new Error('Unexpected import ' + id);
    },
}, { filename });

const { ReassignModal, PlanningOfficerAssignment } = mod.exports;
assert.ok(ReassignModal, 'ReassignModal must be exported for render assertions');
assert.ok(PlanningOfficerAssignment, 'PlanningOfficerAssignment must be exported');

const JYERINE = { id: 4, name: 'Jyerine Desunia' };
const BLASTER = { id: 2, name: 'Blaster Salonga' };
const CANDIDATES = [JYERINE, BLASTER];
const noop = () => {};

/** Render the modal as the two call sites actually pass it, and read disabled. */
function modal({ isInitial, targetId, reason = '', note = '' }) {
    const html = renderToStaticMarkup(React.createElement(ReassignModal, {
        title: 'x', subtitle: 'y', description: 'z', isInitial,
        candidates: CANDIDATES, currentLabel: isInitial ? 'Not yet assigned' : JYERINE.name,
        reasons: ['Absent', 'On Leave', 'Workload Transfer', 'Unavailable', 'Other'],
        targetId, setTargetId: noop, reason, setReason: noop, note, setNote: noop,
        noteRequired: reason === 'Other', selectedName: null, error: null, saving: false,
        onClose: noop, onSubmit: noop, confirmLabel: 'Assign Planning Officer',
    }));
    // Read the ATTRIBUTE, not the bare word. The className contains
    // `disabled:opacity-50`, so searching the markup for "disabled" matches the
    // styling on every render and would report the button as permanently disabled
    // even after a correct fix.
    const confirm = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
        .find((m) => /Assign Planning Officer/.test(m[2]));
    assert.ok(confirm, 'confirm button must render');
    return { html, disabled: /(^|\s)disabled(=|\s|$)/.test(confirm[1]) };
}

function confirmDisabled({ isInitial, targetId, reason = '', note = '' }) {
    return modal({ isInitial, targetId, reason, note }).disabled;
}

// ── INITIAL ASSIGNMENT (APP-2026-00026: current owner NULL) ───────────────────

// The regression. Selecting an active officer MUST enable the button even though
// there is no reason field and no reason state.
check(
    confirmDisabled({ isInitial: true, targetId: '' }) === true,
    'initial with no officer selected stays disabled',
);
check(
    confirmDisabled({ isInitial: true, targetId: '4' }) === false,
    'initial: selecting Jyerine Desunia MUST enable "Assign Planning Officer"',
);
check(
    confirmDisabled({ isInitial: true, targetId: '2' }) === false,
    'initial: selecting Blaster Salonga MUST enable "Assign Planning Officer"',
);

const initial = modal({ isInitial: true, targetId: '4' }).html;
check(initial.includes('Not yet assigned'), 'initial modal shows current as "Not yet assigned"');
check(!initial.includes('>Reason<'), 'initial modal asks for NO reason');
check(!initial.includes('>Note (optional)<'), 'initial modal asks for NO note');
check(
    initial.includes('no transfer reason is required'),
    'initial modal states that no reason is required',
);

// ── REASSIGNMENT (current owner exists) — unchanged behaviour ───────────────

check(
    confirmDisabled({ isInitial: false, targetId: '4', reason: '' }) === true,
    'reassignment with no reason stays disabled',
);
check(
    confirmDisabled({ isInitial: false, targetId: '4', reason: 'Absent' }) === false,
    'reassignment with a valid reason enables the button',
);
check(
    confirmDisabled({ isInitial: false, targetId: '', reason: 'Absent' }) === true,
    'reassignment with no officer selected stays disabled',
);
check(
    confirmDisabled({ isInitial: false, targetId: '4', reason: 'Other', note: '' }) === true,
    'reason "Other" without a note stays disabled',
);
check(
    confirmDisabled({ isInitial: false, targetId: '4', reason: 'Other', note: 'x' }) === false,
    'reason "Other" with a note enables the button',
);

// ── AUTHORITY SURFACE + candidate list ───────────────────────────────────────

const adminUnassigned = renderToStaticMarkup(React.createElement(PlanningOfficerAssignment, {
    current: null, candidates: CANDIDATES, canReassign: true, applicationId: 132,
}));
check(adminUnassigned.includes('Assign Planning Officer'), 'Admin on an unowned application sees the assign control');
check(adminUnassigned.includes('Not yet assigned'), 'Admin sees the unassigned state');
check(
    adminUnassigned.includes('does not transfer technical decision authority'),
    'Admin is told handover grants no decision authority',
);

const officerUnassigned = renderToStaticMarkup(React.createElement(PlanningOfficerAssignment, {
    current: null, candidates: CANDIDATES, canReassign: false, applicationId: 132,
}));
check(!officerUnassigned.includes('Assign Planning Officer'), 'a Planning Officer is offered NO assign control');
check(
    officerUnassigned.includes('does not self-reassign'),
    'a Planning Officer is told who owns assignment instead',
);

const adminOwned = renderToStaticMarkup(React.createElement(PlanningOfficerAssignment, {
    current: JYERINE, candidates: CANDIDATES, canReassign: true, applicationId: 132,
}));
check(adminOwned.includes('Reassign'), 'Admin on an owned application sees Reassign');
check(!adminOwned.includes('Assign Planning Officer'), 'an owned application is not labelled a first assignment');

// The no-op guard is NOT asserted here: excluding the current officer happens in
// PlanningOfficerAssignment (`options`), which this check cannot open in a static
// render, and the modal is deliberately a dumb presenter that renders whatever
// candidate list it is handed. The authoritative no-op refusal is server-side in
// WorkAssignmentService, already covered by WorkReassignmentContractTest.
const ownedModal = modal({ isInitial: false, targetId: '4', reason: 'Absent' }).html;
check(ownedModal.includes('Blaster Salonga'), 'other officers remain selectable on reassignment');
check(ownedModal.includes('>Reason<'), 'reassignment modal asks for a reason');
check(!ownedModal.includes('no transfer reason is required'), 'reassignment does not claim a reason is optional');

console.log(`Work assignment confirm-button contract: ${checks} assertions PASS`);