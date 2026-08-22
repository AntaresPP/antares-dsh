# antares-dsh v0.1.0 全面行级静态审查报告

- 日期：2026-08-20
- 审查对象：`E:\oh-my-dsh\antares-dsh`（git HEAD `0f35dce`，v0.1.0）
- 审查性质：**只读静态审查**，未修改任何源码；产出问题清单 + 可执行修复建议（修复是否执行由用户决定）
- 审查方式：5 个独立审查域并行（lib 运行时契约 / preset 组合 / 8 skills / 测试与文档 / 生态与发布），全部结论与官方运行时源码（`C:\Program Files\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\`，0.1.0-rc.7）、真实 ast-grep 二进制（0.45.1）、awesome-dsh-plugin 生态目录（1837 条）、上游 oh-my-opencode-slim（v2.2.15）交叉验证
- 控制器复核：关键契约 8 项独立核实；两处子 agent 结论经实证修正（见 §4）

---

## 0. 总体结论

**插件架构方向正确、可装载、无启动级缺陷**：22 个顶层行 config 键全部通过官方 schema；引用的 16 个官方包全部存在；`!!js` 表达式求值正确；toolFilter 白名单工具逐一真实存在；`dsh.bundle` manifest 规范合规；默认发布/安装路径（`dsh plugin add github:<owner>/antares-dsh#tag`）可用。自研项（ast-grep 工具、`/loop`、deepwork 编排、council）与官方工具语义互补、无一需要被替换。

**但存在 2 条严重、1 条修正后严重/中等的运行时缺陷**，集中在 ast-grep 工具的执行路径（宿主进程鲁棒性、大结果截断）与命令消息契约（followup 缺字段）：

| 严重度 | 数量 | 关键主题 |
|---|---|---|
| 【严重】 | 2 | ast-grep JSON 截断误报；ast-grep spawn 错误被误报为超时（原判"崩溃宿主"经实证修正） |
| 【中等】 | 12 | cwd 错位；followup 缺 id/role；fetch:true 无 provider；complete:true 压制 plan-mode；council 收口错配；report 工具表述过时；依赖布局前提；大匹配报告失真；超时语义；signal abort 延迟；worktrees 缺 git-ignore；.ignore 死约定 |
| 【轻微】 | 16 | 解析边界、文档不一致、测试脆弱性、平台分支遗漏等 |
| 【建议】 | 16 | 生态整合（补挂 tool-goal/tool-ralph/tool-workflow）、平台包直挂 optionalDependencies、CI、README 等 |

总计 **46 条**（五域去重后）。每条含：位置、问题、证据、影响、修复建议。

---

## 1. 【严重】

### S1. `lib/ast-grep.js:145-172` — 大匹配量搜索/替换被误报为 "No matches found"，替换静默不落盘

- **位置**：`lib/ast-grep.js:102-107`（stdout 截断）+ `:64-79`（parseAstGrepJson）+ `:159`（replace 落盘门槛）
- **问题**：`--json=compact` 输出是**单行大数组**（实测 3000 匹配 = 1.31MB、0 换行）。stdout 超 `DEFAULT_MAX_OUTPUT_BYTES`（1MB）被截断后：
  1. `JSON.parse(stdout)` 必然失败（不完整 JSON）；
  2. 兜底按 `\n` 切行逐行解析——compact 只有一行，仍失败被 `catch{}` 跳过 → 返回 `[]`；
  3. `formatSearchText` 对 `matches.length === 0` **提前 return** `'No matches found.'`，`truncated` 标记被隐藏；
  4. replace 流程 `result.totalMatches === 0` → `--update-all` 落盘步骤被**静默跳过**。
- **证据**：实测 `sg run -p 'console.log($MSG)' --lang typescript --json=compact` 于 3000 文件目录：exit 0、stdout 1,312,573 字节、换行数 0。
- **影响**：搜索假阴性（模型看到 "No matches found" 且无截断提示）；`ast_grep_replace(dryRun:false)` 静默不执行任何改写且不报错。大型 monorepo 中搜 `console.log` 等常见模式极易触发（约 >2400 匹配即超 1MB）。
- **修复建议**：① 截断策略改为"按匹配对象计数"——流式消费 stdout 逐对象解析（compact 单行可先按 `},{` 切分）；② 或大幅提高字节上限；③ 至少当 `truncated=true` 时禁止走 "No matches found" 文案并显式输出截断原因。配套补 fake-sg 测试（见 §2.8 测试缺口）。

