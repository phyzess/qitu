import process from "node:process";
import { expect } from "@playwright/test";

export async function assertShellNavigationLifecycle({ context, page, webUrl }) {
  await page.goto(`${webUrl}/workspace`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
    "href",
    "#qitu-main-content",
  );
  await expect(page.locator("#qitu-main-content")).not.toBeFocused();
  await expect(page).toHaveTitle("Home · qitu");

  const currentUrl = page.url();
  const settingsLink = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Settings" });
  const popupPromise = context.waitForEvent("page");
  await settingsLink.click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup).toHaveURL(`${webUrl}/settings`);
  await popup.close();
  expect(page.url()).toBe(currentUrl);

  await page
    .getByRole("navigation", { name: "Section navigation" })
    .getByRole("link", { name: "Sources" })
    .click();
  await expect(page).toHaveURL(`${webUrl}/workspace/sources`);
  await expect(page.getByRole("heading", { level: 1, name: "Sources" })).toHaveCount(1);
  await expect(page.locator("#qitu-main-content")).toBeFocused();
  await expect(page).toHaveTitle("Sources · qitu");

  await page.goto(`${webUrl}/missing-route`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Route not found" })).toHaveCount(1);
  await expect(page).toHaveTitle("Route not found · qitu");

  await page.goto(`${webUrl}/workspace`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toHaveCount(1);
}

export async function assertWorkbenchResponsiveAndMotion({ page, webUrl }) {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`${webUrl}/workspace/sources`, { waitUntil: "domcontentloaded" });
  const grid = page.locator('.qitu-workbench-grid[data-layout="context"]').first();
  await expect(grid).toBeVisible();
  await expect
    .poll(() =>
      grid.evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
      ),
    )
    .toBe(2);
  await page.waitForTimeout(300);
  await expect
    .poll(() =>
      page
        .locator('.qitu-route-frame[data-route-key="sources"]')
        .evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("none");

  await page.setViewportSize({ width: 1170, height: 900 });
  await expect
    .poll(() =>
      grid.evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
      ),
    )
    .toBe(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const viewportWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidth.scrollWidth).toBeLessThanOrEqual(viewportWidth.clientWidth);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`${webUrl}/workspace/sources`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('.qitu-route-frame[data-route-key="sources"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(() => readReducedMotionState(page, '.qitu-route-frame[data-route-key="sources"]'), {
      timeout: 15_000,
    })
    .toEqual({ animationName: "none", reducedMotion: true });
  await page.waitForLoadState("networkidle");

  await page
    .getByRole("button", { name: /Choose language/ })
    .first()
    .click();
  const languageMenu = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(languageMenu).toBeVisible();
  expect(await readReducedMotionStateFromLocator(languageMenu)).toEqual({
    animationName: "none",
    reducedMotion: true,
  });
  await page.keyboard.press("Escape");

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${webUrl}/workspace`, { waitUntil: "domcontentloaded" });
}

export async function assertChartInteractions({ page, webUrl }) {
  await page.goto(`${webUrl}/workspace/reviews`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Confirmations" })).toHaveCount(1);
  const timeSeries = page.locator('svg.qitu-chart[aria-keyshortcuts*="ArrowRight"]').first();
  await expect(timeSeries).toBeVisible();
  await timeSeries.focus();
  await page.keyboard.press("End");
  const timeSeriesRoot = timeSeries.locator("xpath=..");
  await expect(timeSeriesRoot.locator('[role="status"]')).not.toHaveText("");
  await expect(timeSeriesRoot.locator(".qitu-chart-tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(timeSeriesRoot.locator(".qitu-chart-tooltip")).toHaveCount(0);

  const barItem = page.locator('.qitu-category-chart svg [role="listitem"]').first();
  await barItem.hover();
  await expect(page.locator(".qitu-category-chart .qitu-chart-tooltip")).toBeVisible();

  const legendItem = page.locator("button.qitu-chart-legend-item").first();
  await expect(legendItem).toBeVisible();
  await legendItem.focus();
  await expect(legendItem).toHaveAttribute("data-active", "true");
  await expect(page.locator(".qitu-category-chart .qitu-chart-tooltip")).toBeVisible();

  await page.goto(`${webUrl}/workspace`, { waitUntil: "domcontentloaded" });
}

export async function assertCalendarInteraction({ page, webUrl }) {
  await page.goto(`${webUrl}/settings/audit`, { waitUntil: "domcontentloaded" });
  const trigger = page.locator(".qitu-date-trigger").first();
  await expect(trigger).toHaveAccessibleName("From date");
  await trigger.click();

  const dropdowns = page.locator(".qitu-date-popover select");
  await expect(dropdowns).toHaveCount(2);
  const hitTargets = await dropdowns.evaluateAll((selects) =>
    selects.map((select) => {
      const rect = select.getBoundingClientRect();
      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        ?.tagName;
    }),
  );
  expect(hitTargets).toEqual(["SELECT", "SELECT"]);

  const current = await page.evaluate(() => ({
    day: String(new Date().getDate()),
    month: String(new Date().getMonth()),
    year: String(new Date().getFullYear()),
  }));
  await dropdowns.first().selectOption(current.month);
  await dropdowns.nth(1).selectOption(current.year);
  await page
    .locator("button.qitu-calendar-day:not([data-outside])")
    .filter({ hasText: new RegExp(`^${current.day}$`) })
    .first()
    .click();
  await expect(trigger).toHaveAccessibleName(/^From date: /);

  await page
    .getByRole("button", { name: /Choose language/ })
    .first()
    .click();
  await page.getByRole("menuitemradio", { name: "简体中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.goto(`${webUrl}/settings/audit`, { waitUntil: "domcontentloaded" });
  const localizedTrigger = page.locator(".qitu-date-trigger").first();
  await localizedTrigger.click();
  await expect(page.getByRole("combobox", { name: "选择月份" }).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "选择年份" }).first()).toBeVisible();
  await expect(
    page.locator("button.qitu-calendar-day:not([data-outside])").first(),
  ).toHaveAccessibleName(/[年月日星期]/);
  await page.keyboard.press("Escape");

  await page
    .getByRole("button", { name: /选择语言/ })
    .first()
    .click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.goto(`${webUrl}/workspace`, { waitUntil: "domcontentloaded" });
}

function readReducedMotionState(page, selector) {
  return page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) return null;
    return {
      animationName: getComputedStyle(element).animationName,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }, selector);
}

function readReducedMotionStateFromLocator(locator) {
  return locator.evaluate((element) => ({
    animationName: getComputedStyle(element).animationName,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));
}
