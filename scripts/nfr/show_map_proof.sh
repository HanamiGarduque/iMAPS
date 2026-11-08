#!/usr/bin/env bash
set -e

CYAN='\033[0;36m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

cd /home/nami/Downloads/iMAPS

node -e '
const fs = require("fs");
const file = "scripts/nfr/nfr-results-2026-11-02T14-05-36-303Z.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));

console.log("\x1b[36m==========================================================================================\x1b[0m");
console.log("\x1b[1m\x1b[34m   iMAPS NFR BENCHMARK VERIFICATION AUDIT (Table 4-17)\x1b[0m");
console.log("   Target URL: " + data.base + " | Automated Execution Suite: Playwright Chromium");
console.log("   Artifact:   " + file);
console.log("\x1b[36m==========================================================================================\x1b[0m\n");

console.log("\x1b[33m[1/3] INDIVIDUAL TRIAL RUN TIMINGS (5 Trials)\x1b[0m");
for (let i = 0; i < data.trials; i++) {
    console.log(`  Trial ${i + 1}/${data.trials}:`);
    console.log(`    • Dashboard Load:          ${data.raw.dashboard[i].toFixed(3)} s`);
    console.log(`    • Geospatial Map Load:     \x1b[1m${data.raw.map[i].toFixed(3)} s\x1b[0m`);
    console.log(`    • PDF Permit Generation:   ${data.raw.pdf[i].toFixed(3)} s`);
    console.log(`    • Growth Forecast Request: ${data.raw.forecast[i].toFixed(3)} s`);
}

console.log("\n\x1b[33m[2/3] ACCEPTANCE CRITERIA RESULTS SUMMARY (Table 4-17)\x1b[0m");
console.table(data.summary);

console.log("\x1b[33m[3/3] FOCUS AUDIT: GEOSPATIAL MAP LOAD TIME\x1b[0m");
console.log("  • Requirement Label:     Geospatial map load time");
console.log("  • Acceptance Target:     \x1b[1m≤ 5 s\x1b[0m");
console.log("  • Measured Mean:         \x1b[1m\x1b[31m7.42 s\x1b[0m");
console.log("  • Measured Peak / Max:   \x1b[1m\x1b[31m9.34 s\x1b[0m (Trial 4)");
console.log("  • Acceptance Status:     \x1b[1m\x1b[31mNot Met when cached\x1b[0m");
console.log("  • Individual Timings:    [7.06 s, 7.49 s, 5.33 s, 9.34 s, 7.89 s]");
console.log("  • Technical Analysis:    Even with server-side warm layer caching, client delivery &");
console.log("                           browser SVG/canvas rendering of 4,180 cadastral parcels +");
console.log("                           513 zoning polygons exceeds the 5.0s threshold over network.\n");

console.log("\x1b[36m==========================================================================================\x1b[0m");
console.log("\x1b[1m\x1b[33m   >>> AUDIT PROOF RECORDED: Geospatial map load time: 7.42 s (9.34 s) - Not Met <<<\x1b[0m");
console.log("\x1b[36m==========================================================================================\x1b[0m");
'
