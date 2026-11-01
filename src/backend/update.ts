import type { UpdateState } from '../shared/api.ts';
export const RELEASE_REPO = 'rengwu/werk';
export function newerVersion(tag: string, current: string) {
  const parse = (s: string) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(s)?.slice(1).map(Number);
  const a = parse(tag), b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
export async function checkUpdate(version: string, url = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`): Promise<UpdateState> {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `werk/${version}` }, signal: AbortSignal.timeout(15000) });
    if (response.status === 404) return { checkedAt, state: 'current' };
    if (!response.ok) return { checkedAt, state: 'unavailable' };
    const data = await response.json() as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean };
    if (!data.draft && !data.prerelease && data.tag_name && newerVersion(data.tag_name, version) && data.html_url?.startsWith(`https://github.com/${RELEASE_REPO}/releases/`)) {
      return { checkedAt, state: 'available', version: data.tag_name.replace(/^v/, ''), url: data.html_url };
    }
    return { checkedAt, state: 'current' };
  } catch { return { checkedAt, state: 'unavailable' }; }
}
