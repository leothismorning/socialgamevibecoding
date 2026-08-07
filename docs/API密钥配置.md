# API 密钥配置说明

本文档说明 Vibe Gallery 运行时需要哪些模型 API Key，以及如何在本地或 Railway 中配置。项目默认使用 GPT-5.5（Sui-Xiang）；只使用默认模型时，仅需配置 `SUIXIANG_API_KEY`。

> 安全要求：不要把真实 Key 写入本文件、`.env.example`、聊天记录或 Git 提交。真实 Key 应放在本地 `.env.pool.local`、`.env.local`、Railway Variables 或团队密码管理器中。项目已通过 `.gitignore` 排除这些本地环境变量文件。

## 一、最短可运行配置

在项目根目录执行：

```powershell
Copy-Item .env.example .env.local
```

打开 `.env.local`，至少填写：

```dotenv
SUIXIANG_API_KEY="在安全渠道收到的真实Key"
SUIXIANG_BASE_URL="https://sui-xiang.com"
```

然后启动项目：

```powershell
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。项目服务端会依次读取根目录的 `.env.pool.local`、`.env.local` 和 `.env`；无需、也不能把 Key 写入前端代码。

## 二、变量清单

| 模型选项 | 环境变量 | 是否必填 | 用途 |
| --- | --- | --- | --- |
| GPT-5.5（默认） | `SUIXIANG_API_KEY` | 使用默认模型时必填 | Sui-Xiang 共享 Key 池的第一把 Key |
| GPT-5.5（默认） | `SUIXIANG_BASE_URL` | 可选 | Sui-Xiang 网关地址；未填写时默认使用 `https://sui-xiang.com` |
| GPT-5.5（默认） | `SUIXIANG_API_KEY_APP2` / `APP3` | 可选 | 兼容旧配置；现在都会加入共享 Key 池，不再固定给 C02/C03 |
| GPT-5.5（默认） | `SUIXIANG_API_KEY_POOL_4` / `POOL_5` | 可选 | 共享 Key 池中的额外 Key |
| DeepSeek V4 Flash / Pro | `DEEPSEEK_API_KEY` | 选择 DeepSeek 时必填 | Flash 与 Pro 共用同一个 DeepSeek Key |
| Gemini 2.5 Flash | `GEMINI_API_KEY` | 选择 Gemini 时必填 | Google Gemini API Key |
| GLM-5.2 | `GLM_API_KEY` | 选择 GLM 时必填 | 智谱开放平台 API Key |

不需要同时配置全部供应商。平台在同一时刻只使用当前选择的模型，缺少未使用模型的 Key 不会影响运行。

## 三、多人实验时的 GPT-5.5 Key 分配

只配置 `SUIXIANG_API_KEY` 即可运行。多人实验可以配置多把 Key：

```dotenv
SUIXIANG_API_KEY="第一把Key"
SUIXIANG_API_KEY_APP2="第二把Key（兼容旧变量名）"
SUIXIANG_API_KEY_APP3="第三把Key（兼容旧变量名）"
SUIXIANG_API_KEY_POOL_4="第四把Key"
SUIXIANG_API_KEY_POOL_5="第五把Key"
```

所有 Key 会自动去重并进入同一个 FIFO 池。每个 Creator 开发任务独占一把空闲 Key；全部 Key 都在使用时，新任务显示排队位置并等待。任一任务完成或失败后都会释放 Key，队首任务自动开始。同一 Creator 同时仍只允许一个开发任务。

Key 池同时覆盖初始创建、发布前继续修改、Host 锁定轮次后的系统开发和失败重试。额外 Key 只应用于供应商账户允许的并发范围，不应用于规避账户或上游限流。

## 四、Railway 部署配置

1. 打开 Railway 中对应的服务。
2. 在 Variables 中添加当前模型所需的同名变量。
3. 默认模型至少添加 `SUIXIANG_API_KEY`；如使用额外 Key，也添加 `SUIXIANG_API_KEY_APP2`、`SUIXIANG_API_KEY_APP3`、`SUIXIANG_API_KEY_POOL_4`、`SUIXIANG_API_KEY_POOL_5`。`SUIXIANG_BASE_URL` 不填也会使用默认地址。
4. 保存变量并重新部署服务。
5. 部署完成后，使用一个 Creator 编号生成初始应用，确认模型请求成功。

Railway 中不需要上传 `.env.local`，也不要在构建日志或公开截图中显示 Key。

## 五、把配置交给其他成员

推荐的交付方式是把本文件和仓库发给对方，同时通过密码管理器、一次性密钥链接或其他加密渠道单独发送真实 Key。对方收到后只需将 Key 填入 `.env.local` 或 Railway Variables。

如果团队选择共用 Key，应同时约定：

- Key 的负责人和可访问成员；
- 额度上限与限流策略；
- 实验结束后的轮换或吊销时间；
- Key 泄露后的立即吊销流程。

## 六、常见错误

| 报错或现象 | 检查方法 |
| --- | --- |
| `SUIXIANG_API_KEY is not configured on the server.` | 确认 `.env.local` 位于项目根目录，变量名拼写正确，修改后已重启服务 |
| 请求返回 401 / 403 | Key 无效、过期、权限不足或余额不可用；到对应供应商后台检查 |
| 请求返回 429 | 检查随想账户/分组总并发与 RPM；减少池中同时使用的 Key，或联系供应商提高授权额度 |
| Railway 本地正常、线上失败 | 确认 Key 已添加到正确服务的 Variables，并在保存后重新部署 |
| 浏览器前端找不到 Key | 这是正常现象；Key 只保存在服务端，任何变量都不要添加 `VITE_` 前缀 |
