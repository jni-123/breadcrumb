import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const EVENTS = ["SessionStart", "PostToolUse", "Stop"] as const;
const COMMAND_MARKERS = [
  "breadcrumb-codex hook",
  "@breadcrumb/codex",
  "packages/codex/dist/cli.js hook",
];
const STATUS_MARKER = "Breadcrumb:";

type JsonObject = Record<string, unknown>;
interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
  statusMessage?: string;
}
interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
}

interface HooksFile extends JsonObject {
  description?: string;
  hooks?: JsonObject;
}

const readHooksFile = async (path: string): Promise<HooksFile> => {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Codex hooks.json must contain a JSON object");
    }
    return value as HooksFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
};

const hookGroups = (value: unknown): HookGroup[] =>
  Array.isArray(value) ? (value as HookGroup[]) : [];

const isBreadcrumbHook = (hook: HookCommand): boolean =>
  hook.statusMessage?.startsWith(STATUS_MARKER) === true ||
  COMMAND_MARKERS.some((marker) => hook.command.includes(marker));

const withoutBreadcrumbHooks = (groups: HookGroup[]): HookGroup[] =>
  groups
    .map((group) => ({
      ...group,
      hooks: group.hooks.filter((hook) => !isBreadcrumbHook(hook)),
    }))
    .filter((group) => group.hooks.length > 0);

export const hooksPath = (codexHome: string): string =>
  join(codexHome, "hooks.json");

export const installHooks = async (
  codexHome: string,
  command = "npx --yes @breadcrumb/codex",
): Promise<string> => {
  const path = hooksPath(codexHome);
  await mkdir(dirname(path), { recursive: true });
  const file = await readHooksFile(path);
  try {
    await copyFile(path, `${path}.breadcrumb-backup-${Date.now()}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const hooks =
    typeof file.hooks === "object" && file.hooks !== null ? file.hooks : {};
  for (const event of EVENTS) {
    const existing = withoutBreadcrumbHooks(hookGroups(hooks[event]));
    const group: HookGroup = {
      ...(event === "PostToolUse" ? { matcher: "*" } : {}),
      hooks: [
        {
          type: "command",
          command: `${command} hook ${event}${
            event === "SessionStart"
              ? ` --report-command-base64 ${Buffer.from(command).toString("base64")}`
              : ""
          }`,
          timeout: 20,
          statusMessage: "Breadcrumb: recording privacy-safe metrics",
        },
      ],
    };
    hooks[event] = [...existing, group];
  }
  file.description ??= "User-level Codex hooks";
  file.hooks = hooks;
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  return path;
};

export const uninstallHooks = async (codexHome: string): Promise<string> => {
  const path = hooksPath(codexHome);
  const file = await readHooksFile(path);
  const hooks =
    typeof file.hooks === "object" && file.hooks !== null ? file.hooks : {};
  for (const event of EVENTS) {
    const remaining = withoutBreadcrumbHooks(hookGroups(hooks[event]));
    if (remaining.length === 0) delete hooks[event];
    else hooks[event] = remaining;
  }
  file.hooks = hooks;
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, path);
  return path;
};

export const hooksInstalled = async (codexHome: string): Promise<boolean> => {
  const file = await readHooksFile(hooksPath(codexHome));
  const hooks =
    typeof file.hooks === "object" && file.hooks !== null ? file.hooks : {};
  return EVENTS.every((event) =>
    hookGroups(hooks[event]).some((group) =>
      group.hooks.some(isBreadcrumbHook),
    ),
  );
};
