import { expect, test, type Page } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { getTestBusinessSlug } from "../support/business";

/**
 * End-to-end flows for Discovery's Marketing and Funding (MKT-03..16, FND-03..17): every
 * workflow driven through the real UI against a real business, checking the rules that
 * matter — drafts before activation, approvals before publishing and sending, unreported
 * numbers shown as "—", commitments kept apart from money raised, share links that stop
 * working when revoked.
 *
 * It creates and changes data, so it only runs when E2E_ALLOW_MUTATIONS=1 and only once
 * (desktop project). Point it at a dedicated test business with E2E_TEST_BUSINESS_SLUG.
 */
test.skip(process.env.E2E_ALLOW_MUTATIONS !== "1", "Set E2E_ALLOW_MUTATIONS=1 to run the data-changing flows");
test.describe.configure({ mode: "serial", timeout: 120_000 });

const RUN = Date.now().toString(36);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

let slug = "";
let root = "";
let fund = "";

// The form error, not Next's own (empty) route-announcer region, which is also role=alert.
const alert = (page: Page) => page.locator('p[role="alert"]').first();
const status = (page: Page) => page.locator('p[role="status"]').first();
const localInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Data-changing flows run once, on desktop");
  page.on("dialog", (d) => d.accept());
  if (!slug) {
    slug = await getTestBusinessSlug(page);
    root = `/${slug}/discovery/marketing`;
    fund = `/${slug}/discovery/funding`;
  }
});

