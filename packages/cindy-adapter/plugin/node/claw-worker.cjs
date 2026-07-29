const { spawn } = require('node:child_process');
const readline = require('node:readline');

function executable() {
  return process.platform === 'win32' ? 'claw.cmd' : 'claw';
}

function runClaw(args, cwd, input, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(executable(), args, {
      cwd,
      env: { ...process.env, CLAW_HOST: 'cindy' },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, errorPrompt: 'claw CLI 执行超时；请在终端运行 `claw context` 检查安装。' });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, errorPrompt: 'claw CLI 未安装或不可执行；请安装 CLI 后运行 `claw context`。', error: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ ok: false, errorPrompt: 'claw CLI 执行失败；请在终端运行 `claw context` 检查项目和 CLI。', error: stderr.trim() });
        return;
      }
      try {
        resolve({ ok: true, output: JSON.parse(stdout.trim()) });
      } catch (error) {
        resolve({ ok: false, errorPrompt: 'claw CLI 返回内容无法解析；请运行 `claw context` 检查版本。', error: error.message });
      }
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  const params = request.params || {};
  if (request.method === 'claw/session-start') {
    const result = await runClaw(
      ['hook', 'auto-claw', '--host', 'cindy'],
      params.workdir,
      JSON.stringify({ cwd: params.workdir, session_id: params.sessionId }),
      10000,
    );
    const context = result.output?.hookSpecificOutput?.additionalContext;
    reply(request.id, {
      ...(typeof context === 'string' && context.trim() ? { context } : {}),
      ...(result.errorPrompt ? { errorPrompt: result.errorPrompt } : {}),
      ...(result.error ? { error: result.error } : {}),
    });
    return;
  }
  if (request.method === 'claw/workflow') {
    const result = await runClaw(['context', '--host', 'cindy'], params.workdir, undefined, 10000);
    reply(request.id, {
      planStatus: result.output?.activeWorkflow?.planStatus || null,
      ...(result.error ? { error: result.error } : {}),
    });
    return;
  }
  reply(request.id, { error: 'Unknown claw worker method' });
});