### S2. `lib/ast-grep.js:93-130` — spawn 失败被误报为 "ast-grep timed out"，真实错误被吞

- **位置**：`lib/ast-grep.js:113-129`（runOne 的 close/超时判定）
- **问题**：`spawn` 没有显式 `child.on('error')` 监听。二进制启动失败（TOCTOU 删除、POSIX 无执行位、杀毒锁定）时：
  - `events.once(child,'close')` 有**隐式 error 监听**——实测进程**不会崩溃**（子 agent 原判"崩溃宿主进程"**经实证修正**）；
  - 但 error 使 close promise reject → `catch { code = null }` → 落入 `if (code === null && stdout.trim() === '' && !stderr.trim()) throw new Error('ast-grep timed out')` → **ENOENT/EACCES 被误报为"超时"**，用户得到完全误导的错误信息，真实原因被吞掉。
- **证据**：复刻插件代码形状（无 error 监听、`once(child,'close')`）spawn 不存在的二进制：`close promise rejected: spawn C:\nonexistent-sg.exe ENOENT` → 插件抛 "ast-grep timed out"，进程存活。另 `isValidBinary`（`ast-grep-bin.js:31-37`）只查 size 不查 POSIX 可执行位（EACCES 场景可达）。
- **影响**：错误诊断完全失真（"超时"≠"二进制不存在"）；用户在二进制缺失/损坏时被误导去排查网络/性能问题。
- **修复建议**：`child.on('error', (err) => { clearTimeout(timeoutId); signal?.removeEventListener('abort', abort); reject(new Error(\`ast-grep failed to start: ${err.message}\`)) })`（与 close 竞速、只结算一次）；`isValidBinary` 补 `accessSync(path, X_OK)`（POSIX）。

---

## 2. 【中等】

### M1. `lib/ast-grep.js:94-97` — spawn 未传会话工作区 cwd，搜索/替换可能作用在错误目录树

- **证据**：`spawn(binary, args, {stdio, windowsHide})` 无 `cwd`；`buildArgs` 默认 `paths: ['.']` 相对**宿主进程 CWD** 解析。官方工具一律以 `exec.agent.session.header.cwd` 为根（dsh-tool-fs 同款语义）。
- **影响**：桌面版宿主进程 CWD 通常不是用户工作区，搜索会搜错目录；`ast_grep_replace(dryRun:false)` 存在**错误位置改写文件**风险。
- **修复**：`spawn` 传 `cwd: exec?.agent?.session?.header?.cwd ?? undefined`，`. ` 默认解析为工作区根。

### M2. `lib/commands.js:12-14` — followup 消息缺 `id` 与 `role`，与官方 UserMessage 契约不符，并发场景抛错

- **证据**：`userMessage()` 返回 `{content:[{type:'text',text}], source:{kind:'plugin',plugin:'antares-dsh'}}`；官方一律 `createUserMessage({...})`（dsh-llm message.js:44）注入 `id: MessageId(randomUUID())`、`role:'user'` 并 deep-freeze。`Inbox.validate`（dsh-agent types/inbox.js:166-183）用 `message.id` 去重——两个 id 均为 `undefined` 的 followup 同时挂起（快速连发两次 `/deepwork`）时，第二次 splice 抛 `message "undefined" is already pending`。
- **影响**：低频但真实的并发故障；持久化消息缺身份/角色字段，偏离消息契约。
- **修复**：改用 `createUserMessage` 或等价地手工生成 uuid + `role:'user'` 并冻结。

### M3. `agent.cordis.yml:215` — `fetch: true` 但本发行版无任何 web fetch provider，`web_fetch` 每次调用必失败

