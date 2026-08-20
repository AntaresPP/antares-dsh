# antares-dsh 实现文档（v1 完整版）

- 版本：0.1.0
- 上游参照：https://github.com/alvinunreal/oh-my-opencode-slim
- 评审与裁定：`my-dsh/docs/oh-my-opencode-slim-to-dsh.md`（已敲定版）
- 目标：在 dsh 上实现 **Orchestrator + 6 专家 + Council 轻量版 + 8 技能 + 3 命令 + 2 个 ast-grep 工具**，其余一律不做。

---

## 1. 范围与关键约束

**必须实现：**

| 类别 | 内容 |
|---|---|
| Agent | 主会话 = Orchestrator；`explorer` / `oracle` / `librarian` / `designer` / `fixer` / `council` / `councillor-alpha` / `councillor-beta` 共 8 个 tool-subagent 实例 |
| Skills | `codemap`、`deepwork`、`verification-planning`、`simplify`、`worktrees`、`clonedeps`、`reflect`、`antares-dsh`（原 oh-my-opencode-slim） |
| Commands | `/deepwork <task>`、`/reflect [focus] [--sessions] [--last N]`、`/loop <goal/success/maxAttempts>` |
| Tools | `ast_grep_search`、`ast_grep_replace` |

**关键约束（决定实现方式）：**

1. **宿主插件不 import 任何 `@deepseek-ai/*` 包**。实测社区 profile 的 node_modules 中没有这些包（官方 npm 版本落后且宿主包由 dsh 私有管理）。所有集成通过 Cordis 服务对象完成：
   - `ctx.commands.register(definition)`：注册命令
   - `ctx.tools.register(definition)`：注册工具
   - `invocation.agent.followup(userMessageObject)`：命令投递新回合
   - 类型只依赖 JS 运行时行为，不依赖 TS 类型导入。
2. **工具用原生 JSON Schema 注册**，不用 `@deepseek-ai/dsh-tools` 的 `defineTool`。`ToolDefinition.parameters` 本身就是 JSON Schema `Record<string, unknown>`，`output.schema` 也是 JSON Schema；入参校验在 `execute()` 内自己做，抛 `Error` 即成为 errored tool result。
3. **不做配置平台**。模型/agent 配置全部是 `agent-presets/antares-dsh/agent.cordis.yml` 里的静态 YAML；不改代码即可编辑。v1 不给 runtime 热切换、schema、Settings 页、CLI。
4. **preset 同步只做 first-install**。目标目录存在则永不覆盖，保护用户手工修改。
5. **路径约定**：运行态状态统一放项目内 `.dsh/antares-dsh/`（deepwork/loop/reflect 各自子目录）。
6. **包名**：`antares-dsh`；preset id 同名。

---

## 2. 架构

```text
dsh profile (base bundles)
├── host plane: antares-dsh 宿主插件
│   ├── preset-sync.js       首次复制 agent-presets/antares-dsh → ~/.dsh/.agent-presets
│   ├── commands.js          /deepwork /reflect /loop
│   └── ast-grep.js          ast_grep_search / ast_grep_replace（懒加载 sg 二进制）
└── agent plane: antares-dsh preset（每会话加入）
    ├── persona               Orchestrator 主提示词（翻译自 slim orchestrator.ts）
    ├── 官方工具行            fs/search/jobs/plan/compaction/subagent/web/skill/todo/ask
    ├── 8 个 tool-subagent   explorer/oracle/... 每人一个 toolName+persona+toolFilter
    └── preset-scoped skills 8 个 SKILL.md
```

数据流：

```text
用户 /deepwork <task>
  → ctx.commands handler
  → agent.followup(deepwork 激活提示词)
  → Orchestrator 读激活提示词 + 加载 deepwork skill
  → 调用 explorer/fixer/oracle 等 subagent 工具（continuable，默认后台）
  → 子代理完成 → dsh runtime 注入 settle 通知
  → Orchestrator 用 job_output/list_agents 收口 → reconcile → 验证 → 回复
```

