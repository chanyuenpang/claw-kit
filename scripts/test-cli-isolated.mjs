import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { removeTestDirectory } from '../packages/cli/dist-test/fixture-cleanup.js';

const packageRoot = fileURLToPath(new URL('../packages/cli/', import.meta.url));
const parent = path.resolve(os.tmpdir());
const temporary = await fs.mkdtemp(path.join(parent, 'claw-cli-suite-'));
let status = 1;
try {
  status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', 'dist-test/**/*.test.js', ...process.argv.slice(2)], {
      cwd: packageRoot, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary,
        CLAW_TEST_TEMP_ROOT: temporary,
        CLAW_SESSION_RUNTIME_DIR: path.join(temporary, 'legacy'),
        CLAW_SESSION_DAEMON_RUNTIME_DIR: path.join(temporary, 'sessions'),
        CLAW_EMBEDDING_DAEMON_RUNTIME_DIR: path.join(temporary, 'embedding'),
        CLAW_EMBEDDING_DAEMON_IDLE_TTL_MS: '1000', CLAW_SEARCH_DAEMON_IDLE_TTL_MS: '1000',
        CLAW_EMBEDDING_WARMUP_DISABLE_LAUNCH: '1' },
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  if (path.dirname(path.resolve(temporary)) !== parent || (await fs.lstat(temporary)).isSymbolicLink()) {
    throw new Error('Unexpected CLI test cleanup target');
  }
  // Own cleanup after test processes release their handles, including failures.
  // A cleanup error fails the npm command instead of silently leaving residue.
  await removeTestDirectory(temporary);
  console.log('CLI test isolation directory removed.');
}
process.exitCode = status;