- **证据**：`web_fetch` execute 走 `ctx.web.fetch()`（dsh-tool-web:706）；`dsh-web` 的 `resolveProvider` 在无 provider 且无 `DSH_WEB_FETCH_PROVIDER` 时抛 `WebError("no usable web provider is registered", "WEB_PROVIDER_UNAVAILABLE")`（dsh-web:127-129）；全库 grep 无任何 `registerFetchProvider` 调用点；官方 base 默认 `fetch: false`（SSRF 延迟防护，注释明示）。librarian persona（:277-278）与 toolFilter（:287）都依赖 `web_fetch`。
- **影响**：librarian 核心职责（抓文档原文）受损；模型被引导使用必然报错的工具；偏离官方安全默认。
- **修复**：默认 `fetch: false` 并与官方对齐（去掉 librarian allow 中 web_fetch），或 README 说明启用 fetch provider 的条件（`DSH_WEB_FETCH_PROVIDER` + provider）。

### M4. `agent.cordis.yml:19` — persona `complete: true` 使 system prompt 收敛为仅 persona 一节，plan-mode 引导 section 永不渲染

- **证据**：dsh-system-prompt 装配（:263-289）在 `complete: true` 时只保留 complete section，其余全部丢弃，包括精心编写的 `plan:policy` 引导（`:161-167`）与全部工具引导 section。官方 standard preset 不使用 complete。
- **影响**：计划模式失去"不得写文件/经 exit_plan_mode 提交计划"的行为引导文本，只剩工具 + 沙箱/审批强制。
- **修复**：去掉 `complete: true`（与官方 standard 一致，section 正常叠加）；若保留则删除 planning 组以免误导。

### M5. `agent.cordis.yml:383` — council 收口工具错配：`job_output`/`job_list` 对 continuable 子代理无效，缺 `interrupt_agent`

- **证据**：councillor 两行均为 `backgroundMode: continuable`，其工具调用返回 `{kind:'continuable', subagentId}` 不产生 job；`job_output`/`job_list` 只对 one-shot 后台任务有效。council persona（:373-374）却引导模型使用它们。allow 无 `interrupt_agent`——卡死的 councillor 无法被中断。
- **修复**：allow 改为 `[councillor-alpha, councillor-beta, list_agents, interrupt_agent]`（或补 send_message），persona 同步。

### M6. `agent.cordis.yml:77-79` + `docs/implementation.md §12` — "continuable 子代理无 task_result 等价物"表述过时

- **证据**：官方 `dsh-tool-subagent-report` 的 `report` 工具即 task_result 等价物，`registerContinuableSetup` 自动注入每个 continuable in-process 子代理（base 默认挂载）；antares 的 8 个专家全部 continuable，**运行时已自动获得 report 工具**。
- **影响**：主 Agent 被误导，可能忽略子代理的 report 投递、重复读子会话；编排损耗 + 文档失真。
- **修复**：persona 改为"continuable 子代理可用官方 `report` 工具交付自包含结果；最终文本同时在 settle 通知中；需要详情再读子会话"。

### M7. 生态依赖 — ast-grep 平台包回退依赖 `nodeLinker: hoisted` 默认布局；isolated/MUSL 下解析必失败

- **证据**：`ast-grep-bin.js:85-93` 用 `createRequire(import.meta.url).resolve('@ast-grep/cli-win32-x64-msvc/package.json')` 解析平台包；平台包是 `@ast-grep/cli` 的**传递 optional 依赖**，pnpm `isolated` 布局下不链到包级 node_modules，`require.resolve` 失败；MUSL Linux 无任何平台包（7 个均为 gnu/msvc）。profile 模板默认 `hoisted`（dsh-app-boot:340-345），故**默认路径成立**，但 `docs/release.md §4` 未写清前提。
- **精度补充（E 域核查子代理，结论不变）**：① pnpm ≥10 默认拒绝依赖构建脚本，但 pnpm 10.0–10.26 期间 git 依赖的 `prepare` 曾无审批即执行（CVE-2025-69264 / GHSA-379q-355j-w6rj），10.26.0 起才强制 `allowBuilds`——对 antares 无影响（插件自身无 build/prepare 脚本），但旧 pnpm 下 `@ast-grep/cli` 的 postinstall 可能实际运行过（属额外余量而非必需）；② 现代 pnpm（≥11.19）对 `github:` 短写走 codeload tarball 下载而非 git clone，`docs/release.md` "安装机器直接用 git 拉取"的表述在新/旧 pnpm 上实现细节略有差异，结论不变。
- **修复**：7 个平台包直挂 `package.json` `optionalDependencies`（os/cpu 自动按平台安装，esbuild 同款模式）；release.md 补 hoisted 前提与 MUSL 缺口。