---

## 3. 文件布局（最终版）

```text
antares-dsh/
├── package.json
├── cordis.patch.yml
├── LICENSE
├── README.md
├── docs/implementation.md
├── lib/
│   ├── index.js             宿主入口：sync + commands + ast-grep 注册
│   ├── preset-sync.js       first-install 同步
│   ├── commands.js          /deepwork /reflect /loop + 激活提示词
│   ├── ast-grep.js          工具定义 + 执行 + 输出渲染 + UI card
│   └── ast-grep-bin.js      sg 二进制解析/懒下载/缓存
├── agent-presets/antares-dsh/
│   ├── agent.cordis.yml     主组合：persona + 官方工具 + 8 个 subagent 工具 + skills
│   ├── preset.yml
│   └── skills/
│       ├── codemap/SKILL.md
│       ├── deepwork/SKILL.md
│       ├── verification-planning/SKILL.md
│       ├── simplify/SKILL.md
│       ├── worktrees/SKILL.md
│       ├── clonedeps/SKILL.md
│       ├── reflect/SKILL.md
│       └── antares-dsh/SKILL.md
└── tests/
    ├── preset-sync.test.mjs
    ├── commands.test.mjs
    ├── ast-grep.test.mjs
    └── agent-preset.test.mjs
```

`package.json` 要点：

```json
{
  "name": "antares-dsh",
  "type": "module",
  "main": "lib/index.js",
  "files": ["lib", "agent-presets", "cordis.patch.yml", "README.md", "LICENSE"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {},
  "scripts": { "test": "node --test" }
}
```

`cordis.patch.yml`：单行 `insert { id: antares-dsh, name: antares-dsh }`，与 Phase 0 一致。

---

## 4. Preset 组合（agent.cordis.yml）

### 4.1 行清单

| id | package | 作用 | 备注 |
|---|---|---|---|
| persona | `@deepseek-ai/dsh-persona` | Orchestrator 主提示词 | `complete: true`，正文为 §6 的调度提示词 |
| tool-bash / tool-pwsh | `@deepseek-ai/dsh-tool-bash` / `dsh-tool-pwsh` | 平台 shell | 按 `process.platform` 禁用另一侧 |
| tool-fs | `@deepseek-ai/dsh-tool-fs` | `read` / `write` / `edit` | — |
| tool-fs-search | `@deepseek-ai/dsh-tool-fs-search` | `glob` / `grep` | `sampleOverCapGlobResults: false` |
| tool-jobs | `@deepseek-ai/dsh-tool-jobs` | `job_output` / `job_list` / `job_kill` + 完成通知 | task_* 官方替代 |
| plan-mode | `@deepseek-ai/dsh-plan-mode` | `exit_plan_mode` 计划审批 | deepwork/工程化需要 |
| compaction | `dsh-compaction-basic` + `dsh-command-compact` + `dsh-compaction-tool-result-pruner` | 官方压缩 | 沿用官方默认 |
| delegation 组 | `dsh-tool-subagent-control` + `/list-agents` | `send_message` / `interrupt_agent` / `list_agents` | 相当于 task_message/cancel/status |
| delegation 组 | `dsh-tool-subagent` × 8 | 专家工具实例 | 见 §5 矩阵 |
| tool-ask-user | `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question` | wait_for_user 替代 |
| tool-todo | `@deepseek-ai/dsh-tool-todo` | `todo_write` | `allowParallelInProgress: true` |
| tool-web | `@deepseek-ai/dsh-tool-web` | `web_search` / `web_fetch` | `fetch: true`，给 Librarian 和主 Agent 用 |
| tool-session-query（可选，不默认挂载） | `@deepseek-ai/dsh-tool-session-query` | `session_search` 等 5 个只读工具 | 实测当前 dsh 发行版未打包该插件；默认 preset 不含此行。部署有该包时，用户可手工加一行，`/reflect --sessions` 会自动利用；没有则命令和 skill 明确降级到当前会话/项目产物 |
| skill-filesystem | `@deepseek-ai/dsh-skill-filesystem` | 把 `skills/` 挂为 preset 层技能目录 | `customSkillDirs` 指向 `new URL('skills/', baseUrl)` |
| tool-skill | `@deepseek-ai/dsh-tool-skill` | `skill` 工具 + 技能目录提示 | — |

