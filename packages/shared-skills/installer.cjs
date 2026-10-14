// Canonical shared-package installer; no Cindy identity, workflow or UI dependencies.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { nodeExecutable } = require('./node-runtime.cjs');
const PACKAGE = '@veewo/claw-skills';
const REGISTRY = 'https://registry.npmjs.org';
const fail = (code, message) => Object.assign(new Error(message), { code });
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }

// File ownership/path containment is a mutation boundary: never follow a user link
// or replace bytes which differ from our receipt. A postcondition cannot undo loss.
async function noLinks(file) {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw fail('SKILLS_PATH_LINK', '技能安装路径包含链接，请使用真实目录：' + current); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (path.dirname(current) === current) break;
  }
}
async function fingerprint(root) {
  await noLinks(root);
  const hash = createHash('sha256');
  async function visit(dir, prefix = '') {
    for (const name of (await fs.readdir(dir)).sort()) {
      const file = path.join(dir, name), relative = prefix + name;
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) throw fail('SKILLS_PATH_LINK', '技能包包含链接：' + file);
      if (stat.isDirectory()) { hash.update('d:' + relative + '\0'); await visit(file, relative + '/'); }
      else if (stat.isFile()) hash.update('f:' + relative + '\0').update(await fs.readFile(file));
      else throw fail('SKILLS_FILE_TYPE', '技能包包含非普通文件：' + file);
    }
  }
  await visit(root);
  return hash.digest('hex');
}
function validate(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest.name !== PACKAGE || !/^\d+\.\d+\.\d+$/.test(manifest.version)
      || !/^[a-f0-9]{64}$/.test(manifest.sourceHash) || !manifest.skills || Array.isArray(manifest.skills)
      || !Object.keys(manifest.skills).length || Object.entries(manifest.skills).some(([id, hash]) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !/^[a-f0-9]{64}$/.test(hash))) {
    throw fail('SKILLS_MANIFEST_INVALID', '共享技能包收据无效。');
  }
  return manifest;
}
function locations(homeDir = os.homedir()) {
  return { root: path.join(homeDir, '.agents', 'skills'), state: path.join(homeDir, '.agents', '.claw-kit-skills') };
}
function sameManifest(a, b) {
  return a?.name === b?.name && a?.version === b?.version && a?.sourceHash === b?.sourceHash
    && Object.keys(a.skills).length === Object.keys(b.skills).length
    && Object.entries(a.skills).every(([id, hash]) => b.skills[id] === hash);
}
async function hashOrNull(file) { return await exists(file) ? fingerprint(file) : null; }
async function assertHash(file, expected, code = 'SKILLS_USER_CONFLICT') {
  if (await hashOrNull(file) !== expected) throw fail(code, '保留已有文件；内容与受管摘要不匹配：' + file);
}
async function atomicJson(file, value) {
  const temp = file + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await fs.rename(temp, file);
}
async function duplicateEntries(root, ids) {
  const conflicts = [];
  for (const name of await fs.readdir(root).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
    if (ids.includes(name)) continue;
    // Read only: Host owns legacy links, including broken ones. Never unlink them.
    if (ids.some(id => name === 'claw-kit--' + id)) { conflicts.push(name); continue; }
    const body = await fs.readFile(path.join(root, name, 'SKILL.md'), 'utf8').catch(() => '');
    const skillName = /^---\r?\n[\s\S]*?^name:\s*['"]?([a-z0-9-]+)['"]?\s*$/m.exec(body)?.[1];
    if (ids.includes(skillName)) conflicts.push(name);
  }
  return conflicts;
}
async function status({ homeDir, expected }) {
  validate(expected);
  const { root, state } = locations(homeDir);
  const repair = '调用 install_skills 安装插件固定版本；旧插件链接请先通过 Cindy 更新插件并重新打开会话。';
  const result = { installed: false, compatible: false, loadedInCurrentSession: 'unknown', repair, version: expected.version };
  try {
    await noLinks(state);
    const duplicates = await duplicateEntries(root, Object.keys(expected.skills));
    if (await exists(path.join(state, 'journal.json'))) return { ...result, status: 'recovery-needed' };
    if (!await exists(path.join(state, 'receipt.json'))) {
      const unowned = [];
      for (const id of Object.keys(expected.skills)) if (await exists(path.join(root, id))) unowned.push(id);
      return { ...result, status: duplicates.length ? 'duplicate-entries' : unowned.length ? 'unowned-entries' : 'missing', duplicates, unowned };
    }
    const owner = await json(path.join(state, 'owner.json'));
    if (owner?.installer !== PACKAGE || owner.schemaVersion !== 1) throw fail('SKILLS_STATE_CONFLICT', '安装状态目录不属于 claw-kit。');
    const receipt = validate(await json(path.join(state, 'receipt.json')));
    for (const [id, hash] of Object.entries(receipt.skills)) await assertHash(path.join(root, id), hash);
    const compatible = sameManifest(receipt, expected);
    return { ...result, installed: true, compatible: compatible && duplicates.length === 0, status: duplicates.length ? 'duplicate-entries' : compatible ? 'ready' : 'incompatible', version: receipt.version, duplicates };
  } catch (error) { return { ...result, status: 'needs-repair', errorCode: error.code || 'SKILLS_CHECK_FAILED', reason: error.message }; }
}

async function withLock(state, action) {
  await noLinks(state);
  await fs.mkdir(path.dirname(state), { recursive: true });
  if (!await exists(state)) {
    const staging = await fs.mkdtemp(path.join(path.dirname(state), '.claw-skills-owner-'));
    try {
      await fs.writeFile(path.join(staging, 'owner.json'), JSON.stringify({ installer: PACKAGE, schemaVersion: 1 }));
      try { await fs.rename(staging, state); }
      catch (error) { if (!await exists(state)) throw error; }
    } finally { await fs.rm(staging, { recursive: true, force: true }); }
  }
  await noLinks(path.join(state, 'owner.json'));
  const owner = await json(path.join(state, 'owner.json')).catch(() => null);
  if (owner?.installer !== PACKAGE || owner.schemaVersion !== 1) throw fail('SKILLS_STATE_CONFLICT', '安装状态目录不属于 claw-kit，已保留：' + state);
  const lock = path.join(state, 'install.lock');
  // An exclusive file serializes installers. A dead process's lock is recoverable;
  // an alive/unknown PID remains untouched. No timed lock stealing during a send.
  for (let attempt = 0; ; attempt++) {
    try { const handle = await fs.open(lock, 'wx'); await handle.writeFile(JSON.stringify({ pid: process.pid })); await handle.close(); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (attempt) throw fail('SKILLS_INSTALL_BUSY', '另一个技能安装正在运行，或锁需要人工检查：' + lock);
      const reclaim = path.join(state, 'reclaim.lock');
      let handle;
      try { handle = await fs.open(reclaim, 'wx'); }
      catch (error) { if (error.code !== 'EEXIST') throw error; throw fail('SKILLS_INSTALL_BUSY', '安装锁正在恢复；若进程已退出，请检查：' + reclaim); }
      try {
        let owner;
        try { owner = await json(lock); } catch { throw fail('SKILLS_INSTALL_BUSY', '安装锁不完整；确认没有安装进程后处理：' + lock); }
        if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw fail('SKILLS_INSTALL_BUSY', '安装锁无有效进程标识：' + lock);
        try { process.kill(owner.pid, 0); throw fail('SKILLS_INSTALL_BUSY', '技能安装进程仍在运行：' + owner.pid); }
        catch (e) { if (e.code !== 'ESRCH') throw e; }
        // A single reclaimer owns the dead lock; competing installers cannot
        // acquire install.lock until this rename and must re-read its next owner.
        await fs.rename(lock, path.join(state, 'stale-lock-' + randomUUID()));
      } finally { await handle.close(); await fs.unlink(reclaim); }
    }
  }
  try { return await action(); } finally { await fs.unlink(lock); }
}

async function recover(root, state) {
  const journalPath = path.join(state, 'journal.json');
  if (!await exists(journalPath)) return;
  const journal = await json(journalPath);
  validate(journal.next);
  if (journal.previous) validate(journal.previous);
  if (!/^txn-[a-f0-9-]+$/.test(journal.transaction)) throw fail('SKILLS_JOURNAL_INVALID', '安装恢复记录无效。');
  const txn = path.join(state, journal.transaction);
  await noLinks(txn);
  const ids = [...new Set([...Object.keys(journal.previous?.skills || {}), ...Object.keys(journal.next.skills)])];
  // Infer crash position from owned bytes, not an increment counter written after rename.
  for (const id of ids.reverse()) {
    const destination = path.join(root, id), backup = path.join(txn, 'backup', id);
    const oldHash = journal.previous?.skills[id] ?? null, newHash = journal.next.skills[id] ?? null;
    const current = await hashOrNull(destination);
    if (await exists(backup)) {
      await assertHash(backup, oldHash);
      if (current !== null) {
        if (current !== newHash) throw fail('SKILLS_RECOVERY_CONFLICT', '恢复时发现用户修改，保留新旧目录：' + destination);
        await fs.rename(destination, path.join(txn, 'discard-' + id + '-' + randomUUID()));
      }
      await fs.rename(backup, destination);
    } else if (oldHash === null && current !== null) {
      if (current !== newHash) throw fail('SKILLS_RECOVERY_CONFLICT', '恢复时发现非受管目录：' + destination);
      await fs.rename(destination, path.join(txn, 'discard-' + id + '-' + randomUUID()));
    } else if (current !== oldHash) throw fail('SKILLS_RECOVERY_CONFLICT', '恢复所需旧版本不可用：' + destination);
  }
  if (journal.previous) await atomicJson(path.join(state, 'receipt.json'), journal.previous);
  else if (await exists(path.join(state, 'receipt.json'))) await fs.unlink(path.join(state, 'receipt.json'));
  await fs.unlink(journalPath);
  // Retain recovery evidence outside discovery. Never recursively delete user data.
}

async function install({ packageRoot, homeDir, expected, fault = async () => {} }) {
  validate(expected);
  const { root, state } = locations(homeDir);
  await noLinks(root);
  return withLock(state, async () => {
    await recover(root, state);
    await noLinks(packageRoot);
    const incoming = validate(await json(path.join(packageRoot, 'skills-manifest.json')));
    if (!sameManifest(incoming, expected)) throw fail('SKILLS_VERSION_MISMATCH', '技能包与插件固定的版本或内容不匹配。');
    const pkg = await json(path.join(packageRoot, 'package.json'));
    if (pkg.name !== PACKAGE || pkg.version !== incoming.version) throw fail('SKILLS_VERSION_MISMATCH', 'npm 包身份与技能清单不匹配。');
    const receiptPath = path.join(state, 'receipt.json');
    const previous = await exists(receiptPath) ? validate(await json(receiptPath)) : null;
    if (previous?.version === incoming.version && !sameManifest(previous, incoming)) throw fail('SKILLS_VERSION_REUSED', '同一版本不能对应不同内容；请使用新版本的技能包和插件。');
    const ids = [...new Set([...Object.keys(previous?.skills || {}), ...Object.keys(incoming.skills)])];
    const duplicates = await duplicateEntries(root, ids);
    if (duplicates.length) throw fail('SKILLS_DUPLICATE_ENTRIES', '保留同名技能；先在 Cindy 更新旧插件或自行处理这些入口：' + duplicates.join(', '));
    for (const id of ids) await assertHash(path.join(root, id), previous?.skills[id] ?? null);
    for (const [id, hash] of Object.entries(incoming.skills)) {
      await assertHash(path.join(packageRoot, 'skills', id), hash, 'SKILLS_PACKAGE_INTEGRITY');
      await fs.access(path.join(packageRoot, 'skills', id, 'SKILL.md'));
    }
    if (previous && sameManifest(previous, incoming)) return { ...(await status({ homeDir, expected })), unchanged: true };
    const transaction = 'txn-' + randomUUID(), txn = path.join(state, transaction);
    await fs.mkdir(path.join(txn, 'backup'), { recursive: true });
    await fs.mkdir(path.join(txn, 'stage'));
    for (const [id, hash] of Object.entries(incoming.skills)) {
      await fs.cp(path.join(packageRoot, 'skills', id), path.join(txn, 'stage', id), { recursive: true, dereference: false });
      await assertHash(path.join(txn, 'stage', id), hash, 'SKILLS_STAGE_INTEGRITY');
    }
    await fault('staged');
    await fs.mkdir(root, { recursive: true });
    await atomicJson(path.join(state, 'journal.json'), { transaction, previous, next: incoming });
    try {
      for (const id of ids) {
        await assertHash(path.join(root, id), previous?.skills[id] ?? null);
        if (previous?.skills[id]) await fs.rename(path.join(root, id), path.join(txn, 'backup', id));
        await fault('backed-up', id);
        if (incoming.skills[id]) await fs.rename(path.join(txn, 'stage', id), path.join(root, id));
        await fault('activated', id);
      }
      await atomicJson(receiptPath, incoming);
      await fault('receipt');
      await fs.unlink(path.join(state, 'journal.json'));
    } catch (error) {
      try { await recover(root, state); } catch (recovery) { error.recovery = { code: recovery.code, message: recovery.message }; }
      throw error;
    }
    return { ...(await status({ homeDir, expected })), unchanged: false, message: '共享技能已安装；当前会话加载状态未知。请新建 Cindy 会话验证，未出现时重启 Cindy。' };
  });
}

async function downloadAndInstall({ homeDir, expected, download = npmDownload }) {
  validate(expected);
  const { root, state } = locations(homeDir);
  await noLinks(root);
  // Restore the old usable snapshot before network acquisition, even offline.
  await withLock(state, () => recover(root, state));
  // Network acquisition is explicit and cannot touch the active install.
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'claw-skills-download-'));
  try {
    await download(temp, expected.version);
    return await install({ homeDir, expected, packageRoot: path.join(temp, 'node_modules', '@veewo', 'claw-skills') });
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
async function npmDownload(prefix, version) {
  const args = ['install', '--prefix', prefix, '--global=false', '--dry-run=false', '--ignore-scripts', '--no-audit', '--no-fund', '--json', '--package-lock=false', '--cache', path.join(prefix, '.npm-cache'), '--registry=' + REGISTRY, '--@veewo:registry=' + REGISTRY, PACKAGE + '@' + version];
  let command = 'npm', commandArgs = args;
  if (process.platform === 'win32') {
    const node = nodeExecutable();
    const candidates = [path.dirname(node), ...(process.env.PATH || '').split(path.delimiter)];
    let cli;
    for (const dir of candidates) {
      const file = path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
      if (await exists(file)) { cli = file; break; }
    }
    if (!cli) throw fail('SKILLS_NPM_UNAVAILABLE', '找不到 npm-cli.js；请安装 Node.js/npm 后重试。');
    command = node; commandArgs = [cli, ...args];
  }
  await new Promise((resolve, reject) => {
    let output = '', timedOut = false;
    const child = spawn(command, commandArgs, { cwd: prefix, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', bytes => { if (output.length < 1024 * 1024) output += bytes.toString(); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 90000);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) { reject(fail('SKILLS_DOWNLOAD_TIMEOUT', '技能包下载超时，现有安装未改变；可重试。')); return; }
      if (code === 0) { resolve(); return; }
      let ownerCode;
      try { ownerCode = JSON.parse(output)?.error?.code; } catch { /* structured npm JSON only */ }
      const safeCode = typeof ownerCode === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(ownerCode) ? ownerCode : 'SKILLS_DOWNLOAD_REJECTED';
      reject(Object.assign(fail(safeCode, 'npm 下载失败（退出码 ' + code + '）；确认固定版本已发布及网络可用后重试。'), { phase: 'download' }));
    });
  });
}
module.exports = { fingerprint, status, install, downloadAndInstall, locations };
