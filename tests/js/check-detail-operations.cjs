const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

// Executable check: the PHASE 2B2D detail-page operations sections must render
// what the server resolved, and must not overstate it.
//
// THE DEFECTS THIS CATCHES
// -----------------------
//  1. Mounting the delivery PANEL, which carries the Planning Officer's
//     retry-delivery POST, on an Admin page.
//  2. Deriving a round number in the browser instead of reading the server's.
//  3. Rendering a fabricated Round N for a parcel-unknown row.
//  4. Presenting a GLOBAL diagnostics count as if it belonged to this inspection,
//     or duplicating the Notify Planning Officers control.
//  5. Dropping the "not associated with this inspection" disclosure.

const ROOT = process.cwd();

const failures = [];
const passes = [];
const check = (ok, msg) => (ok ? passes.push(msg) : failures.push(msg));

function done() {
    if (failures.length) {
        console.log('FAIL: detail operations sections');
        failures.forEach((f) => console.log('   - ' + f));
        console.log(`   ${passes.length} passed, ${failures.length} failed`);
        process.exit(1);
    }
    console.log(
        `detail operations sections OK: ${passes.length} assertions - delivery health is ` +
        'read-only and uses the canonical vocabulary, round history is server-resolved and ' +
        'navigable, the primary inspection record renders first inside one scroll owner, ' +
        'and no global diagnostic count appears on this page'
    );
    process.exit(0);
}

const rel = 'resources/js/Pages/Site Inspections/Show.jsx';
const full = path.join(ROOT, rel);
if (!fs.existsSync(full)) { console.log('FAIL: missing ' + rel); process.exit(1); }

const src = fs.readFileSync(full, 'utf8');
let ast;
try {
    ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
} catch (e) {
    console.log('FAIL: ' + rel + ' does not parse: ' + String(e.message).split('\n')[0]);
    process.exit(1);
}

const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// The server is the single source for every label and disclosure, so its wording
// is asserted here too rather than trusting the page to hardcode it.
const serverPath = path.join(ROOT, 'app/Support/InspectionOperationsContext.php');
if (!fs.existsSync(serverPath)) {
    console.log('FAIL: missing app/Support/InspectionOperationsContext.php');
    process.exit(1);
}
const SERVER = fs.readFileSync(serverPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

function walk(n, cb) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((x) => walk(x, cb)); return; }
    if (typeof n.type !== 'string') return;
    cb(n);
    for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
        walk(n[k], cb);
    }
}

// ---------------------------------------------------------------- DELIVERY

check(/Delivery &amp; FieldSync|Delivery & FieldSync/.test(src),
    'a Delivery & FieldSync section must be present');

check(/delivery\.label/.test(code),
    'the delivery label must come from the server payload, not be re-derived');
check(/delivery\.message/.test(code), 'the delivery message must be rendered');
check(/delivery\.attempt_count/.test(code), 'the attempt count must be shown');
check(/delivery\.last_attempt_at/.test(code), 'the last attempt must be shown');
check(/delivery\.delivered_at/.test(code), 'the delivered date must be shown');
check(/delivery\.is_failure/.test(code), 'failure must be distinguished from neutral');

// Neutral must not be painted as a failure.
check(!/no_delivery_record['"]\s*\?\s*["'][^"']*(rose|red)/i.test(code),
    'no_delivery_record must not be styled as a failure');

// The server is where the read-only guarantee actually lives, so it is asserted
// here too rather than trusting the page to simply not render a control.
check(/InspectionDeliveryStatus::isFailure/.test(SERVER),
    'failure must be decided by the canonical InspectionDeliveryStatus, not re-derived');
check(!/InspectionDeliveryStatusPanel/.test(SERVER),
    'the delivery panel carries the Planning Officer retry POST and must not be used server-side');
check(!/can_retry|retry_delivery|RetryEligibility/.test(SERVER),
    'the delivery payload must expose no retry capability to this page');
check(/InspectionRoundNumbering::forInspections/.test(SERVER),
    'round numbers must come from the canonical helper, never re-derived per surface');

// NO mutation control may appear.
const postCalls = [];
walk(ast.program, (n) => {
    if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression' &&
        ['post', 'put', 'patch', 'delete'].includes(n.callee.property.name) &&
        n.arguments.length > 0) {
        postCalls.push(src.slice(n.arguments[0].start, n.arguments[0].end));
    }
});
const deliveryPosts = postCalls.filter((c) => /retry|deliver/i.test(c));
check(deliveryPosts.length === 0,
    'no retry/re-deliver POST may be issued from this page. Found: ' +
    (deliveryPosts.join(' | ') || '(none)'));

