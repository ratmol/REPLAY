// Architectural guardrails.
//
// These assert the invariants that documentation cannot enforce. A rule written
// in prose is a suggestion; a failing test is a fact. Each check below exists
// because violating it silently would be expensive to discover later - a
// dependency that shipped, a chart library that made the timeline someone
// else's code, an UPDATE that broke the append-only log.
//
// Written in plain .mjs rather than TypeScript on purpose: everything here
// reads package manifests and source text as data, so there are no types to
// gain, and it keeps the repo root free of a tsx/typescript dependency it would
// otherwise need only for this file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), "utf8"));
}

/** Every source file under a directory, recursively. Skips dist and node_modules. */
function sourceFiles(relDir, extensions = [".ts", ".tsx"]) {
  const abs = join(ROOT, relDir);
  if (!existsSync(abs)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (extensions.includes(extname(entry))) out.push(full);
    }
  };
  walk(abs);
  return out;
}

function dependencyNames(pkg) {
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ];
}

// Invariant: the SDK has zero runtime dependencies.
//
// Drop-in weight is the SDK's whole pitch. devDependencies are fine; anything
// that follows the package to a user's node_modules is not. peerDependencies
// count, because npm still asks the user to install them.
test("sdk has zero runtime dependencies", () => {
  const pkg = readJson("sdk/package.json");
  assert.deepEqual(
    dependencyNames(pkg),
    [],
    "replay-sdk must ship with no runtime dependencies. Move it to devDependencies or hand-write the code.",
  );
});

// Invariant: the SDK imports from replay-shared with `import type` only.
//
// This is the check that matters most, and the one a human review misses. The
// type-only import is what lets the SDK share one source of truth for event
// shapes while the compiler erases the import entirely. Drop the `type` keyword
// and it silently becomes a real runtime dependency on a package that depends
// on Zod - the previous test still passes, because package.json never changed.
test("sdk imports replay-shared as types only", () => {
  const offenders = [];

  for (const file of sourceFiles("sdk/src")) {
    const text = readFileSync(file, "utf8");
    const rel = file.slice(ROOT.length + 1);

    text.split("\n").forEach((line, i) => {
      if (!line.includes("replay-shared")) return;

      const isTypeOnlyImport = /^\s*import\s+type\s/.test(line);
      const isTypeOnlyExport = /^\s*export\s+type\s/.test(line);
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);

      if (!isTypeOnlyImport && !isTypeOnlyExport && !isComment) {
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `The SDK may only use \`import type\` from replay-shared. A value import makes it a runtime dependency:\n${offenders.join("\n")}`,
  );
});

// Belt and braces: if the SDK has been built, the emitted JavaScript must not
// mention replay-shared at all. Type-only imports are erased, so any surviving
// reference means something slipped through the source check above.
test("built sdk output does not reference replay-shared", (t) => {
  const dist = join(ROOT, "sdk/dist/index.js");
  if (!existsSync(dist)) {
    t.skip("sdk/dist not built; run `pnpm --filter replay-sdk build` to include this check");
    return;
  }
  const text = readFileSync(dist, "utf8");

  // Match import/require syntax rather than the bare string. tsc keeps comments
  // by default, and the source comments legitimately mention replay-shared when
  // explaining the type-only rule - a substring check would fail on those.
  const valueImport = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s+)["']replay-shared["']/;

  assert.ok(
    !valueImport.test(text),
    "sdk/dist/index.js imports replay-shared at runtime, so the import was not erased. Check for a missing `type` keyword.",
  );
});

// Invariant: events are append-only.
//
// Run-level totals are derived by summing events, so the runs table is legitimately
// updated. The events table never is - an UPDATE there means the log stopped being
// the source of truth, and every derived number downstream becomes unreliable.
test("no UPDATE against the events table", () => {
  const offenders = [];

  // Matched against the whole file, not line by line: SQL in this codebase is
  // written across template literals, so `UPDATE` and `events` are often on
  // separate lines. \s spans newlines, so this catches both shapes.
  const updateEvents = /\bUPDATE\s+events\b/i;

  for (const file of sourceFiles("collector/src")) {
    const text = readFileSync(file, "utf8");
    const rel = file.slice(ROOT.length + 1);
    const match = updateEvents.exec(text);

    if (match) {
      const line = text.slice(0, match.index).split("\n").length;
      offenders.push(`${rel}:${line}: ${match[0].replace(/\s+/g, " ")}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `The events table is append-only. Derive from the log instead:\n${offenders.join("\n")}`,
  );
});

// Invariant: the timeline is hand-built.
//
// This one fires during the dashboard work, which is exactly when a charting
// library looks most reasonable. Owning the scrubber is the point of the
// project; importing it hands the interesting part to someone else's code.
test("dashboard has no charting library", () => {
  const banned = ["recharts", "chart.js", "d3", "visx", "@visx/visx", "nivo", "@nivo/core", "victory", "plotly.js", "apexcharts", "echarts"];
  const pkg = readJson("dashboard/package.json");
  const present = dependencyNames(pkg).filter((name) => banned.includes(name));

  assert.deepEqual(
    present,
    [],
    `The timeline is hand-built with SVG or canvas. Remove: ${present.join(", ")}`,
  );
});

// Invariant: SQLite, local-first. No Postgres, no ORM, no migration framework.
//
// Checked across every package rather than just the collector, because the
// tempting place to add an ORM is wherever someone is currently frustrated.
test("no Postgres, ORM, or migration framework in any package", () => {
  const banned = ["pg", "postgres", "prisma", "@prisma/client", "drizzle-orm", "knex", "typeorm", "sequelize", "kysely", "umzug", "node-pg-migrate"];
  const offenders = [];

  for (const pkgPath of ["package.json", "shared/package.json", "sdk/package.json", "collector/package.json", "dashboard/package.json"]) {
    const pkg = readJson(pkgPath);
    for (const name of dependencyNames(pkg)) {
      if (banned.includes(name)) offenders.push(`${pkgPath}: ${name}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Storage is SQLite via better-sqlite3, with plain SQL migrations:\n${offenders.join("\n")}`,
  );
});
