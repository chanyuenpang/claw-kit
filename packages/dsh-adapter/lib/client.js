window.__ModuleLoader__.load({
  id: "@veewo/dsh-claw-kit",
  factory: (require) => {
    const React = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");
    const inject = ["slots", "connection"];
    const EFFORTS = [["minimal", "极低"], ["low", "较低"], ["medium", "中等"], ["high", "较高"], ["xhigh", "极高"]];
    const SECTIONS = [
      { title: "工作流", rows: [
        ["planning", "先规划再执行", "boolean", "默认计划先澄清需求、拆分任务。关闭后直接执行原始请求；显式工作流模板不受影响。"],
        ["goalMode", "自动推进", "boolean", "将计划目标同步为宿主 Goal，由宿主按需续跑。关闭不影响计划和任务管理。"],
        ["maxTasksToKeep", "归档保留数量", "number", "保留的归档任务目录数，默认 9，最少 1。不是计划内的任务项数量。", "超限删除最旧归档及报告"],
        ["gitnexus", "GitNexus", "boolean", "提供代码图谱检索提示，并在计划收尾时刷新索引。关闭不会卸载工具或删除图谱。", "自动刷新图谱，缺少工具时会安装"],
      ] },
      { title: "知识整理", rows: [
        ["knowledgeWriter.model", "模型", "text", "用于计划结束后的 Truth/ADR 整理，不切换当前会话模型。填写当前服务商下的模型 ID；留空保存为宿主默认，不等于继承团队。模板或宿主专属设置可覆盖此偏好。"],
        ["knowledgeWriter.reasoningEffort", "推理深度", "effort", "知识整理助手的推理投入，默认中等；仅在模型支持时采用，较高档位可能增加耗时与用量。"],
      ] },
      { title: "文档", rows: [
        ["memory.enabled", "知识检索", "boolean", "控制 claw search、向量索引维护和外部文档同步。关闭不删除文档，也不关闭 Truth/ADR 整理。语义检索需另行启用 embedding。"],
        ["memory.externalDocPaths", "文档路径", "list", "Truth/ADR 之外用于检索和同步的文档文件或目录。相对路径以项目根目录为准。个人列表整体替换团队列表，不会追加。"],
        ["memory.autoUpdate", "同步已有文档", "boolean", "知识整理后，按最新 Truth/ADR 更新上述路径内受影响的已有文档。需开启知识检索并配置路径；不会新建文档，与版本更新无关。"],
      ] },
    ];
    const ADVANCED = [
      ["autoUpdate", "版本更新偏好", "boolean", "兼容字段。当前 DSH 仍只提示可用新版本，安装需要你明确要求；此项不控制文档更新。"],
      ["contextPaths", "上下文路径", "list", "预留参考路径。当前 DSH 不会据此自动读取文件或将其加入检索范围。"],
    ];
    const definitions = (rows) => rows.map(([key, label, kind, help, note]) => ({ key, label, kind, help, note }));
    const ALL_ROWS = [...SECTIONS.flatMap((section) => definitions(section.rows)), ...definitions(ADVANCED)];
    const identity = (workspaceId, layer, key) => JSON.stringify([workspaceId, layer, key]);
    const draftText = (row, value) => row.kind === "list" ? (Array.isArray(value) ? value.join("\n") : "") : value == null ? "" : String(value);
    function readValue(source, key) {
      for (const part of key.split(".")) {
        if (!source || !Object.prototype.hasOwnProperty.call(source, part)) return { present: false };
        source = source[part];
      }
      return { present: true, value: source };
    }
    function keySnapshot(snapshot, layer, key) {
      const value = readValue(snapshot[layer], key), effective = readValue(snapshot.effective, key);
      return { ...value, revision: snapshot.revisions[layer], effectivePresent: effective.present, effectiveValue: effective.value };
    }
    function errorText(error) {
      const messages = {
        WORKSPACE_NOT_REGISTERED: "项目已移除，请刷新项目列表。",
        PROJECT_ROOT_NOT_FOUND: "请先初始化 claw-kit 项目。",
        PROJECT_CONFIG_CONFLICT: "配置已变化，草稿保留。重新读取会放弃本项草稿。",
        PROJECT_CONFIG_INVALID: "设置值不符合要求。",
        PROJECT_CONFIG_RESPONSE_INVALID: "结果待确认，请重新读取，不要重复提交。",
        PROJECT_CONFIG_KEY_INVALID: "不支持此设置项。",
      };
      return messages[error?.code] || (/[\u4e00-\u9fff]/.test(error?.message || "") ? error.message : "操作未完成，请重新读取后再试。");
    }
    const CSS = `
      .claw-settings { --claw-border: var(--dsw-alias-border-l1, color-mix(in srgb, currentColor 15%, transparent)); --claw-soft: var(--dsw-alias-bg-layer-1, color-mix(in srgb, currentColor 4%, transparent)); --claw-accent: var(--dsw-alias-brand-primary, #4385e8); --claw-muted: var(--dsw-alias-label-secondary, inherit); max-width: 800px; margin: 0 auto; padding: 8px 4px 24px; font-size: 14px; line-height: 1.5; }
      .claw-settings * { box-sizing: border-box; }
      .claw-settings h2, .claw-settings h3, .claw-settings p { margin: 0; }
      .claw-settings h2 { font-size: 18px; font-weight: 650; margin-bottom: 14px; }
      .claw-settings h3 { font-size: 14px; font-weight: 650; padding: 0 0 5px; color: var(--claw-muted); }
      .claw-settings button, .claw-settings input, .claw-settings select, .claw-settings textarea { font: inherit; color: inherit; }
      .claw-settings button { cursor: pointer; border: 1px solid var(--claw-border); border-radius: 6px; background: transparent; padding: 5px 9px; }
      .claw-settings button:hover:not(:disabled) { background: var(--claw-soft); }
      .claw-settings :is(button, select, input, textarea, summary):focus-visible { outline: 2px solid var(--claw-accent); outline-offset: 2px; }
      .claw-settings :disabled { cursor: not-allowed; opacity: .5; }
      .claw-settings .claw-toolbar { display: flex; align-items: center; gap: 10px; }
      .claw-settings .claw-project { flex: 1; min-width: 0; }
      .claw-settings .claw-scope { display: flex; gap: 2px; padding: 2px; background: var(--claw-soft); border: 1px solid var(--claw-border); border-radius: 8px; }
      .claw-settings .claw-scope button { border-color: transparent; white-space: nowrap; padding: 4px 11px; }
      .claw-settings .claw-scope button[aria-pressed=true] { border-color: var(--claw-border); background: var(--dsw-alias-bg-base, Canvas); }
      .claw-settings .claw-scope-note { color: var(--claw-muted); opacity: .7; font-size: 12px; margin: 7px 0 18px; }
      .claw-settings .claw-group { margin-top: 20px; }
      .claw-settings .claw-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 300px); gap: 6px 18px; align-items: center; padding: 11px 0; border-top: 1px solid var(--claw-border); }
      .claw-settings .claw-name { min-width: 0; }
      .claw-settings .claw-label { display: flex; align-items: center; gap: 6px; }
      .claw-settings .claw-key { display: block; color: var(--claw-muted); opacity: .6; font-size: 12px; overflow-wrap: anywhere; }
      .claw-settings .claw-note { color: var(--claw-muted); opacity: .8; font-size: 11px; }
      .claw-settings .claw-info { padding: 0; width: 18px; height: 18px; line-height: 16px; border: 0; border-radius: 50%; color: var(--claw-muted); opacity: .6; font-size: 12px; }
      .claw-settings .claw-value { display: flex; align-items: center; justify-content: flex-end; gap: 7px; min-width: 0; }
      .claw-settings .claw-origin, .claw-settings .claw-progress { color: var(--claw-muted); opacity: .65; font-size: 11px; white-space: nowrap; }
      .claw-settings .claw-value input, .claw-settings .claw-value select { width: 170px; min-width: 0; }
      .claw-settings input, .claw-settings select, .claw-settings textarea { border: 1px solid var(--claw-border); border-radius: 6px; background: var(--claw-soft); padding: 6px 8px; }
      .claw-settings .claw-project select { width: 100%; }
      .claw-settings option { background: Canvas; color: CanvasText; }
      .claw-settings textarea { display: block; width: 100%; min-height: 86px; resize: vertical; }
      .claw-settings .claw-switch { flex: 0 0 auto; position: relative; width: 34px; height: 20px; padding: 0; border-radius: 12px; background: color-mix(in srgb, currentColor 20%, transparent); }
      .claw-settings .claw-switch[aria-checked=true] { background: var(--claw-accent); border-color: var(--claw-accent); }
      .claw-settings .claw-switch::after { content: ''; position: absolute; width: 14px; height: 14px; top: 2px; left: 2px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px #0003; }
      .claw-settings .claw-switch[aria-checked=true]::after { left: 16px; }
      .claw-settings .claw-icon { flex: 0 0 auto; padding: 3px; min-width: 25px; height: 27px; border-color: transparent; }
      .claw-settings .claw-confirm { color: var(--claw-accent); }
      .claw-settings .claw-wide { grid-column: 1 / -1; }
      .claw-settings .claw-help { font-size: 12px; color: var(--claw-muted); background: var(--claw-soft); border-radius: 6px; padding: 9px 11px; }
      .claw-settings .claw-error { color: var(--dsw-alias-state-error-primary, #d34949); font-size: 12px; overflow-wrap: anywhere; }
      .claw-settings .claw-error button { margin-left: 8px; font-size: 12px; }
      .claw-settings .claw-list-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
      .claw-settings .claw-advanced { margin-top: 18px; }
      .claw-settings .claw-advanced > summary { cursor: pointer; color: var(--claw-muted); padding: 6px 0; }
      .claw-settings .claw-empty { color: var(--claw-muted); padding: 20px 0; }
      @media (max-width: 540px) {
        .claw-settings .claw-row { grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; }
        .claw-settings .claw-value { flex-wrap: wrap; max-width: 180px; gap: 4px; }
        .claw-settings .claw-value input, .claw-settings .claw-value select { width: 125px; }
        .claw-settings .claw-scope button { padding: 4px 8px; }
      }
    `;

    function ProjectConfigSection({ call }) {
      const [items, setItems] = React.useState([]), [workspaceId, setWorkspaceId] = React.useState("");
      const [layer, setLayer] = React.useState("personal"), [rows, setRows] = React.useState([]);
      const [drafts, setDrafts] = React.useState({}), [issues, setIssues] = React.useState({});
      const [loading, setLoading] = React.useState(true), [pending, setPending] = React.useState("");
      const [pageError, setPageError] = React.useState(""), [helpKey, setHelpKey] = React.useState("");
      const request = React.useRef(0), mutation = React.useRef(false), view = React.useRef({});
      view.current = { workspaceId, layer };
      const invoke = async (endpoint, payload) => {
        const result = await call(endpoint, payload);
        if (!result || result.ok !== true) throw Object.assign(new Error(result?.error?.message || "请求失败。"), result?.error);
        return result.value;
      };
      const loadRows = async (id, preserveRows = false) => {
        const turn = ++request.current;
        setLoading(true); setPageError("");
        try {
          const next = await Promise.all(ALL_ROWS.map(async (row) => {
            const [team, personal] = await Promise.all(["team", "personal"].map((scope) => invoke("get", { workspaceId: id, layer: scope, key: row.key })));
            return { ...row, team, personal };
          }));
          if (turn === request.current) setRows(next);
          return turn === request.current;
        } catch (error) {
          if (turn === request.current) { if (!preserveRows) setRows([]); setPageError(errorText(error)); }
          return false;
        } finally { if (turn === request.current) setLoading(false); }
      };
      const loadProjects = async () => {
        const turn = ++request.current;
        setLoading(true); setPageError("");
        try {
          const listed = await invoke("list", {});
          if (turn !== request.current) return;
          const next = listed.items, currentId = view.current.workspaceId;
          const id = next.some((item) => item.workspaceId === currentId) ? currentId : next[0]?.workspaceId || "";
          setItems(next); setWorkspaceId(id);
          if (id) await loadRows(id);
          else { setRows([]); setLoading(false); }
        } catch (error) {
          if (turn === request.current) { setPageError(errorText(error)); setLoading(false); }
        }
      };
      React.useEffect(() => { void loadProjects(); return () => { request.current++; }; }, []);
      const dropDraft = (id) => setDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
      const changeDraft = (row, text) => {
        const id = identity(workspaceId, layer, row.key);
        setDrafts((current) => ({ ...current, [id]: { workspaceId, layer, key: row.key, revision: row[layer].revision, ...current[id], text } }));
      };
      const reloadRow = async (row) => {
        const wid = workspaceId, scope = layer, id = identity(wid, scope, row.key);
        if (mutation.current) return;
        mutation.current = true; setPending(id);
        try {
          // Revisions belong to the layer: refresh sibling values too, without
          // discarding their drafts or rebasing them over external changes.
          if (!await loadRows(wid, true)) return;
          dropDraft(id);
          setIssues((current) => { const next = { ...current }; delete next[id]; return next; });
        } catch (error) {
          setIssues((current) => ({ ...current, [id]: { ...current[id], text: errorText(error), code: error.code } }));
        } finally { mutation.current = false; setPending(""); }
      };
      const commit = async (row, value, unset = false, revision = row[layer].revision) => {
        const wid = workspaceId, scope = layer, id = identity(wid, scope, row.key);
        if (mutation.current || issues[id]?.uncertain) return;
        mutation.current = true; setPending(id);
        try {
          const payload = { workspaceId: wid, layer: scope, key: row.key, revision };
          if (!unset) payload.value = value;
          const snapshot = await invoke(unset ? "unset" : "set", payload);
          // The owner returns the accepted full snapshot. No catalog gate or write replay.
          const nextRows = rows.map((entry) => ({ ...entry,
            team: keySnapshot(snapshot, "team", entry.key), personal: keySnapshot(snapshot, "personal", entry.key),
          }));
          const nextRevision = snapshot.revisions[scope];
          if (view.current.workspaceId === wid) setRows(nextRows);
          // An accepted same-revision write changed only this key. Other local
          // drafts at that revision can advance without accepting external edits.
          setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id).map(([key, draft]) => [key,
            draft.workspaceId === wid && draft.layer === scope && draft.revision === revision
              ? { ...draft, revision: nextRevision } : draft,
          ])));
          setIssues((current) => { const next = { ...current }; delete next[id]; return next; });
        } catch (error) {
          // UI-only outcome barrier, not authorization: the config RPC/Core owns
          // outcome evidence and CAS. An unknown/lost response may follow commit;
          // CAS cannot confirm that outcome to the user. Do not resend the same
          // unresolved intent. A false positive costs one explicit read; the
          // smallest paused resource is [workspace, layer, key], not the page.
          // A successful read clears it; even failed recovery keeps sibling rows.
          const uncertain = ["committed", "partial", "unknown"].includes(error.effect) || (error.outcome !== "known" && error.effect !== "none");
          setIssues((current) => ({ ...current, [id]: { text: errorText(error), code: error.code, phase: error.phase, uncertain } }));
        } finally { mutation.current = false; setPending(""); }
      };
      const saveDraft = (row) => {
        const id = identity(workspaceId, layer, row.key), draft = drafts[id];
        if (!draft) return;
        let value = draft.text;
        if (row.kind === "number") {
          value = Number(value);
          if (!Number.isInteger(value) || value < 1) {
            setIssues((current) => ({ ...current, [id]: { text: "请输入不小于 1 的整数。" } })); return;
          }
        } else if (row.kind === "list") value = value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
        else if (row.kind === "text") value = value.trim() || null;
        void commit(row, value, false, draft.revision);
      };
      const renderRow = (row) => {
        const id = identity(workspaceId, layer, row.key), draft = drafts[id], issue = issues[id];
        const inherited = layer === "personal" && !row.personal.present;
        const value = inherited ? row.personal.effectiveValue : row[layer].value;
        const disabled = loading || Boolean(pending) || issue?.uncertain;
        const props = { "aria-label": row.label, disabled, "aria-describedby": helpKey === row.key ? `claw-help-${row.key}` : undefined };
        const buttons = () => [
          jsx("button", { type: "button", className: "claw-icon claw-confirm", disabled, title: row.kind === "list" ? "保存（Ctrl/⌘+Enter）" : "保存（Enter）", "aria-label": `保存：${row.label}`, onClick: () => saveDraft(row), children: "✓" }, "save"),
          jsx("button", { type: "button", className: "claw-icon", disabled: Boolean(pending), title: "取消（Esc）", "aria-label": `取消：${row.label}`, onClick: () => dropDraft(id), children: "×" }, "cancel"),
        ];
        const keyboard = (event) => {
          if (event.isComposing || event.nativeEvent?.isComposing) return;
          if (event.key === "Escape") { event.preventDefault(); dropDraft(id); }
          if (event.key === "Enter" && (row.kind !== "list" || event.ctrlKey || event.metaKey)) { event.preventDefault(); saveDraft(row); }
        };
        let control;
        if (row.kind === "boolean") control = jsx("button", { ...props, type: "button", role: "switch", className: "claw-switch", "aria-checked": value === true, onClick: () => void commit(row, value !== true) });
        else if (row.kind === "effort") control = jsx("select", { ...props, value: value ?? "", onChange: (event) => void commit(row, event.target.value), children: EFFORTS.map(([key, label]) => jsx("option", { value: key, children: label }, key)) });
        else if (row.kind === "list") control = jsx("button", { ...props, type: "button", title: "编辑路径", onClick: () => changeDraft(row, draftText(row, value)), children: Array.isArray(value) && value.length ? `${value.length} 条路径` : "添加路径" });
        else control = jsx("input", { ...props, type: row.kind === "number" ? "number" : "text", min: row.kind === "number" ? 1 : undefined, step: row.kind === "number" ? 1 : undefined,
          value: draft?.text ?? draftText(row, value), placeholder: row.kind === "text" ? "宿主默认" : undefined,
          onChange: (event) => changeDraft(row, event.target.value), onKeyDown: keyboard,
        });
        return jsxs("div", { className: "claw-row", "data-key": row.key, children: [
          jsxs("div", { className: "claw-name", children: [
            jsxs("div", { className: "claw-label", children: [jsx("span", { children: row.label }), jsx("button", { type: "button", className: "claw-info", "aria-label": `说明：${row.label}`, "aria-expanded": helpKey === row.key, onClick: () => setHelpKey(helpKey === row.key ? "" : row.key), children: "ⓘ" })] }),
            jsx("code", { className: "claw-key", children: row.key }),
            row.note && jsx("p", { className: "claw-note", children: row.note }),
          ] }),
          jsxs("div", { className: "claw-value", children: [
            inherited && jsx("span", { className: "claw-origin", title: "未设置个人值，当前跟随团队", children: "团队" }),
            layer === "team" && row.personal.present && jsx("span", { className: "claw-origin", title: "此项个人设置仍会覆盖团队值", children: "个人已另设" }),
            control,
            draft && row.kind !== "list" && buttons(),
            layer === "personal" && row.personal.present && jsx("button", { type: "button", className: "claw-icon", disabled, title: "恢复团队值", "aria-label": `恢复团队值：${row.label}`, onClick: () => void commit(row, undefined, true), children: "↶" }),
            pending === id && jsx("span", { className: "claw-progress", role: "status", children: "处理中…" }),
          ] }),
          helpKey === row.key && jsx("p", { id: `claw-help-${row.key}`, className: "claw-wide claw-help", children: row.help }),
          draft && row.kind === "list" && jsxs("div", { className: "claw-wide", children: [
            jsx("textarea", { ...props, value: draft.text, placeholder: "每行一条路径", "aria-label": `编辑路径：${row.label}`, onChange: (event) => changeDraft(row, event.target.value), onKeyDown: keyboard }),
            jsx("div", { className: "claw-list-actions", children: buttons() }),
          ] }),
          issue && jsxs("div", { className: "claw-wide claw-error", role: "alert", children: [jsx("span", { title: [issue.code, issue.phase].filter(Boolean).join(" · "), children: issue.text }), jsx("button", { type: "button", disabled: Boolean(pending), "aria-label": `重新读取：${row.label}`, onClick: () => void reloadRow(row), children: "重新读取" })] }),
        ] }, row.key);
      };
      return jsxs("section", { className: "claw-settings", "aria-label": "Claw Kit 项目设置", "aria-busy": loading, children: [
        jsx("style", { children: CSS }), jsx("h2", { children: "项目设置" }),
        jsxs("div", { className: "claw-toolbar", children: [
          jsx("div", { className: "claw-project", children: jsx("select", { "aria-label": "项目", value: workspaceId, disabled: !items.length || Boolean(pending), onChange: (event) => { const id = event.target.value; setWorkspaceId(id); setRows([]); void loadRows(id); }, children: items.length ? items.map((item) => jsx("option", { value: item.workspaceId, children: item.title }, item.workspaceId)) : jsx("option", { value: "", children: "暂无项目" }) }) }),
          jsx("div", { className: "claw-scope", role: "group", "aria-label": "设置范围", children: [["personal", "个人"], ["team", "团队"]].map(([scope, label]) => jsx("button", { type: "button", "aria-pressed": layer === scope, disabled: Boolean(pending), onClick: () => setLayer(scope), children: label }, scope)) }),
          jsx("button", { type: "button", className: "claw-icon", title: "刷新项目", "aria-label": "刷新项目", disabled: loading || Boolean(pending), onClick: () => void loadProjects(), children: "↻" }),
        ] }),
        jsx("p", { className: "claw-scope-note", children: layer === "personal" ? "默认跟随团队，修改仅对本机项目生效。" : "共享设置；个人覆盖不受影响。" }),
        pageError && jsx("p", { className: "claw-error", role: "alert", children: pageError }),
        !rows.length && !pageError && jsx("p", { className: "claw-empty", role: "status", children: loading ? "读取中…" : "请添加并初始化 claw-kit 项目。" }),
        rows.length > 0 && SECTIONS.map((section) => jsxs("section", { className: "claw-group", "aria-label": section.title, children: [jsx("h3", { children: section.title }), section.rows.map(([key]) => renderRow(rows.find((row) => row.key === key)))] }, section.title)),
        rows.length > 0 && jsxs("details", { className: "claw-advanced", children: [jsx("summary", { children: "高级" }), ADVANCED.map(([key]) => renderRow(rows.find((row) => row.key === key)))] }),
      ] });
    }
    function apply(ctx) {
      const call = (endpoint, payload) => ctx.connection.rpc.call("/claw-project-config", endpoint, payload);
      ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "claw-kit", order: 40, label: () => "Claw Kit 设置", inject: () => ({ call }) }, ProjectConfigSection));
    }
    return { inject, apply };
  },
});
