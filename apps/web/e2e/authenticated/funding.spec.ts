import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { getTestBusinessSlug } from "../support/business";
import { openSidebar } from "../support/sidebar";

// FND-03..14 / DISC-NAV-05. Every Funding page renders for real, and the sidebar reaches them.
const PAGES = ["", "/profile", "/readiness", "/rounds", "/investors", "/outreach", "/outreach/new", "/data-room", "/due-diligence", "/analytics"];

test.describe("Discovery › Funding", () => {
  for (const path of PAGES) {
    test(`funding${path || " dashboard"} renders`, async ({ page }) => {
      const slug = await getTestBusinessSlug(page);
      await page.goto(`/${slug}/discovery/funding${path}`);
      await expectNoAppCrash(page);
      await expect(page.locator("main").first()).toBeVisible();
    });
  }

  // PLATFORM-NAV-P0-03.1: Funding is one link in the sidebar; its pages are the tabs on
  // the page it opens.
  test("the sidebar opens Funding, whose pages are tabs on the page", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/dashboard`);
    await openSidebar(page);
    await page.locator('nav[aria-label="Main"]').getByRole("link", { name: "Funding", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/discovery/funding$`));
    await expectNoAppCrash(page);
    const tabs = page.locator('nav[aria-label="Section"]');
    for (const label of ["Overview", "Profile", "Investors", "Data room"]) {
      await expect(tabs.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("a share link that does not exist reveals nothing", async ({ page }) => {
    const response = await page.goto(`/p/dr/${"x".repeat(43)}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("This link is not valid.")).toBeVisible();
  });
});