宿主插件注册的工具（global 层，preset toolFilter 决定可见性）：`ast_grep_search`、`ast_grep_replace`。
宿主插件注册的命令（global 层）：`/deepwork`、`/reflect`、`/loop`。

### 4.2 平台相关的 toolFilter

写操作子代理（designer/fixer）的 shell 工具名在 Windows 是 `pwsh`，其他平台是 `bash`。`toolFilter` 的 allow 列表用 `!!js` 表达式按平台求值：

```yaml
toolFilter:
  allow: !!js "process.platform === 'win32'
    ? ['read','write','edit','glob','grep','ast_grep_search','ast_grep_replace','pwsh','ask_user_question']
    : ['read','write','edit','glob','grep','ast_grep_search','ast_grep_replace','bash','ask_user_question']"
```

原因：`tools.restrict()` 会对 allow 里的未知全局工具名抛错；某平台被 `disabled` 的 shell 工具不在全局目录中，因此不能同时写两个名字。

---

## 5. 专家工具矩阵

所有专家都是 `@deepseek-ai/dsh-tool-subagent` 实例：`provider: spawn`、`backgroundMode: continuable`（省略 `run_in_background` 默认后台）、每个实例一个 `toolName`。v1 不写 `agentOptions`，子代理继承主会话的 provider/model；需要分模型时在 preset 对应行加：

```yaml
agentOptions:
  provider: <provider>
  model: <provider/model>
```

| toolName | 角色 | persona 要点 | toolFilter allow（platform 通用） | 说明 |
|---|---|---|---|---|
| `explorer` | 代码库侦察 | 只读；返回压缩地图：路径+行号+一句说明；不写文件、不派子代理 | `read` `glob` `grep` `ast_grep_search` `ask_user_question` | slim explorer 翻译版 |
| `oracle` | 架构/评审/疑难调试 | 只读顾问；高风险决策、评审、simplify；不实现代码 | `read` `glob` `grep` `ast_grep_search` `skill` `ask_user_question` | 只有它可见 `skill`；persona 约束只用 `simplify` |
| `librarian` | 外部知识检索 | 用 `web_search`/`web_fetch` 查官方文档与版本化 API；只返回引用与结论 | `read` `glob` `grep` `ast_grep_search` `web_search` `web_fetch` `ask_user_question` | 替代 slim 的 context7/gh_grep |
| `designer` | UI/UX 实现 | 设计原则 + 可写；不做后端；复制文案交给主 Agent | `read` `write` `edit` `glob` `grep` `ast_grep_search` `ast_grep_replace` + 平台 shell + `ask_user_question` | slim designer 翻译版 |
| `fixer` | 有界实现工人 | 只执行明确规格；不研究、不派子代理；输出 summary/changes/verification | 同 designer | slim fixer 翻译版 |
| `council` | 多模型合成者 | 并行派发全部 councillor → 等 settle 通知 → 合成一份结论；**只允许调用 councillor 与收口工具** | `councillor-alpha` `councillor-beta` `job_output` `job_list` `list_agents` | 轻量版合成者 |
| `councillor-alpha` | 投票成员 A | 只读、独立判断、禁止追问和派发 | `read` `glob` `grep` `ast_grep_search` | 模型需用户按 §5 配置不同 provider/model |
| `councillor-beta` | 投票成员 B | 同上 | 同上 | 同上 |

**子代理继承规则**：in-process 子代理默认 `composeFrom` 父 preset，再叠加各自 `persona`/`toolFilter`。因此上述 allow 列表就是硬权限：未列出的 `write`/`bash`/`subagent` 不会出现在对应子代理的工具目录中。

