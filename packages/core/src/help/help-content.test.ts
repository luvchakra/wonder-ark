import { describe, expect, it } from "vitest";
import { FAQ } from "./faq";
import { getGuide, getSection, listGuides, listSections, sectionHref } from "./guides";
import { searchHelp, stem, tokenize } from "./search";

// The generator itself, and the drift check that keeps this content in step with
// docs/user-guides, are tested in scripts/build-help-content.test.mjs -- next to the
// script, and able to import it without a TypeScript declaration for a .mjs file.
describe("generated help content", () => {
    it("dates every guide", () => {
    for (const guide of listGuides()) expect(guide.lastUpdated, guide.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has every guide, in reading order, each with sections", () => {
    const guides = listGuides();
    expect(guides.length).toBeGreaterThanOrEqual(6);
    expect(guides.map((guide) => guide.order)).toEqual([...guides.map((g) => g.order)].sort((a, b) => a - b));
    for (const guide of guides) {
      expect(guide.slug, `${guide.title} needs a slug`).toMatch(/^[a-z0-9-]+$/);
      expect(guide.summary.length, `${guide.slug} needs a summary`).toBeGreaterThan(20);
      expect(guide.sections.length, `${guide.slug} needs sections`).toBeGreaterThan(0);
    }
  });

  it("gives every section a unique, linkable id within its guide", () => {
    for (const guide of listGuides()) {
      const ids = guide.sections.map((section) => section.id);
      expect(new Set(ids).size, `${guide.slug} has duplicate section ids`).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("carries the Finance guide, not the pre-rename Compliance one", () => {
    const finance = getGuide("finance");
    expect(finance?.title).toContain("Finance");
    expect(getGuide("compliance-gst")).toBeUndefined();
  });
});

// The topics the 2026-10 refresh added. If a section is renamed or merged, this names the
// topic that lost its home, instead of the help quietly forgetting a feature exists.
describe("recently shipped features are documented", () => {
  const cases: Array<[string, string, string]> = [
    ["Microsoft and LinkedIn sign-in", "getting-started", "creating-an-account"],
    ["Download my data", "getting-started", "your-profile-your-data-and-appearance"],
    ["the Executive Dashboard", "getting-started", "your-dashboard"],
    ["voiding a payment (Service)", "service-fsm", "correcting-a-payment-void-never-edit"],
    ["voiding a payment (Finance)", "finance", "payments-are-corrected-by-voiding"],
    ["outreach unsubscribe and opt-outs", "discovery", "outreach-replies-and-unsubscribes"],
    ["the Discovery watchlist", "discovery", "watchlist"],
    ["performance analysis and run history", "discovery", "performance-analysis-and-run-history"],
    ["customer-facing Service pages", "service-fsm", "customer-facing-pages"],
    ["the Service reports", "service-fsm", "reports"],
        ["working a CRM sales opportunity", "crm", "working-a-sales-opportunity"],
    ["AI-drafted WhatsApp replies", "crm", "ai-drafted-whatsapp-replies"],
    ["organizations, addresses and environments", "getting-started", "organizations-addresses-and-environments"],
    ["connecting an AI agent over MCP", "getting-started", "connecting-an-ai-agent-mcp-server"],
  ];

  it.each(cases)("%s has a section", (_topic, guideSlug, sectionId) => {
    expect(getSection(guideSlug, sectionId), `${guideSlug}#${sectionId} is missing`).toBeDefined();
  });

  it("mentions all three social sign-in providers where people sign up", () => {
    const body = getSection("getting-started", "creating-an-account")?.body ?? "";
    for (const provider of ["Google", "Microsoft", "LinkedIn"]) expect(body).toContain(provider);
  });

  it("explains the opt-out in the FAQ as well as the guide", () => {
    expect(FAQ.some((entry) => /unsubscrib/i.test(entry.question))).toBe(true);
  });
});

// Help is read by customers, so it says what the product does, not what it is built with.
// The only sections allowed to name a vendor are the ones addressed to whoever deploys the
// product ("... (for whoever deploys WonderArk)"); everything else, and every FAQ answer
// outside the administrators' category, has to stay clear of them.
describe("help text stays free of internal technology", () => {
  const VENDORS = /supabase|postgres|razorpay|stripe|vercel|resend(?!\s+estimate)|next\.js|row level security|\bRLS\b/i;

  it("keeps vendor names out of the everyday guide sections", () => {
    for (const section of listSections()) {
      if (/for whoever deploys/i.test(section.heading)) continue;
      expect(`${section.heading}\n${section.body}`, `${section.guideSlug}#${section.sectionId} names a vendor`).not.toMatch(VENDORS);
    }
  });

  it("keeps vendor names out of the FAQ for everyday users", () => {
    for (const entry of FAQ) {
      if (entry.category === "For administrators") continue;
      expect(`${entry.question}\n${entry.answer}`, `FAQ "${entry.question}" names a vendor`).not.toMatch(VENDORS);
    }
  });
});

describe("FAQ", () => {
  it("points every answer at a section that actually exists", () => {
    for (const entry of FAQ) {
      const section = getSection(entry.guideSlug, entry.sectionId);
      expect(section, `FAQ "${entry.question}" links to a missing section: ${sectionHref(entry.guideSlug, entry.sectionId)}`).toBeDefined();
    }
  });

  it("asks a question and answers it in prose", () => {
    for (const entry of FAQ) {
      expect(entry.question.endsWith("?"), `"${entry.question}" should be a question`).toBe(true);
      expect(entry.answer.length).toBeGreaterThan(40);
    }
  });

  it("has no duplicate questions", () => {
    const questions = FAQ.map((entry) => entry.question.toLowerCase());
    expect(new Set(questions).size).toBe(questions.length);
  });
});

describe("searchHelp", () => {
  it("finds the section a real question is about", () => {
    const cases: Array<[string, string, string]> = [
      ["how do I reconcile my bank statement", "finance", "banking"],
      ["my balance sheet doesn't balance", "finance", "financial-reports"],
      ["how do I close an accounting period", "finance", "accounting-periods"],
      ["connect whatsapp", "crm", "connecting-a-channel-whatsapp-instagram-facebook"],
      ["what is an ideal customer profile", "discovery", "working-an-offering"],
      ["create an api key", "getting-started", "api-keys"],
      // Topics added in the 2026-10 help refresh: each one has to be findable by the
      // words a person would actually type, not only by the heading's own wording.
      ["sign in with microsoft", "getting-started", "creating-an-account"],
      ["continue with linkedin", "getting-started", "creating-an-account"],
      ["download a copy of my data", "getting-started", "your-profile-your-data-and-appearance"],
      ["executive dashboard", "getting-started", "your-dashboard"],
      ["buy ai credits", "getting-started", "plans-billing-and-ai-credits"],
      ["cancel a module", "getting-started", "licensing-a-module"],
      ["void a payment", "service-fsm", "correcting-a-payment-void-never-edit"],
      ["customer approves an estimate", "service-fsm", "customer-facing-pages"],
      ["unsubscribe link in outreach email", "discovery", "outreach-replies-and-unsubscribes"],
      ["watch an account", "discovery", "watchlist"],
      ["click to chat link", "crm", "connecting-a-channel-whatsapp-instagram-facebook"],
      ["payments are never edited", "finance", "payments-are-corrected-by-voiding"],
    ];
    for (const [query, guideSlug, sectionId] of cases) {
      const results = searchHelp(query, 5);
      expect(
        results.some((r) => r.guideSlug === guideSlug && r.sectionId === sectionId),
        `"${query}" should reach ${guideSlug}#${sectionId}, got ${results.map((r) => `${r.guideSlug}#${r.sectionId}`).join(", ")}`,
      ).toBe(true);
    }
  });

  it("ranks the section named after the topic above one that merely mentions it", () => {
    const best = searchHelp("chart of accounts")[0];
    expect(best).toBeDefined();
    expect(best?.guideSlug).toBe("finance");
    expect(best?.sectionId).toBe("first-run-set-up-your-chart-of-accounts");
  });

  // "I have nothing on that" is a better answer than a confident wrong link.
  it("returns nothing rather than the least-bad section for an unrelated question", () => {
    expect(searchHelp("xyzzy plugh quantum walrus")).toEqual([]);
    expect(searchHelp("")).toEqual([]);
    expect(searchHelp("   the and of   ")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchHelp("invoice", 3).length).toBeLessThanOrEqual(3);
  });

  it("folds the word endings that would otherwise split one topic in two", () => {
    expect(stem("invoices")).toBe("invoice");
    expect(stem("policies")).toBe("policy");
    // "accounting periods" and "accounts" should reach each other.
    expect(stem("accounting")).toBe("account");
    expect(stem("accounts")).toBe("account");
    expect(stem("reconciled")).toBe(stem("reconciling"));
    // Short words are left alone -- stemming "is" to "i" would match everything.
    expect(stem("is")).toBe("is");
  });

  it("drops filler words that say nothing about which section is wanted", () => {
    expect(tokenize("How do I do this?")).toEqual([]);
    expect(tokenize("how do I import products")).toEqual(["import", "products"]);
  });
});

describe("listSections", () => {
  it("keeps each section attached to the guide it came from", () => {
    const sections = listSections();
    expect(sections.length).toBeGreaterThan(40);
    for (const section of sections) {
      expect(getGuide(section.guideSlug)?.title).toBe(section.guideTitle);
    }
  });
});

// The guides are read by every signed-in customer, so they describe what a person does,
// not how the platform is deployed or built: operator notes live in
// docs/ops/deployment-setup.md.
describe("the guides keep platform internals out", () => {
  it("names no server secret, deploy-only setting or source path", () => {
    for (const section of listSections()) {
      expect(`${section.heading}\n${section.body}`, `${section.guideSlug}#${section.sectionId}`).not.toMatch(/SERVICE_ROLE_KEY|_SECRET\b|ENCRYPTION_SECRET|whoever deploys|apps\/web\/|packages\/[a-z-]+\/src/);
    }
  });
});
