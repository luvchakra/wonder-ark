// DISC-IG-P0-01.1: runs the real extension in Chromium against a MOCK Instagram page and a
// mock WonderArk, to check the mechanics: list, open the chat, fill the box, never send,
// notice the person's own Send, record it, save a reply, hold the pace.
// It does not touch instagram.com: every instagram.com address is answered locally.
//   node extensions/instagram-helper/e2e-mock.cjs      (needs Playwright's Chromium)
const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MESSAGE = "Hi Blair, love your systems for family chaos.\nWould you be open to a collaboration?";
const QUEUE = {
  offerings: [{ offeringId: "o1", offeringName: "WonderHome", businessName: "Home Co", items: [{ kind: "first", messageId: "m1", prospectId: "p1", name: "Blair Mohr", handle: "blair.mohr", text: MESSAGE }] }],
  prospects: [{ prospectId: "p1", name: "Blair Mohr", handle: "blair.mohr", offeringId: "o1" }],
};
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif">${body}</body></html>`;
const THREAD = `
  <div id="thread" style="width:600px">
    <a href="/blair.mohr/">Blair Mohr</a>
    <div id="rows">
      <div role="row" style="display:flex;justify-content:flex-start"><div dir="auto">Hello there</div></div>
      <div role="row" style="display:flex;justify-content:flex-end"><div dir="auto">An older message of mine</div></div>
      <div role="row" style="display:flex;justify-content:flex-start"><div dir="auto">Sounds great, tell me more</div></div>
    </div>
    <div contenteditable="true" role="textbox" id="box" style="border:1px solid #999;min-height:40px"></div>
    <button id="send" onclick="(function(){var b=document.getElementById('box');var r=document.createElement('div');r.setAttribute('role','row');r.style.cssText='display:flex;justify-content:flex-end';var d=document.createElement('div');d.dir='auto';d.innerText=b.innerText;r.appendChild(d);document.getElementById('rows').appendChild(r);b.innerHTML='';})()">Send</button>
  </div>`;
const PROFILE = `<h1>blair.mohr</h1><div role="button" id="message" onclick="history.pushState({},'','/direct/t/123/');document.getElementById('app').innerHTML=window.THREAD">Message</div>`;

