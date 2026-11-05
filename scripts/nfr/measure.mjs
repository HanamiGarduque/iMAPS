// Times the quantitative acceptance criteria in Table 4-17 against a running iMAPS.
//
//   cd scripts/nfr && npm install && npx playwright install chromium
//   IMAPS_APP_ID=123 node measure.mjs
//
// The first run opens a browser for you to sign in (see signIn below).
// Optional: IMAPS_EMAIL / IMAPS_PASSWORD to prefill the login form, IMAPS_URL (default https://imaps-mpdorosario.com), TRIALS (default 5),
// PERMIT_TYPE (ze | lc | zc, default lc), SKIP_FORECAST=1, HEADLESS=0.
//
// Each trial uses a fresh browser context, so the cache and cookies are empty.
// The account must be a Planning Officer (permit PDF generation is PO only).
// The PDF uses export-preview, which renders the permit but saves nothing.
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';

const BASE = (process.env.IMAPS_URL || 'https://imaps-mpdorosario.com').replace(/\/$/, '');
const EMAIL = process.env.IMAPS_EMAIL;
const PASSWORD = process.env.IMAPS_PASSWORD;
const APP_ID = process.env.IMAPS_APP_ID;
const PERMIT_TYPE = process.env.PERMIT_TYPE || 'lc';
const TRIALS = Number(process.env.TRIALS || 5);
const SKIP_FORECAST = process.env.SKIP_FORECAST === '1';

// The login page has a Cloudflare Turnstile check that automated browsers cannot pass,
// so you sign in once by hand (signIn below). That session is saved to SESSION and
// reused; each trial still gets a new context with an empty cache.
const SESSION = '.session.json';

const TARGETS = {
    dashboard: { label: 'Dashboard load time', target: 5 },
    map: { label: 'Geospatial map load time', target: 5 },
    pdf: { label: 'PDF report generation', target: 10 },
    forecast: { label: 'Forecast request', target: 180 },
};

const results = { dashboard: [], map: [], pdf: [], forecast: [] };
const secs = (ms) => ms / 1000;

async function xsrf(context) {
    const cookie = (await context.cookies(BASE)).find((c) => c.name === 'XSRF-TOKEN');
    return cookie ? decodeURIComponent(cookie.value) : '';
}

// Cloudflare rejects browsers that Playwright launches, so you start Chrome yourself
// with a debugging port (see README.md), sign in, and the script copies that session.
async function signIn() {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => {
        console.error('No Chrome on port 9222. Start it as described in README.md, then run again.');
        process.exit(1);
    });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.newPage());
    if (!page.url().startsWith(BASE)) await page.goto(`${BASE}/login`);
    if (new URL(page.url()).pathname.startsWith('/login')) {
        console.log('Complete the check and click Sign In in that Chrome window (5 min limit).');
        await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 300000 });
    }
    await context.storageState({ path: SESSION });
    await browser.close();
    console.log(`Session saved to ${SESSION}. You can close that Chrome window.`);
}

async function trial(browser, n) {
    const context = await browser.newContext({ storageState: SESSION });
    const page = await context.newPage();
    try {

        // Dashboard (= /maps): navigation start to the load event.
        // Map: navigation start until every /api/map/* layer request has finished.
        const pending = new Set();
        let lastLayerDone = 0;
        const isLayer = (r) => new URL(r.url()).pathname.startsWith('/api/map/');
        page.on('request', (r) => isLayer(r) && pending.add(r));
        const done = (r) => {
            if (pending.delete(r)) lastLayerDone = Date.now();
        };
        page.on('requestfinished', done);
        page.on('requestfailed', done);

        const start = Date.now();
        await page.goto(`${BASE}/maps`, { waitUntil: 'load', timeout: 60000 });
        if (new URL(page.url()).pathname.startsWith('/login')) {
            throw new Error(`session expired; delete ${SESSION} and run again to sign in`);
        }
        results.dashboard.push(secs(Date.now() - start));
        await page.waitForLoadState('networkidle', { timeout: 60000 });
        if (pending.size === 0 && lastLayerDone) results.map.push(secs(lastLayerDone - start));
        else console.warn(`  trial ${n}: no map layer requests seen, map time skipped`);

        if (APP_ID) {
            const t = Date.now();
            const res = await page.request.post(`${BASE}/applications/${APP_ID}/export-preview/${PERMIT_TYPE}`, {
                headers: { 'X-XSRF-TOKEN': await xsrf(context), Accept: 'application/pdf' },
                data: { format: 'pdf' },
                timeout: 60000,
            });
            await res.body();
            if (res.ok()) results.pdf.push(secs(Date.now() - t));
            else console.warn(`  trial ${n}: PDF returned HTTP ${res.status()}`);
        }

        if (!SKIP_FORECAST) {
            const t = Date.now();
            const res = await page.request.post(`${BASE}/api/forecast/generate`, {
                headers: { 'X-XSRF-TOKEN': await xsrf(context), Accept: 'application/json' },
                timeout: 300000,
            });
            await res.body();
            if (res.ok()) results.forecast.push(secs(Date.now() - t));
            else console.warn(`  trial ${n}: forecast returned HTTP ${res.status()}`);
        }
    } finally {
        await context.close();
    }
}

if (!existsSync(SESSION)) await signIn();
const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
for (let n = 1; n <= TRIALS; n++) {
    console.log(`Trial ${n}/${TRIALS}`);
    try {
        await trial(browser, n);
    } catch (e) {
        console.warn(`  trial ${n} failed: ${e.message}`);
    }
}
await browser.close();

const rows = [];
for (const [key, { label, target }] of Object.entries(TARGETS)) {
    const v = results[key];
    if (!v.length) {
        rows.push({ Requirement: label, Target: `≤ ${target} s`, Trials: 0, Mean: '-', Max: '-', Remarks: 'Not measured' });
        continue;
    }
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const max = Math.max(...v);
    rows.push({
        Requirement: label,
        Target: `≤ ${target} s`,
        Trials: v.length,
        Mean: `${mean.toFixed(2)} s`,
        Max: `${max.toFixed(2)} s`,
        Remarks: mean <= target ? 'Met' : 'Not Met',
    });
}
console.table(rows);

const file = `nfr-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ base: BASE, trials: TRIALS, raw: results, summary: rows }, null, 2));
console.log(`Raw timings saved to ${file}`);
