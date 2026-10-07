import type {Page, TestInfo, ConsoleMessage, Request, Response} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import type {TurnExitReason} from './helpers.ts';

export type QaProfile = 'Noob' | 'Avg' | 'Goat' | 'Exploratory';
export type QaErrorType = 'pageerror' | 'console' | 'request' | 'response' | 'driver' | 'artifact';
export interface QaError {
  type: QaErrorType; msg: string; source: 'application' | 'external' | 'unknown';
  url?: string; resourceType?: string; status?: number;
}
export interface QaSnapshot {innerText: string | null; buttonLabels: string[]; unavailable?: string;}
export interface QaBug extends QaSnapshot {
  persona: QaProfile; turn: number; note: string; reason: TurnExitReason | 'unknown'; iteration: number | null;
}
export interface QaFinding {
  ts: string; persona: QaProfile; status: 'running' | 'passed' | 'failed';
  errors: QaError[]; bugs: QaBug[]; snapshot?: QaSnapshot; expectedCancellations: QaCancellation[];
}
export interface QaCancellation extends QaError {type: 'request'; operation: 'reload'; operationId: number;}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Origin attribution is metadata, never a reason to discard a failure. */
export function classifyQaSource(url: string, applicationURL: string) {
  try {
    const location = new URL(url), application = new URL(applicationURL);
    if (!['http:', 'https:'].includes(location.protocol) || !['http:', 'https:'].includes(application.protocol)) return 'unknown';
    return location.origin === application.origin ? 'application' : 'external';
  } catch {return 'unknown';}
}

export function observeQaErrors(page: Page, errors: QaError[], baseURL?: string, expectedCancellations: QaCancellation[] = []) {
  const pending = new Set<Request>();
  let reloadRequests: Set<Request> | null = null, operationId = 0;
  const requestStarted = (request: Request) => {pending.add(request);};
  const requestFinished = (request: Request) => {pending.delete(request);};
  const source = (url: string) => classifyQaSource(url, baseURL ?? page.url());
  const pageError = (error: Error) => errors.push({type: 'pageerror', msg: error.message, source: 'unknown'});
  const consoleError = (entry: ConsoleMessage) => {
    if (entry.type() !== 'error') return;
    const url = entry.location().url;
    errors.push({type: 'console', msg: entry.text(), url, source: source(url)});
  };
  const requestError = (request: Request) => {
    const url = request.url();
    pending.delete(request);
    const observation: QaError = {type: 'request', msg: request.failure()?.errorText ?? 'Unknown browser request failure',
      url, resourceType: request.resourceType(), source: source(url)};
    if (observation.msg === 'net::ERR_ABORTED' && reloadRequests?.has(request)) {
      expectedCancellations.push({...observation, type: 'request', operation: 'reload', operationId});
    } else errors.push(observation);
  };
  const responseError = (response: Response) => {
    if (response.status() < 400) return;
    const url = response.url();
    errors.push({type: 'response', msg: `HTTP ${response.status()} ${response.statusText()}`,
      url, status: response.status(), resourceType: response.request().resourceType(), source: source(url)});
  };
  page.on('pageerror', pageError); page.on('console', consoleError);
  page.on('requestfailed', requestError); page.on('response', responseError);
  page.on('request', requestStarted); page.on('requestfinished', requestFinished);
  const stop = () => {
    page.off('pageerror', pageError); page.off('console', consoleError);
    page.off('requestfailed', requestError); page.off('response', responseError);
    page.off('request', requestStarted); page.off('requestfinished', requestFinished);
    pending.clear(); reloadRequests = null;
  };
  const reload = async () => {
    if (reloadRequests) throw new Error('Overlapping QA reload operations are unsupported.');
    // Only already-pending same-origin media in the old main document can be expected cancellations.
    reloadRequests = new Set([...pending].filter(request => request.resourceType() === 'media'
      && source(request.url()) === 'application' && request.frame() === page.mainFrame()));
    operationId++;
    try {await page.reload();} finally {reloadRequests = null;}
  };
  return {stop, reload};
}

export async function captureQaSnapshot(page: Page): Promise<QaSnapshot> {
  try {
    return await page.evaluate(() => ({innerText: document.body.innerText.slice(0, 400),
      buttonLabels: [...document.querySelectorAll('button')].filter(button => button.offsetParent !== null).slice(0, 20)
        .map(button => (button.getAttribute('aria-label') || button.innerText || '').trim().slice(0, 60)).filter(Boolean)}));
  } catch (error) {return {innerText: null, buttonLabels: [], unavailable: message(error)};}
}

