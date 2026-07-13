import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type {
  Friction,
  OutcomeStatus,
  BreadcrumbReport,
} from "@breadcrumb/core";

export interface DeclaredAssessment {
  outcome: Exclude<OutcomeStatus, "success">;
  attribution: BreadcrumbReport["attribution"];
  confidence: number;
}

export interface SessionState {
  sessionIdHash: string;
  cwdHash: string;
  model?: string;
  startedAt: number;
  toolCalls: number;
  commandCalls: number;
  commandFailures: number;
  failedToolCalls: number;
  retries: number;
  searches: number;
  filesInspected: number;
  pendingFailures: Record<string, boolean>;
  declaredFeedback: Friction[];
  declaredAssessment?: DeclaredAssessment;
}

const stateDirectory = (): string =>
  process.env.BREADCRUMB_STATE_DIR ?? join(tmpdir(), "breadcrumb-codex");

export const hashSessionId = (sessionId: string): string =>
  createHash("sha256").update(sessionId).digest("hex").slice(0, 32);

export const hashCwd = (cwd: string): string =>
  createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 32);

const statePath = (sessionId: string): string =>
  join(stateDirectory(), `${hashSessionId(sessionId)}.json`);

const withStateLock = async <T>(
  path: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const lockPath = `${path}.lock`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const lock = await open(lockPath, "wx", 0o600);
      try {
        return await operation();
      } finally {
        await lock.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
  }
  throw new Error("Timed out waiting for Breadcrumb session-state lock");
};

export const newSessionState = (
  sessionId: string,
  cwd: string,
  model?: string,
): SessionState => ({
  sessionIdHash: hashSessionId(sessionId),
  cwdHash: hashCwd(cwd),
  ...(model === undefined ? {} : { model }),
  startedAt: Date.now(),
  toolCalls: 0,
  commandCalls: 0,
  commandFailures: 0,
  failedToolCalls: 0,
  retries: 0,
  searches: 0,
  filesInspected: 0,
  pendingFailures: {},
  declaredFeedback: [],
});

const normalizeState = (state: SessionState): SessionState => {
  state.declaredFeedback ??= [];
  return state;
};

export const readState = async (
  sessionId: string,
): Promise<SessionState | null> => {
  try {
    return normalizeState(
      JSON.parse(await readFile(statePath(sessionId), "utf8")) as SessionState,
    );
  } catch {
    return null;
  }
};

export const writeState = async (
  sessionId: string,
  state: SessionState,
  preserveDeclarations = true,
): Promise<void> => {
  await mkdir(stateDirectory(), { recursive: true, mode: 0o700 });
  const path = statePath(sessionId);
  await withStateLock(path, async () => {
    if (preserveDeclarations) {
      try {
        const current = normalizeState(
          JSON.parse(await readFile(path, "utf8")) as SessionState,
        );
        state.declaredFeedback = current.declaredFeedback;
        if (current.declaredAssessment === undefined)
          delete state.declaredAssessment;
        else state.declaredAssessment = current.declaredAssessment;
      } catch {
        // The first write has no previous state to preserve.
      }
    }
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, path);
  });
};

export const removeState = async (sessionId: string): Promise<void> => {
  await rm(statePath(sessionId), { force: true });
};

export const appendFeedbackForCwd = async (
  cwd: string,
  feedback: Friction,
  assessment?: DeclaredAssessment,
): Promise<boolean> => {
  let names: string[];
  try {
    names = await readdir(stateDirectory());
  } catch {
    return false;
  }

  const matches: Array<{ path: string; state: SessionState }> = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(stateDirectory(), name);
    try {
      const state = normalizeState(
        JSON.parse(await readFile(path, "utf8")) as SessionState,
      );
      if (state.cwdHash === hashCwd(cwd)) matches.push({ path, state });
    } catch {
      // Ignore stale or concurrently replaced state files.
    }
  }

  const selected = matches.sort(
    (a, b) => b.state.startedAt - a.state.startedAt,
  )[0];
  if (selected === undefined) return false;
  return withStateLock(selected.path, async () => {
    const latest = normalizeState(
      JSON.parse(await readFile(selected.path, "utf8")) as SessionState,
    );
    if (latest.cwdHash !== hashCwd(cwd)) return false;
    latest.declaredFeedback.push(feedback);
    if (assessment !== undefined) latest.declaredAssessment = assessment;
    const temporary = `${selected.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(latest), { mode: 0o600 });
    await rename(temporary, selected.path);
    return true;
  });
};