test.describe("Marketing flows", () => {
  let campaignUrl = "";
  let contentUrl = "";

  test("an offering exists, so Customer Acquisition has somewhere to point", async ({ page }) => {
    await page.goto(`/${slug}/business`);
    if (await page.getByText(/^Alarm Monitoring /).count()) return;
    await page.getByRole("button", { name: "New offering" }).click();
    await page.locator('input[name="name"]').fill(`Alarm Monitoring ${RUN}`);
    await page.locator('textarea[name="description"]').fill("24x7 monitored alarm service for gated communities.");
    await page.getByRole("button", { name: "Create offering" }).click();
    await expect(page.getByText(`Alarm Monitoring ${RUN}`).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await expectNoAppCrash(page);
  });

  test("strategy: saved as a draft version, becomes active only when activated", async ({ page }) => {
    await page.goto(`${root}/strategy`);
    await page.getByLabel("Strategy name", { exact: true }).fill(`FY27 strategy ${RUN}`);
    await page.getByLabel("Positioning statement", { exact: true }).fill("The most reliable monitored security for gated communities.");
    await page.getByLabel("Key messages", { exact: true }).fill("Response in 5 minutes\nLocal technicians");
    await page.getByRole("checkbox", { name: "LinkedIn" }).check();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(status(page)).toContainText("Saved as a new draft version");
    const version = page.locator("li", { hasText: `FY27 strategy ${RUN}` }).first();
    await expect(version).toContainText("Draft");
    await version.getByRole("button", { name: "Activate" }).click();
    await expect(page.locator("li", { hasText: `FY27 strategy ${RUN}` }).first()).toContainText("Active");
  });

  test("campaign: validation, draft on create, activation needs a start date", async ({ page }) => {
    await page.goto(`${root}/campaigns/new`);
    await page.getByLabel("Campaign name", { exact: true }).fill(`Gated communities ${RUN}`);
    await page.getByLabel("Objective", { exact: true }).selectOption("lead_generation");
    await page.getByLabel("Channel", { exact: true }).selectOption("linkedin");
    await page.getByLabel("Budget", { exact: true }).fill("10000");
    await page.getByLabel("Currency", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save as draft" }).click();
    await expect(alert(page)).toContainText("currency");
    // A rejected submit keeps what the founder typed.
    await expect(page.getByLabel("Campaign name", { exact: true })).toHaveValue(`Gated communities ${RUN}`);
    await expect(page.getByLabel("Budget", { exact: true })).toHaveValue("10000");

    await page.getByLabel("Currency", { exact: true }).fill("INR");
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}$/);
    campaignUrl = new URL(page.url()).pathname;
    await expect(page.locator("h1")).toContainText("Draft");

    // No start date yet: the server refuses to activate.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(alert(page)).toContainText("start date");
    // Nothing reported yet shows as "—", not 0.
    await expect(page.getByText("Cost per lead").locator("..")).toContainText("—");
  });

  test("campaign: edit dates and landing page, then activate", async ({ page }) => {
    await page.goto(`${campaignUrl}/edit`);
    await page.getByLabel("Start date", { exact: true }).fill(isoDay(-2));
    await page.getByLabel("End date", { exact: true }).fill(isoDay(3));
    await page.getByLabel("Landing page", { exact: true }).fill("https://example.com/gated");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(new RegExp(`${campaignUrl}$`));
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.locator("h1")).toContainText("Active");
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  });

  test("campaign results: manual entry, CSV import with a bad row, CPL and over-budget signal", async ({ page }) => {
    await page.goto(campaignUrl);
    await page.getByText("Record results").click();
    await page.getByLabel("Website sessions", { exact: true }).fill("300");
    await page.getByLabel("Leads", { exact: true }).fill("5");
    await page.getByLabel("Spend", { exact: true }).fill("12000");
    await page.getByRole("button", { name: "Save numbers" }).click();
    await expect(page.getByText("Numbers recorded.")).toBeVisible();

    await page.getByText("Import from a CSV export").click();
    await page.getByLabel("Or paste", { exact: true }).fill(`date,clicks,leads,spend,currency\n${isoDay(-1)},40,,,\nnot-a-date,1,1,,\n`);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText(/Imported 1 day/)).toBeVisible();
    await expect(page.getByText(/Skipped 1/)).toBeVisible();

    await page.reload();
    await expect(page.getByText("Cost per lead").locator("..")).toContainText("2,400");
    await page.goto(root);
    await expect(page.getByText(new RegExp(`Gated communities ${RUN} is over budget`))).toBeVisible();
  });

  test("attribution: credits a prospect only with the business's own records", async ({ page }) => {
    await page.goto(campaignUrl);
    const record = page.getByText("Record an attribution");
    if (!(await record.count())) test.skip(true, "No prospects, opportunities or customers to attribute yet");
    await record.click();
    const select = page.getByLabel("Record", { exact: true });
    const firstValue = await select.locator("option:not([disabled])").first().getAttribute("value");
    await select.selectOption(firstValue!);
    await page.getByLabel("Evidence", { exact: true }).fill("Came in through the landing page form");
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect(page.getByText("Recorded.")).toBeVisible();
  });

  test("content: draft → review → approve → schedule → publish, then locked and duplicable", async ({ page }) => {
    await page.goto(`${root}/content/new`);
    await page.getByLabel("Title", { exact: true }).fill(`5 signs your complex needs monitoring ${RUN}`);
    await page.getByLabel("Type", { exact: true }).selectOption("blog");
    await page.getByLabel("Brief", { exact: true }).fill("Explain the warning signs, end with a site-survey offer.");
    await page.getByLabel("Body", { exact: true }).fill("1. Unattended gates\n2. Blind spots\n3. Slow response");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/content\/[0-9a-f-]{36}$/);
    contentUrl = new URL(page.url()).pathname;
    await expect(page.locator("h1")).toContainText("Draft");

    // Publishing is not offered to a draft.
    await expect(page.getByRole("button", { name: "Mark as published" })).toHaveCount(0);
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.locator("h1")).toContainText("In review");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("h1")).toContainText("Approved");

    await page.getByLabel("Publish on", { exact: true }).fill(localInput(new Date(Date.now() + 2 * 86_400_000)));
    await page.getByRole("button", { name: "Schedule", exact: true }).click();
    await expect(page.locator("h1")).toContainText("Scheduled");

    await page.getByLabel("Where it was published", { exact: true }).fill("https://example.com/blog/5-signs");
    await page.getByRole("button", { name: "Mark as published" }).click();
    await expect(page.locator("h1")).toContainText("Published");
    await expect(page.getByText("published", { exact: true })).toBeVisible(); // pinned version
    await expect(page.getByRole("button", { name: "Save version" })).toHaveCount(0);

    await page.getByRole("button", { name: "Duplicate" }).click();
    await page.waitForURL((u) => u.pathname !== contentUrl && /\/content\/[0-9a-f-]{36}$/.test(u.pathname));
    await expect(page.locator("h1")).toContainText(`Copy of 5 signs`);
    contentUrl = new URL(page.url()).pathname;
  });

  test("content: editing saves a new version", async ({ page }) => {
    await page.goto(contentUrl);
    await page.getByLabel("Body", { exact: true }).fill("Rewritten body for version two.");
    await page.getByRole("button", { name: "Save version" }).click();
    await expect(page.getByText("Saved as a new version.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("v2 · Written by a person")).toBeVisible();
  });

  test("content calendar shows the scheduled month and navigates", async ({ page }) => {
    await page.goto(`${root}/content?view=calendar`);
    await expectNoAppCrash(page);
    await expect(page.getByRole("tab", { name: "calendar" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("link", { name: "Next month" }).click();
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
  });

  test("assets: real image uploads, a disguised file is refused, delete works", async ({ page }) => {
    await page.goto(`${root}/assets`);
    await page.getByLabel("File", { exact: true }).setInputFiles({ name: "evil.pdf", mimeType: "text/html", buffer: Buffer.from("<script>") });
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(alert(page)).toContainText("does not match");

    await page.getByLabel("File", { exact: true }).setInputFiles({ name: `logo-${RUN}.png`, mimeType: "image/png", buffer: PNG });
    await page.getByLabel("Name", { exact: true }).fill(`Logo ${RUN}`);
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Uploaded.")).toBeVisible();
    const card = page.locator("li", { hasText: `Logo ${RUN}` });
    await expect(card.getByRole("link", { name: "Open" })).toHaveAttribute("href", /token=/);
    await card.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("li", { hasText: `Logo ${RUN}` })).toHaveCount(0);
  });

  test("website & SEO: log and resolve an opportunity, log an AI-search observation", async ({ page }) => {
    await page.goto(`${root}/website-seo`);
    await page.getByText("Log an opportunity").click();
    await page.getByLabel("What is the issue?", { exact: true }).fill(`Home page has no meta description ${RUN}`);
    await page.getByRole("button", { name: "Add" }).first().click();
    const item = page.locator("li", { hasText: `no meta description ${RUN}` });
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Resolve" }).click();
    await expect(page.locator("li", { hasText: `no meta description ${RUN}` })).toHaveCount(0);

    await page.getByText("Log an observation").click();
    await page.getByLabel("Question asked", { exact: true }).fill("Best monitored alarm company in Bengaluru?");
    await page.getByLabel("Did you appear?", { exact: true }).selectOption("no");
    await page.getByLabel("Summary", { exact: true }).fill(`Not mentioned by ChatGPT ${RUN}`);
    await page.getByRole("button", { name: "Add" }).last().click();
    await expect(page.locator("li", { hasText: `Not mentioned by ChatGPT ${RUN}` })).toContainText("you did not appear");
  });

  test("analytics: reports render with the recorded numbers", async ({ page }) => {
    await page.goto(`${root}/analytics?period=30d&report=channel`);
    await expectNoAppCrash(page);
    await expect(page.getByRole("cell", { name: "LinkedIn" })).toBeVisible();
    await page.goto(`${root}/analytics?report=campaign&grain=day`);
    await expect(page.getByRole("cell", { name: new RegExp(`Gated communities ${RUN}`) })).toBeVisible();
  });

  test("AI assist: generates a draft version, or says plainly why it cannot", async ({ page }) => {
    await page.goto(contentUrl);
    await page.getByRole("button", { name: "Generate from brief" }).click();
    const outcome = page.locator('p[role="status"], p[role="alert"]').first();
    await expect(outcome).toBeVisible({ timeout: 90_000 });
    const text = await outcome.innerText();
    test.info().annotations.push({ type: "ai-outcome", description: text.slice(0, 200) });
    if ((await outcome.getAttribute("role")) === "status") {
      await page.reload();
      await expect(page.getByText(/AI draft/).first()).toBeVisible();
    } else {
      expect(text).not.toMatch(/Something went wrong/i);
    }
  });
});

test.describe("Funding flows", () => {
  let roundUrl = "";
  let investorUrl = "";

  test("profile: traction needs a source, then saves", async ({ page }) => {
    await page.goto(`${fund}/profile`);
    await page.getByLabel("Summary", { exact: true }).fill("Monitored security for gated communities in Bengaluru.");
    // The last traction row is always a blank one.
    await page.getByLabel("Metric", { exact: true }).last().fill(`Monitored sites ${RUN}`);
    await page.getByLabel("Value", { exact: true }).last().fill("42");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(alert(page)).toContainText("source");
    await expect(page.getByLabel("Metric", { exact: true }).last()).toHaveValue(`Monitored sites ${RUN}`);
    await page.getByLabel("Source", { exact: true }).last().fill("Monitoring console export");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(status(page)).toHaveText("Profile saved.");
  });

  test("readiness: standard checklist starts Missing; only a person marks Ready", async ({ page }) => {
    await page.goto(`${fund}/readiness`);
    await page.getByRole("button", { name: "Add standard checklist" }).click();
    await expect(page.getByRole("status").first()).toBeVisible();
    await page.reload();
    await expect(page.getByText("Pitch deck").first()).toBeVisible();
    // Any item not yet ready: marking it records the decision, and the button goes away.
    const open = page.locator("ul.divide-y > li").filter({ has: page.getByRole("button", { name: "Mark ready" }) }).first();
    const title = (await open.locator("p.font-medium").first().innerText()).trim();
    await open.getByRole("button", { name: "Mark ready" }).click();
    const row = page.locator("ul.divide-y > li").filter({ has: page.getByText(title, { exact: true }) }).first();
    await expect(row.getByRole("button", { name: "Mark ready" })).toHaveCount(0);
    await expect(row.getByText("Ready", { exact: true })).toBeVisible();
  });

  test("round: amounts need a currency; opening sets the round live", async ({ page }) => {
    await page.goto(`${fund}/rounds`);
    const live = page.locator("a", { hasText: /Open|Planning|Paused/ }).filter({ hasText: "primary" });
    await page.getByLabel("Round name", { exact: true }).fill(`Seed ${RUN}`);
    await page.getByLabel("Type", { exact: true }).selectOption("seed");
    await page.getByLabel("Target", { exact: true }).fill("1,00,00,000");
    await page.getByLabel("Currency", { exact: true }).fill("");
    if (await live.count()) await page.getByLabel(/Primary round/).uncheck();
    await page.getByRole("button", { name: "Create round" }).click();
    await expect(alert(page)).toContainText("currency");
    await page.getByLabel("Currency", { exact: true }).fill("INR");
    await page.getByRole("button", { name: "Create round" }).click();
    await page.waitForURL(/\/rounds\/[0-9a-f-]{36}$/);
    roundUrl = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "Open round" }).click();
    await expect(page.locator("h1")).toContainText("Open");
  });

  test("investor: create, contact, research needs a source to be source-backed", async ({ page }) => {
    await page.goto(`${fund}/investors`);
    await page.getByLabel("Investor or fund", { exact: true }).fill(`Acme Ventures ${RUN}`);
    await page.getByLabel("General email", { exact: true }).fill(`aitoolshubsaas+investor-${RUN}@gmail.com`);
    await page.getByRole("button", { name: "Add investor" }).click();
    await page.waitForURL(/\/investors\/[0-9a-f-]{36}$/);
    investorUrl = new URL(page.url()).pathname;

    await page.getByText("Add a contact").click();
    await page.getByLabel("First name", { exact: true }).fill("Priya");
    await page.getByLabel("Title", { exact: true }).fill("Partner");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(status(page)).toHaveText("Contact added.");

    await page.getByText("Add a finding").click();
    await page.getByLabel("Where it comes from", { exact: true }).selectOption("source_backed");
    await page.getByLabel("Finding", { exact: true }).fill("Invests in B2B security and proptech at seed.");
    await page.getByRole("button", { name: "Save finding" }).click();
    await expect(alert(page)).toContainText("link it came from");
    await page.getByLabel("Source link", { exact: true }).fill("https://example.com/acme-ventures/thesis");
    await page.getByRole("button", { name: "Save finding" }).click();
    await expect(status(page)).toHaveText("Finding saved.");
    await page.reload();
    await expect(page.getByText("Source-backed").first()).toBeVisible();
  });

  test("pipeline: add to round, a commitment needs its amount, raised stays separate", async ({ page }) => {
    await page.goto(investorUrl);
    const roundId = roundUrl.split("/").pop()!;
    await page.getByLabel("Round", { exact: true }).first().selectOption(roundId);
    await page.getByRole("button", { name: "Add to round" }).click();
    // Once the investor is in every open round the form unmounts, taking its
    // confirmation with it — the round listed under "In rounds" is the proof.
    await expect(page.locator(`a[href$="${roundId}"]`).first()).toBeVisible();

    await page.reload();
    await page.getByText("Move stage").first().click();
    const move = page.locator("form", { has: page.locator('select[name="to"]') }).first();
    await move.locator('select[name="to"]').selectOption("committed");
    await move.getByRole("button", { name: "Move", exact: true }).click();
    await expect(move.locator('p[role="alert"]')).toContainText("committed amount");

    await move.locator('input[name="committedAmount"]').fill("2500000");
    await move.locator('input[name="currency"]').fill("INR");
    await move.getByRole("button", { name: "Move", exact: true }).click();
    await expect(page.getByText(/committed ₹25,00,000/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/committed ₹25,00,000/)).toBeVisible();

    await page.goto(roundUrl);
    await expect(page.getByText("Committed (not yet received)").locator("..")).toContainText("25,00,000");
    await expect(page.getByText("Raised (received)").locator("..")).toContainText("—");
  });

  test("interaction: a logged meeting appears on the timeline", async ({ page }) => {
    await page.goto(investorUrl);
    await page.getByText("Log an interaction").click();
    await page.getByLabel("When", { exact: true }).fill(localInput(new Date()));
    await page.getByLabel("Subject", { exact: true }).fill(`Intro call ${RUN}`);
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(status(page)).toHaveText("Logged.");
    await page.reload();
    await expect(page.getByText(`Meeting — Intro call ${RUN}`)).toBeVisible();
  });

  test("outreach: draft → approval → approve; sending records the provider's answer", async ({ page }) => {
    await page.goto(investorUrl);
    await page.getByRole("link", { name: "Draft outreach" }).click();
    await page.getByLabel("Subject", { exact: true }).fill(`Seed round intro ${RUN}`);
    await page.getByLabel("Message", { exact: true }).fill("Hi Priya — we monitor 42 gated communities and are raising our seed.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.waitForURL(/\/outreach\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("button", { name: /^Send/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("h1")).toContainText("Approved");
    await page.getByRole("button", { name: /^Send/ }).click();
    // The Send form unmounts once the status moves on; the Status card carries
    // the provider's answer either way.
    await expect(page.locator("h1")).toContainText(/Sent|Failed/, { timeout: 60_000 });
    const outcome = page.getByText(/^(Sent .* Provider id|Not sent: )/).first();
    await expect(outcome).toBeVisible();
    test.info().annotations.push({ type: "send-outcome", description: (await outcome.innerText()).slice(0, 200) });
  });

  test("data room: upload into a placeholder, share, open as an outsider, revoke", async ({ page, browser }) => {
    await page.goto(`${fund}/data-room`);
    await page.getByRole("button", { name: "Add standard checklist" }).click();
    await expect(status(page)).toBeVisible();
    // A run-specific placeholder: the standard "Pitch deck" keeps its file from earlier runs.
    const placeholder = page.locator("form", { has: page.locator("#ph-name") });
    await placeholder.locator("#ph-name").fill(`Pitch deck ${RUN}`);
    await placeholder.getByRole("button", { name: "Add", exact: true }).click();
    await expect(placeholder.locator('p[role="status"]')).toHaveText("Added to the checklist.");
    await page.reload();
    const row = () => page.locator("ul.divide-y > li", { hasText: `Pitch deck ${RUN}` }).first();
    await row().getByText("Upload the file").click();
    await row().getByLabel("File", { exact: true }).setInputFiles({ name: "deck.pdf", mimeType: "application/pdf", buffer: PDF });
    await row().getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText(/Uploaded as a draft/)).toBeVisible();
    await page.reload();
    await row().getByRole("button", { name: "Mark ready" }).click();
    await expect(row()).toContainText("Ready");

    await row().getByText("Share", { exact: true }).click();
    await row().locator('input[name="recipientEmail"]').fill(`aitoolshubsaas+investor-${RUN}@gmail.com`);
    await row().locator('input[name="days"]').fill("1");
    await row().getByRole("button", { name: "Create link" }).click();
    const message = await page.getByText(/Link created/).innerText();
    const link = message.match(/https?:\/\/\S+\/p\/dr\/[A-Za-z0-9_-]{43}/)?.[0];
    expect(link).toBeTruthy();

    const outsider = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const first = await outsider.request.get(link!, { maxRedirects: 0 });
    expect(first.status()).toBe(302);
    expect(first.headers()["location"]).toMatch(/supabase\.co\/storage\/v1\/object\/sign\//);

    await page.reload();
    await expect(row()).toContainText("opened 1×");
    await row().getByRole("button", { name: "Revoke" }).click();
    await expect(row()).toContainText("revoked");

    const after = await outsider.request.get(link!, { maxRedirects: 0 });
    expect(after.status()).toBe(410);
    expect(await after.text()).toContain("withdrawn");
    await outsider.close();
  });

  test("diligence: submit needs a response; accept is recorded", async ({ page }) => {
    await page.goto(`${fund}/due-diligence`);
    await page.getByLabel("Request", { exact: true }).fill(`Please share the cap table ${RUN}`);
    await page.getByRole("button", { name: "Add request" }).click();
    await expect(status(page)).toHaveText("Added.");
    await page.getByRole("link", { name: new RegExp(`cap table ${RUN}`) }).first().click();
    await page.getByRole("button", { name: "Mark submitted" }).click();
    await expect(alert(page)).toContainText("Write the response");
    await page.getByLabel("Response", { exact: true }).fill("Cap table attached in the data room.");
    await page.getByRole("button", { name: "Save response" }).click();
    await expect(status(page)).toHaveText("Saved.");
    await page.getByRole("button", { name: "Mark submitted" }).click();
    await expect(page.locator("h1")).toContainText("Submitted");
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.locator("h1")).toContainText("Accepted");
    await expect(page.getByRole("button", { name: "Save response" })).toHaveCount(0);
  });

  test("dashboard and analytics reflect the round, pipeline and diligence", async ({ page }) => {
    await page.goto(fund);
    await expectNoAppCrash(page);
    await expect(page.getByText("Round progress")).toBeVisible();
    await expect(page.getByText("Runway (months)")).toBeVisible();
    await page.goto(`${fund}/analytics?round=${roundUrl.split("/").pop()}`);
    await expectNoAppCrash(page);
    await expect(page.getByText("Pipeline conversion")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Founder network" })).toBeVisible();
  });

  test("the sidebar's Customer Acquisition points at the offering's existing pages", async ({ page }) => {
    await page.goto(`/${slug}/discovery/dashboard`);
    await page.getByRole("button", { name: /^Customer Acquisition/ }).click();
    // DISC-NAV-P0-01.1: Customer Acquisition lists the offering's four tabs.
    const find = page.locator('nav[aria-label="Main"]').getByRole("link", { name: "Find", exact: true });
    await expect(find).toHaveAttribute("href", new RegExp(`/${slug}/discovery/offerings/[0-9a-f-]{36}/prospects/discover$`));
    await find.click();
    await expectNoAppCrash(page);
  });
});
