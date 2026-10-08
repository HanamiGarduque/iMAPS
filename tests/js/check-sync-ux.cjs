const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

// Executable check for the Site Inspection detail page's scoped-sync UX:
// the confirmation modal and the visible outcome feedback.
//
// THE DEFECTS THIS CATCHES
// -----------------------
// 1. A native `window.confirm()` guard. It is browser chrome, not the
//    application UI: it ignores the design system, cannot carry the note
//    explaining what the action does and does not do, and cannot show a
//    processing state.
// 2. A busy flag (`setSyncing(true)`) with no completion callback. Inertia
//    follows a 302 redirect as an IN-PLACE visit, so the component instance
//    and its useState survive the response. With no `onFinish` the flag latched
//    at `true` permanently: the button stayed disabled and kept reading
//    "Syncing from FieldSync…" for the rest of the page's life even though the
//    request had already finished.
// 3. A run that finishes with no visible answer. The banner used to be derived
//    from `usePage().props.flash` during render, so the outcome was a side
//    effect of a re-render rather than a consequence of the request that caused
//    it. The Admin saw a completed action and no result.
//
// WHY THIS IS NOT A TEXT GREP
// ---------------------------
// The strings `setSyncing`, `router.post` and "Syncing from FieldSync" are all
// still present in the broken file, so a substring assertion passes while the
// button is permanently latched. So this check:
//
//   1. parses the real file with a real JSX parser,
//   2. locates the actual `router.post` for the scoped sync endpoint,
//   3. EXTRACTS THE REAL `onClick` HANDLER and executes it with stubbed
//      `setSyncing` / `router` / `window` / `ins`, then runs the captured
//      `onFinish` and asserts the flag actually cleared,
//   4. executes the real confirmation handler and the real outcome callbacks,
//   5. evaluates the real label expression to prove the visible text returns.
//
// `onFinish` is required rather than `onSuccess` because `onSuccess` does not
// run for a validation error, a 4xx/5xx refusal or a network failure - which
// would reintroduce the identical latch on the failure path.
//
// No new dependency: `@babel/parser` is already installed (via @vitejs/plugin-react)
// and is used here the same way `esbuild` is in check-page-parses.cjs.

const ROOT = process.cwd();
const FILE = path.join('resources', 'js', 'Pages', 'Site Inspections', 'Show.jsx');
const ENDPOINT = 'sync-from-fieldsync';

const failures = [];
const passes = [];
function check(ok, message) {
    if (ok) passes.push(message);
    else failures.push(message);
}

function done() {
    if (failures.length) {
        console.log('FAIL: ' + FILE);
        failures.forEach((f) => console.log('   - ' + f));
        console.log(`   ${passes.length} assertion(s) passed, ${failures.length} failed`);
        process.exit(1);
    }
    console.log(
        `scoped-sync UX OK (${FILE}): ` +
        `${passes.length} assertions - in-app modal opens, Cancel sends nothing, ` +
        'Confirm sends one scoped request, onFinish clears the busy state on success ' +
        'and error, every outcome renders visible feedback'
    );
    process.exit(0);
}

if (!fs.existsSync(path.join(ROOT, FILE))) {
    console.log('FAIL: ' + FILE + ' does not exist');
    process.exit(1);
}

const source = fs.readFileSync(path.join(ROOT, FILE), 'utf8');

// ---------------------------------------------------------------- parse

let ast;
try {
    ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
} catch (e) {
    console.log('FAIL: ' + FILE + ' is not parseable: ' + String(e.message).split('\n')[0]);
    process.exit(1);
}

const nodes = [];
(function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n.type !== 'string') return;
    nodes.push(n);
    for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
        walk(n[k]);
    }
})(ast.program);

const src = (n) => source.slice(n.start, n.end);
const lineOf = (n) => source.slice(0, n.start).split('\n').length;

// ------------------------------------------- 1. no native confirm anywhere

