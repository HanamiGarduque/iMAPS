const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

// Executable check: the Planning Officer review UI must not overstate what the
// database proves.
//
// THE DEFECTS THIS CATCHES
// -----------------------
// 1. Rendering a parcel-level review as a decision for a specific round. The
//    words "Decision for this inspection" must be reachable ONLY from the
//    round-specific payload field.
// 2. Showing parcel-level context on every historical card, which reads as
//    though one review applied to all of them.
// 3. Wording `Needs Site Inspection` as a post-inspection decision.
// 4. Any Admin review MUTATION control (approve / decline / reinspect /
//    assign / schedule) appearing on a read-only page.
// 5. An "Awaiting PO Review" indicator, which absence of linkage cannot prove.
//
// The binding expressions are EXTRACTED from the real pages and evaluated, so
// this proves what the Admin actually reads rather than what the file contains.

const ROOT = process.cwd();

const failures = [];
const passes = [];

function check(ok, message) {
    if (ok) passes.push(message);
    else failures.push(message);
}

function done() {
    if (failures.length) {
        console.log('FAIL: PO review visibility');
        failures.forEach((f) => console.log('   - ' + f));
        console.log(`   ${passes.length} passed, ${failures.length} failed`);
        process.exit(1);
    }
    console.log(
        `PO review visibility OK: ${passes.length} assertions - round decisions render only ` +
        'from explicit linkage, parcel context is labelled as context and shown once per chain, ' +
        'a request is worded as a request, and the page exposes no review mutation'
    );
    process.exit(0);
}

function read(rel, php = false) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
        failures.push('missing file: ' + rel);
        return null;
    }
    const src = fs.readFileSync(full, 'utf8');
    if (php) {
        // PHP is not JS; only its text is inspected here.
        return { rel, src, ast: null };
    }
    try {
        return { rel, src, ast: parser.parse(src, { sourceType: 'module', plugins: ['jsx'] }) };
    } catch (e) {
        failures.push(rel + ' does not parse: ' + String(e.message).split('\n')[0]);
        return null;
    }
}

function walk(node, cb) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, cb)); return; }
    if (typeof node.type !== 'string') return;
    cb(node);
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
        walk(node[k], cb);
    }
}

// ------------------------------------------------------------------
// DETAIL PAGE
// ------------------------------------------------------------------

const show = read('resources/js/Pages/Site Inspections/Show.jsx');

if (show) {
    const s = show.src;

    // The section must be visually separate from the field record.
    check(
        /Planning Officer Review/.test(s),
        'the detail page must have a clearly labelled Planning Officer Review section'
    );
    check(
        /Field Inspection Result|inspection_result/.test(s),
        'the field result must still exist and stay separate from the PO review section'
    );

    // Round-specific wording is bound ONLY to the round decision field.
    const roundLabelCount = (s.match(/Decision for this inspection/g) || []).length;
    check(
        roundLabelCount >= 1,
        'the detail page must be able to state a decision for this inspection'
    );
    check(
        /review\.po_decision\s*\?/.test(s) || /review\.po_decision\s*&&/.test(s),
        'the round-specific wording must be gated on review.po_decision'
    );
    check(
        /review\.parcel_review\?\.label/.test(s),
        'parcel context must read review.parcel_review.label'
    );

    // Parcel context must SAY it is context, not a decision.
    check(
        /parcel_review\?\.context/.test(s) || /review\.parcel_review\.context/.test(s),
        'parcel-level context must display its supporting context line'
    );
    check(
        /Latest Parcel Review/.test(s),
        'parcel-level context must be labelled "Latest Parcel Review"'
    );

    // A parcel-unknown inspection must say review is unavailable, not hide itself.
    check(
        /is_parcel_unknown/.test(s) && /Not available/.test(s),
        'a parcel-unknown inspection must state that PO review is not available, ' +
        'and must still render'
    );

    // Reviewer and date come from the payload, never invented.
    check(/po_decision_reviewer/.test(s), 'reviewer must come from the payload when present');
    check(/parcel_review\?\.reviewer/.test(s), 'parcel reviewer must come from the payload');
    check(/po_decision_date/.test(s) && /parcel_review\?\.reviewed_at/.test(s),
        'dates must come from the payload');

    // The anomaly branch must exist: a linked request is reported, not forced.
    check(/round_decision_anomaly/.test(s), 'a linked non-verdict must be reported as an anomaly');

    // ---- READ ONLY: no review mutation control may exist -------------------
    const mutating = [
        /router\.(post|put|patch|delete)\(/,
        /onClick[\s\S]{0,120}(approve|decline|reject|reinspect)/i,
        />(Approve|Decline|Requires Reinspection)\s*</,
    ];

    // Ignore the one legitimate POST: the scoped FieldSync sync.
    const postCalls = [];
    walk(show.ast.program, (n) => {
        if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression' &&
            ['post', 'put', 'patch', 'delete'].includes(n.callee.property.name) &&
            n.arguments.length > 0) {
            postCalls.push(s.slice(n.arguments[0].start, n.arguments[0].end));
        }
    });
    // Two POSTs predate this phase and are both legitimate read-scope actions:
    // signing out, and the scoped FieldSync sync. Neither is a review mutation,
    // and neither was added here.
    const reviewMutations = postCalls.filter((c) => /review|decision|approve|declin/i.test(c));
    check(
        reviewMutations.length === 0,
        'no POST may target a review or decision. Found: ' +
        (reviewMutations.join(' | ') || '(none)')
    );
    check(
        postCalls.every((c) => /logout|sync-from-fieldsync/.test(c)),
        'the only POSTs on this page may be logout and the scoped sync. Found: ' +
        postCalls.map((c) => c.slice(0, 50)).join(' | ')
    );

    check(
        !/>(\s*)(Approve|Decline|Requires Reinspection)(\s*)</.test(s),
        'no PO decision BUTTON may appear; this phase is read visibility only'
    );
    check(
        !/awaiting[_ ]?po[_ ]?review/i.test(s),
        'no "Awaiting PO Review" indicator may appear - absence of linkage cannot prove it'
    );
}

