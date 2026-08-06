# Vibe Gallery

面向 CHI 协作式 Vibecoding 研究的异步社交创作平台。平台研究社区讨论如何经过用户主动综合和平台内 AI 原型化，转化为可以运行的 Community Version。

## 当前研究流程

1. 12 位 Creator 分别自由创作并发布一个 Initial App。
2. 任一 Initial App 发布后，24 位 Community Member 都可立即体验和评论，不需要等待其他 App，也不需要 Host 解锁。
3. Host 在研究开始前手动选择 6 位 Creator 和 12 位 Community Member 进入对照组；其余参与者进入 Vibe Gallery 条件。系统不再随机分组，所有参与者仍可看到全部作品。
4. 每名 Community Member 从全部 12 个 App 中被平衡分配 3 个需要认真体验的作品，同时可以自由浏览其他作品。
5. 普通评论区支持自由评论、连续回复和点赞，不要求填写结构化“亮点”。
6. Vibe Gallery 条件中，用户可以把评论、回复或已有综合评论加入私有的“创意篮子”。
7. 用户在目标 App 下从创意篮子选择至少两条素材，发布一条新的综合评论；至少一条素材必须来自目标 App。
8. Vibe Gallery App 使用固定横向创意画布展示“普通评论 → 多级综合 → Creator 选择”，自动排序被采用的素材并绘制来源连线。
9. 系统保留每条综合评论的原作者、来源 App、版本和讨论位置，并允许已有综合评论继续成为新综合的来源。
10. 目标 App 的 Creator 可以让平台 AI 读取 Initial Version、综合评论和直接来源，生成 Community Version 草稿。
11. Creator 试玩、修改并发布 Community Version；Initial Version 始终保留。
12. 首页在同一 App 卡片中并列展示 Initial Version 和 Community Version。

对照条件保留 App 瀑布流、普通评论、回复和点赞，不提供创意篮子、综合评论或平台内 AI 原型化。Creator 使用外部工具完成 Community Version 后上传平台。

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
