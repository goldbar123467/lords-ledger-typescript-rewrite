import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {runQaAttempt} from '../qaDiagnostics.ts';

test('QA retains transport-signature application exceptions and failed local/external resources', async ({page}, info) => {
  await page.route('**/qa-local-abort.png', route => route.abort('connectionrefused'));
  await page.route('**/qa-http-failure', route => route.fulfill({status: 404, body: 'Controlled missing app resource'}));
  await page.route('https://qa-external.invalid/font', route => route.fulfill({status: 503,
    headers: {'Access-Control-Allow-Origin': '*'}, body: 'Controlled external unavailability'}));
  await expect(runQaAttempt(page, info, 'Noob', async ({errors}) => {
    await page.goto('/');
    await page.evaluate(() => {
      console.error('Controlled app console: net::ERR_CERT_AUTHORITY_INVALID');
      setTimeout(() => {throw new Error('Controlled app exception: net::ERR_CONNECTION_REFUSED');}, 0);
      const image = new Image(); image.src = '/qa-local-abort.png'; document.body.appendChild(image);
      void fetch('/qa-http-failure'); void fetch('https://qa-external.invalid/font');
    });
    await expect.poll(() => [
      errors.some(error => error.type === 'pageerror' && error.msg.includes('Controlled app exception')),
      errors.some(error => error.type === 'console' && error.msg.includes('Controlled app console')),
      errors.some(error => error.type === 'request' && error.url?.endsWith('/qa-local-abort.png') && error.source === 'application'),
      errors.some(error => error.type === 'response' && error.status === 404 && error.source === 'application'),
      errors.some(error => error.type === 'response' && error.status === 503 && error.source === 'external'),
    ]).toEqual([true, true, true, true, true]);
  })).rejects.toThrow(/QA observed .* errors/);
  const findings: unknown = JSON.parse(readFileSync(info.outputPath('qa-findings.json'), 'utf8'));
  expect(findings).toEqual([expect.objectContaining({persona: 'Noob', status: 'failed', errors: expect.arrayContaining([
    expect.objectContaining({type: 'pageerror', msg: 'Controlled app exception: net::ERR_CONNECTION_REFUSED'}),
    expect.objectContaining({type: 'request', source: 'application', resourceType: 'image'}),
    expect.objectContaining({type: 'response', status: 503, source: 'external'}),
  ])})]);
  expect(JSON.parse(readFileSync(info.outputPath('qa-summary.json'), 'utf8'))).toMatchObject({failedAttempts: 1, totalFindings: 1});
});

test('QA emits findings and the exploratory error record after aborted startup', async ({page}, info) => {
  await page.route('**/', route => route.abort('connectionrefused'));
  await expect(runQaAttempt(page, info, 'Exploratory', async () => {
    const initial: unknown = JSON.parse(readFileSync(info.outputPath('qa-findings.json'), 'utf8'));
    expect(initial).toEqual([expect.objectContaining({status: 'running'})]);
    expect(JSON.parse(readFileSync(info.outputPath('qa-summary.json'), 'utf8'))).toMatchObject({incompleteAttempts: 1});
    await page.goto('/');
  })).rejects.toThrow(/ERR_CONNECTION_REFUSED/);
  const findings: unknown = JSON.parse(readFileSync(info.outputPath('qa-findings.json'), 'utf8'));
  expect(findings).toEqual([expect.objectContaining({status: 'failed', errors: expect.arrayContaining([
    expect.objectContaining({type: 'driver', msg: expect.stringContaining('ERR_CONNECTION_REFUSED')}),
  ])})]);
  expect(JSON.parse(readFileSync(info.outputPath('exploratory-errors.json'), 'utf8'))).toEqual(expect.arrayContaining([
    expect.objectContaining({type: 'request', resourceType: 'document', source: 'application'}),
  ]));
});

test('QA preserves the initiating exception when a closed page prevents a screenshot', async ({page}, info) => {
  const original = new Error('Controlled initiating action failure');
  await expect(runQaAttempt(page, info, 'Avg', async () => {await page.close(); throw original;})).rejects.toBe(original);
  const findings: unknown = JSON.parse(readFileSync(info.outputPath('qa-findings.json'), 'utf8'));
  expect(findings).toEqual([expect.objectContaining({status: 'failed', errors: expect.arrayContaining([
    expect.objectContaining({type: 'driver', msg: original.message}),
    expect.objectContaining({type: 'artifact', msg: expect.stringContaining('closed')}),
  ]), snapshot: expect.objectContaining({unavailable: expect.stringContaining('closed')})})]);
});

test('QA records attachment failure without replacing the original action failure', async ({page}, info) => {
  const original = new Error('Controlled original failure before attachment');
  const brokenSink = {project: info.project, outputPath: info.outputPath.bind(info),
    attach: async () => {throw new Error('Controlled attachment failure');}};
  await expect(runQaAttempt(page, brokenSink, 'Goat', async () => {await page.goto('/'); throw original;})).rejects.toBe(original);
  const findings: unknown = JSON.parse(readFileSync(info.outputPath('qa-findings.json'), 'utf8'));
  expect(findings).toEqual([expect.objectContaining({status: 'failed', errors: expect.arrayContaining([
    expect.objectContaining({type: 'driver', msg: original.message}),
    expect.objectContaining({type: 'artifact', msg: 'Controlled attachment failure'}),
  ])})]);
});

test('QA observers detach after an attempt and do not collect later fixture events', async ({page}, info) => {
  const finding = await runQaAttempt(page, info, 'Noob', async () => {await page.goto('/');});
  expect(finding.status).toBe('passed');
  await page.route('**/qa-after-abort.png', route => route.abort('connectionrefused'));
  await page.route('**/qa-after-http', route => route.fulfill({status: 503, body: 'After attempt'}));
  const later = page.waitForEvent('pageerror');
  const consoleEvent = page.waitForEvent('console', entry => entry.text() === 'Controlled console after attempt');
  const requestEvent = page.waitForEvent('requestfailed', request => request.url().endsWith('/qa-after-abort.png'));
  const responseEvent = page.waitForEvent('response', response => response.url().endsWith('/qa-after-http'));
  await page.evaluate(() => {
    setTimeout(() => {throw new Error('Controlled event after attempt');}, 0);
    console.error('Controlled console after attempt');
    const image = new Image(); image.src = '/qa-after-abort.png'; document.body.appendChild(image);
    void fetch('/qa-after-http');
  });
  expect((await later).message).toBe('Controlled event after attempt');
  await Promise.all([consoleEvent, requestEvent, responseEvent]);
  expect(finding.errors).toEqual([]);
});

test('QA rejects an unexpected aborted media request outside intentional reload', async ({page}, info) => {
  await page.route('**/qa-unexpected-media.mp3', route => route.abort('aborted'));
  await expect(runQaAttempt(page, info, 'Noob', async ({errors}) => {
    await page.goto('/');
    await page.evaluate(() => {const audio = new Audio('/qa-unexpected-media.mp3'); document.body.appendChild(audio); audio.load();});
    await expect.poll(() => errors.some(error => error.type === 'request' && error.resourceType === 'media'
      && error.msg === 'net::ERR_ABORTED')).toBe(true);
  })).rejects.toThrow(/QA observed .* errors/);
  const finding: unknown = JSON.parse(readFileSync(info.outputPath('qa-findings.json'), 'utf8'));
  expect(finding).toEqual([expect.objectContaining({status: 'failed', expectedCancellations: [], errors: expect.arrayContaining([
    expect.objectContaining({type: 'request', resourceType: 'media', msg: 'net::ERR_ABORTED'}),
  ])})]);
});
