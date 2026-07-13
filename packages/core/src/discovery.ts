import { readFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

import { normalizeOrigin } from "./deduplication.js";
import { findAgentFeedbackManifestInRobotsTxt } from "./text-discovery.js";
import type {
  BreadcrumbManifest,
  DiscoveredManifest,
  RepositoryManifest,
  RepositoryTarget,
} from "./types.js";
import { isBreadcrumbManifest, isRepositoryManifest } from "./validation.js";

export interface DiscoveryContext {
  cwd?: string;
  repositoryManifestPath?: string;
  targetOrigin?: string;
  fetch?: typeof globalThis.fetch;
}

const findUp = async (start: string): Promise<string | null> => {
  let current = resolve(start);
  const root = parse(current).root;
  while (true) {
    const candidate = join(current, ".breadcrumb.json");
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      if (current === root) return null;
      current = dirname(current);
    }
  }
};

const fetchOwnerManifest = async (
  manifestUrl: string,
  fetcher: typeof globalThis.fetch,
): Promise<BreadcrumbManifest | null> => {
  let response: Response;
  try {
    response = await fetcher(manifestUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return null;
  }
  if (!isBreadcrumbManifest(value)) return null;
  return {
    ...value,
    submission_url: new URL(value.submission_url, manifestUrl).href,
  };
};

const discovered = (
  manifest: BreadcrumbManifest,
  manifestUrl: string,
  target: RepositoryTarget,
  repositoryManifestPath: string | null,
): DiscoveredManifest => ({
  manifest,
  manifestUrl,
  repositoryManifestPath,
  target,
});

const discoverFromWeb = async (
  targetOrigin: string,
  fetcher: typeof globalThis.fetch,
): Promise<DiscoveredManifest | null> => {
  let origin: string;
  try {
    origin = new URL(targetOrigin).origin;
  } catch {
    return null;
  }
  const target: RepositoryTarget = { origin, manifest: "" };

  const wellKnownUrl = new URL("/.well-known/breadcrumb", origin).href;
  const wellKnownManifest = await fetchOwnerManifest(wellKnownUrl, fetcher);
  if (wellKnownManifest !== null) {
    return discovered(
      wellKnownManifest,
      wellKnownUrl,
      { ...target, manifest: wellKnownUrl },
      null,
    );
  }

  let robotsResponse: Response;
  try {
    robotsResponse = await fetcher(new URL("/robots.txt", origin), {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  }
  if (!robotsResponse.ok) return null;
  const manifestUrl = findAgentFeedbackManifestInRobotsTxt(
    await robotsResponse.text(),
  );
  if (manifestUrl === null) return null;
  const manifest = await fetchOwnerManifest(manifestUrl, fetcher);
  return manifest === null
    ? null
    : discovered(
        manifest,
        manifestUrl,
        { ...target, manifest: manifestUrl },
        null,
      );
};

export const discoverManifest = async (
  context: DiscoveryContext = {},
): Promise<DiscoveredManifest | null> => {
  const fetcher = context.fetch ?? globalThis.fetch;
  const path =
    context.repositoryManifestPath ??
    (await findUp(context.cwd ?? process.cwd()));

  if (path === null) {
    return context.targetOrigin === undefined
      ? null
      : discoverFromWeb(context.targetOrigin, fetcher);
  }

  let repository: unknown;
  try {
    repository = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
  if (!isRepositoryManifest(repository)) return null;

  const repositoryManifest: RepositoryManifest = repository;
  let requestedOrigin: string | undefined;
  try {
    requestedOrigin =
      context.targetOrigin === undefined
        ? undefined
        : normalizeOrigin(context.targetOrigin);
  } catch {
    return null;
  }
  const target =
    repositoryManifest.targets.find((item) => {
      if (requestedOrigin === undefined) return false;
      try {
        return normalizeOrigin(item.origin) === requestedOrigin;
      } catch {
        return false;
      }
    }) ?? repositoryManifest.targets[0];
  if (target === undefined) return null;
  let normalizedTarget: RepositoryTarget;
  try {
    normalizedTarget = { ...target, origin: normalizeOrigin(target.origin) };
  } catch {
    return null;
  }

  const manifest = await fetchOwnerManifest(target.manifest, fetcher);
  return manifest === null
    ? null
    : discovered(manifest, target.manifest, normalizedTarget, path);
};