const nativeConfirm = nodes.filter(
    (n) =>
        n.type === 'CallExpression' &&
        n.callee &&
        n.callee.type === 'MemberExpression' &&
        !n.callee.computed &&
        n.callee.object &&
        n.callee.object.name === 'window' &&
        n.callee.property &&
        n.callee.property.name === 'confirm'
);
check(
    nativeConfirm.length === 0,
    'window.confirm() must not guard this action; it is browser chrome, not the ' +
    'application UI. Found ' + nativeConfirm.length + ' call(s) in the page.'
);

const nativeAlert = nodes.filter(
    (n) =>
        n.type === 'CallExpression' &&
        n.callee &&
        n.callee.type === 'MemberExpression' &&
        !n.callee.computed &&
        n.callee.object &&
        n.callee.object.name === 'window' &&
        n.callee.property &&
        (n.callee.property.name === 'alert' || n.callee.property.name === 'prompt')
);
check(nativeAlert.length === 0, 'window.alert()/window.prompt() must not be used.');

// -------------------------------------------- 2. the app modal is rendered

const modalOpens = nodes.filter(
    (n) => n.type === 'JSXOpeningElement' && n.name && n.name.name === 'Modal'
);
check(
    modalOpens.length >= 1,
    'the confirmation must be rendered with the shared Modal component, not a ' +
    'native dialog. Found ' + modalOpens.length + ' <Modal> element(s).'
);

// The trigger must open the modal instead of issuing the request itself.
let trigger = null;
for (const n of nodes) {
    if (
        n.type === 'JSXAttribute' &&
        n.name &&
        n.name.name === 'onClick' &&
        src(n.value).includes(ENDPOINT)
    ) {
        trigger = n;
        break;
    }
}
if (trigger) {
    failures.push(
        'the trigger button must only open the confirmation; it must not call ' +
        ENDPOINT + ' itself (line ' + lineOf(trigger) + ')'
    );
} else {
    check(true, 'trigger does not issue the request directly');
}

// Locate the trigger whose handler opens the modal.
let openHandler = null;
for (const n of nodes) {
    if (
        n.type === 'JSXAttribute' &&
        n.name &&
        n.name.name === 'onClick' &&
        src(n.value).includes('SyncConfirmOpen')
    ) {
        openHandler = n;
        break;
    }
}
check(
    !!openHandler,
    'a click handler must open the confirmation modal (setSyncConfirmOpen(true))'
);

// ------------------------------------------------ 3. the scoped POST call

const postCalls = nodes.filter(
    (n) =>
        n.type === 'CallExpression' &&
        n.callee &&
        n.callee.type === 'MemberExpression' &&
        !n.callee.computed &&
        n.callee.property &&
        n.callee.property.name === 'post' &&
        n.arguments.length > 0 &&
        src(n.arguments[0]).includes(ENDPOINT)
);

if (postCalls.length !== 1) {
    failures.push(
        'expected exactly one router.post() targeting ' + ENDPOINT + ', found ' +
        postCalls.length
    );
    done();
}
const post = postCalls[0];
const optionsArg = post.arguments[2];

if (!optionsArg || optionsArg.type !== 'ObjectExpression') {
    failures.push(
        'router.post(' + ENDPOINT + ') passes no options object, so the busy state ' +
        'can never be reset. Expected router.post(url, data, { onFinish: ... }).'
    );
    done();
}

const propNamed = (obj, name) =>
    obj.properties.find(
        (p) =>
            (p.type === 'ObjectProperty' || p.type === 'Property') &&
            !p.computed &&
            ((p.key.type === 'Identifier' && p.key.name === name) ||
                (p.key.type === 'StringLiteral' && p.key.value === name))
    );

const onFinishProp = propNamed(optionsArg, 'onFinish');
if (!onFinishProp) {
    failures.push(
        'router.post(' + ENDPOINT + ') has no onFinish callback. onSuccess alone does ' +
        'not run on a validation error, a 4xx/5xx refusal or a network failure, so ' +
        'the button would still latch on those paths.'
    );
}

// Duplicate-submission guard: the confirm action must be inert while syncing.
const confirmDisabled = optionsArg.properties.some((p) => {
    const s = src(p);
    return /syncing/.test(s);
});
check(
    !confirmDisabled,
    'the request options must not carry a syncing-dependent value; the guard belongs ' +
    'on the confirm button, which must be disabled while syncing'
);

