import JSZip from 'jszip';

function safeFileSegment(value: string, fallback: string) {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

export function safeArchiveName(value: string) {
  const cleaned = value.trim().replace(/[^0-9_-]/g, '').slice(0, 32);
  if (/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  return new Date().toISOString().replace(/\.\d{3}Z$/, '').replace('T', '_').replace(/:/g, '-');
}

export async function buildCommunityWorkspaceArchive(
  payload: Record<string, any>,
  requestedArchiveName: string,
) {
  const archiveName = safeArchiveName(requestedArchiveName);
  const zip = new JSZip();
  const root = zip.folder(archiveName)!;
  root.file('research-data.json', JSON.stringify(payload, null, 2));
  root.file(
    'README.txt',
    [
      `归档时间：${payload.exported_at || new Date().toISOString()}`,
      `数据范围：${payload.scope === 'test' ? '测试账号流程' : '正式账号流程'}`,
      '',
      'research-data.json 包含该流程的参与者、作品、版本、评论、综合评论、点赞、开发任务和行为事件。',
      'apps 文件夹包含每位 Creator 已发布的 V0、V1、V2 HTML 代码；如有未发布草稿，也会保存为 draft.html。',
    ].join('\r\n'),
  );

  const apps = Array.isArray(payload.apps) ? payload.apps : [];
  const versions = Array.isArray(payload.versions) ? payload.versions : [];
  const drafts = Array.isArray(payload.drafts) ? payload.drafts : [];
  apps.forEach((app: any) => {
    const creatorCode = safeFileSegment(String(app.creator_code || ''), 'creator');
    const title = safeFileSegment(String(app.title || ''), 'untitled');
    const folder = root.folder('apps')!.folder(`${creatorCode}-${title}`)!;
    versions
      .filter((version: any) => version.app_id === app.id && String(version.code || '').trim())
      .sort((left: any, right: any) => Number(left.version_number) - Number(right.version_number))
      .forEach((version: any) => {
        const versionLabel = version.kind === 'initial'
          ? 'V0'
          : `V${Math.max(1, Number(version.version_number || 1) - 1)}`;
        folder.file(`${versionLabel}.html`, String(version.code));
      });
    const draft = drafts.find((row: any) => row.app_id === app.id && String(row.code || '').trim());
    if (draft) folder.file('draft.html', String(draft.code));
  });

  return {
    archiveName,
    buffer: await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }),
  };
}
