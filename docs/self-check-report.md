# antares-dsh v0.1.0 实现后静态自检报告

- 日期：2025-08-19
- 范围：本仓库 v0.1.0 全量实现（即 `antares-dsh` 包根目录）
- 状态：**静态自检通过，等待人工 review**

---

## 1. 交付物清单

| 文件 | 内容 |
|---|---|
| `package.json` | 包 `antares-dsh`；`dsh.bundle.patch`；依赖 `@ast-grep/cli@^0.45.1`；无 build/prepare |
| `cordis.patch.yml` | 单行 insert `{id: antares-dsh, name: antares-dsh}`，与包名一致 |
| `lib/index.js` | 宿主入口：`inject: ['commands','tools']`；preset 同步 + 3 命令 + 2 工具 |
| `lib/preset-sync.js` | first-install 同步，已存在则绝不覆盖 |
| `lib/commands.js` | `/deepwork` `/reflect` `/loop` 注册与激活提示词 |
| `lib/ast-grep-bin.js` | `sg` 二进制 5 级解析（env/cache/@ast-grep-cli/平台包/Homebrew），无下载逻辑 |
| `lib/ast-grep.js` | 2 个工具的原生 JSON Schema 定义、执行、渲染、UI card |
| `agent-presets/antares-dsh/agent.cordis.yml` | 23 个顶层行：persona、官方工具行、8 个专家 tool-subagent、技能挂载 |
| `agent-presets/antares-dsh/skills/*/SKILL.md` | 8 个技能 |
| `tests/*.test.mjs` | 4 个测试文件 |
| `docs/implementation.md` | 实现设计文档 |
| `docs/self-check-report.md` | 本报告 |

---

## 2. 自动检查结果

| # | 检查 | 结果 |
|---|---|---|
| 1 | `node --check` 全部 `lib/*.js`、`tests/*.mjs` | ✅ 通过 |
| 2 | `node --test` | ✅ **24/24 通过** |
| 3 | `package.json` 无 `build`/`prepare` 脚本 | ✅ |
| 4 | 宿主代码零 `@deepseek-ai/*` runtime import | ✅（测试断言覆盖） |
| 5 | bundle patch 的 id/name 与 package name 一致 | ✅ |
| 6 | preset YAML 用 dsh loader 方言（`!!js`）解析 | ✅ 23 顶层行 / 29 展开行 |
| 7 | 全部 `!!js` 表达式在本机实际求值 | ✅ Windows 返回 `pwsh` 分支、技能目录正确解析 |
| 8 | 8 个专家行 toolName 唯一、persona 非空、toolFilter.allow 存在 | ✅ |
| 9 | 8 个 SKILL.md 目录名与 frontmatter `name` 一致、description 非空 | ✅（CRLF 已归一化处理） |
| 10 | 工具参数/output JSON Schema 可被 Ajv 编译 | ✅ 2/2 |
| 11 | 真实 `@ast-grep/cli` 安装后二进制解析 | ✅ 命中平台包 `ast-grep.exe` |
| 12 | 真实 ast-grep search / replace dry-run / apply 集成冒烟 | ✅ 文件确实被改写 |
| 13 | host `apply()` mock 冒烟 | ✅ 注册 3 命令 + 2 工具，preset 同步到临时 DSH_HOME 成功 |
| 14 | 代码/技能/preset 无 OpenCode 残留（除注释归因与"无 task_result"的说明性文字） | ✅ |
| 15 | 命令注册名无 `/` 前缀；空输入返回 error（reflect 允许空） | ✅ 测试覆盖 |
| 16 | preset 引用的所有官方包在本机 dsh 运行时存在 | ✅ 17/17（见第 4 节） |

---

## 3. 自检发现并已修复的问题

### 3.1 `--update-all` 与 `--json` 冲突（严重）