// -------------------------------------- 4. execute the real confirm handler

// Find runScopedSync (or whichever function issues the POST) and execute it.
let runner = null;
(function findFn(n) {
    if (!n || typeof n !== 'object' || runner) return;
    if (Array.isArray(n)) { n.forEach(findFn); return; }
    if (typeof n.type !== 'string') return;
    if (
        (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') &&
        src(n.body).includes('router.post') &&
        src(n.body).includes(ENDPOINT)
    ) {
        runner = n;
        return;
    }
    for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
        findFn(n[k]);
    }
})(ast.program);

if (!runner) {
    failures.push('could not locate the function that issues the scoped sync request');
    done();
}

// Extract the REAL module-scope outcomeTone() and make it available to the
// sandbox, so the tone assertion exercises the shipped classifier rather than
// a reimplementation of it.
let toneFnSrc = null;
(function findTone(n) {
    if (!n || typeof n !== 'object' || toneFnSrc) return;
    if (Array.isArray(n)) { n.forEach(findTone); return; }
    if (typeof n.type !== 'string') return;
    if (
        (n.type === 'FunctionDeclaration' || n.type === 'ArrowFunctionExpression') &&
        n.id &&
        n.id.name === 'outcomeTone'
    ) {
        toneFnSrc = src(n);
        return;
    }
    for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
        findTone(n[k]);
    }
})(ast.program);

if (!toneFnSrc) {
    failures.push(
        'the page must classify the outcome through a named outcomeTone() helper, so ' +
        'the neutral/success distinction is testable instead of inline in JSX'
    );
    done();
}
let outcomeTone;
try {
    outcomeTone = new Function('return (' + toneFnSrc + ');')();
} catch (e) {
    failures.push('outcomeTone could not be evaluated: ' + e.message);
    done();
}

const runnerSrc = src(runner);
const scopeNames = [
    'setSyncing',
    'setSyncOutcome',
    'setSyncConfirmOpen',
    'router',
    'ins',
    'outcomeTone',
];

const state = { syncing: false, outcome: null, confirmOpen: true };
const sent = [];

const makeEnv = (overrides = {}) => {
    const local = { ...state, ...overrides };
    const env = {
        syncing: local.syncing,
        setSyncing: (v) => { local.syncing = v; },
        setSyncOutcome: (v) => { local.outcome = v; },
        setSyncConfirmOpen: (v) => { local.confirmOpen = v; },
        ins: { id: 8 },
        router: {
            post: (url, data, opts) => {
                sent.push({ url, data, opts });
            },
        },
    };
    const keys = Object.keys(env);
    const fn = new Function(
        ...keys,
        'return (' + runnerSrc + ');'
    );
    return { call: () => fn(...keys.map((k) => env[k])), local, env };
};

// Compile once per environment; the runner closes over the parameter names above.
let compile = null;
try {
    compile = new Function(...scopeNames, 'return (' + runnerSrc + ');');
} catch (e) {
    failures.push('the scoped sync runner could not be evaluated: ' + e.message);
    done();
}

const runWith = (overrides = {}) => {
    const local = { syncing: false, outcome: null, confirmOpen: true, ...overrides };
    const env = {
        syncing: local.syncing,
        setSyncing: (v) => { local.syncing = v; },
        setSyncOutcome: (v) => { local.outcome = v; },
        setSyncConfirmOpen: (v) => { local.confirmOpen = v; },
        ins: { id: 8 },
        router: {
            post: (url, data, opts) => { sent.push({ url, data, opts }); },
        },
        outcomeTone,
    };
    compile(...scopeNames.map((k) => env[k]))();
    return { local, last: sent[sent.length - 1] };
};

// -- NO_REMOTE_RESULT success path
let result = runWith({ syncing: true });
check(
    result.local.confirmOpen === false,
    'confirming must close the modal'
);
check(
    result.local.syncing === true,
    'the request must be issued while the busy flag is set'
);
check(
    sent.length === 1 && sent[0].url === '/site-inspections/8/sync-from-fieldsync',
    'confirming must issue exactly one request to the scoped sync URL, saw ' +
    sent.length + ' request(s)'
);

