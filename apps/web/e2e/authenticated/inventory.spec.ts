import { expect, test } from "@playwright/test";
import { expectNoAppCrash } from "../support/assertions";
import { expectResponsiveTableOrCards } from "../support/responsive";
import { getTestBusinessSlug } from "../support/business";
import { openSidebar } from "../support/sidebar";

test.describe("Inventory", () => {
  test("dashboard loads", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/inventory/dashboard`);
    await expectNoAppCrash(page);
  });

  test("Products list renders responsively (table on desktop, cards on mobile)", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/inventory/products`);
    await expectNoAppCrash(page);
    await expectResponsiveTableOrCards(page);
  });

  // Team & permissions moved out of Inventory's own menu into the business-level
  // /admin/team config -- regression guard for that move (item #1/#3 of a UX pass).
  test("Administration nav no longer has a Team item", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/inventory/dashboard`);
    await openSidebar(page);
    await expect(page.locator('nav[aria-label="Main"] a[href$="/inventory/team"]')).toHaveCount(0);
  });
});

// Inventory's everyday pages (Dashboard, Products, Inventory, Sales Orders, Purchase Orders)
// carry no heading and are always on show; the rest fold under "Sales and purchasing" and
// "More" (the menus were simplified in #56). Named sections start folded, with one
// exception: the section holding the page you're on starts open, or the rail would show
// shut headings and nothing highlighted after a direct link.
test.describe("Inventory nav folds", () => {
  test("everyday pages are on show and the named sections start folded", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/inventory/dashboard`);
    await openSidebar(page);

    const nav = page.locator('nav[aria-label="Main"]');
    await expect(nav.locator('a[href$="/inventory/dashboard"]')).toBeVisible();
    await expect(nav.locator('a[href$="/inventory/products"]')).toBeVisible();
    await expect(nav.getByRole("button", { name: "Sales and purchasing", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("button", { name: "More", exact: true })).toHaveAttribute("aria-expanded", "false");
  });

  test("the section holding the current page starts open, the others folded", async ({ page }) => {
    const slug = await getTestBusinessSlug(page);
    await page.goto(`/${slug}/inventory/customers`);
    await expectNoAppCrash(page);
    await openSidebar(page);

    const nav = page.locator('nav[aria-label="Main"]');
    await expect(nav.getByRole("button", { name: "Sales and purchasing", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(nav.locator('a[href$="/inventory/customers"]')).toBeVisible();
    await expect(nav.getByRole("button", { name: "More", exact: true })).toHaveAttribute("aria-expanded", "false");
  });
});
