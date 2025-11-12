import { test, expect } from '@playwright/test'

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:4173'

// Requires a running preview/dev server that serves the display bundle at BASE_URL.
test.describe('display smoke', () => {
  test('renders root shell', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#root')).toBeVisible()
    await expect(page.locator('body')).toHaveClass(/dark|bg/)
  })
})