(async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      calls.push({ path: req.url, header: req.headers["x-wonderark-helper"], body: body ? JSON.parse(body) : null });
      res.setHeader("content-type", "application/json");
      if (req.url.endsWith("/queue")) return res.end(JSON.stringify(calls.some((c) => c.path.endsWith("/sent")) ? { ...QUEUE, offerings: [{ ...QUEUE.offerings[0], items: [] }] } : QUEUE));
      res.end(JSON.stringify({ status: req.url.endsWith("/sent") ? "sent" : "saved" }));
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;

  // A test copy of the extension that may call the mock server instead of WonderArk.
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "wa-helper-"));
  for (const file of fs.readdirSync(__dirname)) if (!file.startsWith("e2e")) fs.copyFileSync(path.join(__dirname, file), path.join(copy, file));
  const manifest = JSON.parse(fs.readFileSync(path.join(copy, "manifest.json"), "utf8"));
  manifest.host_permissions.push("http://localhost/*");
  fs.writeFileSync(path.join(copy, "manifest.json"), JSON.stringify(manifest));
  const lib = fs.readFileSync(path.join(copy, "lib.js"), "utf8");
  fs.writeFileSync(path.join(copy, "lib.js"), lib.replace('base: "https://ark.wonderapps.biz"', `base: "${base}"`).replace("? base : DEFAULTS.base", `|| base === "${base}" ? base : DEFAULTS.base`));

  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "wa-profile-")), {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`],
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.route("https://www.instagram.com/**", (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname === "/blair.mohr/" ? PROFILE : url.pathname.startsWith("/direct/t/") ? THREAD : "<h1>Home</h1>";
    route.fulfill({ contentType: "text/html", body: page(`<script>window.THREAD=${JSON.stringify(THREAD)}</script><div id="app">${body}</div>`) });
  });
  const tab = await context.newPage();
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  };
  const panel = (selector) => tab.locator(`#wonderark-helper ${selector}`);
  const statusText = async () => (await panel("#status").innerText()).trim();

  await tab.goto("https://www.instagram.com/");
  await panel("#pill").waitFor({ timeout: 15000 });
  await tab.waitForFunction(() => document.querySelector("#wonderark-helper").shadowRoot.getElementById("pill").textContent.includes("(1)"), null, { timeout: 15000 });
  check("lists the waiting message from WonderArk", true, await panel("#pill").innerText());
  check("its calls carry the helper header", calls.every((c) => c.header === "1"));

  await panel("#pill").click();
  await panel("button.go").first().click();
  await tab.waitForURL("**/direct/t/123/", { timeout: 20000 });
  await tab.waitForFunction((first) => document.getElementById("box") && document.getElementById("box").innerText.includes(first), MESSAGE.split("\n")[0], { timeout: 15000 });
  const filled = (await tab.locator("#box").innerText()).replace(/\n+/g, "\n").trim();
  check("opens the chat and fills the message in", filled === MESSAGE, JSON.stringify(filled.slice(0, 50)));
  await tab.waitForTimeout(2500);
  const rowsBefore = await tab.locator('#rows [role="row"]').count();
  check("does not send it: the box still holds the text and no row was added", rowsBefore === 3 && (await tab.locator("#box").innerText()).trim() !== "");
  check("records nothing in WonderArk before the person sends", !calls.some((c) => c.path.endsWith("/sent")));

  await tab.locator("#send").click(); // the person presses Send
  await tab.waitForFunction(() => document.querySelector("#wonderark-helper").shadowRoot.getElementById("status").textContent.includes("Marked as sent"), null, { timeout: 15000 });
  const sent = calls.filter((c) => c.path.endsWith("/sent"));
  check("after the person's Send, marks it sent in WonderArk once", sent.length === 1 && sent[0].body.messageId === "m1", await statusText());

  await tab.waitForFunction(() => !!document.querySelector("#wonderark-helper").shadowRoot.getElementById("replytext"), null, { timeout: 10000 });
  const guess = await panel("#replytext").inputValue();
  check("offers the other person's latest message to save, not my own", guess === "", `after my send the latest row is mine: ${JSON.stringify(guess)}`);
  await tab.evaluate(() => {
    const row = document.createElement("div");
    row.setAttribute("role", "row");
    row.style.cssText = "display:flex;justify-content:flex-start";
    row.innerHTML = '<div dir="auto">Yes, send me the details</div>';
    document.getElementById("rows").appendChild(row);
  });
  await panel("#close").click();
  await panel("#pill").click();
  await tab.waitForFunction(() => {
    const box = document.querySelector("#wonderark-helper").shadowRoot.getElementById("replytext");
    return box && box.value.includes("Yes, send me the details");
  }, null, { timeout: 10000 });
  await panel("#savereply").click();
  await tab.waitForFunction(() => document.querySelector("#wonderark-helper").shadowRoot.getElementById("status").textContent.includes("Reply saved"), null, { timeout: 10000 });
  const reply = calls.filter((c) => c.path.endsWith("/reply"));
  check("saves their reply to WonderArk when the person presses Save reply", reply.length === 1 && reply[0].body.prospectId === "p1" && reply[0].body.text === "Yes, send me the details");

  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  const stored = await worker.evaluate(() => chrome.storage.local.get("pace"));
  check("counts the sent message toward today's pace", stored.pace && stored.pace.count === 1, JSON.stringify(stored.pace && { count: stored.pace.count }));

  await context.close();
  server.close();
  const failed = results.filter((ok) => !ok).length;
  console.log(failed === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed} of ${results.length} checks FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.log("SCRIPT ERROR", String(error).slice(0, 500));
  process.exit(1);
});
