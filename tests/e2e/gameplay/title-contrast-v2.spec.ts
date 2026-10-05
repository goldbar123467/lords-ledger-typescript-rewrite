import { expect, test } from '@playwright/test';

for (const width of [390, 1366]) {
  test(`Difficulty descriptions remain readable normally and on hover at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 768 });
    await page.goto('/');
    const descriptions = ['More resources, gentler penalties', 'The standard experience', 'Fewer resources, harsher realm'];
    for (const description of descriptions) {
      const text = page.getByText(description, { exact: true });
      await expect(text).toBeVisible();
      const button = page.getByRole('button', { name: new RegExp(description) });
      for (const hover of [false, true]) {
        if (hover) await button.hover();
        else await page.mouse.move(0, 0);
        const ratios = await text.evaluate(element => {
          const channels = (rgb: string) => {
            const values = rgb.match(/[\d.]+/g)?.map(Number);
            if (!values || values.length < 3) throw new Error('Unsupported computed color');
            return values.slice(0, 3).map(value => {
              const c = value / 255;
              return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
            });
          };
          const luminance = (rgb: string) => {
            const [r, g, b] = channels(rgb);
            if (r === undefined || g === undefined || b === undefined) throw new Error('Missing color channels');
            return .2126 * r + .7152 * g + .0722 * b;
          };
          const parent = element.closest('button');
          if (!parent) throw new Error('Description has no difficulty button');
          const colors = getComputedStyle(parent).backgroundImage.match(/rgb\([^)]+\)/g);
          if (!colors || colors.length !== 2) throw new Error('Expected two opaque gradient endpoints');
          const foreground = luminance(getComputedStyle(element).color);
          return colors.map(color => {
            const background = luminance(color);
            return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
          });
        });
        for (const ratio of ratios) expect(ratio, `${description}: hover=${hover}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    await page.mouse.move(0, 0);
    await page.screenshot({ path: info.outputPath('readable-difficulties.png'), animations: 'disabled' });
  });
}