- **现象**：`ast_grep_replace(dryRun:false)` 只会返回预览，文件永远不被改写。
- **原因**：`sg run --update-all --json=compact` 组合下 `--update-all` 不生效。
- **修复**：apply 分两步：
  1. 带 `--json=compact` 跑一次，得到结构化 before/after；
  2. 有匹配时去掉 `--json`，再跑 `-r <rewrite> --update-all` 真正落盘。
- **回归**：新增 `buildArgs apply mode` 单测；真实文件集成冒烟验证 `console.log` → `logger.info`。

### 3.2 官方 `dsh-tool-session-query` 未被打包（严重，会导致 preset 挂载失败）

- **现象**：本机 dsh 运行时 `app.asar.unpacked/node_modules/@deepseek-ai` 下不存在 `dsh-tool-session-query`。
- **修复**：
  - preset 默认不再挂该行；
  - `/reflect --sessions` 与 reflect skill 改为"有官方工具则使用，没有则明确降级到当前会话 + 项目产物，禁止读原始 session 文件"；
  - README 与实现文档标注：部署有该官方包时，可手工在 preset 加一行启用完整会话考古。
- **验证**：相关测试更新后全绿。

### 3.3 测试对 CRLF 的脆弱性（轻微）

- 技能文件在本机为 CRLF，frontmatter 断言按 LF 写会误报。
- 修复：测试读取后统一 `\r\n -> \n` 再断言。

---

## 4. 官方包可用性核对（本机 dsh 运行时）

以下包在 `C:/Program Files/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai` 全部存在，preset 行可解析：

`dsh-persona`, `dsh-tool-bash`, `dsh-tool-pwsh`, `dsh-tool-fs`,
`dsh-tool-fs-search`, `dsh-tool-jobs`, `dsh-plan-mode`,
`dsh-compaction-basic`, `dsh-command-compact`,
`dsh-compaction-tool-result-pruner`, `dsh-tool-subagent`,
`dsh-tool-subagent-control`（含 `./list-agents` 导出）,
`dsh-tool-ask-user`, `dsh-tool-todo`, `dsh-tool-web`,
`dsh-skill-filesystem`, `dsh-tool-skill`。

另确认 spawn provider 声明 `persona: true` 与 `toolFilter: true`，本 preset 的 8 个专家实例能力成立。

---

## 5. 未做 / 需要人工 review 重点

1. **没有做真实 dsh profile 装载冒烟**。为避免改动用户现有 `desktop` profile 和 `~/.dsh`，未执行 `dsh plugin --profile desktop add`。请 reviewer 在隔离 profile 或确认后执行真实装载，重点看：
   - bundle patch 生效；
   - 新会话能选到 "Antares DSH" preset；
   - `/deepwork` `/reflect` `/loop` 出现在命令列表；
   - `ast_grep_search` / `ast_grep_replace` 出现在工具目录。
2. **工具用原生 JSON Schema 注册**（不 import `@deepseek-ai/dsh-tools`），入参校验在 `execute()` 内自做。语义上符合 dsh `ToolDefinition` 契约，但建议在真机 review 时确认 model-facing schema 与错误呈现。
3. **命令通过 `agent.followup()` 触发新回合**。官方 API 支持，但需要真机确认 Web/TUI 上 `/deepwork` 等命令返回 UI 结果后确实产生一个模型回合且无重复注入。
4. **Council 模型多样性**：默认 councillor 继承主模型；需要用户按 README 给 `councillor-alpha/beta` 配 `agentOptions` 才有真正多模型投票。
5. **ast-grep 二进制**：依赖 `@deepseek-ai/dsh-tool-session-query` 式的官方包不存在问题已处理；`@ast-grep/cli` 由 npm 依赖安装。reviewer 需确认目标 dsh 插件安装流程会装 dependencies（而非忽略）。
6. **preset 同步不覆盖**：更新插件不会刷新已安装 preset，这是设计决策；review 时确认接受。

---

## 6. 复跑命令

```bash
cd antares-dsh
node --test
for f in lib/*.js tests/*.mjs; do node --check "$f"; done
```
