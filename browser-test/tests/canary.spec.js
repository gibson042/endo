// @ts-check
const { test, expect } = require('@playwright/test');

test('bundled-ses lockdown runs to completion', async ({
  page,
  browser,
  browserName,
}) => {
  page.on('pageerror', error => {
    console.error(`________________
> Error in page: ${error.message}
${error.stack}`);
  });
  console.log(browserName, browser.version());
  await page.goto(`http://127.0.0.1:3000/`);
  const result = await page.evaluate(() => {
    lockdown();
    return 'Pass';
  });
  expect(result).toBe('Pass');
});
