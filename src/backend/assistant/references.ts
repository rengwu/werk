import { createHash } from "node:crypto";
import { parseDocument } from "htmlparser2";
import { textContent, removeElement, findAll } from "domutils";
import { isTag, Text } from "domhandler";
import { readUrl, type FetchContext } from "../http.ts";
export function mentionedUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"'\])]+/g)].flatMap(([value]) => {
    try {
      const url = new URL(value.replace(/[.,;!?]+$/, ""));
      url.hash = "";
      return [url.href];
    } catch {
      return [];
    }
  });
}
const repositoryPath = /^\/([\w.-]+)\/([\w.-]+)(?:\/|$)/;

export function referenceTarget(
  input: string,
  allowed: Set<string>,
  researchText = "",
) {
  const url = new URL(input);
  url.hash = "";
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["443", "80"].includes(url.port))
  )
    throw new Error(
      "Reference URLs must be public HTTP(S) URLs without credentials on standard ports.",
    );
  const github =
    url.origin === "https://github.com" && url.pathname.match(repositoryPath);
  const scoped =
    github &&
    [...allowed].some((entry) => {
      const base = new URL(entry);
      return (
        base.origin === url.origin &&
        base.pathname
          .match(repositoryPath)?.[0]
          .replace(/\/$/, "")
          .toLowerCase() === `/${github[1]}/${github[2]}`.toLowerCase()
      );
    });
  const tail = github
    ? url.pathname.slice(`/${github[1]}/${github[2]}`.length).replace(/\/$/, "")
    : "";
  const author = url.searchParams.get("author");
  const query = url.searchParams.get("q");
  const pullAuthor = query?.match(
    /^is:pr author:([a-z\d](?:[a-z\d-]{0,38}))$/i,
  )?.[1];
  const mentioned = (name: string) =>
    researchText
      .toLowerCase()
      .match(/[a-z\d]+(?:-[a-z\d]+)*/g)
      ?.includes(name.toLowerCase());
  const params = [...url.searchParams.keys()];
  const contributionPage =
    scoped &&
    ((!url.search &&
      /^\/(?:commits|pulls|commit\/[a-f\d]{7,40}|pull\/\d+(?:\/files)?)$/i.test(
        tail,
      )) ||
      (tail === "/commits" &&
        params.length === 1 &&
        params[0] === "author" &&
        author &&
        /^[a-z\d][a-z\d-]{0,38}$/i.test(author) &&
        mentioned(author)) ||
      (tail === "/pulls" &&
        params.length === 1 &&
        params[0] === "q" &&
        pullAuthor &&
        mentioned(pullAuthor)));
  if (!allowed.has(url.href) && !contributionPage)
    throw new Error(
      "Read a supplied public URL, a link returned by read_reference, or a contribution page in a supplied GitHub repository. GitHub author filters must name an account mentioned by the user. Do not ask the user to resend a URL already within this scope.",
    );
  let request = url.href;
  let repo = false;
  let githubJson = false;
  if (github) {
    const api = `https://api.github.com/repos/${github[1]}/${github[2]}`;
    if (!tail && !url.search) {
      request = `${api}/readme`;
      repo = true;
    } else if (contributionPage || allowed.has(url.href)) {
      if (
        tail === "/commits" &&
        (!url.search || (params.length === 1 && author))
      )
        request = `${api}/commits?per_page=30${author ? `&author=${encodeURIComponent(author)}` : ""}`;
      else if (tail === "/pulls" && pullAuthor)
        request = `https://api.github.com/search/issues?per_page=30&q=${encodeURIComponent(`repo:${github[1]}/${github[2]} is:pr author:${pullAuthor}`)}`;
      else if (tail === "/pulls" && !url.search)
        request = `${api}/pulls?state=all&per_page=30`;
      else if (/^\/commit\/[a-f\d]{7,40}$/i.test(tail) && !url.search)
        request = `${api}${tail.replace("/commit/", "/commits/")}`;
      else if (/^\/pull\/\d+(?:\/files)?$/.test(tail) && !url.search)
        request = `${api}${tail.replace("/pull/", "/pulls/")}`;
      githubJson = request !== url.href;
    }
  }
  return { original: url.href, request, repo, githubJson };
}

// Only concrete links from the fetched source extend access, never model-written URLs.
export function referenceLinks(url: string, candidates: string[]): string[] {
  const base = new URL(url);
  return [
    ...new Set(
      candidates.flatMap((value) => {
        try {
          const link = new URL(value, base);
          link.hash = "";
          if (
            link.origin !== base.origin ||
            link.username ||
            link.password ||
            !["http:", "https:"].includes(link.protocol)
          )
            return [];
          return [link.href];
        } catch {
          return [];
        }
      }),
    ),
  ].slice(0, 80);
}
export type Reference = {
  id: string;
  url: string;
  text: string;
  truncated: boolean;
  fetchedAt: string;
  links?: string[];
};
export async function readReference(
  url: string,
  allowed: Set<string>,
  budget: FetchContext,
  signal: AbortSignal,
  researchText = "",
): Promise<Reference> {
  const target = referenceTarget(url, allowed, researchText);
  const origin = new URL(target.request);
  const body = await readUrl(target.request, budget, {
    cache: false,
    maxBytes: 3 * 1024 * 1024,
    signal,
    ...(target.repo
      ? { headers: { Accept: "application/vnd.github.raw+json" } }
      : {}),
    allowRedirect: (next) =>
      next.hostname.replace(/^www\./, "") ===
      origin.hostname.replace(/^www\./, ""),
  });
  let text = body;
  const links = mentionedUrls(body);
  if (target.githubJson) {
    const data = JSON.parse(body);
    const collect = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (key === "html_url" && typeof child === "string") links.push(child);
        else if (typeof child === "object") collect(child);
      }
    };
    collect(data);
  }
  if (
    !target.repo &&
    !target.githubJson &&
    /<(?:html|body|head|div|main)[\s>]/i.test(body)
  ) {
    const document = parseDocument(body);
    for (const node of findAll(
      (node) => isTag(node) && node.name === "a",
      document.children,
    ))
      if (isTag(node) && node.attribs.href) links.push(node.attribs.href);
    for (const el of findAll(
      (node) =>
        isTag(node) &&
        [
          "script",
          "style",
          "noscript",
          "svg",
          "form",
          "nav",
          "footer",
        ].includes(node.name),
      document.children,
    ))
      removeElement(el);
    // Preserve separators so exact quotations remain readable in provenance.
    const blocks = findAll(
      (node) => isTag(node) && /^(p|h[1-6]|li|section|div|br)$/.test(node.name),
      document.children,
    );
    for (const el of blocks) if (isTag(el)) el.children.push(new Text("\n"));
    text = textContent(document)
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();
  }
  if (!text.trim())
    throw new Error(
      "The reference returned no readable text. Paste the relevant content instead.",
    );
  return {
    id: `reference:${createHash("sha256")
      .update(target.original + text)
      .digest("hex")
      .slice(0, 24)}`,
    url: target.original,
    text: text.slice(0, 24000),
    truncated: text.length > 24000,
    fetchedAt: new Date().toISOString(),
    links: referenceLinks(target.original, links),
  };
}
