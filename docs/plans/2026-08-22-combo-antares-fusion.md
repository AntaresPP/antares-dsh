# combo-antares 融合实施计划（已裁定方向，暂未实施）

- 日期：2026-08-22
- 状态：**已裁定方向、已获初步批准，用户选择暂不实施**；本文件是后续启动的权威依据
- 插件：`E:\oh-my-dsh\antares-dsh`（v0.1.0，git HEAD `0f35dce`）
- 上游参照：`~/.dsh/.agent-presets/combo-anchored`（372 行组合 + 7 个本地 .mjs）、`docs/REVIEW.md`

---

## Goal

在 antares-dsh 插件内新增 `combo-antares` preset（combo-anchored 锚定机制 + antares 8 专家编排），并扩展插件能力：用户级 skill 全局安装、一键装全套配套插件。

## 已核实的可行性事实（决定计划形态）

1. **combo-anchored 结构**：22 顶层行 + 7 个本地 .mjs 插件（think-phase/deliberation-gate/cot-drip/instruction-hint/dev-tool-search/skill-search/custom-bash + 依赖 compaction-epoch.mjs）。.mjs 仅依赖 node 内置模块（`node:fs/promises`、`node:path`）与本地 compaction-epoch.mjs，**零 npm 依赖，可直接随包复制**。
2. **用户级 skill 默认开启**：`dsh-skill-filesystem` 的 `roots()` 扫描六类根：项目级 `.dsh/skills`、`.agents/skills`；用户级 `~/.dsh/skills`（user-dsh）、`~/.agents/skills`（user-agents）；preset 级 `customSkillDirs`；bundled。antares 的 skill-filesystem 行未设 `includeDefaultRoots: false`，所以 `~/.dsh/skills/<name>/SKILL.md` 已全局生效。插件只需在 preset-sync 时额外复制通用技能到 `~/.dsh/skills/`。
3. **一键装全套机制**：`dsh plugin add` = 薄 pnpm 转发器（`spawnSync("pnpm", args)`，dsh/lib/plugin-9h8shc4d.js:108）；`reconcilePlugins` 把任何声明 `dsh.bundle` 的 dependencies 自动收录进 profile 层栈（:46-78）。新 profile 默认带 `DEFAULT_PROFILE_BUNDLES = ["@deepseek-ai/dsh-base"]`（dsh-app-boot:334），官方包（tool-goal/ralph/workflow/subagent-report）已在 base 内，只需 preset 加行。
4. **融合冲突裁定（用户已选推荐方案）**：
   - persona：combo 锚定文本保留 `complete: true`；Antares 调度规则作为**独立非 complete section** 注册（dsh-persona 只允许一个 complete，其余 section 正常叠加——REVIEW.md §B-M2 已证）。
   - skill：保留 combo 的 `skill_search`/`skill_load`；oracle toolFilter 改 `[read, glob, grep, ast_grep_search, skill_load, ask_user_question]`；deepwork/reflect 激活提示词由主 Agent 用 skill_load 按需加载。
   - 行 id：以 combo 版为准（tool-bash/pwsh/fs/fs-search/jobs/ask-user/todo/web/planning/compaction/delegation 组），antares 只补 8 个专家行 + skills 目录。
   - 官方配套：combo 已含 tool-goal/tool-workflow/tool-ralph → 融合 preset 自动获得。

## 发布约束（用户明确要求）

- 插件经 GitHub 发布 tag 后由 `dsh plugin add github:<owner>/antares-dsh#tag` 下载；
- **插件内不得引用本地源码文件**——发布后必须源码无关：
  - 所有相对引用（如 `name: ./xxx.mjs`、`customSkillDirs` 的 `baseUrl`）解析必须基于插件安装后的包内路径；
  - 禁止写死 `C:\Users\...` 等本机绝对路径；
  - combo 的 7 个 .mjs 需复制进包（随 files 分发），不能引用 `~/.dsh/.agent-presets/combo-anchored/`。

## Architecture

```
antares-dsh/
├── agent-presets/
│   ├── antares-dsh/          （现有，保留）
│   │   ├── agent.cordis.yml
│   │   ├── preset.yml
│   │   └── skills/           （8 个 SKILL.md）
│   └── combo-antares/        （新增：融合 preset）
│       ├── agent.cordis.yml  （combo 基础 + antares 8 专家 + 融合裁定）
│       ├── preset.yml        （name: Combo Antares）
│       ├── think-phase.mjs / deliberation-gate.mjs / cot-drip.mjs /
│       │   instruction-hint.mjs / dev-tool-search.mjs / skill-search.mjs /
│       │   custom-bash.mjs / compaction-epoch.mjs   （复制自 combo，共 8 个）
│       └── skills/           （复制自 antares 的 8 个 SKILL.md，供主 Agent 加载）
├── lib/
│   ├── index.js              （扩展：sync 时同步用户级 skill）
│   └── preset-sync.js        （扩展：installUserSkillsIfMissing）
├── package.json              （files 含 agent-presets 全目录，已满足）
└── README.md / docs/         （新 preset 用法、用户级 skill、一键安装说明）
```