**Council 轻量版边界（与评审文档一致）**：固定 2 个 councillor；不做动态生成、fallback chain、runtime preset。默认 councillor 继承主模型；用户在 preset 里给 `councillor-alpha/beta` 加 `agentOptions` 即可获得多模型多样性。

---

## 6. Orchestrator 主提示词规格（persona text）

翻译自 slim `src/agents/orchestrator.ts`，做如下等价替换：

| slim | antares-dsh |
|---|---|
| `@explorer` / `@oracle` / … | `explorer` / `oracle` / … 工具名 |
| `task(..., background: true)` | 对应专家工具调用（continuable，默认后台） |
| hook-driven completion | 子代理 settle 通知（运行时会自动注入） |
| `task_status` / `task_result` | `list_agents` / `job_output`（continuable 无 result 等价物） |
| `task_message` / `task_cancel` / `task_revive` | `send_message` / `interrupt_agent` / `send_message` |
| `question` | `ask_user_question` |
| OpenCode todo | `todo_write` |

**必须包含的段落：**

1. **身份**：你是 Antares，DSH 编码团队的调度者；理解 → 建依赖图 → 并行派发 → 跟踪 → reconcile → 验证。
2. **每个专家的 routing 块**（含 Delegate when / Don't delegate when / 规则，移植 slim 的 AGENT_DESCRIPTIONS）。
3. **后台调度规则**：
   - 独立工作并行派发，默认后台（continuable）；
   - 记录每个子代理 id；不要 busy-poll，完成通知会自动到达；
   - 依赖工作等 settle 通知后再继续；最终答复前用 `job_output`/`list_agents` 收口；
   - `send_message` 排队消息不打断当前生成；`interrupt_agent` 只停当前轮，队列保留；
   - continuable 子代理没有 `task_result`：最终文本在 settle 通知里，详细过程读子会话。
4. **写所有权**：同一文件/子系统同一时刻只允许一个写者；Designer 与 Fixer 不重叠；评审任务不与写任务重叠。
5. **直接工作边界**：小改动可直接做；需要发现/研究/多文件实现/设计判断时委派；**UI 工作永远交给 designer**。
6. **验证**：按风险成比例；oracle 评审是条件性升级而非默认步骤；最终回复前必须有 final-state 证据。
7. **输出风格**：简洁的进度短句（如 “Checking auth flow via explorer…”），不做冗长计划叙述。
8. **Council 用法**：关键权衡时才用；默认手动 `@council` 语义 → 对模型来说就是调用 `council` 工具；提醒其成本高。

---

## 7. 三个命令的规格

宿主插件 `export const inject = ['commands', 'tools']`（Cordis 注入服务）。

统一 handler 模式（不 import `createUserMessage`，直接构造 UserMessage 对象）：

```js
function followup(agent, text) {
  agent.followup({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'antares-dsh' },
  })
}
ctx.commands.register({
  name: 'deepwork',
  description: 'Start a deepwork session for a complex coding task',
  input: { hint: '<task>' },
  recordInput: true,
  handler(invocation) {
    if (!invocation.rawInput.trim()) return { kind: 'error', text: '…usage…' }
    followup(invocation.agent, DEEPWORK_PROMPT(invocation.rawInput))
    return { kind: 'success', text: 'deepwork started' }
  },
})
```

### 7.1 `/deepwork <task>`

激活提示词内容 = slim `src/hooks/deepwork/index.ts` 的 activationPrompt 翻译版：

- 强制：先检查/补齐 `.gitignore`（`.dsh/antares-dsh/deepwork/`）与 `.ignore`（`!.dsh/antares-dsh/deepwork/`、`!.dsh/antares-dsh/deepwork/**`）；
- 状态文件：`.dsh/antares-dsh/deepwork/<task-slug>.md`；
- 分阶段计划（按依赖与交付边界，不为了缩小评审而拆分）；
- 执行前向用户展示阶段顺序、专家归属、每阶段 oracle 评审闸与理由；
- 每阶段：派发 → 等 settle 通知 → reconcile → 验证 → 更新状态文件 → `oracle` 评审 → 才进下一阶段；
- 评审发现合并成一次有界修复，再验证；只在修复改变已评审决策/风险时复审；
- `todo_write` 与当前阶段同步。

