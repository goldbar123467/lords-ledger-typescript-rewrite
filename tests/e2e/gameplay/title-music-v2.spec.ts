import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

declare global {
  interface Window { ledgerMedia: HTMLAudioElement[] }
}
for (const width of [390, 1366]) {
  for (const difficulty of [
    { name: 'Easy', key: 'easy', denarii: 700, food: 480, population: 22, garrison: 5 },
    { name: 'Normal', key: 'normal', denarii: 500, food: 365, population: 20, garrison: 5 },
    { name: 'Hard', key: 'hard', denarii: 400, food: 255, population: 18, garrison: 3 },
  ]) {
    test(`Title starts ${difficulty.name} with authored resources at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 768 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/');
      await expect(page.getByRole('heading', { name: "The Lord's Ledger", exact: true })).toBeVisible();
      await page.getByText('How to Play', { exact: true }).click();
      await expect(page.getByText(/Survive 40 turns/)).toBeVisible();
      await page.screenshot({ path: info.outputPath('title-help.png'), animations: 'disabled' });
      await page.getByRole('button', { name: new RegExp(difficulty.name) }).click();
      await page.getByRole('button', { name: /I Understand/ }).click();
      await expect(page.getByRole('button', { name: 'Save game', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Save game', exact: true }).click();
      const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
      if (!raw) throw new Error('Missing new-game save');
      const parsed = readV2Save(raw);
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.state).toMatchObject({ difficulty: difficulty.key, denarii: difficulty.denarii,
        food: difficulty.food, population: difficulty.population, garrison: difficulty.garrison, turn: 1, season: 'spring' as const });
      expect(errors).toEqual([]);
    });
  }
  test(`Music uses real playback, mute persistence and native track ends at ${width}px`, async ({ page }, info) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width, height: 768 });
    const state = { ...createInitialState(104), phase: 'management' as const };
    const v2 = writeV2Save(state);
    const legacy = JSON.stringify(state);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ v2, legacy }) => {
      if (localStorage.getItem('lords-ledger-music-muted') === null) localStorage.setItem('lords-ledger-music-muted', 'true');
      if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', v2);
      if (!localStorage.getItem('lords-ledger-save')) localStorage.setItem('lords-ledger-save', legacy);
      window.ledgerMedia = [];
      // Observe real native Audio instances; play, pause, decoding and ended events stay native.
      window.Audio = new Proxy(window.Audio, {
        construct(target, args, newTarget) {
          const audio = Reflect.construct(target, args, newTarget);
          if (!(audio instanceof HTMLAudioElement)) throw new Error('Audio constructor returned a non-media object');
          window.ledgerMedia.push(audio);
          return audio;
        },
      });
    }, { v2, legacy });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Unmute music', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.ledgerMedia.at(-1)?.paused)).toBe(true);
    await page.getByRole('button', { name: 'Unmute music', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mute music', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const audio = window.ledgerMedia.at(-1);
      return !!audio && !audio.paused && audio.currentTime > 0 && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
    })).toBe(true);
    for (const next of ['medieval-waltz.mp3', 'medieval-happy.mp3', 'medieval-background.mp3']) {
      await expect.poll(() => page.evaluate(() => {
        const audio = window.ledgerMedia.at(-1);
        return !!audio && Number.isFinite(audio.duration) && audio.duration > 1 && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
      })).toBe(true);
      await page.evaluate(() => {
        const audio = window.ledgerMedia.at(-1);
        if (!audio) throw new Error('Missing real audio');
        // Seek near the real track end. Do not dispatch a synthetic ended event or fake timers.
        audio.currentTime = audio.duration - .15;
      });
      await expect.poll(() => page.evaluate(() => window.ledgerMedia.at(-1)?.src)).toContain(next);
      await expect.poll(() => page.evaluate(() => {
        const audio = window.ledgerMedia.at(-1);
        return !!audio && !audio.paused && audio.currentTime > 0;
      })).toBe(true);
    }
    await page.getByRole('button', { name: 'Mute music', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.ledgerMedia.at(-1)?.paused)).toBe(true);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('lords-ledger-music-muted'))).toBe('true');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Unmute music', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.ledgerMedia.at(-1)?.paused)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(v2);
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-save'))).toBe(legacy);
    await page.screenshot({ path: info.outputPath('muted-title.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}