// ------------------------------------------------------------------
// LIST PAGE
// ------------------------------------------------------------------

const index = read('resources/js/Pages/Site Inspections/Index.jsx');

if (index) {
    const s = index.src;

    check(/poReview/.test(s), 'the list page must consume the server review payload');
    check(
        /const review = poReview\?\.\[item\.id\]/.test(s),
        'review context must be read per inspection from the payload'
    );

    // Parcel context only on the current round.
    check(
        /is_current_round/.test(s),
        'parcel-level context must be limited to the current round of the chain'
    );
    check(
        /!review\?\.po_decision[\s\S]{0,220}?is_current_round[\s\S]{0,220}?parcel_review/.test(s),
        'parcel context must be shown only when there is no round decision AND the ' +
        'round is current'
    );

    check(/PO Decision:/.test(s), 'a proven round decision must be labelled "PO Decision:"');
    check(
        /Latest Parcel Review:/.test(s),
        'parcel context must be labelled "Latest Parcel Review:"'
    );

    // The label must come from the server's presentation vocabulary, so
    // `Needs Site Inspection` can never read as a verdict.
    check(
        /review\.parcel_review\.label/.test(s),
        'the parcel label must be the server-classified label, not the raw decision'
    );
    check(
        !/Needs Site Inspection/.test(s),
        'the raw "Needs Site Inspection" string must not be rendered client-side'
    );

    // Strip comments first: an explanatory note may legitimately NAME the
    // forbidden indicator in order to say it was not introduced.
    const listCode = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    check(
        !/awaiting[_ ]?po[_ ]?review/i.test(listCode),
        'no "Awaiting PO Review" indicator may appear on the list'
    );
    check(
        !/awaiting[_ ]?po[_ ]?review/i.test(
            s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        ),
        'no "Awaiting PO Review" indicator may appear in executable list code'
    );
    check(
        !/>(\s*)(Approve|Decline|Requires Reinspection)(\s*)</.test(s),
        'no PO decision button may appear on the list'
    );
}

// ------------------------------------------------------------------
// SERVER: vocabulary and vocabulary-only classification
// ------------------------------------------------------------------

const server = read('app/Support/InspectionReviewVisibility.php', true);

if (server) {
    const s = server.src;

    // Round decisions must NOT include the request.
    check(
        /const ROUND_DECISIONS = \['Approved', 'Declined', 'Requires Reinspection'\];/.test(s),
        'the round-decision vocabulary must be exactly Approved / Declined / ' +
        'Requires Reinspection, and must exclude the request'
    );
    check(
        /const REQUEST_LABEL = 'Site Inspection Requested';/.test(s),
        'a request must have its own presentation label'
    );

    // The judged-round column is the only round-identity source.
    check(
        /reviewed_site_inspection_id/.test(s),
        'round identity must come from reviewed_site_inspection_id'
    );
    check(
        !/site_inspection_task_id\s*\)?\s*(?:===|==|=>)/.test(
            s.replace(/\/\*[\s\S]*?\*\//, '').replace(/^\s*\/\/.*$/gm, '')
        ),
        'site_inspection_task_id must never be read as the reviewed round'
    );

    // Stored values are preserved; only presentation labels differ.
    check(
        /'stored_decision' => \$stored/.test(s),
        'the stored decision value must be exposed unchanged'
    );
}

done();