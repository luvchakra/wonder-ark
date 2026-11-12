import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { getTestBusinessSlug } from "../support/business";
import { openSidebar } from "../support/sidebar";

// MKT-03..14 / DISC-NAV-04. Every Marketing page renders for real (the Server/Client
// boundary crash class only shows up in a browser), and the sidebar reaches them.
const PAGES = ["", "/strategy", "/campaigns", "/campaigns/new", "/content", "/content?view=calendar", "/content/new", "/assets", "/website-seo", "/analytics"];

test.describe("Discovery › Marketing", () => {
  for (const path of PAGES) {
    test(`marketing${path || " dashboard"} renders`, async ({ page }) => {
      const slug = await getTestBusinessSlug(page);
      await page.goto(`/${slug}/discovery/marketing${path}`);
      await expectNoAppCrash(page);
      await expect(page.locator("h1").first()).toBeVisible();
    });
  }

  // PLATFORM-NAV-P0-03.1: Marketing is one link in the sidebar; its pages are the tabs on
  // the page it opens.
  test("the sidebar opens Marketing, whose pages are tabs on the page", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/dashboard`);
    await openSidebar(page);
    await page.locator('nav[aria-label="Main"]').getByRole("link", { name: "Marketing", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/discovery/marketing$`));
    await expectNoAppCrash(page);
    const tabs = page.locator('nav[aria-label="Section"]');
    for (const label of ["Strategy", "Campaigns", "Content", "Assets", "Website & SEO"]) {
      await expect(tabs.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("a campaign cannot be saved without a name", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/marketing/campaigns/new`);
    await expectNoAppCrash(page);
    const save = page.getByRole("button", { name: "Save as draft" });
    test.skip((await save.count()) === 0, "Test account cannot manage marketing");
    await save.click();
    // The browser's own required-field check stops the submit; the page does not move.
    await expect(page).toHaveURL(/campaigns\/new/);
  });
});
