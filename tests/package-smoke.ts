import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "breadcrumb-package-smoke-"));
const packages = ["core", "server", "postgres", "codex", "vercel"];

try {
  for (const name of packages)
    execFileSync("pnpm", ["pack", "--pack-destination", temporary], {
      cwd: join(root, "packages", name),
      stdio: "ignore",
    });

  const tarballs = readdirSync(temporary)
    .filter((name) => name.endsWith(".tgz"))
    .map((name) => join(temporary, name));
  if (tarballs.length !== packages.length)
    throw new Error(`Expected ${packages.length} package tarballs`);

  const dependencies = Object.fromEntries(
    packages.map((name) => {
      const tarball = tarballs.find((path) =>
        path.endsWith(`breadcrumb-${name}-0.1.0.tgz`),
      );
      if (tarball === undefined) throw new Error(`Missing ${name} tarball`);
      return [`@breadcrumb/${name}`, `file:${tarball}`];
    }),
  );
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies,
      pnpm: { overrides: dependencies },
    }),
  );
  execFileSync("pnpm", ["install"], {
    cwd: temporary,
    stdio: "inherit",
  });
  execFileSync(
    "node",
    [
      "--input-type=module",
      "--eval",
      [
        'await import("@breadcrumb/core")',
        'await import("@breadcrumb/server")',
        'await import("@breadcrumb/postgres")',
        'await import("@breadcrumb/codex")',
        'await import("@breadcrumb/vercel")',
      ].join(";"),
    ],
    { cwd: temporary, stdio: "ignore" },
  );
  console.log("Packed packages install and import successfully");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
