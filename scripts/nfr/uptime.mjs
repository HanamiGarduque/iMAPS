// Logs iMAPS availability during UAT. Leave it running for the whole UAT period.
//
//   node uptime.mjs            # checks every 60 s, appends to uptime-log.csv
//   node uptime.mjs --report   # prints availability % from the log
//
// Optional: IMAPS_URL (default https://imaps-mpdorosario.com), INTERVAL_SECONDS (default 60).
// A check counts as up when /login answers HTTP 2xx within 15 s.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const BASE = (process.env.IMAPS_URL || 'https://imaps-mpdorosario.com').replace(/\/$/, '');
const INTERVAL = Number(process.env.INTERVAL_SECONDS || 60) * 1000;
const LOG = 'uptime-log.csv';

if (process.argv.includes('--report')) {
    if (!existsSync(LOG)) {
        console.error(`No ${LOG} yet.`);
        process.exit(1);
    }
    const lines = readFileSync(LOG, 'utf8').trim().split('\n').slice(1);
    const up = lines.filter((l) => l.split(',')[1] === 'up').length;
    const pct = (up / lines.length) * 100;
    console.log(`From ${lines[0].split(',')[0]} to ${lines.at(-1).split(',')[0]}`);
    console.log(`${up}/${lines.length} checks up: ${pct.toFixed(2)}% (${pct >= 95 ? 'Met' : 'Not Met'}, target ≥ 95%)`);
    process.exit(0);
}

if (!existsSync(LOG)) appendFileSync(LOG, 'timestamp,status,http,ms\n');

async function check() {
    const t = Date.now();
    let status = 'down';
    let http = '';
    try {
        const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(15000) });
        http = res.status;
        if (res.ok) status = 'up';
    } catch (e) {
        http = e.name;
    }
    const line = `${new Date().toISOString()},${status},${http},${Date.now() - t}`;
    appendFileSync(LOG, line + '\n');
    console.log(line);
}

console.log(`Checking ${BASE}/login every ${INTERVAL / 1000} s. Ctrl+C to stop.`);
await check();
setInterval(check, INTERVAL);