export function summarizeQaFindings(findings: readonly QaFinding[], runStart: number, now = Date.now()) {
  const byPersona: Partial<Record<QaProfile, number>> = {};
  const bySeverity: Record<QaErrorType, number> = {pageerror: 0, console: 0, request: 0, response: 0, driver: 0, artifact: 0};
  let totalBugs = 0;
  for (const finding of findings) {
    byPersona[finding.persona] = (byPersona[finding.persona] ?? 0) + 1;
    for (const error of finding.errors) bySeverity[error.type]++;
    totalBugs += finding.bugs.length;
  }
  return {timestamp: new Date(now).toISOString(), durationMs: now - runStart, totalFindings: findings.length,
    totalBugs, byPersona, bySeverity, failedAttempts: findings.filter(finding => finding.status === 'failed').length,
    incompleteAttempts: findings.filter(finding => finding.status === 'running').length,
    expectedCancellations: findings.reduce((total, finding) => total + finding.expectedCancellations.length, 0),
    countMeaning: 'Error observations by category, not distinct defects; bySeverity retains its historical field name.'};
}

/** Always persist available evidence before browser cleanup and preserve the initiating exception. */
export async function runQaAttempt(page: Page, info: Pick<TestInfo, 'project' | 'outputPath' | 'attach'>, persona: QaProfile,
  body: (finding: QaFinding, controls: {reload: () => Promise<void>}) => Promise<void>, screenshotName = `qa-${persona.toLowerCase()}.png`) {
  const started = Date.now();
  const finding: QaFinding = {ts: new Date(started).toISOString(), persona, status: 'running', errors: [], bugs: [], expectedCancellations: []};
  const observer = observeQaErrors(page, finding.errors, info.project.use.baseURL, finding.expectedCancellations);
  let failure: {error: unknown} | null = null;
  const artifactError = (error: unknown) => {
    finding.errors.push({type: 'artifact', msg: message(error), source: 'unknown'});
    failure ??= {error}; finding.status = 'failed';
  };
  const persist = () => {
    writeFileSync(info.outputPath('qa-findings.json'), JSON.stringify([finding], null, 2));
    writeFileSync(info.outputPath('qa-summary.json'), JSON.stringify(summarizeQaFindings([finding], started), null, 2));
    if (persona === 'Exploratory') writeFileSync(info.outputPath('exploratory-errors.json'), JSON.stringify(finding.errors, null, 2));
  };
  const safelyPersist = () => {
    try {persist(); return null;}
    catch (error) {artifactError(error); return {error};}
  };
  // Leave an explicitly incomplete record even if the worker is terminated during the body.
  const initialFailure = safelyPersist();
  try {
    if (initialFailure) throw initialFailure.error;
    await body(finding, {reload: observer.reload});
    if (finding.errors.length || finding.bugs.length) throw new Error(`QA observed ${finding.errors.length} errors and ${finding.bugs.length} progression bugs.`);
    finding.status = 'passed';
  } catch (error) {
    failure = {error}; finding.status = 'failed';
    finding.errors.push({type: 'driver', msg: message(error), source: 'unknown'});
  } finally {
    // A closed page, screenshot timeout or interrupted browser action must not erase the JSON.
    safelyPersist();
    finding.snapshot = await captureQaSnapshot(page);
    try {await page.screenshot({path: info.outputPath(screenshotName), fullPage: true});}
    catch (error) {artifactError(error);}
    observer.stop();
    if (finding.errors.length || finding.bugs.length) {
      finding.status = 'failed'; failure ??= {error: new Error('QA attempt collected failures during finalization.')};
    }
    safelyPersist();
    for (const [name, file] of [['qa-findings', 'qa-findings.json'], ['qa-summary', 'qa-summary.json'],
      ...(persona === 'Exploratory' ? [['exploratory-errors', 'exploratory-errors.json']] : [])]) {
      if (!name || !file) throw new Error('Missing QA attachment identity.');
      try {await info.attach(name, {path: info.outputPath(file), contentType: 'application/json'});}
      catch (error) {artifactError(error);}
    }
    safelyPersist();
  }
  if (failure) throw failure.error;
  return finding;
}
