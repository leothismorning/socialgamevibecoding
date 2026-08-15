# Codex Worker 使用说明

Codex Worker 让参与者在平台点击“创建作品”后，把初始作品开发任务排入 Railway 队列，再由研究者电脑上的 Codex 完成。参与者不需要安装 Codex，也不需要等待页面一直打开；开发完成后，草稿会自动回传到原账号，仍由 Creator 决定是否发布。

## 一次性配置

1. 在 Railway 服务的 Variables 中新增 `CODEX_WORKER_TOKEN`，值使用一段足够长的随机字符串。不要把真实令牌提交到 GitHub。
2. 本地安装依赖：`npm install`。项目已经固定安装官方 `@openai/codex` CLI，不会调用 Windows 商店目录中的 Codex 程序。
3. 在本机登录 Codex：`npm exec codex -- login`。登录凭据只保存在本机，不会上传到平台或 GitHub。

Railway 可选变量：

- `CODEX_WORKER_LEASE_MS`：Worker 异常退出后，任务多久可以被重新领取，默认 15 分钟。

## 每次实验启动

在 PowerShell 中运行：

```powershell
$env:CODEX_WORKER_TOKEN = "与 Railway 完全相同的令牌"
npm run codex-worker -- --url https://socialgamevibecoding-production.up.railway.app
```

看到“Codex Worker 已启动”后即可让参与者创建作品。电脑和命令窗口需要保持运行；按 `Ctrl+C` 可安全停止。Worker 离线时任务不会丢失，会继续保存在 Railway 的 SQLite 队列中，待下次启动后处理。

## 工作方式

1. Creator 提交应用名称、简介和创作提示。
2. Railway 只保存任务并立即返回，页面显示“等待 Codex”。
3. 本地 Worker 领取一个任务，在 `.codex-worker-tasks/` 中创建独立目录。
4. Codex 在只读沙箱中读取 `request.md`，把完整单文件 HTML 返回给 Worker。
5. Worker 保存并校验 `result.html` 后回传；Creator 页面自动显示可试玩、可继续修改的草稿。
6. Creator 点击发布后作品才正式进入社区。

任务目录和 Worker ID 已加入 `.gitignore`。Creator 输入只会作为作品需求写入任务文件；Codex 使用临时会话、忽略本机自定义规则、关闭网络，并在只读沙箱中运行。只有固定的 Worker 程序能够保存最终 HTML。Worker 令牌、本机 API Key 和 Codex Desktop 内部环境变量不会传入 Codex 子进程。

## 常见问题

- 显示“令牌无效”：确认本机和 Railway 的 `CODEX_WORKER_TOKEN` 完全一致，并让 Railway 应用新变量后重新部署。
- 提示未登录：运行 `npm exec codex -- login`。
- Worker 关闭：重新运行启动命令即可；等待中的任务会继续处理。
- 单个任务失败：平台保留失败原因和已有草稿，Creator 可以重新提交创建或修改请求。
- 只处理一个任务后退出：在启动命令末尾加 `--once`。