### 7.2 `/reflect [focus] [--sessions] [--last N]`

- 基础模式：调用 reflect skill；扫描当前会话、项目笔记、`.dsh`、AGENTS.md、已安装 skills 与 preset 文件；
- `--sessions`：激活文本改为会话考古模式；若官方 `session_search`/`session_event_*` 工具可见则使用它们，不可见则明确降级到当前会话+项目产物（不得读原始 session 文件）；`--last` 只是给模型的预算建议；
- 输出要求：保守、证据驱动；允许“建议什么都不做”；改配置/技能/命令前必须询问。
- 不写任何 SQLite 读取代码。

### 7.3 `/loop <描述>`

激活提示词内容 = slim `src/hooks/loop-command/index.ts` 的 activationPrompt 翻译版：

- 从用户文本提取 `goal` / `successCriteria` / `maxAttempts`，缺任何一个先追问，不猜测；
- 历史目录：`.dsh/antares-dsh/loop-history/loop-<ts>-<rand>/`；
- 每轮：先读历史 → 派 `fixer` → 按 successCriteria 验证 → 写 `history-NNN.md`（PASS/FAIL + 原因）；
- PASS 停；FAIL 未到上限重试；到上限升级给用户；
- 兜底护栏：单次会话最多 maxAttempts（提示词明确），每轮必须先读历史，禁止无限循环。

---

## 8. Skills 规格

所有 SKILL.md 使用 DSH frontmatter（`name` 必填 kebab-case、`description` 必填；不写 `disable-model-invocation`）。正文统一遵守：

- 只引用 DSH 既有工具：`read` / `glob` / `grep` / `write` / `edit` / `bash`(或 `pwsh`) / `ask_user_question` / `todo_write` / `exit_plan_mode` / `skill` / `job_*` / `send_message` / `list_agents` / 专家工具名；
- 所有状态路径放在 `.dsh/antares-dsh/<skill>/`；
- 需要“评审/研究”时用 `oracle` / `librarian` 工具，不写裸模型请求；
- 需要循环/并行时用后台子代理 + settle 通知，不用轮询。

| skill | 内容要点 | 来源/适配 |
|---|---|---|
| `codemap` | 分层 codemap.md；每目录一图；首次 init / 之后按 diff 更新；只读工具；**无变更检测脚本**（用 `grep`/`glob` + git status 人工判断变更） | slim codemap SKILL.md 纯提示词化 |
| `deepwork` | §7.1 的完整工作流，作为可加载技能（`/deepwork` 只是入口） | slim deepwork SKILL.md |
| `verification-planning` | 变更前证据路径设计：claim/uncertainty/failure modes → 可控输入/状态迁移/边界/产物/不变量/可逆/可重复 → 选最窄证据；必要时向 `librarian` 调研 | slim verification-planning SKILL.md |
| `simplify` | 行为保持简化；范围受控、可评审；oracle 专用 | slim simplify SKILL.md |
| `worktrees` | `.dsh/antares-dsh/worktrees/<slug>` 车道；git worktree add/remove/merge/rebase/cherry-pick/reset --hard 全部先确认；分支默认 `antares/<slug>` | slim worktrees SKILL.md |
| `clonedeps` | `.dsh/antares-dsh/clonedeps/repos/` 只读克隆直接依赖；≤3~5 个；HTTPS + 固定 tag/commit；不跑依赖脚本；登记 AGENTS.md managed block | slim clonedeps SKILL.md |
| `reflect` | 回顾重复工作 → 最小可复用资产（skill/命令/preset 规则/playbook/不做）；证据驱动；改前询问 | slim reflect SKILL.md + dsh 会话工具 |
| `antares-dsh` | 教 agent 配置 antares-dsh 自身：preset 行、专家模型、toolFilter、skills、命令；改动前询问、提示重启/新会话生效 | slim oh-my-opencode-slim SKILL.md 改写 |

