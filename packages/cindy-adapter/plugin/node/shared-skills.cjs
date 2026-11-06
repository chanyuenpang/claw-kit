const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const NAME = '@veewo/claw-skills';
const RECORD = '.claw-package-' + encodeURIComponent(NAME) + '.json';
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const HASH = /^[a-f0-9]{64}$/;
function compare(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; }
function failure(error, phase) {
  phase = typeof error?.phase === 'string' && /^[a-z-]{1,24}$/.test(error.phase) ? error.phase : phase;
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code) ? error.code : 'SKILLS_' + phase.toUpperCase() + '_FAILED';
  return Object.assign(new Error('Shared skills ' + phase + ' failed (' + code + ')', { cause: error }), { code, phase });
}
function release(value) {
  if (value?.schemaVersion !== 1 || value.name !== NAME || !VERSION.test(value.version) || !HASH.test(value.sourceHash) ||
      !value.skills || Array.isArray(value.skills) || !Object.keys(value.skills).length ||
      Object.entries(value.skills).some(([id, hash]) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id) || !HASH.test(hash)))
    throw new Error('Invalid shared skill release data');
  return { schemaVersion: 1, name: NAME, version: value.version, sourceHash: value.sourceHash, skills: value.skills };
}
async function regular(file, directory = false) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile())) throw Object.assign(new Error('Unexpected link or file type'), { code: 'SKILLS_PATH_SCOPE' });
}
// This is the already-published schema-1 wire hash, not a new hash-of-hashes.
async function fingerprint(root) {
  await regular(root, true);
  const hash = createHash('sha256');
  async function walk(dir, prefix = '') {
    for (const name of (await fs.readdir(dir)).sort()) {
      const file = path.join(dir, name), relative = prefix + name, stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) throw new Error('Links are not skill resources');
      if (stat.isDirectory()) { hash.update('d:' + relative + '\0'); await walk(file, relative + '/'); }
      else if (stat.isFile()) hash.update('f:' + relative + '\0').update(await fs.readFile(file));
      else throw new Error('Invalid skill resource');
    }
  }
  await walk(root); return hash.digest('hex');
}
async function complete(root, manifest) {
  try {
    for (const [id, hash] of Object.entries(manifest.skills)) {
      await regular(path.join(root, id, 'SKILL.md'));
      if (await fingerprint(path.join(root, id)) !== hash) return false;
    }
    return true;
  } catch { return false; }
}
async function readRelease(root, state) {
  for (const file of [path.join(root, RECORD), path.join(state, 'receipt.json')]) {
    try { await regular(file); return release(JSON.parse(await fs.readFile(file, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return null;
}
// npm does its own registry/tar integrity handling. It never runs package scripts,
// writes a global npm prefix, or installs the claw CLI. Only its temporary prefix is used.
function npmArguments(version, prefix, config) {
  return ['install', NAME + '@' + version, '--prefix', prefix, '--userconfig', config,
    '--ignore-scripts', '--global=false', '--cache', path.join(prefix, '.npm-cache'), '--no-audit', '--no-fund', '--no-package-lock', '--json', '--registry=https://registry.npmjs.org'];
}
async function downloadPackage(version, prefix) {
  const config = path.join(prefix, '.npmrc');
  await fs.writeFile(config, 'registry=https://registry.npmjs.org\n@veewo:registry=https://registry.npmjs.org\nignore-scripts=true\n');
  let command = 'npm', args = npmArguments(version, prefix, config);
  if (process.platform === 'win32') {
    // Executable shims (e.g. Volta) are real npm owners, not npm-cli.js layouts.
    let executable;
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      const candidate = path.join(dir.replace(/^"(.*)"$/, '$1'), 'npm.exe');
      try { if ((await fs.stat(candidate)).isFile()) { executable = candidate; break; } } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
    }
    if (executable) command = executable;
    else {
    let runtime;
    try { runtime = require('./node-runtime.cjs'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; runtime = require('../../../shared-skills/node-runtime.cjs'); }
    const node = runtime.nodeExecutable();
    let cli;
    for (const dir of [path.dirname(node), ...(process.env.PATH || '').split(path.delimiter)]) {
      const candidate = path.join(dir.replace(/^"(.*)"$/, '$1'), 'node_modules/npm/bin/npm-cli.js');
      try { if ((await fs.stat(candidate)).isFile()) { cli = candidate; break; } } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
    }
    if (!cli) throw Object.assign(new Error('npm-cli.js is unavailable'), { code: 'SKILLS_NPM_UNAVAILABLE' });
    command = node; args = [cli, ...args];
    }
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key)));
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: prefix, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false;
    child.stdout.on('data', data => { if (output.length < 65536) output += data; });
    child.stderr.resume();
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 60000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (!timedOut && code === 0) return resolve();
      let ownerCode; try { ownerCode = JSON.parse(output).error?.code; } catch { /* stable fallback */ }
      reject(Object.assign(new Error('npm data acquisition failed'), { code: timedOut ? 'SKILLS_DOWNLOAD_TIMEOUT' : typeof ownerCode === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(ownerCode) ? ownerCode : 'SKILLS_DOWNLOAD_FAILED' }));
    });
  });
  return path.join(prefix, 'node_modules', '@veewo', 'claw-skills');
}
async function lock(state, operation) {
  const file = path.join(state, 'prepare.lock');
  let handle;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { handle = await fs.open(file, 'wx'); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { await regular(file); owner = JSON.parse(await fs.readFile(file, 'utf8')); }
      catch (readError) {
        if (readError.code === 'ENOENT') continue; // Holder released before inspection.
        if (!(readError instanceof SyntaxError)) throw readError;
        throw Object.assign(new Error('Skill preparation lock is busy'), { code: 'SKILLS_BUSY' });
      }
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw Object.assign(new Error('Invalid preparation lock'), { code: 'SKILLS_BUSY' });
      try { process.kill(owner.pid, 0); }
      catch (probe) { if (Number.isSafeInteger(owner.pid) && owner.pid > 0 && probe.code === 'ESRCH') { await fs.unlink(file); continue; } }
      throw Object.assign(new Error('Skill preparation is already running'), { code: 'SKILLS_BUSY' });
    }
  }
  if (!handle) throw Object.assign(new Error('Skill preparation is busy'), { code: 'SKILLS_BUSY' });
  let primary;
  try { await handle.writeFile(JSON.stringify({ pid: process.pid })); return await operation(); }
  catch (error) { primary = error; throw error; }
  finally {
    try { await handle.close(); await fs.unlink(file); }
    catch (error) { if (!primary) throw failure(error, 'release'); console.error('[claw] shared-skill lock cleanup:', error.code || 'UNAVAILABLE'); }
  }
}
async function prepareSharedSkills({ minimum, homeDir = os.homedir(), download = downloadPackage } = {}) {
  if (!minimum || minimum.package !== NAME || !VERSION.test(minimum.minVersion)) throw failure(new Error('Invalid plugin requirement'), 'configuration');
  const home = await fs.realpath(homeDir), agents = path.join(home, '.agents');
  let root, state;
  let phase = 'state', temp;
  try {
    // Follow user-configured global root links once, then hold the canonical
    // physical scope throughout download and replacement (no model-supplied paths).
    await fs.mkdir(path.join(agents, 'skills'), { recursive: true });
    await fs.mkdir(path.join(agents, '.claw-kit-skills'), { recursive: true });
    root = await fs.realpath(path.join(agents, 'skills'));
    state = await fs.realpath(path.join(agents, '.claw-kit-skills'));
    const current = await readRelease(root, state);
    if (current && compare(current.version, minimum.minVersion) >= 0 && await complete(root, current)) return { ok: true, installed: false, version: current.version };
    const version = current && compare(current.version, minimum.minVersion) > 0 ? current.version : minimum.minVersion;
    phase = 'download'; temp = await fs.mkdtemp(path.join(os.tmpdir(), 'claw-shared-skills-'));
    const source = await download(version, temp);
    phase = 'validate'; await regular(source, true);
    await regular(path.join(source, 'skills-manifest.json')); await regular(path.join(source, 'package.json'));
    const candidate = release(JSON.parse(await fs.readFile(path.join(source, 'skills-manifest.json'), 'utf8')));
    const pkg = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
    if (pkg.name !== NAME || pkg.version !== candidate.version || compare(candidate.version, version) < 0 || !await complete(path.join(source, 'skills'), candidate)) throw new Error('Downloaded skill package is incomplete');
    phase = 'lock';
    return await lock(state, async () => {
      const previous = await readRelease(root, state);
      if (previous && compare(previous.version, candidate.version) > 0) {
        if (await complete(root, previous)) return { ok: true, installed: false, version: previous.version };
        throw Object.assign(new Error('Newer global version changed during preparation'), { code: 'SKILLS_VERSION_CHANGED' });
      }
      phase = 'write';
      // Retain the previous success record until the complete new version is written.
      for (const id of new Set([...Object.keys(previous?.skills || {}), ...Object.keys(candidate.skills)])) {
        const target = path.join(root, id);
        await fs.rm(target, { recursive: true, force: true });
        if (Object.hasOwn(candidate.skills, id)) await fs.cp(path.join(source, 'skills', id), target, { recursive: true });
      }
      const staged = path.join(root, '.claw-manifest-' + randomUUID() + '.tmp');
      try { await fs.writeFile(staged, JSON.stringify(candidate) + '\n'); await fs.rename(staged, path.join(root, RECORD)); }
      finally { await fs.rm(staged, { force: true }); }
      return { ok: true, installed: true, version: candidate.version };
    });
  } catch (error) { throw failure(error, phase); }
  finally { if (temp) await fs.rm(temp, { recursive: true, force: true }).catch(error => console.error('[claw] shared-skill staging cleanup:', error.code || 'UNAVAILABLE')); }
}
module.exports = { prepareSharedSkills, fingerprint, npmArguments };
