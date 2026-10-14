const fs = require('node:fs');
const path = require('node:path');

// An Electron utility worker's execPath is the application, not Node. Resolve
// the system Node used by npm/CLI shims without launching the application.
function nodeExecutable({ platform = process.platform, executable = process.execPath,
  electron = process.versions.electron, searchPath = process.env.PATH || '' } = {}) {
  if (!electron) return executable;
  const name = platform === 'win32' ? 'node.exe' : 'node';
  for (const entry of searchPath.split(platform === 'win32' ? ';' : ':')) {
    if (!entry) continue;
    const candidate = path.resolve(entry.replace(/^"(.*)"$/, '$1'), name);
    try {
      if (!fs.statSync(candidate).isFile()) continue;
      fs.accessSync(candidate, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
      return candidate;
    } catch { /* Continue normal PATH discovery. */ }
  }
  throw Object.assign(new Error('找不到独立 Node.js；请安装 Node.js 并确保 node 在 Cindy 的 PATH 中，然后重新启用插件。'), { code: 'NODE_EXECUTABLE_NOT_FOUND' });
}

module.exports = { nodeExecutable };
