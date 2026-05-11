import { mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const lockRoot = resolve(import.meta.dirname, '../../.tmp/locks');
const staleLockMs = 10 * 60 * 1000;

export async function acquireLock(name) {
	const lockDir = resolve(lockRoot, safeLockName(name));
	await mkdir(lockRoot, { recursive: true });

	while (true) {
		try {
			await mkdir(lockDir);
			return () => rm(lockDir, { recursive: true, force: true });
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error;

			await removeStaleLock(lockDir);
			await sleep(100);
		}
	}
}

async function removeStaleLock(lockDir) {
	try {
		const info = await stat(lockDir);
		if (Date.now() - info.mtimeMs > staleLockMs) {
			await rm(lockDir, { recursive: true, force: true });
		}
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
}

function safeLockName(name) {
	return name.replace(/[^a-zA-Z0-9._-]/g, '-');
}