check(!/>(\s*)(Retry Delivery|Re-deliver|Reassign|Approve|Decline)(\s*)</.test(src),
    'no delivery retry or PO control may be rendered');

check(!/InspectionDeliveryStatusPanel/.test(src),
    'the delivery PANEL must not be mounted here: it carries the Planning Officer retry POST');

// ---------------------------------------------------------------- HISTORY

check(/Round History/.test(src), 'a Round History section must be present');
check(/roundHistory\.available/.test(code),
    'history availability must come from the server, not be inferred in the browser');
check(/Round history unavailable/.test(src),
    'an unavailable history must be explained to the Admin');
check(/roundHistory\.unavailable_reason/.test(code),
    'the unavailable reason must be rendered');
check(/r\.is_current/.test(code), 'the current round must be identifiable');
check(/Current\b/.test(src), 'the current round must be visually marked');
check(/href=\{`\/site-inspections\/\$\{r\.inspection_id\}`\}/.test(code),
    'each sibling round must link to its own detail page');
check(/INS-\{r\.inspection_id\}/.test(code), 'each sibling must show its INS-##');

// Round numbers must be read, never recomputed.
check(/r\.round_number != null/.test(code),
    'the sibling round number must be read from the server payload');
check(!/(rounds|chain)\s*\.\s*(reduce|map)\s*\([^)]*\+\s*1/.test(code),
    'no round number may be computed in the browser');
check(!/index\s*\+\s*1/.test(code), 'no positional round numbering may be computed in the browser');

// ---------------------------------------------------------------- DIAGNOSTICS
//
// REVERSED BY CONTRACT. PHASE 2B2D put a GLOBAL Technical Issue count on this
// page. It has been removed, because `diagnostic_reports` carries no
// application, inspection or parcel identity: a system-wide count has no
// application-specific meaning on one lot's record. Only Application Support -
// linked by a stored field_job_id - may appear here, and only once the shared
// reporting schema exists.
//
// These assertions therefore exist to keep the WRONG block from coming back.

check(!/Diagnostics &amp; Support|Diagnostics & Support/.test(code),
    'the global "Diagnostics & Support" band must NOT be rendered on this page');
check(!/diagnosticsSummary\.message/.test(code),
    'a global diagnostic count must not be rendered against this inspection');
check(!/diagnosticsSummary\.scope_note/.test(code),
    'no diagnostic disclosure is needed, because nothing diagnostic is shown');
check(!/diagnosticsSummary\.link/.test(code),
    'no "Open Diagnostic Reports" link may appear on this page');
check(!/diagnosticsSummary\.link_label/.test(code),
    'no diagnostic link label may appear on this page');
check(!/\bdiagnosticsSummary\b/.test(code),
    'the page must not read a global diagnostics payload at all');
