import { spawn } from 'node:child_process';

const forwarded = process.argv.slice(2);
const vitestArgs = [];
let hasWatchModeArg = false;

for (const arg of forwarded) {
  if (arg.startsWith('--watchAll=')) {
    const value = arg.split('=')[1];
    vitestArgs.push(value === 'false' ? '--run' : '--watch');
    hasWatchModeArg = true;
    continue;
  }

  if (arg === '--watchAll') {
    vitestArgs.push('--watch');
    hasWatchModeArg = true;
    continue;
  }

  if (arg === '--coverage') {
    vitestArgs.push('--coverage');
    continue;
  }

  vitestArgs.push(arg);
  if (arg === '--run' || arg === '--watch') {
    hasWatchModeArg = true;
  }
}

if (!hasWatchModeArg) {
  vitestArgs.push('--watch');
}

const child = spawn('vitest', vitestArgs, {
  stdio: 'inherit',
  shell: true
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