技能可见性：
- 主 Agent（Orchestrator）可见全部 8 个；
- `oracle` 可见 `skill` 工具，persona 约束只用 `simplify`；
- 其余子代理 toolFilter 不含 `skill`，看不见技能目录。

---

## 9. ast-grep 工具规格

### 9.1 二进制解析（lib/ast-grep-bin.js）

依赖 `@ast-grep/cli`（dependencies 或 optionalDependencies 声明，平台二进制走其 optionalDependencies）。解析顺序：

1. `process.env.AST_GREP_SG`（显式覆盖）
2. 缓存：`<LOCALAPPDATA|XDG_CACHE_HOME>/antares-dsh/bin/sg(.exe)`，文件 >10KB
3. `require.resolve('@ast-grep/cli/package.json')` 同目录 `sg(.exe)`
4. 平台包（`@ast-grep/cli-<platform>/package.json` 同目录 `ast-grep(.exe)`）
5. macOS Homebrew `/opt/homebrew/bin/sg`、`/usr/local/bin/sg`
6. 都失败：返回 `{ ok:false, error }`，工具报错；**不做 GitHub release 下载**（v1 保持静态检查面最小，README 给出 `npm i -D @ast-grep/cli` 的说明）

缓存只在第 2 步使用，不写下载逻辑。

### 9.2 语言枚举

与 slim 完全一致：bash, c, cpp, csharp, css, elixir, go, haskell, html, java, javascript, json, kotlin, lua, nix, php, python, ruby, rust, scala, solidity, swift, typescript, tsx, yaml（25 个）。

### 9.3 `ast_grep_search`

```js
{
  name: 'ast_grep_search',
  description: 'AST-aware code pattern search across 25 languages. Meta-variables: $VAR (single node), $$$ (multiple nodes). Patterns must be complete AST nodes.',
  parameters: {
    type: 'object',
    additionalProperties: true,
    properties: {
      pattern: { type: 'string', description: 'Complete AST pattern with $VAR / $$$ meta-variables' },
      lang: { type: 'string', enum: LANGUAGES },
      paths: { type: 'array', items: { type: 'string' }, description: "Paths to search (default: ['.'])" },
      globs: { type: 'array', items: { type: 'string' }, description: 'Include/exclude globs (prefix ! to exclude)' },
      context: { type: 'integer', description: 'Context lines around match' }
    },
    required: ['pattern', 'lang']
  },
  output: {
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        matches: { type: 'array', items: { type: 'object', additionalProperties: false,
          properties: { file:{type:'string'}, line:{type:'integer'}, text:{type:'string'} }, required:['file','line','text'] } },
        total: { type: 'integer' },
        truncated: { type: 'boolean' },
        truncatedReason: { type: 'string' }
      },
      required: ['matches','total','truncated']
    },
    render: (args, value) => [{ type: 'text', text: formatSearchText(value) }]
  },
  execute: async (args, exec) => { validate(args); return runSg({ ...args, signal: exec.signal }) },
  presentCall: (args) => ({ card:'generic', kind:'search', title:`AST search ${args.lang}`, rawInput: args.pattern }),
  presentResult: (args, result) => searchCard(result)
}
```

执行：`spawn(sg, ['run','-p',pattern,'--lang',lang,'--json=compact', ...globs, ...(paths||['.'])])`；超时 300s（与 slim 一致；超时 kill 进程并返回 truncated 结果）；stdout/stderr 解析 compact JSON；匹配数上限与输出字节上限在格式化层裁剪。

格式化（与 slim 相同）：
- 按文件分组，`file:\n  <line>: <text>`；
- 无匹配返回 `No matches found.` + 对 Python 冒号 / JS 函数残缺模式给出 hint；
- 末尾 `Found N matches in M files`（截断时注明原因）。

### 9.4 `ast_grep_replace`

