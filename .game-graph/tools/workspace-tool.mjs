#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workspace = join(root, '.game-graph'), drafts = join(workspace, '.agent-drafts'), lock = join(workspace, '.agent-tools.lock');
const fail = (code, message, details = {}) => { throw Object.assign(new Error(message), { code, details }); };
const hash = value => createHash('sha256').update(value).digest('hex');
const json = async path => { try { return { path, raw: await readFile(path, 'utf8') }; } catch (error) { fail(error.code === 'ENOENT' ? 'WORKSPACE_FILE_MISSING' : 'WORKSPACE_READ_FAILED', `无法读取 ${path}`); } };
const parse = async path => { const file = await json(path); try { return { ...file, value: JSON.parse(file.raw), revision: hash(file.raw) }; } catch { fail('INVALID_JSON', `JSON 无法解析：${path}`); } };
const args = values => { const positionals = [], options = {}; for (let i = 0; i < values.length; i++) { const item = values[i]; if (!item.startsWith('--')) { positionals.push(item); continue; } const key = item.slice(2), value = values[++i]; if (!key || value === undefined || value.startsWith('--') || Object.hasOwn(options, key)) fail('TOOL_INVALID', `参数无效：${item}`); options[key] = value; } return { positionals, options }; };
const emit = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const readMechanicPaths = async directory => { const entries = await readdir(directory, { withFileTypes: true }); const found = []; for (const entry of entries) { const path = join(directory, entry.name); if (entry.isDirectory()) found.push(...await readMechanicPaths(path)); else if (entry.isFile() && entry.name.endsWith('.mechanic.json')) found.push(path); } return found; };
const readFolders = async (directory, prefix = '') => { const entries = await readdir(directory, { withFileTypes: true }); const found = []; for (const entry of entries) if (entry.isDirectory()) { const folder = prefix ? `${prefix}/${entry.name}` : entry.name; found.push(folder, ...await readFolders(join(directory, entry.name), folder)); } return found.sort((a, b) => a.localeCompare(b)); };
const folderSegment = (value, location) => { if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[\\/\u0000-\u001f<>:"|?*]/u.test(value)) fail('TOOL_INVALID', `${location} 必须是单段安全目录名`); return value; };
const folder = (value, location = 'folder') => { if (value === undefined || value === '') return ''; if (typeof value !== 'string') fail('TOOL_INVALID', `${location} 无效`); return value.split('/').map(segment => folderSegment(segment, location)).join('/'); };
const mechanicDirectory = value => join(workspace, 'mechanics', ...value.split('/').filter(Boolean));
async function snapshot() { const manifest = await parse(join(workspace, 'workspace.json')), definitions = await parse(join(workspace, 'definitions.graph.json')); const mechanicsRoot = join(workspace, 'mechanics'); const paths = await readMechanicPaths(mechanicsRoot); const mechanics = await Promise.all(paths.map(parse)); const nodes = definitions.value.nodes ?? []; const edges = mechanics.flatMap(file => (file.value.edges ?? []).map(edge => ({ ...edge, id: `${file.value.id}/${edge.id}`, origin: { mechanicId: file.value.id, edgeId: edge.id } }))); const revision = hash([manifest.raw, definitions.raw, ...mechanics.map(item => item.raw)].join('\n'));
  return { manifest, definitions, mechanics, folders: await readFolders(mechanicsRoot), nodes, edges, revision, nodeMap: new Map(nodes.map(node => [node.id, node])) }; }
const operator = edge => edge.relation === 'specializes' ? 'is-a>' : edge.sign === 1 ? '+>' : edge.sign === -1 ? '->' : '?>';
const guide = () => ({
  contractVersion: 1,
  commands: ['scopes', 'search', 'node', 'impact', 'draft open', 'draft validate', 'draft save'],
  workflow: ['scopes', 'draft open（目标不存在时携带名称与范围）', '编辑两份草稿 JSON', 'draft validate', 'draft save'],
  conceptTemplate: { id: 'stable-concept-id', label: '概念名称', description: '概念定义。', agentLocked: false },
  influenceRuleTemplate: { id: 'source-concept-2-target-concept', source: 'source-concept', target: 'target-concept', relation: 'influence', sign: 1, inheritance: { mode: 'none' }, ruleText: '源概念如何影响目标概念。' },
  specializesRuleTemplate: { id: 'subtype-concept-2-supertype-concept', source: 'subtype-concept', target: 'supertype-concept', relation: 'specializes' },
  constraints: ['所有持久化 ID 使用英文小写 kebab-case', '规则 ID 固定为 source-2-target', '同一有向端点对在全工作区只能有一条规则', '限定词只属于 influence 规则端点', '草稿不允许 positions、projectionPositions 或 routeCache', 'save 前必须 validate；save 不执行自动排版或文档导出'],
});
const semanticId = value => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value);
const text = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) fail('TOOL_INVALID', `${field} 必须是非空文本`);
  return value.trim();
};
const object = (value, location) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('DRAFT_VALIDATION_FAILED', `${location} 必须是对象`);
  return value;
};
const only = (value, required, allowed, location) => {
  object(value, location);
  for (const key of required) if (!(key in value)) fail('DRAFT_VALIDATION_FAILED', `${location} 缺少 ${key}`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('DRAFT_VALIDATION_FAILED', `${location} 不支持字段 ${key}`);
};
const draftId = (value, location) => {
  if (!semanticId(value)) fail('DRAFT_VALIDATION_FAILED', `${location} 必须是英文小写语义 ID`);
  return value;
};
const draftText = (value, location, max = 8000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('DRAFT_VALIDATION_FAILED', `${location} 必须是长度 1–${max} 的非空文本`);
};
const array = (value, location) => {
  if (!Array.isArray(value)) fail('DRAFT_VALIDATION_FAILED', `${location} 必须是数组`);
  return value;
};
const uniqueIds = (ids, location) => {
  const seen = new Set();
  for (const id of ids) { draftId(id, location); if (seen.has(id)) fail('DRAFT_VALIDATION_FAILED', `${location} 存在重复 ID：${id}`); seen.add(id); }
  return seen;
};
const noDraftGeometry = (document, location) => {
  object(document.positions, `${location}.positions`);
  if (Object.keys(document.positions).length) fail('DRAFT_GEOMETRY_FORBIDDEN', `${location}.positions 必须保持为空；布局由网页管理`);
  if ('projectionPositions' in document || 'routeCache' in document) fail('DRAFT_GEOMETRY_FORBIDDEN', `${location} 不允许提交投影坐标或连线路径缓存`);
};
const qualifier = (item, nodes, location) => {
  only(item, ['key', 'value'], ['key', 'value'], location); draftId(item.key, `${location}.key`);
  object(item.value, `${location}.value`);
  if (item.value.kind === 'concept') {
    only(item.value, ['kind', 'conceptId'], ['kind', 'conceptId'], `${location}.value`); draftId(item.value.conceptId, `${location}.value.conceptId`);
    if (!nodes.has(item.value.conceptId)) fail('DRAFT_VALIDATION_FAILED', `${location} 引用不存在的限定概念：${item.value.conceptId}`);
  } else if (item.value.kind === 'literal') {
    only(item.value, ['kind', 'value'], ['kind', 'value'], `${location}.value`);
    if (!['string', 'number', 'boolean'].includes(typeof item.value.value) && item.value.value !== null) fail('DRAFT_VALIDATION_FAILED', `${location}.value.value 必须是基础值`);
  } else fail('DRAFT_VALIDATION_FAILED', `${location}.value.kind 无效`);
};
const qualifiers = (items, nodes, location) => {
  if (items === undefined) return;
  if (!Array.isArray(items) || !items.length) fail('DRAFT_VALIDATION_FAILED', `${location} 必须是非空数组`);
  const keys = new Set();
  items.forEach((item, index) => { qualifier(item, nodes, `${location}[${index}]`); if (keys.has(item.key)) fail('DRAFT_VALIDATION_FAILED', `${location} 的 key 重复：${item.key}`); keys.add(item.key); });
};
const inheritance = (value, location) => {
  object(value, location);
  if (value.mode === 'none') { only(value, ['mode'], ['mode'], location); return; }
  if (value.mode !== 'specializeEndpoint') fail('DRAFT_VALIDATION_FAILED', `${location}.mode 无效`);
  only(value, ['mode', 'endpoints', 'maxSpecializationHops'], ['mode', 'endpoints', 'maxSpecializationHops'], location);
  if (!Array.isArray(value.endpoints) || !value.endpoints.length || new Set(value.endpoints).size !== value.endpoints.length || value.endpoints.some(item => !['source', 'target'].includes(item))) fail('DRAFT_VALIDATION_FAILED', `${location}.endpoints 无效`);
  if (!Number.isInteger(value.maxSpecializationHops) || value.maxSpecializationHops < 1 || value.maxSpecializationHops > 8) fail('DRAFT_VALIDATION_FAILED', `${location}.maxSpecializationHops 必须是 1–8 的整数`);
};
function validateDefinitions(document, workspaceId) {
  only(document, ['schemaVersion', 'kind', 'workspaceId', 'nodes', 'positions'], ['schemaVersion', 'kind', 'workspaceId', 'nodes', 'positions'], 'definitions');
  if (![4, 5].includes(document.schemaVersion) || document.kind !== 'definitions' || document.workspaceId !== workspaceId) fail('DRAFT_VALIDATION_FAILED', 'definitions 的版本、类型或 workspaceId 无效');
  noDraftGeometry(document, 'definitions');
  const nodes = new Map(), aliases = new Set();
  array(document.nodes, 'definitions.nodes').forEach((node, index) => {
    only(node, ['id', 'label', 'description', 'agentLocked'], ['id', 'label', 'description', 'agentLocked', 'customData', 'tags', 'aliases'], `definitions.nodes[${index}]`);
    draftId(node.id, `definitions.nodes[${index}].id`); draftText(node.label, `definitions.nodes[${index}].label`); draftText(node.description, `definitions.nodes[${index}].description`);
    if (typeof node.agentLocked !== 'boolean') fail('DRAFT_VALIDATION_FAILED', `definitions.nodes[${index}].agentLocked 必须是布尔值`);
    if (node.customData !== undefined && (typeof node.customData !== 'string' || node.customData.length > 16000)) fail('DRAFT_VALIDATION_FAILED', `definitions.nodes[${index}].customData 无效`);
    for (const field of ['tags', 'aliases']) if (node[field] !== undefined) {
      array(node[field], `definitions.nodes[${index}].${field}`); if (new Set(node[field]).size !== node[field].length || node[field].some(item => typeof item !== 'string' || !item.trim())) fail('DRAFT_VALIDATION_FAILED', `definitions.nodes[${index}].${field} 必须是不重复的非空文本`);
    }
    if (nodes.has(node.id)) fail('DRAFT_VALIDATION_FAILED', `definitions.nodes 的 ID 重复：${node.id}`); nodes.set(node.id, node);
  });
  const ids = new Set([...nodes.keys()].map(value => value.toLowerCase()));
  for (const node of nodes.values()) for (const alias of node.aliases ?? []) { const normalized = alias.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase(); if (aliases.has(normalized) || ids.has(normalized)) fail('DRAFT_VALIDATION_FAILED', `概念别名重复或遮蔽 ID：${alias}`); aliases.add(normalized); }
  return nodes;
}
function validateMechanic(document, workspaceId, nodes, otherMechanics) {
  only(document, ['schemaVersion', 'kind', 'workspaceId', 'id', 'name', 'scope', 'nodeIds', 'edges', 'positions'], ['schemaVersion', 'kind', 'workspaceId', 'id', 'name', 'scope', 'nodeIds', 'edges', 'positions'], 'mechanic');
  if (![4, 5, 6].includes(document.schemaVersion) || document.kind !== 'mechanic' || document.workspaceId !== workspaceId) fail('DRAFT_VALIDATION_FAILED', 'mechanic 的版本、类型或 workspaceId 无效');
  draftId(document.id, 'mechanic.id'); draftText(document.name, 'mechanic.name'); draftText(document.scope, 'mechanic.scope'); noDraftGeometry(document, 'mechanic');
  const included = uniqueIds(array(document.nodeIds, 'mechanic.nodeIds'), 'mechanic.nodeIds');
  for (const id of included) if (!nodes.has(id)) fail('DRAFT_VALIDATION_FAILED', `mechanic.nodeIds 引用不存在的概念：${id}`);
  const edgeIds = new Set(), pairs = new Set(), allPairs = new Set(), specializes = [];
  for (const graph of otherMechanics) for (const edge of graph.value.edges ?? []) { allPairs.add(`${edge.source}\u0000${edge.target}`); if (edge.relation === 'specializes') specializes.push(edge); }
  array(document.edges, 'mechanic.edges').forEach((edge, index) => {
    const location = `mechanic.edges[${index}]`, allowed = ['id', 'source', 'target', 'relation', 'sign', 'inheritance', 'ruleText', 'customData', 'sourceQualifiers', 'targetQualifiers'];
    only(edge, ['id', 'source', 'target', 'relation'], allowed, location); draftId(edge.id, `${location}.id`); draftId(edge.source, `${location}.source`); draftId(edge.target, `${location}.target`);
    if (!included.has(edge.source) || !included.has(edge.target)) fail('DRAFT_VALIDATION_FAILED', `${location} 的端点必须在 mechanic.nodeIds 中`);
    const pair = `${edge.source}\u0000${edge.target}`;
    if (edgeIds.has(edge.id) || pairs.has(pair) || allPairs.has(pair)) fail('DRAFT_VALIDATION_FAILED', `${location} 的 ID 或有向端点与既有规则重复`);
    if (edge.id !== `${edge.source}-2-${edge.target}`) fail('DRAFT_VALIDATION_FAILED', `${location}.id 必须为 ${edge.source}-2-${edge.target}`);
    edgeIds.add(edge.id); pairs.add(pair); allPairs.add(pair);
    if (edge.relation === 'influence') { if (![1, -1, 'random'].includes(edge.sign)) fail('DRAFT_VALIDATION_FAILED', `${location}.sign 无效`); inheritance(edge.inheritance, `${location}.inheritance`); qualifiers(edge.sourceQualifiers, nodes, `${location}.sourceQualifiers`); qualifiers(edge.targetQualifiers, nodes, `${location}.targetQualifiers`); }
    else if (edge.relation === 'specializes') { if ('sign' in edge || 'inheritance' in edge || 'sourceQualifiers' in edge || 'targetQualifiers' in edge) fail('DRAFT_VALIDATION_FAILED', `${location} 的 is-a 不能带影响属性或限定词`); if (edge.source === edge.target) fail('DRAFT_VALIDATION_FAILED', `${location} 的 is-a 不能连接自身`); specializes.push(edge); }
    else fail('DRAFT_VALIDATION_FAILED', `${location}.relation 无效`);
    if (edge.ruleText !== undefined && (typeof edge.ruleText !== 'string' || edge.ruleText.length > 8000)) fail('DRAFT_VALIDATION_FAILED', `${location}.ruleText 无效`);
    if (edge.customData !== undefined && (typeof edge.customData !== 'string' || edge.customData.length > 16000)) fail('DRAFT_VALIDATION_FAILED', `${location}.customData 无效`);
  });
  const outgoing = new Map(), visiting = new Set(), visited = new Set();
  for (const edge of specializes) (outgoing.get(edge.source) ?? outgoing.set(edge.source, []).get(edge.source)).push(edge.target);
  const visit = id => { if (visiting.has(id)) fail('DRAFT_VALIDATION_FAILED', 'is-a 关系形成分类环'); if (visited.has(id)) return; visiting.add(id); for (const target of outgoing.get(id) ?? []) visit(target); visiting.delete(id); visited.add(id); };
  for (const id of outgoing.keys()) visit(id);
}
function resolveNode(nodes, key) { const norm = key.trim().toLowerCase(); const id = nodes.find(node => node.id.toLowerCase() === norm); if (id) return { status: 'resolved', node: id, matchedBy: 'id' }; const candidates = nodes.filter(node => node.label?.trim().toLowerCase() === norm || (node.aliases ?? []).some(alias => alias.trim().toLowerCase() === norm)); if (candidates.length === 1) return { status: 'resolved', node: candidates[0], matchedBy: candidates[0].label?.trim().toLowerCase() === norm ? 'label' : 'alias' }; return candidates.length ? { status: 'ambiguous', candidates: candidates.map(node => ({ id: node.id, label: node.label })) } : { status: 'not_found' }; }
function paths(edges, from, to, maxDepth = 16) { const out = new Map(); for (const edge of edges) (out.get(edge.source) ?? out.set(edge.source, []).get(edge.source)).push(edge); const queue = [{ ids: [from], steps: [] }], result = []; for (let i = 0; i < queue.length; i++) { const current = queue[i]; if (current.ids.at(-1) === to && current.steps.length) { result.push(current); continue; } if (current.steps.length >= maxDepth) continue; for (const edge of out.get(current.ids.at(-1)) ?? []) if (!current.ids.includes(edge.target)) queue.push({ ids: [...current.ids, edge.target], steps: [...current.steps, edge] }); } return result.sort((a,b) => a.steps.length - b.steps.length || a.ids.join('\0').localeCompare(b.ids.join('\0'))); }
function compact(path, map) { const steps = path.steps.map(edge => ({ from: edge.source, to: edge.target, operator: operator(edge), origin: edge.origin })); const taxonomy = path.steps.some(edge => edge.relation === 'specializes'); let sign = 1; for (const edge of path.steps) if (edge.relation === 'influence') sign = sign === 'random' || edge.sign === 'random' ? 'random' : sign * edge.sign; return { length: steps.length, nodes: path.ids.map(id => ({ id, label: map.get(id)?.label ?? id })), steps, chain: path.ids.map((id, i) => i ? `${steps[i - 1].operator} ${id}` : id).join(' '), kind: taxonomy ? (path.steps.every(edge => edge.relation === 'specializes') ? 'taxonomy' : 'mixed') : 'influence', effect: taxonomy ? null : sign === 1 ? 'positive' : sign === -1 ? 'negative' : 'random' }; }
async function withLock(fn) { try { await writeFile(lock, String(process.pid), { flag: 'wx' }); } catch { fail('WORKSPACE_LOCKED', '已有 JSON 工具正在写入工作区'); } try { return await fn(); } finally { await rm(lock, { force: true }); } }
const structuralCopy = value => {
  const copy = structuredClone(value);
  copy.positions = {};
  delete copy.projectionPositions;
  delete copy.routeCache;
  return copy;
};
const retainedPositions = (positions, ids) => Object.fromEntries(Object.entries(positions ?? {}).filter(([id]) => ids.has(id)));
async function openDraft(mechanicId, options) {
  const data = await snapshot(), mechanic = data.mechanics.find(item => item.value.id === mechanicId);
  draftId(mechanicId, 'mechanic');
  const targetFolder = folder(options.folder);
  if (mechanic && (options.name !== undefined || options.scope !== undefined || options.folder !== undefined)) fail('DRAFT_TARGET_EXISTS', `机制已存在：${mechanicId}；重新打开时不要提供 --name、--scope 或 --folder`);
  if (!mechanic && (!semanticId(mechanicId) || options.name === undefined || options.scope === undefined)) fail('DRAFT_CREATE_METADATA_REQUIRED', '新机制 draft open 必须同时提供 --mechanic、--name 与 --scope');
  if (!mechanic && targetFolder && !data.folders.includes(targetFolder)) fail('FOLDER_NOT_FOUND', `机制目录不存在：${targetFolder}`);
  const document = mechanic?.value ?? { schemaVersion: 6, kind: 'mechanic', workspaceId: data.manifest.value.id, id: mechanicId,
    name: text(options.name, '机制名称'), scope: text(options.scope, '机制范围'), nodeIds: [], edges: [], positions: {} };
  await mkdir(drafts, { recursive: true }); const id = randomUUID(), draftFolder = join(drafts, id); await mkdir(draftFolder);
  const definitionsPath = join(draftFolder, 'definitions.graph.json'), mechanicPath = join(draftFolder, 'mechanic.json');
  await writeFile(definitionsPath, JSON.stringify(structuralCopy(data.definitions.value), null, 2) + '\n');
  await writeFile(mechanicPath, JSON.stringify(structuralCopy(document), null, 2) + '\n');
  const meta = { id, workspaceId: data.manifest.value.id, mechanicId, definitionsRevision: data.definitions.revision,
    mechanicRevision: mechanic?.revision ?? null, targetFile: mechanic?.path ?? join(mechanicDirectory(targetFolder), `${mechanicId}.mechanic.json`), created: !mechanic };
  await writeFile(join(draftFolder, 'draft.json'), JSON.stringify(meta, null, 2) + '\n');
  return { draftId: id, draftPath: draftFolder, definitionsPath, mechanicPath, revision: data.revision, target: mechanic ? 'existing' : 'new',
    geometry: '已从草稿移除；保存时保留既有节点位置并清除过期路径缓存' };
}
async function saveDraft(id, validateOnly = false) { const folder = join(drafts, id); if (relative(drafts, folder).startsWith('..' + sep)) fail('DRAFT_NOT_FOUND', '草稿不存在'); const meta = (await parse(join(folder, 'draft.json'))).value, draftDefinitions = await parse(join(folder, 'definitions.graph.json')), draftMechanic = await parse(join(folder, 'mechanic.json'));
  return withLock(async () => {
    const data = await snapshot(), mechanic = data.mechanics.find(item => item.value.id === meta.mechanicId), creating = meta.created === true;
    if ((creating ? Boolean(mechanic) : !mechanic) || data.manifest.value.id !== meta.workspaceId || data.definitions.revision !== meta.definitionsRevision || (!creating && mechanic.revision !== meta.mechanicRevision)) fail('RESOURCE_REVISION_CONFLICT', '保存前 canonical 已变化；草稿已保留');
    if (draftMechanic.value.id !== meta.mechanicId) fail('DRAFT_IDENTITY_MISMATCH', '草稿机制 ID 与目标不一致');
    const nodes = validateDefinitions(draftDefinitions.value, meta.workspaceId);
    validateMechanic(draftMechanic.value, meta.workspaceId, nodes, data.mechanics.filter(item => item.value.id !== meta.mechanicId));
    if (validateOnly) return { valid: true, draftId: id, revision: data.revision };
    const definitions = structuredClone(draftDefinitions.value), document = structuredClone(draftMechanic.value);
    definitions.positions = retainedPositions(data.definitions.value.positions, new Set(definitions.nodes.map(node => node.id)));
    document.positions = retainedPositions(mechanic?.value.positions, new Set(document.nodeIds));
    const targetMechanicPath = meta.targetFile;
    const temporaryDefinitions = data.definitions.path + '.' + randomUUID() + '.tmp', temporaryMechanic = targetMechanicPath + '.' + randomUUID() + '.tmp';
    const backupDefinitions = data.definitions.path + '.' + randomUUID() + '.backup', backupMechanic = targetMechanicPath + '.' + randomUUID() + '.backup';
    let definitionsBacked = false, mechanicBacked = false, definitionsCommitted = false, mechanicCommitted = false;
    try {
      await writeFile(temporaryDefinitions, JSON.stringify(definitions, null, 2) + '\n', { flag: 'wx' });
      await writeFile(temporaryMechanic, JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
      await rename(data.definitions.path, backupDefinitions); definitionsBacked = true;
      if (mechanic) { await rename(mechanic.path, backupMechanic); mechanicBacked = true; }
      await rename(temporaryDefinitions, data.definitions.path); definitionsCommitted = true;
      await rename(temporaryMechanic, targetMechanicPath); mechanicCommitted = true;
      const verified = await snapshot();
      if (!verified.mechanics.some(item => item.value.id === meta.mechanicId)) fail('SAVE_UNCERTAIN', '提交后回读未找到目标机制');
      await rm(backupDefinitions, { force: true }); await rm(backupMechanic, { force: true });
      await rm(folder, { recursive: true, force: true });
      return { saved: true, revision: verified.revision, note: '已校验并原子提交 JSON；保留既有节点位置，清除过期连线路径缓存；未执行网页排版或文档导出。' };
    } catch (error) {
      try {
        if (definitionsCommitted) await rm(data.definitions.path, { force: true });
        if (mechanicCommitted) await rm(targetMechanicPath, { force: true });
        if (definitionsBacked) await rename(backupDefinitions, data.definitions.path);
        if (mechanicBacked) await rename(backupMechanic, targetMechanicPath);
      } catch (rollback) { fail('SAVE_ROLLBACK_FAILED', `草稿保存失败且回滚失败：${rollback.message}`); }
      throw error;
    } finally { await rm(temporaryDefinitions, { force: true }); await rm(temporaryMechanic, { force: true }); }
  }); }
async function main() { const { positionals, options } = args(process.argv.slice(2)), [command, action] = positionals; if (!command) fail('TOOL_INVALID', '需要命令'); const data = ['scopes','search','node','impact'].includes(command) ? await snapshot() : null;
  if (command === 'guide') return guide();
  if (command === 'scopes') return { workspaceId: data.manifest.value.id, revision: data.revision, folders: data.folders, mechanics: data.mechanics.map(item => ({ id: item.value.id, name: item.value.name, file: relative(root, item.path) })) };
  if (command === 'search') { if (options.query) { const r = resolveNode(data.nodes, options.query); return r.status === 'resolved' ? { revision: data.revision, concept: r.node, matchedBy: r.matchedBy } : { revision: data.revision, resolution: r }; } if (!options.from || !options.to) fail('TOOL_INVALID', 'search 需要 --query 或 --from --to'); const a = resolveNode(data.nodes, options.from), b = resolveNode(data.nodes, options.to); if (a.status !== 'resolved' || b.status !== 'resolved') return { revision: data.revision, from: a, to: b, rules: null }; const direct = (x,y) => data.edges.filter(edge => edge.source === x.id && edge.target === y.id).map(edge => ({ id: edge.id, operator: operator(edge), ruleText: edge.ruleText ?? '', origin: edge.origin })); return { revision: data.revision, from: a.node, to: b.node, rules: { forward: direct(a.node,b.node), reverse: direct(b.node,a.node) } }; }
  if (command === 'impact') { if (!options.from || !options.to || !data.nodeMap.has(options.from) || !data.nodeMap.has(options.to)) fail('NODE_NOT_FOUND', 'impact 需要已有 --from 与 --to'); const result = paths(data.edges, options.from, options.to, Number(options['max-depth'] ?? 16)).map(path => compact(path, data.nodeMap)); return { revision: data.revision, counts: { returned: result.length }, paths: result }; }
  if (command === 'node') { if (!options.id || !data.nodeMap.has(options.id)) fail('NODE_NOT_FOUND', 'node 需要已有 --id'); const hops = Number(options.hops ?? 1), direction = options.direction ?? 'both', inbound = data.edges.map(edge => ({ ...edge, source: edge.target, target: edge.source })), pick = edges => paths(edges, options.id, '__never__', hops); const collect = edges => { const out = []; const walk = (id, depth, seen, steps) => { if (depth >= hops) return; for (const edge of edges.filter(item => item.source === id)) if (!seen.has(edge.target)) { const next = [...steps, edge]; out.push({ ids: [options.id, ...next.map(item => item.target)], steps: next }); walk(edge.target, depth + 1, new Set([...seen, edge.target]), next); } }; walk(options.id, 0, new Set([options.id]), []); return out.map(path => compact(path, data.nodeMap)); }; return { revision: data.revision, center: data.nodeMap.get(options.id), direction, paths: { ...(direction !== 'downstream' ? { upstream: collect(inbound) } : {}), ...(direction !== 'upstream' ? { downstream: collect(data.edges) } : {}) } }; }
  if (command === 'draft' && action === 'open') { if (!options.mechanic) fail('TOOL_INVALID', 'draft open 需要 --mechanic'); return openDraft(options.mechanic, options); }
  if (command === 'draft' && action === 'save') { if (!options.draft) fail('TOOL_INVALID', 'draft save 需要 --draft'); return saveDraft(options.draft); }
  if (command === 'draft' && action === 'validate') { if (!options.draft) fail('TOOL_INVALID', 'draft validate 需要 --draft'); return saveDraft(options.draft, true); }
  fail('TOOL_INVALID', '仅支持 guide、scopes/search/node/impact、draft open|validate|save'); }
main().then(emit).catch(error => { process.stderr.write(JSON.stringify({ error: error.code ?? 'TOOL_FAILED', message: error.message, ...error.details }) + '\n'); process.exitCode = 1; });
