#!/usr/bin/env node
/**
 * Generates `docs/PROGRESS-TRACKER.md`: one place that says, for every story in every
 * backlog under `docs/plan/`, whether it has been built.
 *
 * **Why it is generated rather than written.** A hand-maintained status list is wrong
 * within a week — somebody ships a story and forgets the tracker, and after that nobody
 * trusts it, which is worse than not having one. So the status comes from the repository
 * itself: this codebase cites its story IDs in the code, migrations and tests that
 * implement them (a convention every epic so far has followed), so a story whose ID
 * appears outside `docs/plan/` has been worked, and one whose ID appears nowhere has not.
 * That is evidence rather than memory, and it updates itself.
 *
 * **Where that is not enough.** Epics 0–7 in `04-CLAUDE-CODE-BACKLOG.md` use short ids
 * (`A-1`, `P-3`, `F-11`) that would match unrelated text all over the repo, so their
 * status is curated in `docs/progress-overrides.json` against the per-epic progress
 * documents instead. The same file records anything else the grep gets wrong — a story
 * deliberately deferred, or one built before the citing convention existed. Every
 * override carries a note saying why, so nothing is asserted without a reason.
 *
 * Usage: `npm run build:progress`. `npm test` fails if the committed tracker is stale.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_DIR = join(ROOT, "docs", "plan");
export const OUTPUT_FILE = join(ROOT, "docs", "PROGRESS-TRACKER.md");
export const OVERRIDES_FILE = join(ROOT, "docs", "progress-overrides.json");

/** The backlogs, in the order the tracker presents them. */
const BACKLOGS = [
  { file: "04-CLAUDE-CODE-BACKLOG.md", name: "Platform build-out", curated: true },
  { file: "09-PLATFORM-ADMIN-PORTAL-BACKLOG.md", name: "Platform Administration Portal" },
  { file: "10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md", name: "Discovery — offering-centric upgrade" },
  { file: "08-DISCOVERY-OPPORTUNITY-INTELLIGENCE-BACKLOG.md", name: "Discovery — opportunity intelligence" },
  { file: "11-COMPLIANCE-GLOBAL-TAX-BACKLOG.md", name: "Compliance / Finance — global tax" },
  { file: "12-DISCOVERY-MARKETING-FUNDING-BACKLOG.md", name: "Discovery — Marketing, Customer Acquisition & Funding" },
  { file: "13-DATA-EXPORT-BACKLOG.md", name: "CSV / Excel export" },
  { file: "14-SUBSCRIPTION-BILLING-BACKLOG.md", name: "Subscriptions & billing (Razorpay + Stripe)" },
  { file: "15-MULTI-USER-RBAC-BACKLOG.md", name: "Multi-user / multi-business RBAC" },
  { file: "16-BRANDING-BACKLOG.md", name: "WonderArk branding" },
  { file: "17-DISCOVERY-DATA-AND-CONSUMER.md", name: "Discovery — prospect data and consumer discovery" },
  { file: "18-MODULE-MENUS.md", name: "Module menus" },
  { file: "19-DISCOVERY-OUTREACH-CAMPAIGNS.md", name: "Discovery — outreach campaigns" },
];

/** `## DISC-OFFER-P0-01.1 — Introduce Business Offering`, at any heading depth, with or
 * without a leading "Story".
 *
 * The trailing `.1` is required: every backlog here numbers an epic without one
 * (`## COMPLY-P1-05 — UAE`) and its stories with one, so the minor number is what tells a
 * story from the epic it sits under. Without that, each of those epic headings would be
 * counted as a story of its own and reported as never built. */
const STORY_HEADING = /^#{2,4}\s+(?:Story\s+)?((?:DISC|PLATFORM|COMPLY)[A-Z0-9-]*-\d+\.\d+)\s*[—–-]\s*(.+?)\s*$/;
/** A section heading that is not a story: what the stories under it belong to. */
const EPIC_HEADING = /^#{1,2}\s+(?:\d+\.\s*)?(?:EPIC\s+)?(.+?)\s*$/;
/** `| \`FIN-1\` | **Finance exceptions queue** ... | M |`, and multi-part prefixes such as
 * `| \`DISC-NAV-01\` | ... |`. */
const TABLE_STORY = /^\|\s*`([A-Z]+(?:-[A-Z]+)*-\d+[a-z]?)`\s*\|\s*(.+?)\s*\|/;

