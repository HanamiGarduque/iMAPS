import { spawn } from 'child_process';

const names = ['VITE', 'LARAVEL', 'QUEUE'];
const colors = ['cyan', 'magenta', 'yellow'];
const cmds = [
    '"npm run dev:vite"',
    '"npm run dev:laravel"',
    '"npm run dev:queue"'
];

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