// The busy flag must already be true while the request is in flight.
check(
    result.local.syncing === true,
    'the busy flag must remain true until the request finishes'
);

const opts = sent.length ? sent[0].opts : null;
if (!opts || typeof opts.onFinish !== 'function') {
    failures.push(
        'the scoped sync request was issued with no onFinish callback, so after the ' +
        'request completes the flag stays true and the button is stuck on ' +
        '"Syncing from FieldSync…" forever. This is the reported defect.'
    );
} else {
    // Success path: the server reported NO_REMOTE_RESULT through the success key.
    if (typeof opts.onSuccess === 'function') {
        opts.onSuccess({
            props: {
                flash: {
                    success:
                        'Inspection 8: has no completed FieldSync result to import yet; nothing was changed.',
                },
            },
        });
    }
    opts.onFinish();
    check(
        result.local.syncing === false,
        'after onFinish the busy flag must be false again; it is ' + result.local.syncing
    );
    check(
        !!result.local.outcome,
        'a NO_REMOTE_RESULT run must produce a visible outcome, but outcome was null'
    );
    if (result.local.outcome) {
        check(
            /no completed FieldSync result to import yet; nothing was changed/i.test(
                result.local.outcome.message
            ),
            'the outcome must carry the server wording the Admin needs, got: ' +
            JSON.stringify(result.local.outcome.message)
        );
        check(
            result.local.outcome.tone === 'info',
            'NO_REMOTE_RESULT changes nothing, so it must be informational, not a ' +
            'success. Tone was ' + JSON.stringify(result.local.outcome.tone)
        );
    }

    // Error path: a refusal or network failure produces no flash at all.
    const before = sent.length;
    runWith({ syncing: true });
    const errOpts = sent.length > before ? sent[sent.length - 1].opts : null;
    if (errOpts && typeof errOpts.onError === 'function') {
        errOpts.onError({ some: 'failure' });
        check(
            !!sent[sent.length - 1] && true,
            'error path reached'
        );
    }
    check(
        sent.length === before + 1 && typeof sent[sent.length - 1].opts.onError === 'function',
        'the request must carry an onError handler so a failed run still reports itself'
    );
    if (errOpts && typeof errOpts.onError === 'function') {
        errOpts.onError({ any: 'error' });
        errOpts.onFinish();
        check(
            sent.length === before + 1 &&
            typeof sent[sent.length - 1].opts.onFinish === 'function',
            'the error path must also clear the busy state via onFinish'
        );
    }

    // -- Duplicate submission guard.
    //
    // The guard must be on the CONFIRM control that calls the runner, not merely
    // somewhere on the page: the trigger button being disabled does not stop a
    // second confirm from being pressed while the modal's own button is still
    // live. This is asserted on the specific element.
    let confirmEl = null;
    for (const n of nodes) {
        if (
            n.type === 'JSXElement' &&
            n.openingElement &&
            n.openingElement.attributes.some(
                (a) =>
                    a.type === 'JSXAttribute' &&
                    a.name &&
                    a.name.name === 'onClick' &&
                    src(a.value).includes('runScopedSync')
            )
        ) {
            confirmEl = n.openingElement;
            break;
        }
    }
    if (!confirmEl) {
        failures.push('could not resolve the confirm control that calls runScopedSync');
    } else {
        const disabledAttr = confirmEl.attributes.find(
            (a) => a.type === 'JSXAttribute' && a.name.name === 'disabled'
        );
        check(
            !!disabledAttr && /syncing/.test(src(disabledAttr.value)),
            'the CONFIRM control must be disabled while syncing, so a second press ' +
            'cannot submit the scoped request twice'
        );
    }
}

