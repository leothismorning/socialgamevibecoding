import React from 'react';

export type AsyncGalleryLocale = 'zh-CN' | 'en';

const STORAGE_KEY = 'vibe-gallery-locale';

const exactTranslations: Record<string, string> = {
  '暂无平台内贡献者': 'No contributors yet',
  '等待发布初始版本 V0': 'Waiting for initial version V0',
  '第一轮评论与综合进行中': 'Round 1 feedback and synthesis in progress',
  '第一轮已锁定，系统开发进行中': 'Round 1 locked · development in progress',
  '等待发布社区版本 V1': 'Waiting for community version V1',
  '第二轮评论与综合进行中': 'Round 2 feedback and synthesis in progress',
  '第二轮已锁定，系统开发进行中': 'Round 2 locked · development in progress',
  '两轮流程均已完成': 'Both development rounds completed',
  '进入可视区域后加载低帧率预览': 'Preview loads when it enters the viewport',
  '作品加载中': 'Loading app',
  '加入创意共创社区': 'Join the creative community',
  '把社区讨论变成可以运行的作品': 'Turn community ideas into working apps',
  '使用实验编号登录。创作者账号为 1–50，密码与账号相同；主持人账号和密码均为 0。': 'Sign in with your study ID. Creator accounts are 1–50 and use the same number as the password; the Host account and password are both 0.',
  '账号（实验编号）': 'Account (study ID)',
  '密码': 'Password',
  '请输入密码': 'Enter password',
  '登录': 'Sign in',
  '理解需求': 'Understand request',
  '搭建页面': 'Build interface',
  '检查图片': 'Check visuals',
  '完善样式': 'Refine styles',
  '实现交互': 'Implement interactions',
  '整理说明': 'Prepare summary',
  '最终检查': 'Final validation',
  '最新版本已发布': 'Latest version published',
  '初始版本': 'Initial version',
  '当前为': 'Currently viewing',
  '下一轮开发只能由主持人锁定本轮点赞并完成抽取后启动；生成草稿后，你可以继续修改并决定是否发布。': 'The next round starts after the Host locks likes and completes the draw. You can revise the generated draft and decide whether to publish it.',
  '继续开发': 'Continue developing',
  '打开我的 App': 'Open my app',
  '查看作品、版本和评论': 'View the app, versions, and comments',
  '作品已有评论，不能删除': 'This app has comments and cannot be deleted',
  '删除这个 App 并重新开始创作': 'Delete this app and start over',
  '删除这个 App': 'Delete this app',
  '创作者 · 持续开发': 'Creator · Ongoing development',
  '已上线项目': 'Published project',
  '本轮修改已保存为草稿': 'This update was saved as a draft',
  '本轮修改未完成': 'This update did not finish',
  '系统正在启动 AI 开发': 'Starting AI development',
  '请根据页面提示调整后重试。': 'Follow the on-screen guidance and try again.',
  '正在准备开发环境，请稍候。': 'Preparing the development environment…',
  '系统正在开发中': 'Development in progress',
  '请不要刷新页面或关闭窗口，完成后会生成待发布草稿。': 'Keep this page open. A draft will be created when development finishes.',
  '与 AI 继续开发': 'Continue developing with AI',
  '可以开始新的多轮开发对话': 'Start a new multi-turn development session',
  '草稿模式': 'Draft mode',
  '创作者持续开发对话': 'Creator development conversation',
  '你': 'You',
  '开发助手': 'Development assistant',
  '请输入你希望继续修改或增加的功能。': 'Describe what you want to change or add.',
  '例如：保留现有功能，增加收藏筛选，并优化移动端交互…': 'For example: keep existing features, add saved-item filters, and improve mobile interactions…',
  '正在修改…': 'Updating…',
  '发送更新': 'Send update',
  '发布': 'Publish',
  '草稿已就绪；发布后首页和详情页才会更新。': 'Draft ready. The home and detail pages update only after publication.',
  '发送更新只生成草稿，不会直接修改公开项目。': 'Sending an update creates a draft and does not change the public app.',
  '待发布草稿预览': 'Unpublished draft preview',
  '当前公开项目预览': 'Current public app preview',
  'AI 开发中，请勿刷新': 'AI development in progress',
  '草稿已保存 · 尚未发布': 'Draft saved · Not published',
  '当前已发布版本': 'Current published version',
  '开发请求连接已经中断，本轮开发失败，请重试。': 'The development connection was interrupted. Try this round again.',
  '等待领取': 'Waiting to be claimed',
  'Codex 开发': 'Codex development',
  '保存草稿': 'Save draft',
  'HTML 文件不能超过 8MB。': 'The HTML file must be 8 MB or smaller.',
  '请选择完整的 HTML 项目文件。': 'Choose a complete HTML project file.',
  '恢复的应用': 'Restored app',
  '从本地 HTML 备份恢复的项目。': 'Project restored from a local HTML backup.',
  '创作 · 初始版本': 'Create · Initial version',
  '先完成你的独立作品': 'Create your independent app first',
  '可以提交给 Codex 生成新草稿，也可以上传之前保存的 HTML 恢复项目。只有你确认满意并主动发布后，作品才会出现在首页。': 'Ask Codex to generate a draft or restore a saved HTML file. Your app appears on the home page only after you review and publish it.',
  '第 1 / 4 步 · 创作': 'Step 1 of 4 · Create',
  '本轮开发已经完成': 'Development completed',
  '开发失败，请重试': 'Development failed · Try again',
  '系统正在启动 Codex 开发': 'Starting Codex development',
  '本轮开发失败，请重试。': 'This development attempt failed. Try again.',
  '任务正在等待 Codex Worker': 'Waiting for Codex Worker',
  'Codex 正在开发中': 'Codex is developing',
  '本机 Worker 上线后会自动领取；你可以离开页面，不需要重复点击。': 'Your local Worker will claim this task when it comes online. You may leave this page.',
  '你可以离开当前页面，完成后草稿会自动保存并显示。': 'You may leave this page. The draft will be saved and displayed automatically.',
  '本轮开发已经停止': 'Development stopped',
  '本次失败不会保存不完整的作品，请点击下方按钮重新生成或重新修改。': 'No incomplete app was saved. Use the button below to regenerate or revise it.',
  '应用名称': 'App name',
  '一句话简介': 'One-line description',
  '创作提示词': 'Creation prompt',
  '等待 Codex 领取…': 'Waiting for Codex…',
  'Codex 正在开发…': 'Codex is developing…',
  '重新生成应用草稿': 'Regenerate app draft',
  '使用 Codex 生成草稿': 'Generate draft with Codex',
  '正在恢复…': 'Restoring…',
  '从本地恢复项目': 'Restore local project',
  '上传之前保存的 HTML 并还原项目': 'Upload saved HTML and restore the project',
  '可运行草稿已生成': 'Working draft generated',
  '你可以在右侧试玩，并继续告诉 AI 怎样修改。': 'Try it on the right and tell AI what to change.',
  '想重新开始？': 'Want to start over?',
  '评论阶段已经开始；仍可清除未发布草稿，但重新发布越晚，获得反馈的时间可能越短。': 'Feedback has started. You can still clear an unpublished draft, but publishing later may reduce feedback time.',
  '清除当前未发布草稿和修改记录，回到初始创建界面。': 'Clear the unpublished draft and revision history, then return to the creation screen.',
  '正在删除…': 'Deleting…',
  '删除当前项目并重新开发': 'Delete project and start again',
  '与 Codex 继续修改': 'Continue revising with Codex',
  '可以开始多轮对话修改': 'Start a multi-turn revision session',
  '发布前草稿': 'Pre-publication draft',
  '创作者与 AI 的修改对话': 'Creator and AI revision conversation',
  '草稿已经就绪，请提出第一条修改要求。': 'The draft is ready. Enter your first revision request.',
  '例如：保留现在的功能，把首页改成更简洁的卡片布局，并增加搜索…': 'For example: keep current features, simplify the home-card layout, and add search…',
  '修改草稿': 'Revise draft',
  '实时预览': 'Live preview',
  '等待创建': 'Waiting to be created',
  '生成或上传后在这里试玩': 'Generate or upload an app to try it here',
  '发布并且保存': 'Publish and save',
  '指定体验': 'Assigned app',
  '社区共创': 'Community co-creation',
  '测试角色作品': 'Test-role app',
  '社区共同创作 · 最新版本': 'Community co-created · Latest version',
  '原创应用': 'Original app',
  '等待社区版本': 'Waiting for community version',
  '社区综合讨论后形成的最新可运行版本。': 'Latest working version created from community ideas.',
  '一个由创作者自由创作的应用。': 'An independently created app.',
  '最新社区版本由社区想法推动开发': 'Latest community version developed from community ideas',
  '累计贡献者：': 'Contributors: ',
  '给当前版本点赞，可随时取消': 'Like this version; you can undo it anytime',
  '主持人不能点赞、不能点赞自己的作品，研究结束后内容只读': 'The Host cannot like apps; creators cannot like their own apps; closed studies are read-only',
  '已点赞': 'Liked',
  '点赞': 'Like',
  '进入体验与讨论': 'Open app and discussion',
  '确定删除这条评论吗？删除后不能恢复，评论卡片会从页面中消失；系统仍会保留必要的引用关系和行为记录。': 'Delete this comment? This cannot be undone. Its card will disappear, while required reference and activity records will be retained.',
  '已编辑': 'Edited',
  '编辑': 'Edit',
  '删除': 'Delete',
  '取消': 'Cancel',
  '保存修改': 'Save changes',
  '已收藏': 'Saved',
  '收藏': 'Save',
  '发布回复': 'Post reply',
  '继续讨论这条综合评论…': 'Continue discussing this synthesis…',
  '分享体验、建议、技术细节或新的使用场景…': 'Share an experience, suggestion, technical detail, or new use case…',
  '还没有讨论，来提出第一个想法吧。': 'No discussion yet. Add the first idea.',
  '综合评论来源': 'Synthesis sources',
  '创意来源': 'Idea sources',
  '这条综合评论连接了以下直接创意来源。原作者、来源应用和讨论位置都会被保留。': 'This synthesis links the direct sources below. Original authors, source apps, and discussion locations are preserved.',
  '综合者说明：': 'Synthesizer note: ',
  '版本开发关系': 'Version lineage',
  '作者从社区讨论中选择一个或多个方向；社区版本 1 基于初始版本，社区版本 2 固定基于社区版本 1': 'The creator develops one or more community directions. Community V1 builds on V0, and V2 builds on V1.',
  '起点': 'Starting point',
  '可选': 'Available',
  '外部开发版本': 'Externally developed version',
  '等待作者从第二轮讨论中选择开发方向': 'Waiting for a Round 2 development direction',
  '等待作者从评论区选择开发方向': 'Waiting for a development direction from comments',
  '综合评论下的新讨论': 'Discussion under a synthesis',
  '可视化创意演化': 'Visual idea evolution',
  '创意演化画布': 'Idea evolution canvas',
  '位置由系统自动排列。被采用的评论置顶，连线显示它们如何进入综合方向；向右代表继续综合。': 'Cards are arranged automatically. Adopted ideas move to the top, and links show how ideas feed into syntheses. Moving right means further synthesis.',
  '条来源连线': 'source links',
  '当前 App 的评论和综合入口已暂停，由 Host 单独推进流程。': 'Comments and synthesis are paused for this app while the Host advances its workflow.',
  '提出一个新想法': 'Share a new idea',
  '发布后会进入左侧“普通评论”列': 'It will appear in the Ordinary Comments column',
  '发布评论': 'Post comment',
  '普通评论与外部素材': 'Comments and external sources',
  '继续综合': 'Continue synthesis',
  '已采用内容自动置顶': 'Adopted content is pinned to the top',
  '从收藏夹创建下一方向': 'Create the next direction from saved items',
  '创建下一条综合评论': 'Create another synthesis',
  '收藏或选择至少两条素材，系统会自动生成新的节点和连线。': 'Save or select at least two sources to create a new node and its links.',
  '打开收藏夹': 'Open saved items',
  '综合下的讨论': 'Synthesis discussion',
  '普通评论': 'Ordinary comment',
  '跨应用收藏夹素材': 'Saved source from another app',
  '跨应用综合': 'Cross-app synthesis',
  '已采用': 'Adopted',
  '正在开发': 'In development',
  '来源': 'Sources',
  '讨论': 'Discuss',
  '按入选提示词开发': 'Develop from selected prompt',
  '还没有普通评论': 'No ordinary comments yet',
  '发布第一个想法后，节点会出现在这里。': 'Post the first idea to create a node here.',
  '普通评论与回复': 'Comments and replies',
  '综合评论': 'Synthesis',
  '创作者选择开发': 'Creator-selected development',
  '回复评论': 'Reply to comment',
  '回复想法': 'Reply to idea',
  '继续补充、追问或发展这个想法…': 'Add detail, ask a question, or develop this idea…',
  '综合评论讨论': 'Synthesis discussion',
  '讨论这个方向': 'Discuss this direction',
  '分阶段集体创作': 'Staged collective creation',
  '普通评论和综合评论都可以随时点赞或取消赞；主持人锁定本轮点赞后，会按点赞数加权随机抽取并立即启动开发。': 'Comments and syntheses can be liked or unliked at any time. After the Host locks a round, a like-weighted draw selects development sources.',
  '条采用连线': 'adoption links',
  '使用一次性万能卡，指定第一轮或第二轮的一条普通评论进入本轮开发': 'Use the one-time wildcard to guarantee one ordinary comment enters development',
  '使用万能卡': 'Use wildcard',
  '取消选择': 'Cancel selection',
  '点击第一轮或第二轮的一条普通评论，使用万能卡保证它进入本轮开发。': 'Select an ordinary comment in Round 1 or 2 and use your wildcard to guarantee its development.',
  '第一轮评论与采用来源': 'Round 1 comments and sources',
  '第一次综合': 'Round 1 syntheses',
  '第二轮评论与采用来源': 'Round 2 comments and sources',
  '第二次综合': 'Round 2 syntheses',
  '可选择 Initial 评论及收藏夹来源': 'Select V0 comments and saved sources',
  '初始版本下产生的评论与第一轮外部来源': 'Comments on V0 and Round 1 external sources',
  '社区版本 1 的新评论及本轮收藏夹来源，可与前两列共同选用': 'New V1 comments and saved sources can be combined with the first two columns',
  '社区版本 1 下产生的新评论与第二轮外部来源': 'New V1 comments and Round 2 external sources',
  '针对社区版本 1 提出普通评论': 'Comment on community version 1',
  '针对初始版本提出普通评论': 'Comment on the initial version',
  '发布后会成为本列中的一张普通评论卡片': 'Your comment will become a card in this column',
  '关闭普通评论输入': 'Close comment composer',
  '普通评论内容': 'Comment content',
  '发布普通评论': 'Post comment',
  '分享体验、建议、技术细节或新的使用场景。': 'Share an experience, suggestion, technical detail, or new use case.',
  '开始输入': 'Start writing',
  '每个人在当前应用的本轮只能提交一条；你仍可给其他综合评论点赞。': 'Each person can submit one synthesis per app per round. You can still like other syntheses.',
  '可以选择一条或任意多条普通评论、回复和收藏夹评论。': 'Select one or more comments, replies, and saved comments.',
  '可以从前三列选择一条或任意多条评论、第一次综合。': 'Select one or more items from the first three columns, including Round 1 syntheses.',
  '等待社区点赞': 'Waiting for community likes',
  '开始选择': 'Start selecting',
  '创作者开发方向': 'Creator development direction',
  '回复': 'Reply',
  '跨应用收藏夹评论': 'Saved cross-app comment',
  '跨应用第一次综合': 'Saved Round 1 synthesis from another app',
  '已放入综合篮': 'Added to synthesis basket',
  '可用万能卡指定': 'Eligible for wildcard',
  '创作者很喜欢这个想法，使用了万能卡将它纳入开发。': 'The creator used a wildcard to include this idea in development.',
  '收起内容': 'Show less',
  '展开内容': 'Show more',
  '社区讨论': 'Community discussion',
  '已选作本轮开发方向': 'Selected for this development round',
  '已采用本轮开发方向': 'Adopted for this round',
  '编辑自己的评论': 'Edit your comment',
  '编辑评论': 'Edit comment',
  '编辑综合评论': 'Edit synthesis',
  '编辑自己的综合评论': 'Edit your synthesis',
  '修改完整提示词后，卡片标题会自动使用新的第一行。已有来源和创意连线保持不变。': 'After editing the full prompt, the card title will use its new first line. Existing sources and links remain unchanged.',
  '条素材': 'sources',
  '个应用': 'apps',
  '位贡献者': 'contributors',
  '查看来源': 'View sources',
  '继续讨论这条综合评论': 'Continue discussing this synthesis',
  '个人素材库': 'Personal source library',
  '收藏夹': 'Saved items',
  '这里是你的个人素材库。仅收藏的跨应用内容平时不会占据画布；进入综合选材时才临时出现，被综合采用后才会作为正式来源节点保留。': 'This is your personal source library. Saved cross-app content stays off the canvas until you select synthesis sources, and becomes a permanent source node only after use.',
  '移出': 'Remove',
  '浏览评论时点击“收藏”。': 'Select “Save” while browsing comments.',
  '请选择包含完整 html 结构的 HTML 文件。': 'Choose an HTML file with a complete document structure.',
  '发布后将进入第二轮评论': 'Publishing opens Round 2 feedback',
  '发布后该应用将完成两轮社区开发': 'Publishing completes both community development rounds',
  '原型开发 · 人工确认': 'Prototype development · Creator review',
  '第 3 / 4 步 · 原型开发': 'Step 3 of 4 · Prototype development',
  'AI 正在把抽中的评论实现为新版本': 'AI is implementing the selected ideas',
  '页面会自动刷新开发步骤': 'Development progress updates automatically',
  'Codex 正在处理本轮作品': 'Codex is processing this round',
  '本轮 Codex 任务已创建': 'Codex task created for this round',
  'Codex 完成后，新 HTML 会出现在这里作为草稿；是否发布仍由你决定。': 'When Codex finishes, the new HTML appears here as a draft. You decide whether to publish it.',
  '正在上传并发布…': 'Uploading and publishing…',
  '这是仅你可见的社区版本草稿。你可以继续修改；只有点击发布后，社区才会看到新版本。': 'This community-version draft is visible only to you. Continue revising it, then publish when ready.',
  '可以继续通过提示词修改草稿': 'Continue revising the draft with prompts',
  '社区版本开发对话': 'Community version development conversation',
  '补充约束、修复问题或调整实现细节': 'Add constraints, fix issues, or refine implementation details',
  '正在放弃本次开发…': 'Discarding development…',
  '放弃本次开发': 'Discard this development',
  '讨论回复': 'Discussion reply',
  '生成社区版本': 'Generate community version',
  '情境内 AI 原型开发': 'In-context AI prototype development',
  '本轮固定从初始版本开发。': 'This round develops from the initial version.',
  '本轮固定在社区版本 1 上继续开发。': 'This round continues from community version 1.',
  '可选评论': 'Available comments',
  '当前版本还没有可供选择的评论。': 'This version has no selectable comments yet.',
  '开发提示词（由所选评论自动填入，可继续编辑）': 'Development prompt (filled from selected comments and still editable)',
  '先选择评论，系统会自动填入内容…': 'Select comments to fill the prompt automatically…',
  '你的指定体验应用': 'Your assigned app',
  '社区应用': 'Community app',
  '给当前正在查看的版本点赞；每个版本分别统计': 'Like the version currently in view; likes are counted separately per version',
  '已点赞当前版本': 'Current version liked',
  '点赞当前版本': 'Like current version',
  '正在重新上传…': 'Re-uploading…',
  '重新上传当前版本': 'Re-upload current version',
  '已发布': 'Published',
  '失败': 'Failed',
  '开发任务失败，但没有返回具体原因。': 'Development failed without a specific error.',
  '草稿就绪': 'Draft ready',
  '等待 Codex': 'Waiting for Codex',
  'Codex 处理中': 'Codex processing',
  '任务已创建，等待 Codex 拉取原作品和入选评论': 'Task created; waiting for Codex to pull the app and selected ideas',
  'Codex 已领取任务，完成后会回传为 Creator 待发布草稿': 'Codex claimed the task and will return an unpublished Creator draft',
  '排队中': 'Queued',
  '开发中': 'Developing',
  'AI 正在生成新版本': 'AI is generating a new version',
  '未开始': 'Not started',
  '等待本轮开发启动': 'Waiting for this development round',
  '等待 V0': 'Waiting for V0',
  '第一轮评论中': 'Round 1 feedback',
  '第一轮开发中': 'Round 1 development',
  '等待 V1': 'Waiting for V1',
  '第二轮评论中': 'Round 2 feedback',
  '第二轮开发中': 'Round 2 development',
  '两轮已完成': 'Both rounds complete',
  '测试账号': 'Test accounts',
  '正式账号': 'Study accounts',
  '主持人 · 异步研究': 'Host · Asynchronous study',
  '研究控制与完成进度': 'Study controls and progress',
  '主持人锁定本轮点赞后，系统按点赞数加权随机抽取开发来源，并为勾选的 App 创建一批 Codex 开发任务。': 'After the Host locks a round, the system runs a like-weighted draw and creates Codex tasks for the selected apps.',
  '正在设置…': 'Updating…',
  '重播入选消息': 'Replay selection messages',
  '导出研究数据': 'Export study data',
  '测试账号流程': 'Test-account workflow',
  '正式账号流程': 'Study-account workflow',
  '尚未开始': 'Not started',
  '流程已结束': 'Workflow complete',
  '总流程已开启 · 按 Creator 单独推进': 'Workflow active · Advance each Creator separately',
  '跳过并结束此流程': 'Skip and end workflow',
  '结束此流程': 'End workflow',
  '新建研究': 'New study',
  '主持人 · 实验准备': 'Host · Study setup',
  '清除测试角色的全部数据': 'Clear all test-role data',
  '待清理数据概览': 'Data to be cleared',
  '测试角色仍有开发任务正在运行': 'Test-role development tasks are still running',
  '当前没有需要清除的测试角色数据': 'No test-role data to clear',
  '预览删除范围并进行二次确认': 'Review the deletion scope and confirm again',
  '清除测试角色数据': 'Clear test-role data',
  '主持人 · 测试角色设置': 'Host · Test-role settings',
  '选择测试角色': 'Select test roles',
  '保存测试角色': 'Save test roles',
  '测试角色已保存': 'Test roles saved',
  '创作者账号 1–50': 'Creator accounts 1–50',
  '点击编号切换测试角色；未选择的账号为正式实验角色': 'Select account numbers to mark test roles; unselected accounts are study roles',
  '测试角色': 'Test role',
  '正式角色': 'Study role',
  '已进入': 'Joined',
  '正式角色作品': 'Study-role apps',
  '已进入创作者': 'Creators joined',
  '社区版本': 'Community version',
  '当前流程': 'Current stage',
  '本轮开发': 'This development round',
  '本轮作品': 'This round’s app',
  '本轮': 'This round',
  '轮开发': 'development round',
  '按 Creator 控制': 'Control by Creator',
  '每个 App 的独立流程': 'Per-app workflow',
  '成功': 'Successful',
  '批量控制 Creator 流程': 'Batch Creator workflow controls',
  '取消全选': 'Clear selection',
  '全选 Creator': 'Select all Creators',
  '按序号排序': 'Sort by number',
  '已选择': 'Selected',
  '锁定/重新锁定第一轮并创建 Codex 任务': 'Lock/relock Round 1 and create Codex tasks',
  '锁定/重新锁定第二轮并创建 Codex 任务': 'Lock/relock Round 2 and create Codex tasks',
  '回退上一流程': 'Move back one workflow stage',
  '撤回本轮发布并重新开发': 'Withdraw this release and redevelop',
  'Codex 开发任务': 'Codex development tasks',
  'Codex 任务': 'Codex tasks',
  '复制任务说明发给 Codex；处理结果会回到 Creator 的待发布草稿。': 'Copy the task instructions to Codex. Results return as unpublished Creator drafts.',
  '已复制': 'Copied',
  '复制给 Codex': 'Copy for Codex',
  '应用开发状态': 'App development status',
  '选择 / Creator / 当前流程': 'Select / Creator / Current stage',
  '第一次开发 · 版本 1': 'Round 1 development · V1',
  '第二次开发 · 版本 2': 'Round 2 development · V2',
  '累计普通评论': 'Total comments',
  '累计综合评论': 'Total syntheses',
  '下载已发布作品代码': 'Download published app code',
  '已发布代码': 'Published code',
  '下载中…': 'Downloading…',
  '不可撤销操作': 'Irreversible action',
  '确认清除测试角色数据': 'Confirm test-role data deletion',
  '关闭清除测试角色数据窗口': 'Close test-role deletion dialog',
  '作品': 'Apps',
  '版本': 'Versions',
  '评论': 'Comments',
  '点赞 / 投票': 'Likes / votes',
  '开发任务': 'Development tasks',
  '请输入': 'Enter',
  '以确认': 'to confirm',
  '永久删除测试数据': 'Permanently delete test data',
  '消息中心': 'Notifications',
  '你的创意影响': 'Your creative impact',
  '关闭消息中心': 'Close notifications',
  '当你的普通评论或综合评论被纳入开发流程时，消息会保留在这里。': 'When one of your comments or syntheses enters development, its notification is saved here.',
  '前往该作品': 'Open this app',
  '还没有新消息': 'No new notifications',
  '继续评论和综合社区创意，你的贡献可能成为下一个可运行版本。': 'Keep commenting and synthesizing community ideas. Your contribution may shape the next working version.',
  '你的想法正在成为现实': 'Your idea is becoming real',
  '你的创意进入开发流程了！': 'Your idea entered development!',
  '太好了': 'Great',
  '无法加载创意共创社区。': 'Unable to load the creative community.',
  '操作失败。': 'The action failed.',
  '正在加载创意共创社区…': 'Loading the creative community…',
  '准备阶段': 'Setup',
  '创作者可以发布初始应用；主持人点击开始后，社区评论与综合评论才会开放。': 'Creators can publish initial apps. Comments and syntheses open after the Host starts the study.',
  '异步社区进行中': 'Community active',
  '自由浏览、讨论、收集创意，并把综合方向实现为社区版本。': 'Explore apps, discuss ideas, collect inspiration, and develop syntheses into community versions.',
  '研究已结束': 'Study complete',
  '研究已经结束，作品和创意来源保持只读。': 'The study is complete. Apps and idea sources are now read-only.',
  '返回首页': 'Back to home',
  '创意共创社区': 'Creative Co-creation Community',
  '社交式应用共创平台': 'Social app co-creation platform',
  '主持人': 'Host',
  '创作者': 'Creator',
  '当前身份': 'Current role',
  '访客': 'Guest',
  '刷新': 'Refresh',
  '创作准备阶段': 'Creation setup',
  '社区共创进行中': 'Community co-creation in progress',
  '两个社区的作品进度': 'App progress across both communities',
  '发现作品，加入正在发生的创作': 'Discover apps and join the creative process',
  '初始应用可以陆续发布；主持人点击开始后，大家才能发表评论和进行综合。': 'Initial apps can be published during setup. Comments and syntheses open after the Host starts the study.',
  '先体验指定应用，也可以自由探索其他作品。普通讨论保持自然，综合创意由用户主动创建。': 'Try your assigned apps and freely explore others. Discuss naturally and create syntheses when useful.',
  '编号正序': 'Number ↑',
  '编号倒序': 'Number ↓',
  '时间正序': 'Oldest first',
  '时间倒序': 'Newest first',
  '只修改你自己的首页排序': 'Changes only your home-page order',
  '重新随机排列': 'Reshuffle',
  '随机排列': 'Shuffle',
  '你的初始应用已发布': 'Your initial app is published',
  '第二轮作品': 'Round 2 apps',
  '已经发布社区版本 1，进入第二轮反馈或后续开发的作品。': 'Apps with community V1 published and now in Round 2 feedback or development.',
  '第一轮作品': 'Round 1 apps',
  '目前只有初始版本，正在收集第一轮评论与综合创意的作品。': 'Apps currently collecting Round 1 comments and syntheses on their initial version.',
  '暂无': 'No ',
  '第一批社区版本发布后，作品会自动移动到这里。': 'Apps move here after their first community versions are published.',
  '当前已发布作品都已经进入第二轮。': 'All published apps are currently in Round 2.',
  '等待初始应用发布': 'Waiting for initial apps',
  '创作者发布后，作品会以瀑布流卡片出现在这里。': 'Published apps will appear here as a card gallery.',
  '切换为中文版': 'Switch to Chinese',
};

