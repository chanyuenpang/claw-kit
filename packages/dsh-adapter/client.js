window.__ModuleLoader__.load({
  id: "@veewo/dsh-claw-kit",
  factory: (require) => {
    const React = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");
    const inject = ["slots", "connection"];
    const EFFORTS = [
      ["minimal", "最低", "尽量减少推理，优先响应速度。"],
      ["low", "较低", "使用较少推理，适合简单的整理工作。"],
      ["medium", "中等", "兼顾推理深度和响应速度。"],
      ["high", "较高", "增加推理深度，可能需要更多时间。"],
      ["xhigh", "最高", "优先深入推理，耗时可能更长；是否支持取决于所选模型。"],
    ];
    const SECTIONS = [
      { title: "工作流程", description: "调整计划、目标推进和项目上下文。", rows: [
        ["planning", "计划引导", "boolean", "控制计划流程中的规划引导。", "启用后，计划流程会提供规划引导。", "关闭后，不再启用项目的规划引导。"],
        ["autoUpdate", "自动更新项目指引", "boolean", "控制项目指引的自动更新，与下方的记忆自动更新相互独立。", "允许自动更新项目指引。", "不自动更新项目指引。"],
        ["goalMode", "目标模式", "boolean", "控制工作流是否启用宿主的目标推进能力。", "允许通过目标模式持续推进计划，实际支持由宿主决定。", "不启用工作流的目标模式。"],
        ["maxTasksToKeep", "已完成任务保留数量", "number", "设置保留多少项已完成任务，至少保留 1 项。"],
        ["contextPaths", "补充上下文路径", "list", "添加项目上下文路径，每行填写一条；空列表表示不添加。"],
        ["gitnexus", "代码图谱辅助", "boolean", "控制是否启用 GitNexus 代码图谱辅助。", "启用 GitNexus 辅助；仍需环境提供对应能力。", "不启用 GitNexus 辅助。"],
      ] },
      { title: "知识整理", description: "设置计划结束后整理项目知识时的模型偏好。", rows: [
        ["knowledgeWriter.model", "整理模型", "text", "填写宿主可用的模型标识；这是尽力采用的偏好，不会阻塞知识整理。"],
        ["knowledgeWriter.reasoningEffort", "推理强度", "effort", "选择知识整理的推理投入；实际支持情况由宿主和模型决定。"],
      ] },
      { title: "项目记忆", description: "管理项目记忆与外部文档来源。", rows: [
        ["memory.enabled", "项目记忆", "boolean", "控制项目记忆功能。", "启用项目记忆功能。", "关闭项目记忆功能。"],
        ["memory.autoUpdate", "自动更新记忆", "boolean", "控制项目记忆的自动更新，不影响上方的项目指引设置。", "允许自动更新项目记忆。", "不自动更新项目记忆。"],
        ["memory.externalDocPaths", "外部文档路径", "list", "添加外部文档来源，每行填写一条；空列表表示不添加。"],
      ] },
    ];
    const ALL_ROWS = SECTIONS.flatMap((section) => section.rows.map(([key, label, kind, description, enabled, disabled]) => ({ key, label, kind, description, enabled, disabled, section: section.title })));
    const LAYERS = { team: "团队配置", personal: "个人覆盖" };
    const CSS = `
      .claw-settings { --claw-border: color-mix(in srgb, currentColor 16%, transparent); --claw-soft: color-mix(in srgb, currentColor 4%, transparent); --claw-accent: #4385e8; display: grid; gap: 20px; max-width: 1000px; margin: 0 auto; padding: 8px 4px 28px; font-size: 14px; line-height: 1.6; }
      .claw-settings * { box-sizing: border-box; }
      .claw-settings h2, .claw-settings h3, .claw-settings p { margin: 0; }
      .claw-settings h2 { font-size: 21px; font-weight: 650; }
      .claw-settings h3 { font-size: 15px; font-weight: 650; }
      .claw-settings .claw-muted { opacity: .66; font-size: 12px; }
      .claw-settings .claw-toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
      .claw-settings .claw-project { flex: 1 1 220px; display: grid; gap: 6px; }
      .claw-settings select, .claw-settings input:not([type=checkbox]), .claw-settings textarea { width: 100%; min-width: 0; padding: 9px 11px; border: 1px solid var(--claw-border); border-radius: 8px; background: var(--claw-soft); color: inherit; font: inherit; }
      .claw-settings option { background: Canvas; color: CanvasText; }
      .claw-settings textarea { resize: vertical; min-height: 100px; }
      .claw-settings button { font: inherit; color: inherit; cursor: pointer; border: 1px solid var(--claw-border); border-radius: 8px; padding: 8px 13px; background: transparent; }
      .claw-settings button:hover:not(:disabled) { background: var(--claw-soft); border-color: var(--claw-accent); }
      .claw-settings :is(button, select, input, textarea):focus-visible { outline: 2px solid var(--claw-accent); outline-offset: 2px; }
      .claw-settings :disabled { opacity: .5; cursor: not-allowed; }
      .claw-settings .claw-status { padding: 9px 12px; background: var(--claw-soft); border-radius: 8px; font-size: 12px; overflow-wrap: anywhere; }
      .claw-settings .claw-error { color: #d34949; }
      .claw-settings .claw-section { border: 1px solid var(--claw-border); border-radius: 12px; overflow: hidden; }
      .claw-settings .claw-section-heading { padding: 16px 18px; background: var(--claw-soft); display: grid; gap: 3px; }
      .claw-settings .claw-row { padding: 16px 18px; border-top: 1px solid var(--claw-border); display: grid; gap: 10px; }
      .claw-settings .claw-row-heading { display: flex; gap: 12px; justify-content: space-between; align-items: baseline; }
      .claw-settings .claw-row-label { font-weight: 600; }
      .claw-settings .claw-values { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); gap: 10px; }
      .claw-settings .claw-value { display: grid; align-content: start; gap: 4px; min-width: 0; }
      .claw-settings .claw-value button, .claw-settings .claw-effective { text-align: left; padding: 8px 10px; min-height: 40px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .claw-settings .claw-value button[aria-expanded=true] { border-color: var(--claw-accent); background: color-mix(in srgb, var(--claw-accent) 9%, transparent); }
      .claw-settings .claw-effective { border: 1px solid transparent; border-radius: 8px; background: var(--claw-soft); }
      .claw-settings .claw-editor { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--claw-border); border-left: 3px solid var(--claw-accent); border-radius: 8px; }
      .claw-settings .claw-help { font-size: 13px; padding: 10px 12px; border-radius: 6px; background: var(--claw-soft); }
      .claw-settings .claw-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .claw-settings .claw-primary { background: var(--claw-accent); border-color: var(--claw-accent); color: #fff; }
      .claw-settings .claw-actions .claw-primary:hover:not(:disabled) { background: #3474d1; }
      .claw-settings .claw-checkbox { display: flex; gap: 8px; align-items: center; font-size: 13px; }
      .claw-settings .claw-empty { text-align: center; padding: 28px 16px; opacity: .7; }
      @media (max-width: 600px) { .claw-settings .claw-row, .claw-settings .claw-section-heading { padding: 14px; } .claw-settings .claw-row-heading { flex-wrap: wrap; gap: 2px; } }
    `;

    function errorText(error) {
      const messages = {
        WORKSPACE_NOT_REGISTERED: "项目已不在工作区列表中，请刷新项目。",
        PROJECT_ROOT_NOT_FOUND: "该工作区尚未初始化为项目，请先初始化后再刷新。",
        PROJECT_CONFIG_CONFLICT: "配置已在其他位置修改。请刷新后重新编辑，当前草稿尚未保存。",
        PROJECT_CONFIG_INVALID: "配置内容不符合要求，请检查填写的值。",
        PROJECT_CONFIG_RESPONSE_INVALID: "命令已执行，但返回结果无法解析。请刷新确认当前值，不要直接重复保存。",
        PROJECT_CONFIG_KEY_INVALID: "该配置项不受支持。",
      };
      return (messages[error?.code] || (/[\u4e00-\u9fff]/.test(error?.message || "") ? error.message : "操作未完成，请刷新后重试。")) + (error?.code ? "（错误码：" + error.code + "）" : "");
    }

    function display(row, value, present) {
      if (!present) return "未设置";
      if (value === null) return "宿主默认";
      if (row.kind === "boolean") return value ? "已启用" : "已关闭";
      if (row.kind === "effort") return EFFORTS.find(([key]) => key === value)?.[1] || "未识别的强度";
      if (Array.isArray(value)) return value.length ? value.join("\n") : "无";
      return value === "" ? "空值" : String(value);
    }

    function ProjectConfigSection({ call }) {
      const [items, setItems] = React.useState([]);
      const [workspaceId, setWorkspaceId] = React.useState("");
      const [rows, setRows] = React.useState([]);
      const [editing, setEditing] = React.useState();
      const [status, setStatus] = React.useState({ text: "正在加载项目…" });
      const [loading, setLoading] = React.useState(true);
      const [saving, setSaving] = React.useState(false);
      const request = React.useRef(0), mutation = React.useRef(false);
      const invoke = async (endpoint, payload) => {
        const result = await call(endpoint, payload);
        if (!result || result.ok !== true) throw Object.assign(new Error(result?.error?.message || "请求失败。"), result?.error);
        return result.value;
      };
      const loadRows = async (id) => {
        if (!id) return false;
        const requestId = ++request.current;
        setLoading(true);
        setStatus({ text: "正在加载项目配置…" });
        try {
          const snapshots = await Promise.all(ALL_ROWS.map(async (definition) => {
            const [team, personal] = await Promise.all(["team", "personal"].map((layer) => invoke("get", { workspaceId: id, layer, key: definition.key })));
            return { ...definition, team, personal };
          }));
          if (requestId !== request.current) return false;
          setRows(snapshots);
          setStatus({ text: "配置已加载。点击团队配置或个人覆盖的值即可编辑。" });
          return true;
        } catch (error) {
          if (requestId === request.current) { setRows([]); setStatus({ text: errorText(error), error: true }); }
          return false;
        } finally {
          if (requestId === request.current) setLoading(false);
        }
      };
      const loadProjects = async () => {
        setLoading(true);
        setStatus({ text: "正在加载项目…" });
        try {
          const listed = await invoke("list", {}), next = Array.isArray(listed?.items) ? listed.items : [];
          const id = next.some((item) => item.workspaceId === workspaceId) ? workspaceId : next[0]?.workspaceId || "";
          setItems(next); setWorkspaceId(id); setEditing(undefined);
          if (id) await loadRows(id);
          else { setRows([]); setStatus({ text: "暂无已登记的工作区，请先添加项目。" }); }
        } catch (error) { setStatus({ text: errorText(error), error: true }); }
        finally { setLoading(false); }
      };
      React.useEffect(() => { void loadProjects(); return () => { request.current++; }; }, []);
      const beginEdit = (row, layer) => {
        const snapshot = row[layer], value = snapshot.present ? snapshot.value : row.personal.effectiveValue;
        const draft = row.kind === "list" ? (Array.isArray(value) ? value.join("\n") : "") : value == null ? (row.kind === "boolean" ? "false" : row.kind === "effort" ? "medium" : "") : String(value);
        setEditing({ key: row.key, layer, draft, nullValue: value === null, revision: snapshot.revision, error: "" });
      };
      const parse = (row) => {
        if (editing.nullValue) return null;
        if (row.kind === "boolean") return editing.draft === "true";
        if (row.kind === "number") {
          const value = Number(editing.draft);
          if (!Number.isInteger(value) || value < 1) throw new Error("请输入不小于 1 的整数。");
          return value;
        }
        if (row.kind === "list") return editing.draft.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
        return editing.draft;
      };
      const save = async (row, unset = false) => {
        if (!editing || mutation.current) return;
        mutation.current = true; setSaving(true);
        try {
          const payload = { workspaceId, layer: editing.layer, key: row.key, revision: editing.revision };
          if (!unset) payload.value = parse(row);
          await invoke(unset ? "unset" : "set", payload);
          setEditing(undefined);
          if (await loadRows(workspaceId)) setStatus({ text: unset ? "已恢复继承团队配置。" : "配置已保存。" });
        } catch (error) {
          // Preserve the draft and revision. Never replay a write or silently
          // turn a conflict into an overwrite with a newly fetched revision.
          setEditing({ ...editing, error: errorText(error) });
        } finally { mutation.current = false; setSaving(false); }
      };
      const control = (row) => {
        const props = { id: "claw-config-value", value: editing.draft, disabled: saving || editing.nullValue, "aria-describedby": "claw-config-help", onChange: (event) => setEditing({ ...editing, draft: event.target.value, error: "" }) };
        if (row.kind === "boolean") return jsxs("select", { ...props, children: [jsx("option", { value: "true", children: "启用" }), jsx("option", { value: "false", children: "关闭" })] });
        if (row.kind === "effort") return jsx("select", { ...props, children: EFFORTS.map(([value, label]) => jsx("option", { value, children: label }, value)) });
        return jsx(row.kind === "list" ? "textarea" : "input", { ...props, rows: row.kind === "list" ? 3 : undefined, type: row.kind === "number" ? "number" : "text", min: row.kind === "number" ? 1 : undefined, step: row.kind === "number" ? 1 : undefined, placeholder: row.kind === "list" ? "每行填写一条路径" : row.kind === "text" ? "输入模型标识" : "输入保留数量" });
      };
      const editor = (row) => {
        let help = row.description;
        if (editing.nullValue) help = "使用宿主默认偏好。显式默认值仍会覆盖团队设置；如需跟随团队，请选择恢复继承。";
        else if (row.kind === "boolean") help = editing.draft === "true" ? row.enabled : row.disabled;
        else if (row.kind === "effort") help = EFFORTS.find(([value]) => value === editing.draft)?.[2] || row.description;
        return jsxs("div", { className: "claw-editor", children: [
          jsxs("div", { children: [jsx("strong", { children: `编辑` + LAYERS[editing.layer] }), jsx("p", { className: "claw-muted", children: editing.layer === "team" ? "影响使用团队配置的成员；已有个人覆盖的值不受影响。" : "仅修改当前项目的个人偏好，不改动团队配置。" })] }),
          jsx("label", { htmlFor: "claw-config-value", children: row.label }), control(row),
          row.kind === "text" && jsxs("label", { className: "claw-checkbox", children: [jsx("input", { type: "checkbox", checked: editing.nullValue, disabled: saving, onChange: (event) => setEditing({ ...editing, nullValue: event.target.checked, error: "" }) }), "使用宿主默认"] }),
          jsx("p", { id: "claw-config-help", className: "claw-help", role: "status", children: help }),
          editing.error && jsx("p", { className: "claw-error", role: "alert", children: editing.error }),
          jsxs("div", { className: "claw-actions", children: [
            jsx("button", { type: "button", className: "claw-primary", disabled: saving, onClick: () => void save(row), children: saving ? "正在保存…" : "保存修改" }),
            jsx("button", { type: "button", disabled: saving, onClick: () => setEditing(undefined), children: "取消" }),
            editing.layer === "personal" && row.personal.present && jsx("button", { type: "button", disabled: saving, onClick: () => void save(row, true), children: "恢复继承" }),
          ] }),
        ] });
      };
      const renderRow = (row) => jsxs("div", { className: "claw-row", children: [
        jsxs("div", { className: "claw-row-heading", children: [jsx("span", { className: "claw-row-label", children: row.label }), jsx("span", { className: "claw-muted", children: row.personal.present ? "个人配置优先" : "跟随团队配置" })] }),
        jsx("p", { className: "claw-muted", children: row.description }),
        jsxs("div", { className: "claw-values", children: [
          ...["team", "personal"].map((layer) => jsxs("div", { className: "claw-value", children: [
            jsx("span", { className: "claw-muted", children: LAYERS[layer] }),
            jsx("button", { type: "button", disabled: saving || loading, "aria-label": `编辑` + row.label + "的" + LAYERS[layer], "aria-expanded": editing?.key === row.key && editing.layer === layer, onClick: () => beginEdit(row, layer), children: layer === "personal" && !row.personal.present ? "继承团队配置" : display(row, row[layer].value, row[layer].present) }),
          ] }, layer)),
          jsxs("div", { className: "claw-value", children: [jsx("span", { className: "claw-muted", children: "当前生效" }), jsx("div", { className: "claw-effective", children: display(row, row.personal.effectiveValue, row.personal.effectivePresent) })] }),
        ] }),
        editing?.key === row.key && editor(row),
      ] }, row.key);
      return jsxs("section", { className: "claw-settings", "aria-label": "项目工作流设置", "aria-busy": loading || saving, children: [
        jsx("style", { children: CSS }),
        jsxs("header", { children: [jsx("h2", { children: "项目工作流设置" }), jsx("p", { className: "claw-muted", children: "团队配置作为基础，个人覆盖优先。选择配置值后可查看说明并编辑。" })] }),
        jsxs("div", { className: "claw-toolbar", children: [jsxs("label", { className: "claw-project", children: [jsx("span", { children: "选择项目" }), jsx("select", { "aria-label": "选择项目", value: workspaceId, disabled: !items.length || loading || saving, onChange: (event) => { const id = event.target.value; setWorkspaceId(id); setRows([]); setEditing(undefined); void loadRows(id); }, children: items.length ? items.map((item) => jsx("option", { value: item.workspaceId, children: item.title }, item.workspaceId)) : jsx("option", { value: "", children: "暂无可选项目" }) })] }), jsx("button", { type: "button", disabled: loading || saving, onClick: () => void loadProjects(), children: "刷新配置" })] }),
        jsx("p", { className: "claw-status" + (status.error ? " claw-error" : ""), role: status.error ? "alert" : "status", children: status.text }),
        !rows.length && jsx("p", { className: "claw-empty", children: loading ? "正在读取配置，请稍候…" : "暂无可显示的配置，请检查项目状态后刷新。" }),
        rows.length > 0 && SECTIONS.map((section) => jsxs("section", { className: "claw-section", "aria-label": section.title, children: [jsxs("div", { className: "claw-section-heading", children: [jsx("h3", { children: section.title }), jsx("p", { className: "claw-muted", children: section.description })] }), rows.filter((row) => row.section === section.title).map(renderRow)] }, section.title)),
        jsx("p", { className: "claw-muted", children: "团队设置保存在 .claw/project.json，个人设置保存在 .claw/project-override.json。刷新会放弃尚未保存的草稿。" }),
      ] });
    }
    function apply(ctx) {
      const call = (endpoint, payload) => ctx.connection.rpc.call("/claw-project-config", endpoint, payload);
      ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "claw-kit", order: 40, label: () => "Claw Kit 设置", inject: () => ({ call }) }, ProjectConfigSection));
    }
    return { inject, apply };
  },
});
