# Vibe Gallery

面向 CHI 协作式 Vibecoding 研究的异步社交创作平台。平台研究社区讨论如何经过用户主动综合和平台内 AI 原型化，转化为可以运行的 Community Version。

## 当前研究流程

1. 50 位 Creator 使用实验编号 `1–50` 登录（密码与编号相同）；Host 使用 `0 / 0` 登录。
2. Host 在研究开始前选择若干 Creator 作为测试角色。测试角色与正式角色进入彼此隔离的社区；Host 可分别开启或结束两边的总流程。
3. Creator 可以用 AI 创作或上传之前保存的 HTML 还原项目，再发布 Initial App（V0）；只要作品从未收到普通评论、回复或综合评论，Creator 就可以删除自己的作品并重新创建。
4. V0 发布后 App 自动进入第一轮评论，V1 发布后自动进入第二轮评论，V2 发布后自动结束。Host 可单选或多选 Creator，锁定第一轮或第二轮并启动开发，也可在安全条件下回退到本轮评论。
5. Host 锁定每轮点赞后，系统按点赞权重抽取开发方向，并在平台内生成 Community Version 草稿；Host 可查看每个人当前轮次的普通评论数、综合评论数、任务状态和失败原因，并重新开发。
6. Creator 试玩、修改后使用“发布并且保存”发布 Community Version；浏览器同时把对应 V0/V1/V2 HTML 代码保存到本机，Initial Version 始终保留。
7. 测试流程与正式流程各自结束后会单独显示“新建研究”。点击后先下载一个以 Host 点击时间命名的 ZIP（含研究 JSON 与所有作品版本代码），再只清空并重置对应流程；另一边不受影响。
8. 正式实验前，Host 也可以永久清除测试角色的全部数据，包括测试作品、版本、互动和开发记录；正式角色数据不受影响。

完整功能说明见 [docs/当前功能与实验流程.md](docs/当前功能与实验流程.md)。

## 本地运行

前置条件：Node.js。

1. 安装依赖：`npm install`
2. 按照 [API 密钥配置说明](docs/API密钥配置.md) 创建 `.env.local` 并配置当前模型所需的 API Key。
3. 启动 React、Express 和 SQLite：`npm run dev`
4. 打开 `http://localhost:3000`

默认 SQLite 数据库位于 `data/vibecoding-study.db`，该文件不会提交到 Git。

## 数据持久化

- 本地运行：App、版本、评论和行为日志保存在 `data/vibecoding-study.db`，更新代码不会删除该文件。
- Railway：为服务挂载 Volume 后，程序会自动读取 Railway 提供的挂载路径，并将数据库保存在 Volume 中。
- 推荐 Railway 将 Volume 挂载到 `/data`，并设置 `STUDY_DB_PATH=/data/vibecoding-study.db`。
- 如果 `STUDY_DB_PATH` 意外指向 Volume 之外，程序会自动改用 Volume 内的 `vibecoding-study.db`，避免重新部署时丢失实验数据。
- Railway 启动日志会输出 `[storage] SQLite database: ... (railway-volume, persistent)`，实验前应确认出现该信息。
- 正式实验使用单个 Replica，并在 Railway 中为 Volume 开启备份。

## 检查命令

- `npm run lint`
- `npm run build`
- `npm run test:community-gallery`
- `npm run test:gallery`：保留的旧三轮机制回归测试
