const { test, expect } = require('@playwright/test');

test('home page loads from the already-running server', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
