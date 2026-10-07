import {expect, test} from '@playwright/test';
import {scanForUnicodeIcons} from '../unicodeAudit.ts';

const cases = [
  {label: 'ASCII and configured prose', text: 'ASCII — … × −', expected: []},
  {label: 'BMP symbols', text: '⚔ ✦', expected: ['U+2694', 'U+2726']},
  {label: 'supplementary shield', text: '🛡', expected: ['U+1F6E1']},
  {label: 'emoji presentation selector', text: '🛡️', expected: ['U+1F6E1']},
  {label: 'supplementary presentation selector', text: '⚔\u{E0100}', expected: ['U+2694']},
  {label: 'unpaired surrogate units', text: '\uD83D A \uDEE1', expected: []},
  {label: 'joiner separates candidate code points, not glyph counts', text: '🛡\u200D⚔', expected: ['U+1F6E1', 'U+2694']},
  {label: 'same symbol and context deduplicate', text: '⚔ ⚔', expected: ['U+2694']},
] satisfies readonly {label: string; text: string; expected: readonly string[]}[];

for (const sample of cases) test(`Unicode scanner: ${sample.label}`, async ({page}, info) => {
  // Controlled real DOM fixture for the diagnostic algorithm, not a game flow.
  await page.setContent('<p id="symbols" style="font-size:32px"></p>');
  await page.locator('#symbols').evaluate((node, text) => {node.textContent = text;}, sample.text);
  const findings = await scanForUnicodeIcons(page);
  await info.attach('findings', {body: JSON.stringify(findings, null, 2), contentType: 'application/json'});
  await page.screenshot({path: info.outputPath('symbols.png')});
  expect(findings.map(finding => finding.codePoint)).toEqual(sample.expected);
  expect(findings.every(finding => finding.visible)).toBe(true);
});

test('Unicode scanner: hidden parents and SVG text stay excluded', async ({page}) => {
  await page.setContent('<p style="display:none">⚔</p><svg><text>✦</text></svg><p>⚜</p>');
  expect((await scanForUnicodeIcons(page)).map(finding => finding.codePoint)).toEqual(['U+269C']);
});