const dynamicTranslations: Array<[RegExp, (...matches: string[]) => string]> = [
  [/^(.+) 等 (\d+) 人$/, (_all, visible, count) => `${visible} and ${count} people`],
  [/^社区版本 (\d+)$/, (_all, version) => `Community version ${version}`],
  [/^第 (\d+) 层综合$/, (_all, layer) => `Layer ${layer} synthesis`],
  [/^第 (\d+) 次综合评论$/, (_all, layer) => `Synthesis ${layer}`],
  [/^第 (\d+) 轮综合评论$/, (_all, layer) => `Round ${layer} synthesis`],
  [/^第 (\d+) 次综合 · 直接添加评论$/, (_all, round) => `Synthesis ${round} · Add comments`],
  [/^第 (\d+) 次开发 · 直接添加评论$/, (_all, round) => `Development ${round} · Add comments`],
  [/^创建第 (\d+) 次综合评论$/, (_all, layer) => `Create synthesis ${layer}`],
  [/^你已提交第 (\d+) 次综合评论$/, (_all, layer) => `You submitted synthesis ${layer}`],
  [/^已完成 (\d+) 轮，可继续对话$/, (_all, rounds) => `${rounds} rounds completed · Continue chatting`],
  [/^已完成 (\d+) 轮提示词对话，可继续修改$/, (_all, rounds) => `${rounds} prompt rounds completed · Continue revising`],
  [/^已加入 (\d+) 条评论。你仍可继续点击画布中的评论；每条内容会直接追加到此处。$/, (_all, count) => `${count} comments added. Continue selecting canvas comments to append them here.`],
  [/^已选择 (\d+) 条$/, (_all, count) => `${count} selected`],
  [/^已选择 (\d+) 个$/, (_all, count) => `${count} selected`],
  [/^(\d+) 个社区方向$/, (_all, count) => `${count} community directions`],
  [/^(\d+) 个第一次综合评论 · 按点赞数排序$/, (_all, count) => `${count} Round 1 syntheses · Sorted by likes`],
  [/^(\d+) 个第二次综合评论 · 按点赞数排序$/, (_all, count) => `${count} Round 2 syntheses · Sorted by likes`],
  [/^综合了 (\d+) 个想法$/, (_all, count) => `Synthesized ${count} ideas`],
  [/^被综合 (\d+) 次$/, (_all, count) => `Synthesized ${count} times`],
  [/^还有 (\d+) 条讨论$/, (_all, count) => `${count} more discussions`],
  [/^同时还有 (\d+) 条新的采用消息$/, (_all, count) => `${count} more new adoption notifications`],
  [/^消息中心，(\d+) 条未读消息$/, (_all, count) => `Notifications · ${count} unread`],
  [/^(\d+) \/ 3 个指定体验已完成$/, (_all, count) => `${count} of 3 assigned apps completed`],
  [/^账号 (\d+)$/, (_all, number) => `Account ${number}`],
  [/^回复 (C\d+)$/, (_all, code) => `Reply to ${code}`],
  [/^打开“(.+)”(最新社区版本|原始版本)详情$/, (_all, title, version) => `Open ${title} · ${version === '最新社区版本' ? 'latest community version' : 'initial version'}`],
  [/^(.+) · 社区版本 (\d+)$/, (_all, title, version) => `${title} · Community version ${version}`],
  [/^社区版本 (\d+) 已采用$/, (_all, version) => `Adopted in community version ${version}`],
  [/^万能卡已为第 (\d+) 轮开发选定评论$/, (_all, round) => `Wildcard selected a comment for Round ${round}`],
  [/^上传 HTML 并发布 V(\d+)$/, (_all, version) => `Upload HTML and publish V${version}`],
  [/^社区版本 (\d+) 工作台$/, (_all, version) => `Community version ${version} workspace`],
  [/^也可以上传本地 HTML 完成第 (\d+) 轮开发$/, (_all, round) => `Or upload local HTML to complete Round ${round}`],
  [/^使用该提示词生成社区版本 (\d+)$/, (_all, version) => `Generate community version ${version} from this prompt`],
  [/^选择评论，开发社区版本 (\d+)$/, (_all, version) => `Select comments for community version ${version}`],
  [/^第 (\d+) 轮系统开发已完成，等待 Creator 确认发布$/, (_all, round) => `Round ${round} draft ready · Waiting for Creator publication`],
  [/^社区版本 (\d+) 已发布$/, (_all, version) => `Community version ${version} published`],
  [/^已回传 (\d+)\/(\d+)$/, (_all, done, total) => `${done}/${total} returned`],
  [/^累计贡献者：(.*)$/, (_all, contributors) => `Contributors: ${contributors}`],
  [/^最新社区版本来自“(.+)”$/, (_all, title) => `Latest community version developed from “${title}”`],
  [/^采用“(.+)”$/, (_all, title) => `Adopted “${title}”`],
  [/^给当前版本点赞，可随时取消$/, () => 'Like this version; you can undo it anytime'],
  [/^文件下载失败（(\d+)）。$/, (_all, status) => `File download failed (${status}).`],
  [/^确认删除“(.+)”吗？删除后需要重新创建并发布。$/, (_all, title) => `Delete “${title}”? You will need to recreate and publish it.`],
  [/^版本已经发布，但项目代码保存失败：(.+)$/, (_all, error) => `The version was published, but saving the project code failed: ${error}`],
  [/^作品代码下载失败：(.+)$/, (_all, error) => `App-code download failed: ${error}`],
  [/^下载 (C\d+) 的 V(\d+) HTML 代码$/, (_all, creator, version) => `Download ${creator} V${version} HTML`],
];

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

