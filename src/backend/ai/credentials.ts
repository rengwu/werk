import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  chmod,
  lstat,
} from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

type Credential = {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  [key: string]: unknown;
};
type Options = { signal?: AbortSignal };
export function createCredentialStore(dataDir: string) {
const directory = join(dataDir, "pi-auth");
const path = join(directory, "credentials.json");
let directoryReady: Promise<void> | undefined;
function privateDirectory() {
  return (directoryReady ??= (async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await lstat(directory)).isSymbolicLink())
      throw new Error("The ChatGPT credential directory must not be a link.");
    if (process.platform !== "win32") {
      await chmod(directory, 0o700);
      return;
    }
    // POSIX modes do not restrict Windows ACLs. Secure the directory before
    // writing tokens, including existing records from an earlier installation.
    // A fixed script receives only a path through the environment, never tokens.
    await promisify(execFile)(
      join(
        process.env.SystemRoot || "C:\\Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `
        $ErrorActionPreference = 'Stop'
        # A PowerShell 7 parent can pass incompatible modules through Node.
        # This fixed Windows PowerShell script needs only its system modules.
        $env:PSModulePath = $PSHOME + '\\Modules'
        $directory = Get-Item -LiteralPath $env:WERK_PI_AUTH_DIRECTORY -Force
        $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $items = @($directory)
        foreach ($name in @('credentials.json', 'host-id')) {
          $file = Join-Path $directory.FullName $name
          if (Test-Path -LiteralPath $file) { $items += Get-Item -LiteralPath $file -Force }
        }
        foreach ($item in $items) {
          if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Credential paths must not be links.' }
          $acl = Get-Acl -LiteralPath $item.FullName
          if ($item.PSIsContainer) {
            $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
          } else {
            $inherit = [Security.AccessControl.InheritanceFlags]::None
          }
          $acl.SetAccessRuleProtection($true, $false)
          foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
          foreach ($principal in @($sid, [Security.Principal.SecurityIdentifier]'S-1-5-18', [Security.Principal.SecurityIdentifier]'S-1-5-32-544')) {
            $rule = New-Object Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', $inherit, 'None', 'Allow')
            $acl.AddAccessRule($rule)
          }
          $item.SetAccessControl($acl)
        }
      `,
      ],
      {
        env: { ...process.env, WERK_PI_AUTH_DIRECTORY: directory },
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 16000,
      },
    );
  })().catch((cause) => {
    directoryReady = undefined;
    // The fixed permission script never receives tokens. Keep its actual failure
    // in the private desktop log while the user receives an actionable message.

    throw new Error(
      "Cannot secure the ChatGPT connection files. Check appdata permissions.",
      { cause },
    );
  }));
}
let pending: Promise<unknown> = Promise.resolve();
function authLock<T>(fn: (guard: () => void) => Promise<T>, options: Options = {}): Promise<T> {
  const result = pending.catch(() => {}).then(async () => { options.signal?.throwIfAborted(); return fn(() => {}); });
  pending = result.catch(() => {});
  return result;
}
const credentials = {
  async read(
    id: string,
    options: Options = {},
  ): Promise<Credential | undefined> {
    options.signal?.throwIfAborted();
    if (id !== "openai") return undefined;
    try {
      await privateDirectory();
      if ((await lstat(path)).isSymbolicLink()) throw new Error("Credential files must not be links.");
      const value = JSON.parse(await readFile(path, "utf8"));
      if (
        value.type !== "oauth" ||
        typeof value.access !== "string" ||
        typeof value.refresh !== "string" ||
        !Number.isFinite(value.expires)
      )
        throw new Error("Invalid ChatGPT connection. Sign in again.");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error(
        "Cannot read the saved ChatGPT connection. Sign in again.",
        { cause: error },
      );
    }
  },
  async list(options: Options = {}) {
    return (await this.read("openai", options))
      ? [{ providerId: "openai", type: "oauth" as const }]
      : [];
  },
  async modify(
    id: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options: Options = {},
  ) {
    if (id !== "openai")
      throw new Error("Only ChatGPT subscription credentials are supported.");
    return authLock(async (guard) => {
      const current = await this.read(id);
      const next = await fn(current);
      if (!next) return current;
      if (next.type !== "oauth")
        throw new Error("A ChatGPT subscription connection is required.");
      await privateDirectory();
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(next), {
          mode: 0o600,
          flag: "wx",
        });
        // Persist refresh results even if its initiating request was cancelled.
        guard();
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
      return next;
    }, options);
  },
  async delete(id: string, options: Options = {}) {
    if (id === "openai")
      await authLock(async (guard) => {
        guard();
        await rm(path, { force: true });
      }, options);
  },
};
async function hostId() {
  await privateDirectory();
  const file = join(directory, "host-id");
  try {
    await writeFile(file, randomUUID(), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return (await readFile(file, "utf8")).trim();
}

return { credentials, hostId };
}
