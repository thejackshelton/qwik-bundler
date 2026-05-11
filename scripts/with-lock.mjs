import { spawn } from 'node:child_process';
import { acquireLock } from './lib/lock.mjs';

const [, , lockName, ...command] = process.argv;

if (!lockName || !command.length) {
	console.error('Usage: node scripts/with-lock.mjs <lock-name> <command...>');
	process.exit(1);
}

const release = await acquireLock(lockName);
let status = 1;
try {
	status = await run(command);
} finally {
	await release();
}

process.exitCode = status;

function run(command) {
	return new Promise((resolve) => {
		const child = spawn(command[0], command.slice(1), { shell: true, stdio: 'inherit' });
		child.on('close', (status) => resolve(status ?? 1));
	});
}
