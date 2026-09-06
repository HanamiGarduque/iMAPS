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
    return candidatePaths[0];
}

const uvicornBin = getUvicornPath();
const pythonCmd = `"${uvicornBin} main:app --app-dir python-analytics --reload --port 8001"`;

const commands = [
    '-k',
    '-c', 'cyan,magenta,yellow,blue',
    '-n', 'VITE,LARAVEL,QUEUE,PYTHON',
    '"npm run dev:vite"',
    '"npm run dev:laravel"',
    '"npm run dev:queue"',
    pythonCmd
];

const child = spawn('npx concurrently', commands, {
    stdio: 'inherit',
    shell: true
});

child.on('exit', (code) => {
    process.exit(code || 0);
});