window.__ModuleLoader__.load({
  id: "@veewo/dsh-claw-kit",
  factory: (require) => {
    const React = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");
    const inject = ["slots", "connection"];
    const EFFORTS = [
      ["minimal", "极低", "请求极低档推理投入，不等于关闭推理；仅在整理模型支持时采用。"],
      ["low", "较低", "请求较低档推理投入；仅在整理模型支持时采用。"],
      ["medium", "中等", "请求中等档推理投入，这是项目初始默认值；仅在整理模型支持时采用。"],
      ["high", "较高", "请求较高档推理投入，可能增加耗时与用量；仅在整理模型支持时采用。"],
      ["xhigh", "极高", "请求极高档推理投入，可能增加耗时与用量；仅在整理模型支持时采用。"],
    ];
    const SECTIONS = [
      { title: "计划与执行", description: "设置新计划的起步方式、目标自动推进和归档保留规则。", rows: [
        ["planning", "新计划先做规划", "boolean", "使用默认模板新建计划时，是否先澄清需求、拆分任务。显式指定的工作流模板仍按自身流程执行，不受此开关影响。", "默认计划先进入讨论阶段，使用规划技能明确需求和任务，再开始执行。", "默认计划直接进入执行阶段，将原始请求作为一个任务项；不再自动添加前置规划步骤。"],
        ["autoUpdate", "claw-kit 版本更新偏好", "boolean", "保留给版本更新引导的偏好，不是项目文档更新开关。当前 DSH 只提示可用新版本，安装仍需你明确要求。", "记录允许自动更新的偏好；当前 DSH 仍只提示新版本，不会据此自动安装。", "记录不自动更新的偏好；当前 DSH 仍可提示新版本，由你决定是否安装。"],
        ["goalMode", "按计划目标自动推进", "boolean", "在支持的宿主中，将计划目标同步为 Goal，让助手在需要时自动继续执行；不改变计划本身的目标和任务。", "执行计划时同步宿主 Goal，允许宿主按目标继续推进；实际续跑由宿主控制。", "不为计划启用宿主 Goal 自动推进；计划与任务管理仍可正常使用。"],
        ["maxTasksToKeep", "归档任务保留上限", "number", "最多保留多少个已归档的任务目录，默认 9 个，最少 1 个。超限时清理最旧归档及其中的报告，不是限制计划内的任务项数量。"],
        ["contextPaths", "上下文参考路径（预留）", "list", "记录项目的补充上下文路径，每行一条。当前 DSH 不会据此自动读取文件，也不会将这些路径加入知识检索范围。"],
        ["gitnexus", "GitNexus 代码图谱集成", "boolean", "提供代码图谱检索提示，并在计划收尾时安排索引刷新。刷新时若缺少 GitNexus，会尝试安装和初始化；不开启也能使用 claw-kit。", "启用图谱检索提示和收尾索引刷新；缺少工具时会尝试安装及初始化 GitNexus。", "不由 claw-kit 安排 GitNexus 索引刷新；不会卸载工具或删除已有图谱。"],
      ] },
      { title: "知识整理助手", description: "设置计划结束后整理项目事实（Truth）与架构决策（ADR）的助手。以下为项目通用偏好，计划模板或宿主专属设置可以覆盖。", rows: [
        ["knowledgeWriter.model", "知识整理模型", "text", "只影响知识整理助手，不切换当前会话模型。DSH 使用当前服务商下可用的模型 ID；选择“由宿主选择模型”时按宿主默认策略选模。偏好无法采用时仍会继续整理。"],
        ["knowledgeWriter.reasoningEffort", "知识整理推理深度", "effort", "请求知识整理模型投入多少推理。不影响当前会话；模型不支持所选档位时，由宿主采用可用设置。"],
      ] },
      { title: "知识检索与文档同步", description: "检索已沉淀的项目知识，并按需同步已有文档；与上方的模型设置分开控制。", rows: [
        ["memory.enabled", "项目记忆总开关", "boolean", "控制 claw search 文档检索、向量索引维护和外部文档自动同步。关闭不会删除已有文档，也不会关闭 Truth/ADR 知识整理；语义检索还需单独启用 embedding。", "允许检索项目知识并维护已启用的向量索引；外部文档同步还需开启下方开关并配置路径。", "关闭 claw search、向量索引维护及外部文档自动同步；保留已有文档，Truth/ADR 知识整理仍独立运行。"],
        ["memory.autoUpdate", "自动同步已有文档", "boolean", "知识整理后，根据最新 Truth/ADR 更新下方路径中受影响的已有文档。需开启项目记忆且路径非空；不会新建文档，也不控制 claw-kit 版本更新。", "知识整理后，按需同步指定范围内的已有文档；没有配置路径时不执行。", "不自动同步外部文档；这些文档仍可用于检索，Truth/ADR 知识整理不受此开关影响。"],
        ["memory.externalDocPaths", "外部文档范围", "list", "将 Truth/ADR 之外的文档文件或目录加入 claw search 检索范围，同时作为自动同步文档的范围。每行一条，相对路径以项目根目录为基准；空列表表示不添加外部文档。"],
      ] },
    ];
    const ALL_ROWS = SECTIONS.flatMap((section) => section.rows.map(([key, label, kind, description, enabled, disabled]) => ({ key, label, kind, description, enabled, disabled, section: section.title })));
    const LAYERS = { team: "团队设置", personal: "个人设置" };
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
      .claw-settings .claw-row-title { display: grid; gap: 2px; min-width: 0; }
      .claw-settings .claw-row-label { font-weight: 600; }
      .claw-settings .claw-key { font-size: 12px; opacity: .66; overflow-wrap: anywhere; }
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
        WORKSPACE_NOT_REGISTERED: "该项目已从 DSH 工作区移除，请刷新项目列表。",
        PROJECT_ROOT_NOT_FOUND: "该工作区尚未初始化为 claw-kit 项目，请先完成初始化再刷新。",
        PROJECT_CONFIG_CONFLICT: "设置已被其他操作修改，本次未保存。若有编辑草稿，请先记下内容再刷新；刷新会丢弃草稿。",
        PROJECT_CONFIG_INVALID: "设置值未通过校验，请检查填写内容。",
        PROJECT_CONFIG_RESPONSE_INVALID: "命令已执行，但无法确认返回结果。请先刷新核实是否已保存，不要直接重复提交。",
        PROJECT_CONFIG_KEY_INVALID: "此设置项暂不支持编辑。",
      };
      return (messages[error?.code] || (/[\u4e00-\u9fff]/.test(error?.message || "") ? error.message : "操作未完成，请刷新后重试。")) + (error?.code ? "（错误码：" + error.code + "）" : "");
    }

    function display(row, value, present) {
      if (!present) return "未设置";
      if (value === null) return "由宿主选择模型";
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
        setStatus({ text: "正在读取项目设置…" });
        try {
          const snapshots = await Promise.all(ALL_ROWS.map(async (definition) => {
            const [team, personal] = await Promise.all(["team", "personal"].map((layer) => invoke("get", { workspaceId: id, layer, key: definition.key })));
            return { ...definition, team, personal };
          }));
          if (requestId !== request.current) return false;
          setRows(snapshots);
          setStatus({ text: "设置已加载。数值仅供查看，请使用对应的编辑按钮；设置个人值后才会替代团队值。" });
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
        const target = unset ? { layer: "personal", revision: row.personal.revision } : editing;
        if (!target || mutation.current) return;
        mutation.current = true; setSaving(true);
        try {
          const payload = { workspaceId, layer: target.layer, key: row.key, revision: target.revision };
          if (!unset) payload.value = parse(row);
          await invoke(unset ? "unset" : "set", payload);
          if (!unset || (editing?.key === row.key && editing.layer === "personal")) setEditing(undefined);
          if (await loadRows(workspaceId)) setStatus({ text: unset ? "已移除这项个人设置，恢复使用团队值。" : "设置已保存。" });
        } catch (error) {
          // Preserve the draft and revision. Never replay a write or silently
          // turn a conflict into an overwrite with a newly fetched revision.
          if (unset) setStatus({ text: errorText(error), error: true });
          else setEditing({ ...editing, error: errorText(error) });
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
        if (editing.nullValue) help = "保存 null，由宿主按默认策略选择模型。在个人设置中，这会替代团队指定的模型，并非跟随团队；“恢复团队值”才会移除已保存的个人值。";
        else if (row.kind === "boolean") help = editing.draft === "true" ? row.enabled : row.disabled;
        else if (row.kind === "effort") help = EFFORTS.find(([value]) => value === editing.draft)?.[2] || row.description;
        return jsxs("div", { className: "claw-editor", children: [
          jsxs("div", { children: [jsx("strong", { children: `编辑` + LAYERS[editing.layer] }), jsx("p", { className: "claw-muted", children: editing.layer === "team" ? "修改项目共享值。共享此配置且未设置个人值的成员会使用新值。" : "仅对你在此项目中的使用生效，不修改团队值。路径列表会整体替换团队列表，不会追加。" })] }),
          jsx("label", { htmlFor: "claw-config-value", children: row.label }), control(row),
          row.kind === "text" && jsxs("label", { className: "claw-checkbox", children: [jsx("input", { type: "checkbox", checked: editing.nullValue, disabled: saving, onChange: (event) => setEditing({ ...editing, nullValue: event.target.checked, error: "" }) }), "由宿主选择模型（保存 null）"] }),
          jsx("p", { id: "claw-config-help", className: "claw-help", role: "status", children: help }),
          editing.error && jsx("p", { className: "claw-error", role: "alert", children: editing.error }),
          jsxs("div", { className: "claw-actions", children: [
            jsx("button", { type: "button", className: "claw-primary", disabled: saving, onClick: () => void save(row), children: saving ? "正在保存…" : "保存修改" }),
            jsx("button", { type: "button", disabled: saving, onClick: () => setEditing(undefined), children: "取消" }),
          ] }),
        ] });
      };
      const renderRow = (row) => jsxs("div", { className: "claw-row", children: [
        jsxs("div", { className: "claw-row-heading", children: [jsxs("div", { className: "claw-row-title", children: [jsx("span", { className: "claw-row-label", children: row.label }), jsx("code", { className: "claw-key", children: row.key })] }), jsx("span", { className: "claw-muted", children: row.personal.present ? "当前使用个人值" : "当前使用团队值" })] }),
        jsx("p", { className: "claw-muted", children: row.description }),
        jsxs("div", { className: "claw-values", children: [
          ...["team", "personal"].map((layer) => jsxs("div", { className: "claw-value", children: [
            jsx("span", { className: "claw-muted", children: LAYERS[layer] }),
            jsx("div", { className: "claw-effective", children: layer === "personal" && !row.personal.present ? "使用团队值：" + display(row, row.personal.effectiveValue, row.personal.effectivePresent) : display(row, row[layer].value, row[layer].present) }),
            jsxs("div", { className: "claw-actions", children: [
              jsx("button", { type: "button", disabled: saving || loading, "aria-label": (layer === "team" ? "编辑团队值：" : row.personal.present ? "编辑个人值：" : "设置个人值：") + row.label, "aria-expanded": editing?.key === row.key && editing.layer === layer, onClick: () => beginEdit(row, layer), children: layer === "team" ? "编辑团队值" : row.personal.present ? "编辑个人值" : "设置个人值" }),
              layer === "personal" && row.personal.present && jsx("button", { type: "button", disabled: saving || loading, "aria-label": "恢复团队值：" + row.label, onClick: () => void save(row, true), children: "恢复团队值" }),
            ] }),
          ] }, layer)),
          jsxs("div", { className: "claw-value", children: [jsx("span", { className: "claw-muted", children: "合并后的项目值" }), jsx("div", { className: "claw-effective", children: display(row, row.personal.effectiveValue, row.personal.effectivePresent) })] }),
        ] }),
        editing?.key === row.key && editor(row),
      ] }, row.key);
      return jsxs("section", { className: "claw-settings", "aria-label": "Claw Kit 项目设置", "aria-busy": loading || saving, children: [
        jsx("style", { children: CSS }),
        jsxs("header", { children: [jsx("h2", { children: "Claw Kit 项目设置" }), jsx("p", { className: "claw-muted", children: "团队设置供项目成员共享。未设置个人值时使用团队值；个人设置只对你生效。“恢复团队值”会移除该项个人设置。" })] }),
        jsxs("div", { className: "claw-toolbar", children: [jsxs("label", { className: "claw-project", children: [jsx("span", { children: "选择项目" }), jsx("select", { "aria-label": "选择项目", value: workspaceId, disabled: !items.length || loading || saving, onChange: (event) => { const id = event.target.value; setWorkspaceId(id); setRows([]); setEditing(undefined); void loadRows(id); }, children: items.length ? items.map((item) => jsx("option", { value: item.workspaceId, children: item.title }, item.workspaceId)) : jsx("option", { value: "", children: "暂无可选项目" }) })] }), jsx("button", { type: "button", disabled: loading || saving, onClick: () => void loadProjects(), children: "重新加载设置" })] }),
        jsx("p", { className: "claw-status" + (status.error ? " claw-error" : ""), role: status.error ? "alert" : "status", children: status.text }),
        !rows.length && jsx("p", { className: "claw-empty", children: loading ? "正在读取设置，请稍候…" : "暂无可显示的设置，请检查项目状态后重新加载。" }),
        rows.length > 0 && SECTIONS.map((section) => jsxs("section", { className: "claw-section", "aria-label": section.title, children: [jsxs("div", { className: "claw-section-heading", children: [jsx("h3", { children: section.title }), jsx("p", { className: "claw-muted", children: section.description })] }), rows.filter((row) => row.section === section.title).map(renderRow)] }, section.title)),
        jsx("p", { className: "claw-muted", children: "团队设置保存在 .claw/project.json，个人设置保存在本机的 .claw/project-override.json。“合并后的项目值”不含计划模板或宿主专属覆盖。重新加载会丢弃未保存的草稿。" }),
      ] });
    }
    function apply(ctx) {
      const call = (endpoint, payload) => ctx.connection.rpc.call("/claw-project-config", endpoint, payload);
      ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "claw-kit", order: 40, label: () => "Claw Kit 设置", inject: () => ({ call }) }, ProjectConfigSection));
    }
    return { inject, apply };
  },
});
