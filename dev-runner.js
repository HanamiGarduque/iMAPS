import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

const isWindows = os.platform() === 'win32';

function getUvicornPath() {
    // Check both standard 'venv' and hidden '.venv' inside python-analytics
    const candidatePaths = isWindows
        ? [
            'python-analytics\\venv\\Scripts\\uvicorn.exe',
            'python-analytics\\.venv\\Scripts\\uvicorn.exe',
          ]
        : [
            './python-analytics/venv/bin/uvicorn',
            './python-analytics/.venv/bin/uvicorn',
          ];

    for (const binPath of candidatePaths) {
        if (fs.existsSync(path.resolve(binPath))) {
            return binPath;
        }
    }
    return null;
}

const uvicornBin = getUvicornPath();

const names = ['VITE', 'LARAVEL', 'QUEUE'];
const colors = ['cyan', 'magenta', 'yellow'];
const cmds = [
    '"npm run dev:vite"',
    '"npm run dev:laravel"',
    '"npm run dev:queue"'
];

if (uvicornBin) {
    names.push('PYTHON');
    colors.push('blue');
    cmds.push(`"${uvicornBin} main:app --app-dir python-analytics --reload --port 8001"`);
} else {
    console.warn('\x1b[33m%s\x1b[0m', '[DEV-RUNNER] Note: Python virtual environment with uvicorn not found in python-analytics/venv or .venv.');
    console.warn('\x1b[33m%s\x1b[0m', '[DEV-RUNNER] Starting Vite, Laravel, and Queue without Python analytics service.');
    console.warn('\x1b[33m%s\x1b[0m', '[DEV-RUNNER] To enable Python analytics, create python-analytics/venv and install requirements.txt.\n');
}

const commands = [
    '-k',
    '-c', colors.join(','),
    '-n', names.join(','),
    ...cmds
];

const child = spawn('npx concurrently', commands, {
    stdio: 'inherit',
    shell: true
});

child.on('exit', (code) => {
    process.exit(code || 0);
});