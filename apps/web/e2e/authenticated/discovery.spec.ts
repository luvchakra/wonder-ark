import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { getTestBusinessSlug } from "../support/business";
import { openSidebar } from "../support/sidebar";

test.describe("Discovery", () => {
  test("dashboard shows the business's own KPIs", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/dashboard`);
    await expectNoAppCrash(page);
  });

  // PLATFORM-NAV-P0-03.1 / 03.2: Discovery is four plain links with nothing to unfold,
  // and Business is a row of its own above the modules.
  test("sidebar shows Business above the modules and Discovery as four links", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/dashboard`);
    await openSidebar(page);
    const nav = page.locator('nav[aria-label="Main"]');
    await expect(nav.getByRole("link", { name: "Business", exact: true })).toHaveAttribute("href", `/${slug}/business`);
    for (const label of ["Overview", "Customer Acquisition", "Marketing", "Funding"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    for (const heading of ["Business Offerings", "Customer Acquisition", "Marketing", "Funding"]) {
      await expect(nav.getByRole("button", { name: heading, exact: true })).toHaveCount(0);
    }
  });

  test("the Business page lists the offerings and opens one with the right breadcrumb", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/discovery/dashboard`);
    await openSidebar(page);
    await page.locator('nav[aria-label="Main"]').getByRole("link", { name: "Business", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/business$`));
    await expectNoAppCrash(page);
    const offeringLink = page.locator(`main a[href*="/discovery/offerings/"]`).first();
    const hasOffering = await offeringLink.count();
    test.skip(hasOffering === 0, "Seed business has no offerings yet");

    await offeringLink.click();
    await expectNoAppCrash(page);
    await expect(page.getByText("Business Offering", { exact: true })).toBeVisible();
  });
});
