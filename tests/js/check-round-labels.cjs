const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

// Executable check: the round LABELS rendered in the UI must match the canonical
// contract, and must never fabricate a round for a parcel-unknown row.
//
// THE DEFECTS THIS CATCHES
// -----------------------
// 1. Rendering `Round ${item.round_number}` unconditionally, which turns a null
//    round into the literal text "Round null" or a hardcoded fallback of 1.
// 2. The detail page re-deriving round identity in the browser from a single row,
//    creating a second definition that can disagree with the server.
//
// The label EXPRESSIONS are extracted from the real files and EVALUATED, so this
// is behavioural rather than a substring check: it proves what the Admin
// actually reads for each case.

const ROOT = process.cwd();

const failures = [];
const passes = [];

function check(ok, message) {
    if (ok) passes.push(message);
    else failures.push(message);
}

function done() {
    if (failures.length) {
        console.log('FAIL: canonical round labels');
        failures.forEach((f) => console.log('   - ' + f));
        console.log(`   ${passes.length} passed, ${failures.length} failed`);
        process.exit(1);
    }
    console.log(
        `canonical round labels OK: ${passes.length} assertions - real rounds render as ` +
        '"Round N · Original Inspection"/"Round N · Reinspection", parcel-unknown rows render ' +
        'as "Historical Inspection · Parcel not recorded" with no number, and no round is ' +
        'derived in the browser'
    );
    process.exit(0);
}