在 search 基础上：
- 参数增加 `rewrite: string`，`dryRun: boolean`（默认 true；schema 不能表达默认值，`execute` 内 `args.dryRun !== false` 视为 true）；
- 执行分两步（因为 `--update-all` 与 `--json` 冲突）：先带 `--json=compact` 跑一次获取结构化 before/after 预览；`dryRun=false` 且有匹配时，再不带 `--json` 跑一次 `-r <rewrite> --update-all` 真正落盘。
- 输出 `files: [{path, line, before, after}]` + `total` + `applied: boolean`；
- 文本格式：`[DRY RUN]` / `[APPLIED]`，每行 `path:line: "before" → "after"`，dry-run 末尾提示 `To apply, run with dryRun=false`；
- UI：`presentCall` 用 generic(edit)；`presentResult` 用 generic card 展示变更文本（ast-grep 只给出匹配行级 before/after，不能伪造整文件 diff card）。`ast_grep_search` 的 `presentResult` 用官方 `search/matches` card。

### 9.5 静态检查要点

- `execute` 内只允许 `node:child_process.spawn`、`node:fs`、`node:path`、`node:url`、`node:os`；
- 不用 `exec`/shell 字符串拼接（避免注入）；
- args 所有字符串长度上限（pattern ≤ 2000、rewrite ≤ 2000、paths ≤ 64 项、globs ≤ 64 项、context 0~10）；
- `exec.signal` 传入子进程并在 abort 时 kill；
- 输出对象永远符合 `output.schema`，错误时 `throw new Error(message)` 而不是返回半截结果。

---

## 10. 宿主插件模块设计

### 10.1 lib/index.js

```js
export const name = 'antares-dsh'
export const inject = ['commands', 'tools']

export function apply(ctx) {
  syncPreset(ctx)              // Phase 0 已实现，保持 first-install 语义
  registerCommands(ctx)        // §7
  registerAstGrepTools(ctx)    // §9
}
```

- 所有注册用 `ctx.effect()` 返回 disposer 的等价形态：`ctx.commands.register` / `ctx.tools.register` 自身返回 disposer；apply 内直接调用即可，插件 unload 时 Cordis 负责回收。
- 任何子模块抛错只能影响该模块自己的注册，不能阻止 preset sync（先 sync，再 commands，再 tools，各自 try/catch + `ctx.logger.warn`）。

### 10.2 lib/commands.js

纯函数导出三个激活提示词构造器，便于单测：

```js
export function deepworkActivationPrompt(task)
export function reflectActivationPrompt(rawInput)
export function loopActivationPrompt(rawInput)
export function registerCommands(ctx)
```

### 10.3 lib/ast-grep.js / ast-grep-bin.js

- `runSg(options, signal)`：组装参数 → 查找二进制 → `spawn` → 超时竞速 → 解析 compact JSON → 归一化 `{matches, total, truncated, truncatedReason}`；
- `formatSearchText` / `formatReplaceText`：与 slim 输出格式一致；
- `registerAstGrepTools(ctx)`：注册两个工具，纯对象定义（原生 JSON Schema）。

---

## 11. 测试与静态检查计划（实现完成后执行）

### 11.1 自动化

| 测试 | 覆盖 |
|---|---|
| `tests/preset-sync.test.mjs` | 已有 3 例；补：目标为文件而非目录时抛错；DSH_HOME 展开 |
| `tests/commands.test.mjs` | 三个激活提示词内容断言（含/不含 `--sessions`/`--last`；空参数行为）；mock ctx.commands 捕获注册定义；mock agent.followup 捕获消息对象 |
| `tests/ast-grep.test.mjs` | 用临时目录 + fake `sg` 脚本注入 `AST_GREP_SG`；断言参数拼装、dry-run 默认、输出 schema 合规、超时、错误路径；真实 `sg` 存在时加一条 integration（skip 条件） |
| `tests/agent-preset.test.mjs` | 读取 `agent.cordis.yml`，用 js-yaml（devDependency 或 node 内联解析器）+ `!!js` 自定义 tag 解析，断言：8 个 tool-subagent 行存在、toolName 唯一、每个 row 有 persona、toolFilter 只含白名单工具名、skill 目录 8 个 SKILL.md 齐全 |