### M8. `lib/ast-grep.js:159-169` — 落盘应用全部匹配，但报告只覆盖前 500 条/1MB

- **证据**：预览结果截到 `DEFAULT_MAX_MATCHES`(500) 与 1MB；落盘 `--update-all` 由 sg 应用**所有**匹配（实测 3000 全部改写）。
- **影响**：模型看到的 total/files 与实际磁盘改动不一致，后续判断系统性失真。
- **修复**：落盘后再跑一次完整 JSON 预览刷新报告，或按与预览相同的匹配范围落盘。

### M9. `lib/ast-grep.js:113,128` — 超时 kill 后若有部分输出，静默返回部分结果

- **证据**：仅当 stdout/stderr 都空才报超时；超时前已有部分输出时返回部分 stdout，无任何超时标记。
- **修复**：记录 `timedOut` 标志（kill 由 timeoutId 触发时置位），只要 timedOut 就抛错或返回 `truncated=true, truncatedReason='timeout'`。

### M10. `lib/ast-grep.js:115,127` — 已 aborted 的 signal 不会中止子进程

- **证据**：`signal?.addEventListener('abort', abort, {once:true})`——注册时已 aborted 则事件不再触发，子进程跑满全程（最长 300s）。
- **修复**：注册后立即检查 `signal?.aborted`，已中止则直接 `child.kill()` 走取消路径。

### M11. `skills/worktrees/SKILL.md:12-17,28-29,67` — 车道目录缺 git-ignore，技能自身"git status 干净"安全闸结构性无法满足

- **证据**：`git worktree add` 后主仓库恒出现未跟踪的嵌套 worktree 目录；技能 Pre-flight 与集成清单要求"git status clean"——按技能流程建完第一个车道后该闸门永远失败；`git add .` 有误提交 gitlink 风险。deepwork/clonedeps 都显式要求忽略，唯独 worktrees 漏了。
- **修复**：要求 `.gitignore` 含 `.dsh/antares-dsh/worktrees/`（及 registry `.dsh/antares-dsh/worktrees.json`）；集成清单"clean"限定为"除被忽略的 `.dsh/` 外无未跟踪改动"。

### M12. `skills/deepwork/SKILL.md:22-24` + `lib/commands.js:21` — `.ignore` 反忽略约定在本运行时无效（死约定）

- **证据**（实证）：harness `grep` argv 不带 `--hidden`，ripgrep 不进入隐藏目录 `.dsh`；`glob` 用 `--no-ignore --hidden` 无条件包含。该约定对任何模型可见工具均无效果，且会污染用户 `.ignore`。
- **修复**：删除 `.ignore` 反忽略要求，只保留 `.gitignore` 条目；Setup 说明"状态文件通过 `glob`/`read` 定位"。

---

## 3. 【轻微】