**文件职责**：
- `preset-sync.js`：新增用户级 skill 同步（first-install 不覆盖语义，与 preset 同步一致）。
- `index.js`：apply 时调用用户级 skill 同步；preset 同步已覆盖多目录（installPresetsIfMissing 遍历 sourceRoot 下所有目录），combo-antares 自动被同步。
- `agent.cordis.yml`（combo-antares）：融合后的组合文件。
- 8 个 .mjs：从 combo 复制，仅 node 内置依赖。

## Global Constraints

1. 插件内零 `@deepseek-ai/*` runtime import（保持现有架构决策）。
2. 不写死本机绝对路径；所有路径基于包内相对路径或 `DSH_HOME`/`baseUrl` 解析（发布源码无关）。
3. preset 同步 first-install 不覆盖用户已存在目录。
4. 用户级 skill 同步同样遵循 first-install 不覆盖语义（用户已安装的 skill 不被覆盖）。
5. `node --test` 全绿；`node --check` 全过。
6. combo 的 .mjs 复制后保持可运行（其内部 `import './compaction-epoch.mjs'` 相对路径在包内解析）。

---

## Task 1: 创建 `agent-presets/combo-antares/`（融合 preset）

**Files:**
- Create: `agent-presets/combo-antares/preset.yml`
- Create: `agent-presets/combo-antares/agent.cordis.yml`（融合版）
- Create: `agent-presets/combo-antares/think-phase.mjs`、`deliberation-gate.mjs`、`cot-drip.mjs`、`instruction-hint.mjs`、`dev-tool-search.mjs`、`skill-search.mjs`、`custom-bash.mjs`、`compaction-epoch.mjs`（复制自 `~/.dsh/.agent-presets/combo-anchored/`，内容原样）
- Create: `agent-presets/combo-antares/skills/<8 个>/SKILL.md`（复制自 `agent-presets/antares-dsh/skills/`）

**Interfaces:**
- Consumes: combo-anchored 的 agent.cordis.yml（`C:\Users\DesireP\.dsh\.agent-presets\combo-anchored\agent.cordis.yml`，372 行）、antares 的 agent.cordis.yml（`agent-presets/antares-dsh/agent.cordis.yml`，432 行）
- Produces: `agent-presets/combo-antares/` 完整目录

**融合规则（agent.cordis.yml）**：
1. 以 combo 的 22 行为基础，逐行保留（含注释）。
2. persona 行：保留 combo 的锚定文本 + `complete: true` + `includeRuntimeContext: false`；**新增一个独立 section 行**（`@deepseek-ai/dsh-persona` 第二个实例，不带 complete）承载 Antares 调度规则（routing/后台调度/写所有权/验证/输出风格/Council 段落，翻译自 antares persona 的非锚定部分）。
   - 注意：dsh-persona 的 Config 是 `{text, complete, includeRuntimeContext}`；同 id 只能有一个行——用不同 id（如 `persona-anchored` + `persona-antares`）。
3. 在 delegation 组（combo 的）之后/内新增 8 个专家行：`agent-explorer`/`agent-oracle`/`agent-librarian`/`agent-designer`/`agent-fixer`/`agent-council`/`agent-councillor-alpha`/`agent-councillor-beta`（复制 antares 的 8 行定义，toolName 不变）。
4. oracle 行 toolFilter：antares 原 `[read, glob, grep, ast_grep_search, skill, ask_user_question]` → 改为 `[read, glob, grep, ast_grep_search, skill_load, ask_user_question]`（skill 工具被 combo 移除，改用 skill_load）。
5. 技能挂载：combo 的 skill-filesystem 行保持（不加 customSkillDirs，因为 combo 用 skill-search 按需加载）；skills/ 目录随 preset 复制，由 skill_search 发现（skill-search.mjs 扫描 preset 内 skills 目录——需确认其 root 逻辑，若扫描 customSkillDirs 则需给 skill-filesystem 行加 `customSkillDirs: [baseUrl skills/]`）。
6. 保留 combo 的 tool-goal/tool-workflow/tool-ralph（已在内）。
7. preset.yml：`name: Combo Antares`、description 注明融合来源。

