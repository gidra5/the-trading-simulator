import { expect, test } from "@playwright/test";

test("renders the market chart", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Market Sim")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByText("Controls")).toBeVisible();
});