function translateAsyncGalleryText(value: string) {
  const normalized = normalize(value);
  if (!normalized) return value;
  const exact = exactTranslations[normalized];
  if (exact) return exact;
  for (const [pattern, translate] of dynamicTranslations) {
    const match = normalized.match(pattern);
    if (match) return translate(...match);
  }
  return value;
}

type LanguageContextValue = {
  locale: AsyncGalleryLocale;
  toggleLocale: () => void;
};

const LanguageContext = React.createContext<LanguageContextValue>({
  locale: 'zh-CN',
  toggleLocale: () => undefined,
});

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = ['aria-label', 'placeholder', 'title'];

function translatedTextWithWhitespace(value: string) {
  const translated = translateAsyncGalleryText(value);
  if (translated === value) return value;
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

function updateTextNode(node: Text, locale: AsyncGalleryLocale) {
  if (locale === 'zh-CN') {
    const original = originalText.get(node);
    if (original !== undefined && node.data !== original) node.data = original;
    originalText.delete(node);
    return;
  }
  let current = originalText.get(node) ?? node.data;
  if (originalText.has(node) && node.data !== translatedTextWithWhitespace(current)) {
    current = node.data;
    originalText.set(node, current);
  }
  const translated = translatedTextWithWhitespace(current);
  if (translated !== current) {
    if (!originalText.has(node)) originalText.set(node, current);
    if (node.data !== translated) node.data = translated;
  }
}

function updateElementAttributes(element: Element, locale: AsyncGalleryLocale) {
  const originals = originalAttributes.get(element) ?? new Map<string, string>();
  for (const attribute of translatedAttributes) {
    if (locale === 'zh-CN') {
      const original = originals.get(attribute);
      if (original !== undefined && element.getAttribute(attribute) !== original) {
        element.setAttribute(attribute, original);
      }
      originals.delete(attribute);
      continue;
    }
    let current = originals.get(attribute) ?? element.getAttribute(attribute);
    if (!current) continue;
    if (originals.has(attribute) && element.getAttribute(attribute) !== translateAsyncGalleryText(current)) {
      current = element.getAttribute(attribute);
      if (!current) continue;
      originals.set(attribute, current);
    }
    const translated = translateAsyncGalleryText(current);
    if (translated !== current) {
      if (!originals.has(attribute)) originals.set(attribute, current);
      if (element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated);
    }
  }
  if (originals.size) originalAttributes.set(element, originals);
  else originalAttributes.delete(element);
}

function translateTree(root: Node, locale: AsyncGalleryLocale) {
  if (root.nodeType === Node.TEXT_NODE) {
    updateTextNode(root as Text, locale);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) updateElementAttributes(root as Element, locale);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) updateTextNode(node as Text, locale);
    else updateElementAttributes(node as Element, locale);
    node = walker.nextNode();
  }
}

export function AsyncGalleryLanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = React.useState<AsyncGalleryLocale>(() => (
    window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh-CN'
  ));

  React.useLayoutEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.classList.toggle('async-lang-en', locale === 'en');
    translateTree(document.body, locale);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') updateTextNode(mutation.target as Text, locale);
        if (mutation.type === 'attributes') updateElementAttributes(mutation.target as Element, locale);
        mutation.addedNodes.forEach((node) => translateTree(node, locale));
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatedAttributes,
    });

    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    window.alert = (message?: unknown) => {
      const text = String(message ?? '');
      originalAlert(locale === 'en' ? translateAsyncGalleryText(text) : text);
    };
    window.confirm = (message?: string) => {
      const text = String(message ?? '');
      return originalConfirm(locale === 'en' ? translateAsyncGalleryText(text) : text);
    };
    return () => {
      observer.disconnect();
      window.alert = originalAlert;
      window.confirm = originalConfirm;
    };
  }, [locale]);

  const value = React.useMemo<LanguageContextValue>(() => ({
    locale,
    toggleLocale: () => setLocale((current) => (current === 'en' ? 'zh-CN' : 'en')),
  }), [locale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAsyncGalleryLanguage() {
  return React.useContext(LanguageContext);
}