| # | 位置 | 问题 | 修复 |
|---|---|---|---|
| L1 | `lib/preset-sync.js:25-30` | `dshHome()` 缺 `resolve()` 归一化，相对 DSH_HOME 写到错误位置 | 结果套 `resolve()` |
| L2 | `lib/preset-sync.js:66` | 循环内 `statSync` 在 per-entry try 之外，罕见竞态中止整个同步 | 移入 try 计入 failed |
| L3 | `lib/ast-grep.js:28-41` | `assertSearchArgs` 不校验 paths/globs 元素类型（非字符串进 argv 报错晦涩）；replace schema 未声明 `context` 但内部支持 | 校验元素 string；schema 补 context 或移除内部支持 |
| L4 | `lib/ast-grep.js:50-62` | paths 前未加 `--` 分隔符，`-`/`--` 开头路径被 clap 误解析为 flag | paths 前加 `--` |
| L5 | `lib/commands.js:36-41` | `--last` 只认空格形式（`--last=12` 不匹配）、无下界（`--last 0` 生成 "last 0" 提示词） | 支持 `--last=N`，`Math.max(1,...)` |
| L6 | `lib/ast-grep-bin.js:71-74` | `AST_GREP_SG` env 路径不支持 `~` 展开 | 走 expandTilde |
| L7 | `lib/ast-grep.js:145-154` | 搜索路径不存在时 stderr 报错但因 stdout 非空被静默当"无匹配" | stderr 非空且非已知空结果时优先报 stderr |
| L8 | `skills/verification-planning/SKILL.md:66` | 无条件写 "may use `bash`"，Windows 上 bash 被禁用 | 改为 `bash`/`pwsh`（随平台） |
| L9 | `skills/reflect/SKILL.md:31-36` | 枚举的 `session_event_read/trace` 等在本运行时全部不存在，且与提示词枚举不一致（降级处理正确） | 统一为 `session_search` / `session_event_*` 概称并补降级说明 |
| L10 | `skills/deepwork/SKILL.md:43-44` | 每阶段强制 oracle 闸与 persona"conditional not automatic"未声明覆盖 | 加"本技能显式覆盖 persona 默认" |
| L11 | `docs/implementation.md` 多处 | §9.1 返回形状 `{ok:false,error}` 实为 `null`；§9.3 超时语义不符；§9.5 import 白名单漏 node:events/node:module；文件布局/files 清单不全；peerDependencies 声称不符 | 逐处修正 |
| L12 | `docs/self-check-report.md:37,39,44` | "23/29 行"实测 22/28；"toolName 唯一/persona/toolFilter"与"apply() mock 冒烟"在仓库内无测试支撑，手工验证写成"自动检查" | 补测试或标注手工验证；修正行数 |
| L13 | `docs/self-check-report.md:80` | 硬编码本机绝对路径 | 改相对描述 |
| L14 | 文档 §3.2/§12 | "dsh-tool-session-query 未打包"表述不准确——存在的是 `dsh-session-query`（服务，非模型工具）+ sqlite（base 默认 `openAt: never` 搜索禁用）；降级判断本身正确 | 修正包名与事实 |
| L15 | `tests/agent-preset.test.mjs` | 正则解析 YAML 脆弱：计数断言漏 toolName 碰撞/缺 persona；`^---` 无 m 标志对 BOM/前导空行敏感 | 按 §11.1 计划改 js-yaml 结构化断言 |
| L16 | `lib/ast-grep-bin.js:43-55` | 缓存目录解析是死路径（无代码写入） | 保留（手工放置运维口子），README 注明 |

---

## 4. 控制器复核与修正记录

以下关键契约由控制器独立核实（读官方运行时源码），其中两处子 agent 结论被实证修正：

1. ✅ **确认** `agent.followup(UserMessage): void` 存在（dsh-cordis-host-runner typert.host.js:819 interface Agent；dsh-agent-loop:396-398），antares 用法方向正确。
2. ✅ **确认** `ctx.tools.register` 不调用 defineTool 编译 parameters——只校验 `output.schema`（受支持子集）+ render 函数，antares 原生 JSON Schema 注册静态契约成立；execute 内自校验 args。
3. ✅ **确认** output.schema 受支持子集（type/oneOf/properties/required/additionalProperties/items/enum/const）覆盖 antares 全部写法。
4. ✅ **确认** presentResult 收到 `{isError, error?, content, meta?, ...}`，search 读 `result.meta.matches`、replace 读 `result.content` 均成立。
5. ✅ **确认** `provider: "spawn"` 由 dsh-base 默认装载（subagent-spawn-in-process），8 个专家基础成立；`backgroundMode: "continuable"` 合法。
6. ✅ **确认** 命令契约：`{kind:'success'|'error', text}` + `invocation.rawInput/agent` 与 dsh-commands normalizeDefinition/normalizeResult 逐字段兼容。
7. ✅ **确认** plan-mode 模型可见工具名 `exit_plan_mode`（plan/plan:policy 为内部名）。
8. ✅ **实证** S2（JSON 截断误报）：3000 匹配 = 1.31MB 单行 compact，0 换行——成立。
9. 🔧 **修正 S1**：`events.once` 隐式 error 监听使 spawn 失败**不崩溃宿主**（复现确认进程存活），但错误被误报为 "ast-grep timed out"——严重度从"崩溃宿主"降为"错误被吞/误导"。
10. 🔧 **修正 D 域计数**："23/29 顶层行"实测 22/28（自检报告未同步删除 session-query 行的计数）。