/** The first clause of a story's line, as its name. Backlog entries run to a paragraph;
 * what belongs in a status table is the phrase a person would use to refer to the story. */
function cleanTitle(raw) {
  return raw
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .split(/\.\s|\s—\s|:\s/)[0]
    // After the cut, not before: a trailing "(§38)" is a pointer into the requirements
    // document rather than part of the story's name, and cutting at a sentence boundary
    // can leave a bracket that never closes ("(§28"), which reads as truncation.
    .replace(/\s*\([^)]*\)?\s*$/, "")
    .replace(/\|/g, "\\|")
    .trim()
    .slice(0, 120);
}

export function parseBacklog(fileName, source) {
  const stories = [];
  let epic = "(no epic)";

  for (const line of source.split("\n")) {
    const storyMatch = STORY_HEADING.exec(line);
    if (storyMatch) {
      stories.push({ id: storyMatch[1], title: cleanTitle(storyMatch[2]), epic });
      continue;
    }

    const tableMatch = TABLE_STORY.exec(line);
    if (tableMatch) {
      stories.push({ id: tableMatch[1], title: cleanTitle(tableMatch[2]), epic });
      continue;
    }

    const epicMatch = EPIC_HEADING.exec(line);
    // Only a heading that is NOT itself a story starts a new epic.
    if (epicMatch && !STORY_HEADING.test(line)) {
      const heading = epicMatch[1].replace(/`/g, "").trim();
      // Skip the document's own front matter headings.
      if (!/^(Purpose|Product thesis|Guardrails|Claude Code implementation protocol|Business outcome|Objective|Requirements|Acceptance criteria)$/i.test(heading)) {
        epic = heading;
      }
    }
  }

  // The same story can be restated in a summary table and again as a full section.
  const seen = new Set();
  return stories.filter((story) => {
    if (seen.has(`${fileName}:${story.id}`)) return false;
    seen.add(`${fileName}:${story.id}`);
    return true;
  });
}

/**
 * The codebase does not always cite one story at a time. A migration that implements four
 * related stories writes `PLATFORM-P0-15.1/15.2/15.3/15.4`, and a component covering a
 * run of them writes `COMPLY-P0-11.1-11.5`. Matching only the first id in those would
 * report the other three as never built, which is exactly the kind of quiet wrongness
 * that makes a status document worthless.
 *
 * `/` separates a list, `-` or an en dash separates a range.
 */
export function expandCitation(token) {
  // `MKT-03..14` — an integer range written with two dots, as the Discovery expansion
  // stories are cited. Filled in keeping the zero padding the backlog uses (MKT-03).
  const dotted = /^((?:DISC|PLATFORM|COMPLY|MKT|FND|INT|EXP|BILL|RBAC|BRAND)[A-Z0-9-]*?-)(\d+)\.\.(\d+)$/.exec(token);
  if (dotted) {
    const [, prefix, from, to] = dotted;
    const ids = [];
    for (let n = Number(from); n <= Number(to) && ids.length < 100; n += 1) ids.push(`${prefix}${String(n).padStart(from.length, "0")}`);
    return ids;
  }
  const match = /^((?:DISC|PLATFORM|COMPLY|MKT|FND|INT|EXP|BILL|RBAC|BRAND)[A-Z0-9-]*?-)(\d+(?:\.\d+)?)((?:[/\u2013-]\d+(?:\.\d+)?)*)$/.exec(token);
  if (!match) return [];

  const [, base, first, rest] = match;
  const ids = [`${base}${first}`];
  let previous = first;

  for (const [, separator, value] of rest.matchAll(/([/\u2013-])(\d+(?:\.\d+)?)/g)) {
    if (separator === "/") {
      ids.push(`${base}${value}`);
    } else {
      // A range: fill it in, but only within one section (11.1-11.5), never across
      // sections, where the numbering is not a sequence anyone intended to enumerate.
      const [fromMajor, fromMinor] = previous.split(".");
      const [toMajor, toMinor] = value.split(".");
      if (fromMajor === toMajor && fromMinor !== undefined && toMinor !== undefined) {
        for (let n = Number(fromMinor) + 1; n <= Number(toMinor); n += 1) {
          ids.push(`${base}${fromMajor}.${n}`);
        }
      } else {
        ids.push(`${base}${value}`);
      }
    }
    previous = value;
  }

  return [...new Set(ids)];
}

/**
 * Every story id cited outside `docs/plan/`, mapped to the files citing it. One `git
 * grep` over the whole repository rather than one per story -- a few hundred greps would
 * make this too slow to run on every commit, and something slow gets skipped.
 */
export function findCitations(ids) {
  const citations = new Map(ids.map((id) => [id, []]));
  if (ids.length === 0) return citations;

  let output = "";
  try {
    output = execFileSync(
      "git",
      [
        "grep", "-oI", "--no-color", "-E",
        "\\b(DISC|PLATFORM|COMPLY|MKT|FND|INT|EXP|BILL|RBAC|BRAND)[A-Z0-9-]*-[0-9]+((\\.\\.[0-9]+)|((\\.[0-9]+)?([/\u2013-][0-9]+(\\.[0-9]+)?)*))",
        // Everything that talks *about* story ids rather than implementing one: the
        // backlogs, the tracker, this script and its test (whose examples would otherwise
        // read as evidence), and the instructions that tell contributors to cite ids.
        "--", ".",
        ":!docs/plan",
        ":!docs/PROGRESS-TRACKER.md",
        ":!docs/progress-overrides.json",
        ":!scripts/build-progress-tracker.mjs",
        ":!scripts/build-progress-tracker.test.mjs",
        ":!CLAUDE.md",
      ],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    // git grep exits 1 when nothing matches, which is not a failure here.
    if (error.status !== 1) throw error;
    output = error.stdout ?? "";
  }

  for (const line of output.split("\n")) {
    const separator = line.lastIndexOf(":");
    if (separator === -1) continue;
    const file = line.slice(0, separator);
    for (const id of expandCitation(line.slice(separator + 1))) {
      const found = citations.get(id);
      if (found && !found.includes(file)) found.push(file);
    }
  }

  return citations;
}

function statusOf(story, citations, overrides) {
  const override = overrides[story.id];
  if (override) return { status: override.status, note: override.note, evidence: override.evidence ?? [] };
  const files = citations.get(story.id) ?? [];
  if (files.length === 0) return { status: "Not started", note: "", evidence: [] };

  // An id that appears only in an audit or test-case document has been *written about*,
  // not demonstrably built -- those documents discuss the backlog, so counting them as
  // proof would report a story as shipped on the strength of somebody noting that it
  // had not been. Code, a migration or a test is what counts as built.
  const built = files.filter((file) => !file.startsWith("docs/"));
  return built.length > 0
    ? { status: "Done", note: "", evidence: built }
    : { status: "Unverified", note: `Discussed in \`${files[0]}\`, but no code cites it — confirm before relying on this`, evidence: files };
}

const STATUS_MARK = {
  Done: "✅",
  "In progress": "🟡",
  Deferred: "⏸️",
  Superseded: "🔁",
  Unverified: "❔",
  Blocked: "⛔",
  "Not started": "⬜",
};

/** Statuses that are a decision rather than outstanding work, so they do not belong in
 * "what is left". */
const SETTLED = new Set(["Done", "Deferred", "Superseded"]);

function renderStory(story, state) {
  const mark = STATUS_MARK[state.status] ?? "⬜";
  const note = state.note
    ? state.note
    : state.evidence.length > 0
      ? `\`${state.evidence[0]}\`${state.evidence.length > 1 ? ` +${state.evidence.length - 1}` : ""}`
      : "—";
  return `| \`${story.id}\` | ${story.title} | ${mark} ${state.status} | ${note} |`;
}

export function renderTracker(backlogs, citations, overrides) {
  const allStories = backlogs.flatMap((backlog) => backlog.stories);
  const states = new Map(allStories.map((story) => [story.id, statusOf(story, citations, overrides)]));
  const count = (predicate) => allStories.filter((story) => predicate(states.get(story.id).status)).length;

  const lines = [];
  lines.push("# WonderArk platform — progress tracker");
  lines.push("");
  lines.push("<!-- GENERATED FILE — do not edit by hand. Run `npm run build:progress`. -->");
  lines.push("");
  lines.push(
    "Every story in every backlog under `docs/plan/`, and whether it is built. Generated",
    "from the backlogs themselves plus the repository: this codebase cites a story's id in",
    "the code, migration or test that implements it, so a story whose id appears outside",
    "`docs/plan/` has been worked and one whose id appears nowhere has not. Where that",
    "evidence does not apply — the short ids of the platform build-out epics, a story",
    "deliberately deferred, one built before the citing convention — the status is curated",
    "in `docs/progress-overrides.json`, with a note saying why. ❔ Unverified means the id",
    "appears only in an audit or test-case document: somebody wrote about the story, but no",
    "code cites it, so it is counted as outstanding rather than assumed shipped.",
  );
  lines.push("");
  lines.push("Regenerate after finishing a story: `npm run build:progress`. `npm test` fails if this");
  lines.push("file is stale, so it cannot quietly drift out of date.");
  lines.push("");

  lines.push("## Where the platform stands");
  lines.push("");
  lines.push("| | Stories |");
  lines.push("|---|---|");
  lines.push(`| ✅ Done | ${count((status) => status === "Done")} |`);
  lines.push(`| 🟡 In progress | ${count((status) => status === "In progress")} |`);
  lines.push(`| ⏸️ Deferred | ${count((status) => status === "Deferred")} |`);
  lines.push(`| 🔁 Superseded | ${count((status) => status === "Superseded")} |`);
  lines.push(`| ❔ Unverified | ${count((status) => status === "Unverified")} |`);
  lines.push(`| ⛔ Blocked | ${count((status) => status === "Blocked")} |`);
  lines.push(`| ⬜ Not started | ${count((status) => status === "Not started")} |`);
  lines.push(`| **Total** | **${allStories.length}** |`);
  lines.push("");

  lines.push("| Backlog | Done | Set aside | Remaining | Total |");
  lines.push("|---|---|---|---|---|");
  for (const backlog of backlogs) {
    const statuses = backlog.stories.map((story) => states.get(story.id).status);
    const done = statuses.filter((status) => status === "Done").length;
    const settled = statuses.filter((status) => status !== "Done" && SETTLED.has(status)).length;
    lines.push(
      `| [${backlog.name}](./plan/${backlog.file}) | ${done} | ${settled} | ${statuses.length - done - settled} | ${statuses.length} |`,
    );
  }
  lines.push("");

  const outstanding = allStories.filter((story) => !SETTLED.has(states.get(story.id).status));
  lines.push("## What is left");
  lines.push("");
  if (outstanding.length === 0) {
    lines.push("Nothing outstanding — every story in every backlog is done, deferred or superseded.");
  } else {
    lines.push(`${outstanding.length} stories are neither built nor deliberately set aside:`);
    lines.push("");
    lines.push("| ID | Story | Status | Note |");
    lines.push("|---|---|---|---|");
    for (const story of outstanding) lines.push(renderStory(story, states.get(story.id)));
  }
  lines.push("");

  for (const backlog of backlogs) {
    lines.push(`## ${backlog.name}`);
    lines.push("");
    lines.push(`Source: [\`docs/plan/${backlog.file}\`](./plan/${backlog.file})`);
    lines.push("");

    let currentEpic = null;
    for (const story of backlog.stories) {
      if (story.epic !== currentEpic) {
        currentEpic = story.epic;
        lines.push(`### ${currentEpic}`);
        lines.push("");
        lines.push("| ID | Story | Status | Evidence / note |");
        lines.push("|---|---|---|---|");
      }
      lines.push(renderStory(story, states.get(story.id)));
      const isLast = backlog.stories[backlog.stories.length - 1] === story;
      const nextEpic = isLast ? null : backlog.stories[backlog.stories.indexOf(story) + 1].epic;
      if (nextEpic !== currentEpic) lines.push("");
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export function buildTracker() {
  const present = new Set(readdirSync(PLAN_DIR));
  const backlogs = BACKLOGS.filter((backlog) => present.has(backlog.file)).map((backlog) => ({
    ...backlog,
    stories: parseBacklog(backlog.file, readFileSync(join(PLAN_DIR, backlog.file), "utf8")),
  }));

  const overrides = JSON.parse(readFileSync(OVERRIDES_FILE, "utf8")).stories;
  const citations = findCitations(backlogs.flatMap((backlog) => backlog.stories.map((story) => story.id)));
  return { markdown: renderTracker(backlogs, citations, overrides), backlogs, overrides };
}

function main() {
  const { markdown, backlogs } = buildTracker();
  writeFileSync(OUTPUT_FILE, markdown);
  const total = backlogs.reduce((sum, backlog) => sum + backlog.stories.length, 0);
  console.log(`build:progress — ${backlogs.length} backlog(s), ${total} story/stories tracked.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
