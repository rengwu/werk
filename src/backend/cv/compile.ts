import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  realpath,
  stat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { LatexDiagnostic } from "../../shared/documents.ts";
import {
  findTectonic,
  latexCacheDirectory,
  latexSandboxExecutable,
} from "./runtime.ts";

export class LatexCompileError extends Error {
  diagnostics:LatexDiagnostic[];statusCode:number;
  constructor(
    message: string,
    diagnostics: LatexDiagnostic[] = [],
    statusCode = 422,
  ) {
    super(message);this.diagnostics=diagnostics;this.statusCode=statusCode;
  }
}
export function parseLatexDiagnostics(log: string): LatexDiagnostic[] {
  const result: LatexDiagnostic[] = [];
  for (const match of log.matchAll(
    /(?:error|warning):\s*(?:resume\.tex:(\d+):\s*)?([^\n]+)/g,
  )) {
    const severity = match[0].startsWith("error") ? "error" : "warning";
    const message = match[2].trim();
    if (
      !result.some((x) => x.message === message && x.line === Number(match[1]))
    )
      result.push({
        severity,
        message,
        ...(match[1] ? { line: Number(match[1]) } : {}),
      });
  }
  return result.slice(0, 30);
}
function executable() {
  const bin = findTectonic();
  if (bin) return bin;
  throw new LatexCompileError(
    "LaTeX compiler setup is incomplete. Reinstall werk or complete the documented development setup, then recompile. Your saved source is preserved.",
    [],
    503,
  );
}
export function macSandbox(work: string, cache: string, bin: string) {
  const quoted = (value: string) => JSON.stringify(value);
  // Leave OS runtime/cache reads available (including dyld on newer macOS),
  // while denying private user, volume, temporary, project and appdata trees.
  const privatePaths = [
    "/Users",
    "/Volumes",
    "/private/var",
    "/private/tmp",
    "/tmp",
    "/var",
    "/config",
    process.cwd(),
    resolve(process.env.WERK_DATA_DIR || ".local-data"),
  ];
  return `(version 1)
    (allow default)
    (deny network*)
    (deny file-write*)
    (deny file-read* ${privatePaths.map((p) => `(subpath ${quoted(p)})`).join(" ")})
    (deny process-exec)
    (allow process-exec (literal ${quoted(bin)}))
    (allow sysctl-read mach-lookup)
    (allow file-read-metadata)
    (allow file-read* ${[work, cache, "/private/var/db"].map((p) => `(subpath ${quoted(p)})`).join(" ")} (literal ${quoted(bin)}))
    (allow file-write* (subpath ${quoted(work)}) (literal "/dev/null"))`;
}
let running = false;
export async function compileLatex(
  source: string, signal?: AbortSignal,
): Promise<{ pdf: Buffer; diagnostics: LatexDiagnostic[] }> {
  if (running)
    throw new LatexCompileError(
      "A LaTeX compile is already running. Try again shortly.",
      [],
      409,
    );
  if(source.length>2*1024*1024)throw new LatexCompileError("The LaTeX source exceeds 2 MB.");
  signal?.throwIfAborted();
  running = true;
  let work: string | undefined;
  try {
    const bin = executable();
    const cache = await realpath(latexCacheDirectory()).catch(() => {
      throw new LatexCompileError(
        "LaTeX package setup is incomplete. Reinstall werk or complete the documented development setup, then recompile. Your source is preserved.",
        [],
        503,
      );
    });
    work = await realpath(await mkdtemp(join(tmpdir(), "werk-latex-")));
    await mkdir(join(work, "out"));
    await writeFile(join(work, "resume.tex"), source, { mode: 0o600 });
    const compilerArgs = [
      "--untrusted",
      "--only-cached",
      "--keep-logs",
      "--print",
      "--outdir",
      "out",
      "resume.tex",
    ];
    let command: string;
    let args: string[];
    if (process.platform === "darwin") {
      command = "/usr/bin/sandbox-exec";
      args = ["-p", macSandbox(work, cache, bin), bin, ...compilerArgs];
    } else if (process.platform === "win32") {
      command = latexSandboxExecutable();
      if (!existsSync(command))
        throw new LatexCompileError(
          "LaTeX sandbox unavailable. Run the documented compiler setup for this platform.",
          [],
          503,
        );
      args = [work, cache, bin, ...compilerArgs];
    } else
      throw new LatexCompileError(
        "LaTeX compilation requires macOS or Windows.",
        [],
        503,
      );
    const env: NodeJS.ProcessEnv = {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: work,
      TMPDIR: work,
      TECTONIC_CACHE_DIR: cache,
      XDG_CACHE_HOME: cache,
      TECTONIC_UNTRUSTED_MODE: "1",
      SOURCE_DATE_EPOCH: "1789920000",
      LANG: "en_US.UTF-8",
      ...(process.platform === "win32"
        ? {
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
          }
        : {}),
    };
    const log = await new Promise<string>((resolvePromise, reject) => {
      const child = spawn(command, args, {
        cwd: work,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const abort=()=>child.kill("SIGKILL");signal?.addEventListener("abort",abort,{once:true});
      let log = "";
      let reason = "";
      const timer = setTimeout(() => {
        reason =
          "Compilation exceeded 30 seconds. Check for a loop or an unusually large document.";
        child.kill("SIGKILL");
      }, 30000);
      const collect = (chunk: Buffer) => {
        if (reason) return;
        if (Buffer.byteLength(log) + chunk.length > 256 * 1024) {
          reason =
            "Compiler output exceeded the limit. Fix repeated errors before recompiling.";
          child.kill("SIGKILL");
        } else log += chunk.toString();
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.on("error", () => {
        clearTimeout(timer);
        reject(
          new LatexCompileError(
            "The LaTeX compiler or sandbox could not start. Check the local installation.",
            [],
            503,
          ),
        );
      });
      child.on("close", (code, processSignal) => {
        clearTimeout(timer);signal?.removeEventListener("abort",abort);
        if(signal?.aborted){reject(new LatexCompileError("Compilation stopped."));return;}
        const diagnostics = parseLatexDiagnostics(log);
        if (reason || code !== 0) {
          if (
            /Landlock support|create sandbox|activate sandbox|disable compiler networking|Windows LaTeX sandbox:/.test(
              log,
            )
          ) {
            reject(
              new LatexCompileError(
                process.platform === "win32"
                  ? "The Windows LaTeX sandbox could not run. Saved source is preserved."
                  : "LaTeX sandbox unavailable in this Linux runtime. Native Linux with Landlock is required; saved source is preserved.",
                [{ severity: "error", message: log.trim().slice(-2000) }],
                503,
              ),
            );
            return;
          }
          const missing =
            /not cached|not found in cache|network|failed to open.*bundle|could not find.*bundle|LaTeX Error: File .*not found/i.test(
              log,
            );
          const summary =
            reason ||
            (missing
              ? "A required LaTeX package is not installed. Compilation is offline; install the package through the documented setup, then retry."
              : diagnostics.find((x) => x.severity === "error")?.message ||
                `LaTeX compilation failed${processSignal ? ` (${processSignal})` : ""}. Check your source or compiler setup.`);
          reject(
            new LatexCompileError(
              summary,
              diagnostics.length
                ? diagnostics
                : [
                    {
                      severity: "error",
                      message: log.trim().slice(-2000) || summary,
                    },
                  ],
            ),
          );
        } else resolvePromise(log);
      });
    });
    const output = join(work, "out/resume.pdf");
    if ((await stat(output)).size > 8 * 1024 * 1024)
      throw new LatexCompileError("The PDF exceeds the 8 MB preview limit.");
    const pdf = await readFile(output);
    if (pdf.subarray(0, 5).toString() !== "%PDF-")
      throw new LatexCompileError("The compiler did not produce a valid PDF.");
    return { pdf, diagnostics: parseLatexDiagnostics(log) };
  } finally {
    if (work) await rm(work, { recursive: true, force: true }).catch(() => {});
    running = false;
  }
}