**验证**：`node -e` 或临时脚本用 dsh loader 方言解析该 YAML（`!!js` tag）成功；grep 确认无 `C:\` 绝对路径、无 `~/.dsh/.agent-presets/combo-anchored` 引用。

## Task 2: 扩展 `lib/preset-sync.js`（用户级 skill 同步）

**Files:**
- Modify: `lib/preset-sync.js`（新增函数）
- Test: `tests/preset-sync.test.mjs`（新增用例）

**Interfaces:**
- Consumes: 现有 `dshHome()`、`expandTilde()`
- Produces: `installUserSkillsIfMissing(sourceSkillsDir, targetUserSkillsRoot)` → `{installed, existing, failed}`；`userSkillsRoot()` → `join(dshHome(), 'skills')`

**实现：**
- `userSkillsRoot()`：`join(dshHome(), 'skills')`。
- `installUserSkillsIfMissing(sourceSkillsDir, targetRoot)`：遍历 sourceSkillsDir 下每个技能目录（`<name>/SKILL.md`），目标 `<targetRoot>/<name>` 不存在才复制（first-install 不覆盖）。
- 与现有 `installPresetsIfMissing` 同构。

**TDD：**
- Step 1 失败测试：临时源/目标目录，断言 installed/existing/failed 聚合 + 不覆盖语义。
- Step 3 实现 → Step 4 通过。

## Task 3: 扩展 `lib/index.js`（apply 时同步用户级 skill）

**Files:**
- Modify: `lib/index.js`（apply 中新增调用）
- Test: `tests/agent-preset.test.mjs` 或新增 smoke

**实现：**
- `apply(ctx)` 在 `syncPreset(ctx)` 后调用 `syncUserSkills(ctx)`：`installUserSkillsIfMissing(bundledUserSkillsRoot(), userSkillsRoot())`。
- `bundledUserSkillsRoot()`：antares 的通用技能目录——建议从 `agent-presets/combo-antares/skills/`（或 antares-dsh/skills/）复制到 `~/.dsh/skills/`。
- 日志与错误隔离同现有 syncPreset。

## Task 4: 一键装全套配套插件

**Files:**
- Modify: `README.md`（安装说明）
- Modify: `docs/RELEASE.md` 或 `docs/release.md`（发布说明）
- 可选 Modify: `package.json`（若采用 dependencies 机制）

**实现（两条路线，文档优先）：**
1. **官方能力**（零安装）：tool-goal/tool-ralph/tool-workflow/tool-subagent-report 已在 dsh-base，combo-antares preset 已含所需行 → README 说明。
2. **第三方生态**：README 提供组合安装命令 `dsh plugin add github:<owner>/antares-dsh#vX github:<ecosystem-plugin>#vX ...`（pnpm 多包参数天然支持）；可选：把常用配套声明为 `optionalDependencies`（reconcilePlugins 自动收录 dsh.bundle 依赖）——**注意权衡**：写死 dependencies = 强制所有安装者装上，可能引入没要求的 UI/功能；默认推荐组合命令路线。

## Task 5: 文档与全量验证

**Files:**
- Modify: `README.md`（新 preset 用法：选 "Combo Antares" preset；用户级 skill 说明：`~/.dsh/skills/`；一键安装命令）
- Modify: `docs/implementation.md`（组合矩阵新增 combo-antares）
- Modify: `tests/agent-preset.test.mjs`（新增 combo-antares 存在性/8 专家/无绝对路径断言）

**验证命令：**
```bash
cd E:\oh-my-dsh\antares-dsh
node --test          # 全绿
for f in lib/*.js tests/*.mjs; do node --check "$f"; done
grep -R "C:\\\\Users\|combo-anchored\\\\" agent-presets/combo-antares  # 0 命中
```

---

## 执行模式

获批后推荐 workflow-subagents（每任务一个后台 subagent + 审查）；或内联执行。每任务 TDD 红→绿→提交。

## 风险与裁定记录

| 风险 | 裁定 |
|---|---|
| combo 的 skill-search.mjs 是否扫描 preset 内 skills/ | 需在 Task 1 读其源码确认；若不扫描，给 skill-filesystem 行加 customSkillDirs 指向 baseUrl skills/（发布后仍包内相对解析，符合源码无关约束） |
| 两个 dsh-persona 行是否允许 | 用不同 id（persona-anchored/persona-antares），各自注册 section；complete 只能一个 |
| 用户级 skill 与 preset skill 同名冲突 | user-dsh rank 低于 custom rank；不覆盖语义保护用户文件 |
| 一键装全套强制安装第三方插件 | 默认走 README 组合命令路线，不写死 dependencies（除非用户明确要求强制） |
