import { parseDocument } from 'htmlparser2';
import { findAll, getAttributeValue, removeElement, textContent } from 'domutils';
import { isTag } from 'domhandler';

export async function readWeb(url: string, signal?: AbortSignal) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use read for local files and read_url for HTTP or HTTPS URLs.');
  const response = await fetch(parsed, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(45000)]), headers: { 'User-Agent': 'werk/0.1', Accept: 'text/html,application/json,text/plain,*/*' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} reading ${parsed.origin}${parsed.pathname}`);
  const reader = response.body?.getReader(); if (!reader) throw new Error('This response has no body.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 8 * 1024 * 1024) throw new Error('Response exceeds 8 MB. Download it with the shell for local processing.'); chunks.push(value); }
  } finally { await reader.cancel(); }
  const body = Buffer.concat(chunks).toString('utf8');
  if (!(response.headers.get('content-type') || '').includes('html')) return { url: response.url, text: body.slice(0, 100000), truncated: body.length > 100000, links: [] as string[] };
  const doc = parseDocument(body);
  const links = [...new Set(findAll(n => isTag(n) && n.name === 'a', doc.children).flatMap(n => { try { const value = new URL(getAttributeValue(n, 'href') || '', response.url); return /^https?:$/.test(value.protocol) ? [value.href] : []; } catch { return []; } }))].slice(0, 100);
  for (const node of findAll(n => isTag(n) && ['script', 'style', 'noscript', 'svg'].includes(n.name), doc.children)) removeElement(node);
  const text = textContent(doc).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  return { url: response.url, text: text.slice(0, 100000), truncated: text.length > 100000, links };
}

export async function searchWeb(query: string, signal?: AbortSignal) {
  const result = await readWeb(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, signal);
  const links = result.links.flatMap(link => { const parsed = new URL(link); const target = parsed.searchParams.get('uddg'); return target ? [target] : parsed.hostname.endsWith('duckduckgo.com') ? [] : [link]; }).slice(0, 12);
  if (!links.length) throw new Error('The search service returned no results or a challenge. Try reading a known site or searching through the shell.');
  return { query, text: result.text, links };
}
