# antares-dsh 最简发布与恢复流程

目标：把本插件上传到 GitHub，然后在另一台机器上用 dsh 恢复安装。

## 0. 一次性的上传前准备

- [ ] 创建 GitHub 仓库（推荐 public，原因见下），仓库名建议 `antares-dsh`
- [ ] 把本目录作为 git 根目录提交：
  ```bash
  cd antares-dsh
  git init
  git add .
  git commit -m "antares-dsh v0.1.0"
  git branch -M main
  git remote add origin https://github.com/<owner>/antares-dsh.git
  git push -u origin main
  ```
- [ ] 检查仓库里没有本机绝对路径（本仓库已检查：README、代码、preset、skills 均无）
- [ ] 首次发布打 tag：
  ```bash
  git tag v0.1.0
  git push origin v0.1.0
  ```

## 1. 另一台机器安装

机器上已装 dsh，选择一个 profile 名（不存在会自动初始化）：

```bash
dsh plugin --profile desktop add github:<owner>/antares-dsh#v0.1.0
```

- `#v0.1.0` 是版本固定；也可以写完整 commit sha 更严格。
- 安装完成后**完全重启 dsh**，新建会话并选择 **Antares DSH** preset。
- 首次启动时插件会把 preset 与 skills 复制到 `~/.dsh/.agent-presets/antares-dsh/`。
- 若 profile 是新建的，`dsh plugin add` 会自动带上官方 `@deepseek-ai/dsh-base`。

## 2. 发布新版本（最简流程）

每次要发版：

```bash
cd antares-dsh
# 1. 改 package.json 的 version（例如 0.1.1），并提交代码
git commit -am "release v0.1.1"
# 2. 打同名 tag（v + package.json 的 version）
git tag v0.1.1
git push origin main
git push origin v0.1.1
```

升级机器上已安装的版本：

```bash
dsh plugin --profile desktop add github:<owner>/antares-dsh#v0.1.1
```

然后重启 dsh。**注意**：本插件对已安装的
`~/.dsh/.agent-presets/antares-dsh/` 采取不覆盖策略；如果升级需要新的
preset/skills，先删除该目录再重启，插件会重新同步（你的模型配置若有手工
修改，请先备份）。

## 3. 仓库必须 public 吗？

- **推荐 public**：`dsh plugin add github:owner/repo#tag` 底层是 pnpm 的 git
  依赖，安装机器直接用 git 拉取。public 仓库零配置、零凭据即可恢复。
- **private 可以，但有前提**：目标机器必须配置了能访问该私有库的 git
  凭据（HTTPS PAT 或 SSH deploy key），并且 `dsh plugin add` 拉取时才不会
  失败。官方发布文档没有为私有库认证提供额外封装，等于把认证问题交给
  pnpm/git。因此"换一台机器最省事"的选择是 public。
- 如果不想 public 又想免认证，可选 npm 私有源或 tarball 分发，但都增加
  一步操作，不符合"最简约"。

## 4. 为什么 GitHub 安装可以直接用，不需要 build

本插件是纯 ESM JavaScript，`package.json` 没有 `build` / `prepare` 脚本，
`main` 直接指向仓库内 `lib/index.js`。官方文档规定 git 安装只会拉源码、
不跑 build；因此本包不会遇到"装完没有产物"的问题，也不需要
`pnpm-workspace.yaml` 的 `allowBuilds` 白名单。

依赖 `@ast-grep/cli` 是普通 npm 依赖，会随插件一起安装；即使它的
postinstall 被 pnpm 拦截，ast-grep 的解析顺序仍会回退到平台专用二进制包，
工具照常工作。

## 5. 本仓库的无绝对路径保证

运行时与安装路径全部为相对/约定路径：

- `cordis.patch.yml` 只引用包名 `antares-dsh`
- preset/skills 通过 `baseUrl` 相对解析
- `lib/preset-sync.js` 使用 `DSH_HOME` / `~/.dsh`
- ast-grep 使用 npm 包解析 + 平台缓存目录，不写死机器路径

安装命令中的 `<owner>` 是占位符，替换为你的 GitHub 用户名或组织名。
