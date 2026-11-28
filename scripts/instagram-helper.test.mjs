// DISC-IG-P0-01.1: the WonderArk Instagram helper (extensions/instagram-helper). What is
// pinned here is the owner's limit on it (2026-11-28): it fills a message in and the person
// presses Send. It never sends, follows, likes or browses for them, it asks for no more
// access than it uses, and it holds the person to a human pace.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { GENERATED_PATH, HELPER_FILES, generatedModule, zipOf } from "./build-instagram-helper.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "extensions", "instagram-helper");
const helper = createRequire(import.meta.url)(join(dir, "lib.js"));
const read = (name) => readFileSync(join(dir, name), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 28, 10, 0, 0);

test("the helper asks only for storage, and only for WonderArk's own addresses", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://ark.wonderapps.biz/*", "https://*.ark.wonderapps.biz/*"]);
  // It runs on Instagram's pages as a page script; it has no access to Instagram's cookies or requests.
  for (const forbidden of ["cookies", "webRequest", "tabs", "scripting", "debugger", "<all_urls>"]) {
    assert.ok(!JSON.stringify(manifest).includes(`"${forbidden}"`), forbidden);
  }
});

test("the page script never presses Send: its one click is Instagram's Message button", () => {
  const script = read("content.js");
  const clicks = script.match(/\.click\(\)/g) ?? [];
  assert.equal(clicks.length, 1, "exactly one .click() in content.js");
  assert.match(script, /const button = await waitFor\(messageButton\);[\s\S]{0,400}button\.click\(\)/);
  assert.match(script, /=== "Message"/);
  // No synthetic key presses or form submits, which is how a message would be sent.
  for (const forbidden of ["KeyboardEvent", "keydown", "keypress", "keyup", ".submit(", "requestSubmit", "fetch(", "XMLHttpRequest"]) {
    assert.ok(!script.includes(forbidden), `content.js must not use ${forbidden}`);
  }
});

test("only the background worker talks to WonderArk, and only to its helper endpoints", () => {
  const background = read("background.js");
  assert.equal((background.match(/fetch\(/g) ?? []).length, 1);
  assert.match(background, /\/api\/discovery\/instagram-helper\//);
  assert.match(background, /"X-WonderArk-Helper": "1"/);
  assert.ok(!background.includes("instagram.com"));
});

test("handleOf reads a plain profile address and nothing else", () => {
  assert.equal(helper.handleOf("https://www.instagram.com/WeekView/?hl=en"), "weekview");
  assert.equal(helper.handleOf("/the.organized_mom/"), "the.organized_mom");
  for (const link of ["/p/abc123/", "/direct/t/1234/", "/direct/", "/explore/", "https://evil.example/weekview/", "/week view/", ""]) {
    assert.equal(helper.handleOf(link), null, link);
  }
});

test("the pace allows a message, then holds the gap, then the daily limit", () => {
  const settings = helper.cleanSettings({ dailyLimit: 2, gapSeconds: 120 });
  assert.deepEqual(helper.paceCheck(undefined, settings, NOW), { allowed: true, reason: null, left: 2, waitSeconds: 0 });
  const one = helper.paceAfterSend(undefined, NOW);
  assert.deepEqual(helper.paceCheck(one, settings, NOW + 30_000), { allowed: false, reason: "gap", left: 1, waitSeconds: 90 });
  assert.equal(helper.paceCheck(one, settings, NOW + 120_000).allowed, true);
  const two = helper.paceAfterSend(one, NOW + 120_000);
  assert.deepEqual(helper.paceCheck(two, settings, NOW + 10 * 60_000), { allowed: false, reason: "limit", left: 0, waitSeconds: 0 });
  // A new day starts a new count.
  assert.equal(helper.paceCheck(two, settings, NOW + DAY).allowed, true);
});

test("settings stay within safe bounds and never point outside WonderArk", () => {
  assert.deepEqual(helper.cleanSettings({ base: "https://evil.example", dailyLimit: 9999, gapSeconds: 0 }), {
    base: "https://ark.wonderapps.biz",
    dailyLimit: 50,
    gapSeconds: 120,
  });
  assert.equal(helper.cleanSettings({ base: "https://home.ark.wonderapps.biz/" }).base, "https://home.ark.wonderapps.biz");
  assert.equal(helper.cleanSettings({ base: "https://ark.wonderapps.biz.evil.example" }).base, "https://ark.wonderapps.biz");
  assert.equal(helper.cleanSettings({ gapSeconds: 5 }).gapSeconds, 30);
});

// DISC-IG-P0-01.3: the download WonderArk offers is built from the extension's own files.
test("the packed download matches the extension's source", () => {
  assert.equal(readFileSync(GENERATED_PATH, "utf8"), generatedModule(), "package.generated.ts is stale -- run `npm run build:instagram-helper`");
});

test("the download holds what ships and not the mock test", () => {
  assert.deepEqual(HELPER_FILES.slice().sort(), ["README.md", "ark.js", "background.js", "content.js", "lib.js", "manifest.json", "popup.html", "popup.js"]);
  const manifest = JSON.parse(read("manifest.json"));
  const used = [manifest.background.service_worker, manifest.action.default_popup, ...manifest.content_scripts.flatMap((entry) => entry.js)];
  for (const file of used) assert.ok(HELPER_FILES.includes(file), `${file} is used by the manifest but not packed`);
});

test("zipOf writes a zip a reader accepts: signatures, sizes and a stable result", () => {
  const files = [{ name: "a/one.txt", data: Buffer.from("hello") }, { name: "a/two.txt", data: Buffer.from("") }];
  const zip = zipOf(files);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 2);
  assert.equal(zip.readUInt32LE(14), 0x3610a686); // CRC-32 of "hello"
  assert.ok(zip.equals(zipOf(files)), "the same files give the same bytes");
});

test("on a WonderArk page the helper only reports the address and leaves its version mark", () => {
  const script = read("ark.js");
  assert.match(script, /dataset\.wonderarkHelper = chrome\.runtime\.getManifest\(\)\.version/);
  for (const forbidden of ["fetch(", "cookie", "localStorage", "innerHTML", "querySelector", "addEventListener"]) {
    assert.ok(!script.includes(forbidden), `ark.js must not use ${forbidden}`);
  }
});
