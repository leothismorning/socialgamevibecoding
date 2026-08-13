import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type CodexTaskItem = {
  jobId: number;
  status: string;
  appId: string;
  creatorCode: string;
  appTitle: string;
  appBrief: string;
  iterationNumber: number;
  baseVersionNumber: number;
  basePrompt: string;
  baseCode: string;
  creatorInstruction: string;
  selectedIdeas: Array<{
    sourceType: 'comment' | 'synthesis';
    sourceId: number;
    authorCode: string;
    title: string;
    content: string;
    contributionNote: string;
  }>;
  outputFilename: string;
};

type CodexTask = {
  taskId: string;
  status: string;
  fixedPrompt: string;
  itemCount: number;
  completedCount: number;
  items: CodexTaskItem[];
};

type LocalTaskMetadata = {
  taskId: string;
  platformUrl: string;
  pulledAt: string;
  items: Array<{
    jobId: number;
    appId: string;
    creatorCode: string;
    appTitle: string;
    directory: string;
  }>;
};

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function safeName(value: string, fallback: string) {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, '-');
  return normalized.slice(0, 70) || fallback;
}

function platformUrl() {
  return (argumentValue('--url') || process.env.COMMUNITY_GALLERY_URL || 'http://localhost:3000')
    .replace(/\/+$/, '');
}

function taskDirectory(taskId: string) {
  return path.resolve(process.cwd(), '.codex-community-tasks', taskId);
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(payload.error || `平台请求失败（HTTP ${response.status}）。`);
  return payload as T;
}

function taskEndpoint(baseUrl: string, taskId: string) {
  return `${baseUrl}/api/community-gallery/codex-tasks/${encodeURIComponent(taskId)}`;
}

function requestMarkdown(task: CodexTask, item: CodexTaskItem) {
  const ideas = item.selectedIdeas.map((idea, index) => [
    `### 入选创意 ${index + 1}（${idea.sourceType === 'synthesis' ? '综合评论' : '普通评论'}）`,
    `- 作者：${idea.authorCode}`,
    idea.title ? `- 标题：${idea.title}` : '',
    '',
    idea.content,
    idea.contributionNote ? `\n贡献说明：${idea.contributionNote}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
  return `# ${item.creatorCode} · ${item.appTitle} · 第 ${item.iterationNumber} 轮开发

## 固定要求

${task.fixedPrompt}

## 本轮入选创意

${ideas}

## App 信息

- 简介：${item.appBrief || '未填写'}
- 原始创作提示：${item.basePrompt || '未填写'}
- 本轮综合开发内容：${item.creatorInstruction}
- 基础版本：平台内部版本 ${item.baseVersionNumber}

## 文件约定

- 保留 \`original.html\`，不要直接修改它。
- 把新的单文件版本保存为同目录的 \`result.html\`。
- 完成即可停止，不需要启动浏览器做长时间检查。
`;
}

async function pull(taskId: string, baseUrl: string) {
  const endpoint = taskEndpoint(baseUrl, taskId);
  const task = await requestJson<CodexTask>(`${endpoint}/claim`, { method: 'POST' });
  const root = taskDirectory(taskId);
  await mkdir(root, { recursive: true });
  const metadata: LocalTaskMetadata = {
    taskId,
    platformUrl: baseUrl,
    pulledAt: new Date().toISOString(),
    items: [],
  };
  for (const item of task.items) {
    const directory = `${safeName(item.creatorCode, 'creator')}-${safeName(item.appTitle, 'app')}-${item.jobId}`;
    const itemRoot = path.join(root, directory);
    await mkdir(itemRoot, { recursive: true });
    await writeFile(path.join(itemRoot, 'original.html'), item.baseCode, 'utf8');
    await writeFile(path.join(itemRoot, 'request.md'), requestMarkdown(task, item), 'utf8');
    await writeFile(path.join(itemRoot, 'item.json'), `${JSON.stringify({ ...item, baseCode: undefined }, null, 2)}\n`, 'utf8');
    metadata.items.push({
      jobId: item.jobId,
      appId: item.appId,
      creatorCode: item.creatorCode,
      appTitle: item.appTitle,
      directory,
    });
  }
  await writeFile(path.join(root, 'task.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  process.stdout.write([
    `已拉取 Codex 任务 ${taskId}：${task.itemCount} 个 App。`,
    `任务目录：${root}`,
    '请逐个阅读 request.md，保留 original.html，并把新版本写入 result.html。',
  ].join('\n') + '\n');
}

async function status(taskId: string, baseUrl: string) {
  const task = await requestJson<CodexTask>(taskEndpoint(baseUrl, taskId));
  process.stdout.write(`${JSON.stringify({
    taskId: task.taskId,
    status: task.status,
    completed: `${task.completedCount}/${task.itemCount}`,
    items: task.items.map((item) => ({
      creatorCode: item.creatorCode,
      appTitle: item.appTitle,
      status: item.status,
      jobId: item.jobId,
    })),
  }, null, 2)}\n`);
}

async function push(taskId: string, baseUrl: string) {
  const root = taskDirectory(taskId);
  const metadata = JSON.parse(
    await readFile(path.join(root, 'task.json'), 'utf8'),
  ) as LocalTaskMetadata;
  let uploaded = 0;
  let missing = 0;
  for (const item of metadata.items) {
    const resultPath = path.join(root, item.directory, 'result.html');
    if (!existsSync(resultPath)) {
      missing += 1;
      process.stdout.write(`跳过 ${item.creatorCode} · ${item.appTitle}：没有 result.html。\n`);
      continue;
    }
    const code = await readFile(resultPath, 'utf8');
    await requestJson(
      `${taskEndpoint(baseUrl, taskId)}/jobs/${item.jobId}/result`,
      {
        method: 'POST',
        body: JSON.stringify({
          code,
          summary: 'Codex 已根据本轮入选评论完成平台兼容版本。',
        }),
      },
    );
    uploaded += 1;
    process.stdout.write(`已回传 ${item.creatorCode} · ${item.appTitle}。\n`);
  }
  process.stdout.write(`回传完成：${uploaded} 个成功，${missing} 个因没有 result.html 跳过。\n`);
  await status(taskId, baseUrl);
}

async function main() {
  const command = String(process.argv[2] || '').trim();
  const taskId = String(process.argv[3] || '').trim();
  if (!['pull', 'push', 'status'].includes(command) || !taskId) {
    throw new Error([
      '用法：',
      '  npm run codex-task -- pull <任务编号> --url <平台地址>',
      '  npm run codex-task -- status <任务编号> --url <平台地址>',
      '  npm run codex-task -- push <任务编号> --url <平台地址>',
    ].join('\n'));
  }
  const baseUrl = platformUrl();
  if (command === 'pull') await pull(taskId, baseUrl);
  else if (command === 'push') await push(taskId, baseUrl);
  else await status(taskId, baseUrl);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