---

## 5. 生态整合建议（官方/生态优先）

| 建议 | 做法 | 理由 |
|---|---|---|
| S1 补挂官方 `tool-goal` | preset 加 `- id: tool-goal / name: '@deepseek-ai/dsh-tool-goal'` | create_goal/get_goal/update_goal 会话级持久目标，与 deepwork markdown 进度互补；注意 create_goal 要求直接人工回合，deepwork 激活提示词不应要求它 |
| S2 补挂官方 `tool-ralph` | preset 加 tool-ralph 行（subagentProvider: spawn, maxRounds: 64） | 用户显式要求 Ralph/fresh-agent 迭代时的官方合规实现；与 `/loop` 语义互补不替换 |
| S3 补挂官方 `tool-workflow` + `workflow-worker-thread` | 2 行 YAML | 脚本化确定性 fan-out，与 deepwork/council 不重叠 |
| S4 ast-grep 保留自研 | — | 生态 1837 条无 ast-grep 插件（实证 0 命中），不构成重复造轮子；codemap 未来可对接 codegraph 等生态插件 |
| S5 提交 awesome-dsh-plugin 收录 | — | 满足入选协议（dsh.bundle + ≥10 commits + dsh-plugin topic），差异化明显 |
| S6 平台包直挂 optionalDependencies | 见 M7 | 任何 linker 布局下解析恒命中，不依赖 postinstall/allowBuilds |
| S7 测试补强 | 见 §2.8 | runSg/runOne、resolveAstGrepPath 全分支、dshHome/expandTilde、apply() 冒烟 |

**上游覆盖对照**：8 专家（除 Observer 明确不做）、3 命令、2 ast-grep 工具、8 skills 全部覆盖，无遗漏核心功能；`/loop`、deepwork 编排、council、ast-grep 均无官方替代品，保留自研正确。

---

## 6. 测试与验证缺口（D 域重点）

1. **`runSg`/`runOne`（spawn/超时/abort/两步 apply）零测试**——`implementation.md:428` 计划的 fake-sg 测试一条未落地；且实测 `:152` 'No files found' 分支在 sg 0.45.1 是死代码、超时语义与文档不符。
2. **`resolveAstGrepPath` 六条分支零覆盖**——无任何测试 import ast-grep-bin.js。
3. **`expandTilde`/`dshHome` 未测**（DSH_HOME 覆盖/空串/~ 展开）。
4. **`commandDefinition` 断言不足**——recordInput/hint 元数据、loop 空输入 error、`--last` 100 上限 clamp。
5. **`registerAstGrepTools`/`apply()` 从未被测试执行**（self-check 声称的 apply mock 冒烟在仓库内无支撑）。
6. **无 CI**——发布流程无自动验证。
7. 已验证无问题：`node --test` 24/24 可复现、`node --check` 9 文件全过、测试 import 与 lib exports 匹配、`dsh.bundle.patch` manifest 合规、README 与 ast-grep 解析顺序一致。

---

## 7. 最值得先做的修复清单（按性价比）

1. **S1**：ast-grep 大结果截断误报（流式/按匹配计数解析 + truncated 不隐藏）——影响搜索与替换正确性。
2. **S2**：spawn error 监听 + 正确错误消息——一行代码封堵误导性诊断。
3. **M1**：spawn 传会话 cwd——消除错误目录改写风险。
4. **M2**：`userMessage` 补 id/role——消除并发 followup 抛错与消息契约偏差。
5. **M3**：`fetch: false`——消除 librarian 必失败工具。
6. **M4**：去掉 `complete: true`——恢复 plan-mode 引导。
7. **M6**：改写"无 task_result 等价物"表述——让主 Agent 消费官方 report 通道。
8. **M11/M12**：worktrees 补 git-ignore、deepwork 删 .ignore 死约定——技能自洽。
9. **M7/S6**：平台包直挂 optionalDependencies——发布健壮性。
10. **S7**：补 runSg/runOne/resolveAstGrepPath 测试——钉住上述修复。

---

*本报告由 5 个并行审查域 + 控制器复核生成；所有子 agent 结论经独立证据核验（官方运行时源码、真实二进制实测、生态目录实证）。审查过程只读，未修改任何文件。*