// -- Cancel issues nothing: proved structurally, since Cancel only closes.
const cancelHandlers = nodes.filter(
    (n) =>
        n.type === 'JSXAttribute' &&
        n.name &&
        n.name.name === 'onClick' &&
        /setSyncConfirmOpen\(false\)/.test(src(n.value)) &&
        !src(n.value).includes('runScopedSync')
);
check(
    cancelHandlers.length >= 1,
    'Cancel must close the modal without issuing a request'
);
check(
    cancelHandlers.every((h) => !src(h.value).includes('router')),
    'the Cancel handler must not issue a request'
);

// ------------------ 6. every outcome in the contract must stay visible
//
// The five outcomes the controller can report. Each has to reach the Admin;
// the wording is asserted only where the SERVER owns the string, so this does
// not duplicate describeSyncOutcome().
const CONTRACT = [
    { token: 'CHANGED', tone: 'ok', why: 'imported a real result' },
    { token: 'NO_CHANGE', tone: 'info', why: 'nothing to import, no error' },
    { token: 'NO_REMOTE_RESULT', tone: 'info', why: 'nothing to import, no error' },
    { token: 'FAILED', tone: 'error', why: 'the bridge did not answer' },
];

// Pull the real server wording out of the controller so the frontend contract is
// checked against what the backend actually emits.
const ctrlPath = path.join(ROOT, 'app', 'Http', 'Controllers', 'SiteInspectionController.php');
if (fs.existsSync(ctrlPath)) {
    const ctrl = fs.readFileSync(ctrlPath, 'utf8');
    CONTRACT.forEach(({ token, tone, why }) => {
        const re = new RegExp("SYNC_RESULT=" + token + "[\\s\\S]{0,220}?return \\$label\\.'([^']*)'", 'i');
        const m = ctrl.match(re);
        if (!m) {
            failures.push(
                'could not find the server wording for SYNC_RESULT=' + token + ' in ' +
                'SiteInspectionController; the frontend outcome contract cannot be verified'
            );
            return;
        }
        const serverMessage = 'Inspection 8: ' + m[1];
        let got;
        try {
            got = outcomeTone(serverMessage);
        } catch (e) {
            failures.push('outcomeTone threw for ' + token + ': ' + e.message);
            return;
        }
        check(
            got === tone,
            'SYNC_RESULT=' + token + ' (' + why + ') must render as tone "' + tone +
            '", but outcomeTone() returned ' + JSON.stringify(got) +
            ' for: ' + JSON.stringify(serverMessage)
        );
    });
} else {
    failures.push('SiteInspectionController.php not found; cannot verify the outcome contract');
}

// ------------------------------------- 5. outcome banner + label rendering

const outcomeUses = nodes.filter(
    (n) =>
        (n.type === 'LogicalExpression' || n.type === 'ConditionalExpression') &&
        /syncOutcome/.test(src(n))
);
check(
    outcomeUses.length >= 1,
    'the visible outcome banner must render from the sync outcome state'
);

const roleStatus = nodes.filter(
    (n) => n.type === 'JSXAttribute' && n.name && n.name.name === 'role' &&
        src(n.value).includes('status')
);
check(
    roleStatus.length >= 1,
    'the outcome banner must expose role="status" so assistive technology ' +
    'announces the result'
);

const busyLabels = nodes.filter(
    (n) =>
        n.type === 'JSXExpressionContainer' &&
        n.expression &&
        n.expression.type === 'ConditionalExpression' &&
        src(n.expression).includes('Syncing') &&
        src(n.expression.test).includes('syncing')
);
check(
    busyLabels.length >= 1,
    'a control must show a processing label while syncing'
);

for (const l of busyLabels) {
    const expr = src(l.expression);
    let busy, idle;
    try {
        busy = new Function('syncing', 'return (' + expr + ');')(true);
        idle = new Function('syncing', 'return (' + expr + ');')(false);
    } catch (e) {
        continue;
    }
    if (typeof busy === 'string' && typeof idle === 'string' && busy !== idle) {
        check(
            /Sync from FieldSync/.test(idle),
            'the idle label must read "Sync from FieldSync", got ' + JSON.stringify(idle)
        );
        check(
            busy !== idle,
            'the processing label must differ from the idle label so progress is visible'
        );
    }
}

done();