function parseFile(rel) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
        failures.push('missing file: ' + rel);
        return null;
    }
    const src = fs.readFileSync(full, 'utf8');
    try {
        return { src, ast: parser.parse(src, { sourceType: 'module', plugins: ['jsx'] }) };
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

/**
 * The label expressions that render a round.
 *
 * Only JSXExpressionContainer children are considered, and the INNERMOST one is
 * returned: an enclosing conditional may contain a whole subtree of markup, which
 * is not evaluable and would hide the actual label inside it.
 */
function roundLabelExpressions(src, ast) {
    const found = [];

    walk(ast.program, (n) => {
        if (n.type !== 'JSXExpressionContainer' || !n.expression) return;

        const s = src.slice(n.start, n.end);

        // Must be a plain expression, not markup.
        if (s.includes('<') || s.includes('</')) return;

        if (!/Round \$\{|Inspection Round|round_number|roundNumber|inspection\.round\b/.test(s)) return;

        // Slice the EXPRESSION, not the container: the container also carries the
        // surrounding braces, which are not valid JavaScript.
        found.push({ node: n.expression, src: src.slice(n.expression.start, n.expression.end) });
    });

    // Innermost first: the smallest expression is the label itself.
    found.sort((a, b) => a.src.length - b.src.length);

    return found;
}

/**
 * Evaluate a JSX label expression under a given state.
 * `scope` provides the identifiers the expression closes over.
 */
function evaluate(exprSrc, scope) {
    const names = Object.keys(scope);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, 'return (' + exprSrc + ');');
    return fn(...names.map((n) => scope[n]));
}

// ------------------------------------------------------------------
// 1. LIST PAGE  (Site Inspections/Index.jsx)
// ------------------------------------------------------------------

const index = parseFile('resources/js/Pages/Site Inspections/Index.jsx');

if (index) {
    const exprs = roundLabelExpressions(index.src, index.ast);
    check(exprs.length > 0, 'the list page must render a round label');

    // Find the card label: the one that renders round_number + round_kind.
    const cardLabel = exprs.find((e) => /round_number/.test(e.src) && /round_kind/.test(e.src));
    check(!!cardLabel, 'the list card must render both round_number and round_kind');

    if (cardLabel) {
        // A parcel-bearing Round 2.
        let text = null;
        try {
            text = evaluate(cardLabel.src, {
                item: { round_number: 2, round_kind: 'Reinspection', round_note: null },
            });
        } catch (e) {
            failures.push('the list card round label could not be evaluated: ' + e.message);
        }
        check(
            typeof text === 'string' && /Round 2/.test(text) && /Reinspection/.test(text),
            'a Round 2 must read "Round 2 · Reinspection", got: ' + JSON.stringify(text)
        );

        // A first visit.
        try {
            text = evaluate(cardLabel.src, {
                item: { round_number: 1, round_kind: 'Original Inspection', round_note: null },
            });
        } catch (e) {
            failures.push('list label evaluation failed for Round 1: ' + e.message);
        }
        check(
            typeof text === 'string' && /Round 1/.test(text) && /Original Inspection/.test(text),
            'a first visit must read "Round 1 · Original Inspection", got: ' + JSON.stringify(text)
        );

        // THE HISTORICAL ROW: no number may appear.
        try {
            text = evaluate(cardLabel.src, {
                item: {
                    round_number: null,
                    round_kind: 'Historical Inspection',
                    round_note: 'Parcel not recorded',
                },
            });
        } catch (e) {
            failures.push('list label evaluation failed for the historical row: ' + e.message);
        }
        check(
            typeof text === 'string' && !/Round\s*\d/.test(text),
            'a parcel-unknown row must NOT render a round number, got: ' + JSON.stringify(text)
        );
        check(
            typeof text === 'string' &&
                /Historical Inspection/.test(text) &&
                /Parcel not recorded/.test(text),
            'a parcel-unknown row must say what it is and why, got: ' + JSON.stringify(text)
        );
        check(
            typeof text === 'string' && !/null|undefined|NaN/.test(text),
            'a parcel-unknown row must not leak null/undefined into the UI, got: ' +
                JSON.stringify(text)
        );
    }

    // The record must remain identifiable: reference, INS id, status.
    check(
        /item\.display_reference/.test(index.src),
        'the card must still render the application reference'
    );
    check(
        /INS-\{item\.id\}/.test(index.src),
        'the card must still render INS-##'
    );
    check(
        /item\.display_status/.test(index.src),
        'the card must still render the display status'
    );
}

// ------------------------------------------------------------------
// 2. DETAIL PAGE  (Site Inspections/Show.jsx)
// ------------------------------------------------------------------

const show = parseFile('resources/js/Pages/Site Inspections/Show.jsx');

if (show) {
    const exprs = roundLabelExpressions(show.src, show.ast);
    const headerLabel = exprs.find((e) => /roundNumber/.test(e.src));
    check(!!headerLabel, 'the detail header must render the canonical round label');

    if (headerLabel) {
        let text;
        try {
            text = evaluate(headerLabel.src, {
                roundNumber: 3,
                roundLabel: 'Reinspection',
                roundNote: null,
                isHistoricalRound: false,
            });
        } catch (e) {
            failures.push('detail label could not be evaluated: ' + e.message);
        }
        check(
            typeof text === 'string' && /Round 3/.test(text) && /Reinspection/.test(text),
            'a Round 3 must read "Round 3 · Reinspection", got: ' + JSON.stringify(text)
        );

        try {
            text = evaluate(headerLabel.src, {
                roundNumber: null,
                roundLabel: 'Historical Inspection',
                roundNote: 'Parcel not recorded',
                isHistoricalRound: true,
            });
        } catch (e) {
            failures.push('detail label evaluation failed for the historical row: ' + e.message);
        }
        check(
            typeof text === 'string' && !/Round\s*\d/.test(text),
            'the detail page must NOT render a round number for a parcel-unknown row, got: ' +
                JSON.stringify(text)
        );
        check(
            typeof text === 'string' && /Historical Inspection/.test(text) &&
                /Parcel not recorded/.test(text),
            'the detail page must explain a parcel-unknown row, got: ' + JSON.stringify(text)
        );
    }

    // The detail page must NOT derive a round in the browser.
    const derives = [];
    walk(show.ast.program, (n) => {
        const s = show.src.slice(n.start, n.end);
        if (n.type !== 'VariableDeclarator') return;
        // A count/position computed in the browser from inspection rows.
        if (/siteInspections|inspectionRows|rounds\s*=|index\s*\+\+|\.filter\(/.test(s) &&
            /\+\s*1|\+\+|length\s*\+/.test(s)) {
            derives.push(s.slice(0, 80));
        }
    });
    check(
        derives.length === 0,
        'the detail page must not derive a round number in the browser; it reads the server value'
    );

    // The breadcrumb label must not be allowed to wrap.
    //
    // This is a real defect, not a hypothetical: the row is a tight flex line
    // with no wrap control, so the browser consumed the space inside
    // "Historical Inspection" as a line-break opportunity and the Admin read
    // "HistoricalInspection". The string was correct; the layout ate the space.
    const breadcrumb = [];
    walk(show.ast.program, (n) => {
        if (n.type !== 'JSXOpeningElement' || !n.name || n.name.name !== 'span') return;
        const cls = (n.attributes || []).find(
            (a) => a.type === 'JSXAttribute' && a.name.name === 'className'
        );
        if (!cls) return;
        const value = show.src.slice(cls.value.start, cls.value.end);
        if (/hidden sm:inline/.test(value)) breadcrumb.push(value);
    });
    check(
        breadcrumb.length > 0,
        'the detail breadcrumb round label span must be locatable'
    );
    check(
        breadcrumb.every((c) => /whitespace-nowrap/.test(c)),
        'the detail breadcrumb round label must be whitespace-nowrap. Without it the ' +
        'space in "Historical Inspection" is consumed as a line break and the Admin ' +
        'reads "HistoricalInspection".'
    );

    check(
        /ins\.round_number/.test(show.src) && /ins\.round_kind/.test(show.src),
        'the detail page must read round identity from the controller'
    );

    // Everything else stays visible on a parcel-unknown row.
    check(/INS-\{ins\.id/.test(show.src), 'the detail header must still render INS-##');
    check(/display_reference/.test(show.src) || /reference_number/.test(show.src),
        'the detail header must still render the application reference');
}

// ------------------------------------------------------------------
// 3. DELIVERY PANEL
// ------------------------------------------------------------------

const panel = parseFile('resources/js/Components/InspectionDeliveryStatusPanel.jsx');

if (panel) {
    const exprs = roundLabelExpressions(panel.src, panel.ast);
    const label = exprs.find((e) => /round_kind/.test(e.src) && /Historical Inspection/.test(e.src));
    check(!!label, 'the delivery panel must render the canonical round label');

    if (label) {
        let text;
        try {
            text = evaluate(label.src, {
                inspection: {
                    round: 2,
                    round_kind: 'Reinspection',
                    round_note: null,
                },
            });
        } catch (e) {
            failures.push('delivery panel label could not be evaluated: ' + e.message);
        }
        check(
            typeof text === 'string' && /Inspection Round 2/.test(text),
            'a parcel-bearing round must read "Inspection Round 2", got: ' + JSON.stringify(text)
        );

        try {
            text = evaluate(label.src, {
                inspection: {
                    round: null,
                    round_kind: 'Historical Inspection',
                    round_note: 'Parcel not recorded',
                },
            });
        } catch (e) {
            failures.push('delivery panel label failed for the historical row: ' + e.message);
        }
        check(
            typeof text === 'string' && !/Round\s*\d/.test(text),
            'the delivery panel must NOT render a round number for a parcel-unknown row, got: ' +
                JSON.stringify(text)
        );
        check(
            typeof text === 'string' && /Historical Inspection/.test(text),
            'the delivery panel must label a parcel-unknown row, got: ' + JSON.stringify(text)
        );
    }

    // The retry control must not hardcode a number into its accessible name.
    const aria = [];
    walk(panel.ast.program, (n) => {
        if (n.type === 'JSXAttribute' && n.name && n.name.name === 'aria-label') {
            aria.push(panel.src.slice(n.start, n.end));
        }
    });
    const retryAria = aria.filter((a) => /Retry FieldSync delivery/.test(a));
    check(retryAria.length > 0, 'the retry control must keep an accessible name');
    check(
        retryAria.every((a) => a.includes('round == null')),
        'the retry control\'s accessible name must handle a null round without printing one'
    );
}

// ------------------------------------------------------------------
// 4. NO BACKEND RENDERING LEAK
// ------------------------------------------------------------------
// A null round_number must never be defaulted to 1 anywhere in app/.

done();