check(!/href=["']\/diagnostics/.test(code),
    'this page must not link to the global diagnostics surface');

// Deep-surface content must NOT be duplicated here.
for (const forbidden of ['technical_description', 'repro_steps', 'recommended_action', 'affected_file']) {
    check(!code.includes(forbidden),
        `deep diagnostic content (${forbidden}) must stay on /diagnostics, not be duplicated here`);
}

// The Notify Planning Officers action must NOT be duplicated.
check(!/notify-planning-officers/.test(code),
    'the Notify Planning Officers control must remain on the Diagnostics page only');
check(!/Notify Planning Officers/.test(code),
    'the Notify Planning Officers action must not be reproduced here');

// No report may be presented as belonging to this round.
check(!/diagnosticsSummary\?\.\w*report_id/.test(code),
    'no diagnostic report id may be shown against this inspection');
check(!/diagnosticsSummary\.reports/.test(code),
    'no diagnostic report list may be shown here');

// ---------------------------------------------------------------- LAYOUT
//
// The regression these assertions exist to prevent:
//
//   PHASE 2B2D stacked every supplemental band ABOVE the tab content, each
//   `shrink-0`, inside a column whose ONLY scroll owner was the tab content
//   itself. Once the stack exceeded the column height the `flex-1` tab region
//   collapsed to zero and the column's `overflow-hidden` CLIPPED the rest, so the
//   primary inspection record became unreachable. Nothing was ever removed from
//   the DOM; it was pushed below an unscrollable edge.
//
// The contract that fixes it:
//   1. ONE scroll owner in the right column.
//   2. The tab bar is `shrink-0` and renders ABOVE that scroll owner.
//   3. The primary tab content renders FIRST inside it.
//   4. Every supplemental band renders INSIDE it, after the primary content.
//   5. No band is ever a sibling of the `flex-1` region again.

const columnIdx = src.indexOf('relative overflow-hidden lg:w-7/12');
check(columnIdx >= 0, 'the right column owner must exist');

const scrollDivs = [...code.matchAll(/className="[^"]*overflow-y-auto[^"]*"/g)];
check(
    scrollDivs.length === 1,
    `the right column must have exactly ONE scroll owner, found ${scrollDivs.length}. ` +
    'A second scroller would either nest-scroll or reintroduce the clip.'
);

const iTabBar = code.indexOf('px-5 pt-2 flex gap-1 shrink-0');
const iScroll = scrollDivs.length ? scrollDivs[0].index : -1;
check(iTabBar >= 0 && iScroll >= 0 && iTabBar < iScroll,
    'the tab bar must be shrink-0 and render ABOVE the scroll owner, so it is always visible');

check(/className="flex-1 min-h-0 overflow-y-auto relative"/.test(code),
    'the scroll owner must be flex-1 min-h-0, or it cannot shrink and will push content out');

// Primary content before supplemental content. The labels searched here are the
// RENDERED headings, not the section comments - the comments are stripped from
// `code`, so searching them would silently pass on position -1 comparisons.
const iPrimary = code.indexOf('max-w-2xl mx-auto p-5');
const iPO = code.indexOf('Planning Officer Review');
const iDelivery = code.indexOf('Delivery &amp; FieldSync');
const iHistory = code.indexOf('Round History');
const iAdmin = code.indexOf('Admin Support Actions');

check(iPrimary >= 0, 'the primary tab content wrapper must exist');
check(iPO >= 0, 'the Planning Officer Review band must be present');
check(iDelivery >= 0, 'the Delivery & FieldSync band must be present');
check(iHistory >= 0, 'the Round History band must be present');
check(iAdmin >= 0, 'the Admin Support Actions band must be present');
check(
    iScroll >= 0 && iPrimary > iScroll,
    'the primary tab content must render INSIDE the scroll owner, not as a sibling of it'
);
check(
    [iPO, iDelivery, iHistory, iAdmin].every((p) => p > iPrimary),
    'every supplemental band must render AFTER the primary record. ' +
    'The primary inspection record is the reason this page exists.'
);
check(
    iPO < iDelivery && iDelivery < iHistory && iHistory < iAdmin,
    'supplemental bands must keep their hierarchy: PO Review -> Delivery -> Round History -> Admin Actions'
);

// A band must never be a flex sibling of the scroll region again. `shrink-0` was
// the load-bearing part of that failure, so it must not appear between the scroll
// owner and the end of the right column.
//
// The window is bounded by real div-depth counting rather than "to end of file",
// because the scoped-sync confirmation modal legitimately sits after the column
// and uses shrink-0 on its own icon rows.
const opensIn = (s) => (s.match(/<div\b/g) || []).length;
const closesIn = (s) => (s.match(/<\/div>/g) || []).length;

function divDepthWindow(text, openIdx) {
    let depth = 1;
    let i = openIdx;
    while (depth > 0 && i < text.length) {
        const nl = text.indexOf('\n', i);
        const line = text.slice(i, nl < 0 ? text.length : nl);
        depth += opensIn(line) - closesIn(line);
        i = nl < 0 ? text.length : nl + 1;
    }
    return text.slice(openIdx, i);
}

const scrollWindow = iScroll >= 0 ? divDepthWindow(code, iScroll) : '';
check(scrollWindow.length > 0, 'the scroll owner div must be resolvable for the layout check');
const shrinkAfter = scrollWindow.match(/shrink-0/g) || [];
check(
    shrinkAfter.length === 0,
    'no element between the scroll owner and the end of the right column may carry ' +
    'shrink-0 (found ' + shrinkAfter.length + '). Inside a block scroll region it is ' +
    'inert; if it reappears on a band, that band has escaped the scroll region ' +
    'and can be clipped again.'
);

// The bands must be visually separated from the primary record.
check(/border-t-2 border-slate-300/.test(code),
    'the supplemental block must be visually separated from the primary record');

check(!/Application Support/i.test(code),
    'Application Support must NOT appear until the shared reporting schema exists');

// ---------------------------------------------------------------- STRUCTURE

// The scoped sync must be untouched by this phase.
check(/onFinish: \(\) => setSyncing\(false\)/.test(code),
    'the scoped reverse-sync busy-state reset must remain intact');
check(/sync-from-fieldsync/.test(code),
    'the scoped reverse-sync action must remain on this page');

done();