### 11.2 静态检查清单（实现后逐项过）

- [ ] `node --check` 所有 lib/*.js 与 tests/*.mjs 通过
- [ ] `node --test` 全绿
- [ ] `package.json` 无 build 步骤、无 `prepare`（避免 `dsh plugin add` 触发构建）
- [ ] 宿主代码无 `import '@deepseek-ai/...'`、无 `import` 除 node:builtin 以外的运行时依赖
- [ ] `grep -R 'oh-my-opencode\|OpenCode\|task_status\|task_result\|task_message\|task_cancel\|task_revive\|@explorer\|@oracle'` 在实现产物（除 docs/ 引用说明外）为 0 或只出现在“不要用”的说明中
- [ ] SKILL.md 的 frontmatter name 与目录名一致，description 非空，目录共 8 个
- [ ] `agent.cordis.yml` 用 dsh loader 方言解析成功（`!!js` tag）
- [ ] toolFilter 不包含平台不存在的 shell 工具（用 `!!js` 表达式处理）
- [ ] ast-grep 参数名/输出 schema 与文档 §9 一致
- [ ] 命令注册名不含前导 `/`（DSH `CommandDefinition.name` 要求）
- [ ] `/deepwork` 等 handler 使用 `agent.followup`，返回 `CommandResult`，空输入返回 error 而非注入空回合
- [ ] 状态目录统一为 `.dsh/antares-dsh/...`，无 `.slim/`、`.opencode/` 残留

### 11.3 人工验收（review 时跑）

1. 安装后新会话选择 “Antares DSH” preset。
2. 主 Agent 收到仓库问题会调用 `explorer`；Explorer 只读。
3. `fixer` 能写文件；尝试让 explorer 写文件会被工具层拒绝（toolFilter）。
4. `/deepwork`、`/reflect`、`/loop` 均产生新回合并执行对应技能。
5. `ast_grep_search(pattern:'console.log($MSG)', lang:'typescript')` 返回按文件分组结果；replace 默认 dry-run，`dryRun:false` 真正改写。
6. Council：配置两个不同模型的 councillor 后，问架构取舍问题，council 返回单一合成结论。

---

## 12. 已知限制（v1 明确接受）

- continuable 子代理无 `task_result` 精确等价物：结果靠 settle 通知 + 子会话读取；
- `task_revive` 无等价物：用 `send_message` 冷恢复近似；
- 无 wall-clock 超时、无 Board 注入、无会话复用池；
- 无 Observer/视觉路由、无 ACP、无 Interview、无 `/preset`；
- 无 webfetch 增强（用官方 `web_fetch`）、无 context7/gh_grep（用户自装 MCP）；
- 当前 dsh 发行版未带官方 `dsh-tool-session-query`，因此 `/reflect --sessions` 默认走降级路径；有官方包的部署可手工在 preset 加行启用；
- codemap 无变更检测脚本，纯提示词；
- 技能权限到“是否可见 skill 工具”粒度，无法只给 oracle 展示 simplify 单个技能；
- 模型配置是静态 YAML，改动后需新会话/重启生效；
- ast-grep v1 不自动下载二进制，断网/未装依赖时工具返回可读错误。

---

## 13. 实施顺序与状态

> 状态：v0.1.0 已按下列顺序实现完毕，静态自检 24/24 通过（见
> `docs/self-check-report.md`）；等待人工 review 与真实 profile 装载验收。

1. package.json 依赖字段 + 补 README 状态
2. lib/ast-grep-bin.js、lib/ast-grep.js
3. lib/commands.js
4. lib/index.js 汇总
5. agent-presets/antares-dsh/agent.cordis.yml 全量改写
6. 8 个 skills/SKILL.md
7. tests 四个文件
8. 静态检查 11.2 全清单 + `node --test`
9. 提交 review
