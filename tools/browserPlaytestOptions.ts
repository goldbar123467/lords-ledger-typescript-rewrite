import {dirname, resolve, relative, isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync, mkdtempSync, existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export interface BrowserPlaytestOptions {games: number; baseURL: string; turnLimit: number;
  offset: number; debug: boolean; output?: string;}
export function parseBrowserArgs(args: readonly string[]): BrowserPlaytestOptions {
  const positional = args.filter(arg => !arg.startsWith('--'));
  const flags = args.filter(arg => arg.startsWith('--'));
  if (flags.filter(flag => flag === '--debug').length > 1) throw new Error('Repeated debug option.');
  if (positional.length > 2 || flags.some(flag => !/^--(?:debug|turns=\d+|offset=\d+|output=.+)$/.test(flag))) throw new Error('Invalid browser playtest arguments.');
  const games = positional[0] === undefined ? 6 : Number(positional[0]);
  if (!Number.isSafeInteger(games) || games < 1) throw new Error('Game count must be a positive safe integer.');
  const address = positional[1];
  if (!address) throw new Error('Provide the production preview URL explicitly.');
  const url = new URL(address);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid preview URL.');
  const option = (name: string) => {
    const matches = flags.filter(flag => flag.startsWith(`--${name}=`));
    if (matches.length > 1) throw new Error(`Repeated ${name} option.`);
    return matches[0]?.slice(name.length + 3);
  };
  const turnLimit = Number(option('turns') ?? 40), offset = Number(option('offset') ?? 0);
  if (!Number.isSafeInteger(turnLimit) || turnLimit < 1 || turnLimit > 40) throw new Error('Turn limit must be from 1 to 40.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5) throw new Error('Persona offset must be from 0 to 5.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return {games, baseURL: url.href, turnLimit, offset, debug: flags.includes('--debug'), output: option('output')};
}

export function createOutputDirectory(requested?: string): string {
  const root = join(WORKSPACE, 'artifacts/v2');
  mkdirSync(root, {recursive: true});
  if (!requested) return mkdtempSync(join(root, 'browser-playtest-'));
  const target = resolve(WORKSPACE, requested), child = relative(root, target);
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Output must be inside artifacts/v2.');
  if (existsSync(target)) throw new Error('Output directory already exists; use a fresh path.');
  mkdirSync(target, {recursive: true});
  return target;
}

export async function verifyProductionPreview(baseURL: string) {
  const dist = join(WORKSPACE, 'dist');
  const walk = (directory: string): string[] => readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  const files = walk(dist);
  const manifest: Array<{path: string; sha256: string}> = [];
  for (const path of files) {
    const name = relative(dist, path).replaceAll('\\', '/'), disk = readFileSync(path);
    const response = await fetch(new URL(name, baseURL), {signal: AbortSignal.timeout(10000)});
    if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(disk)) throw new Error(`Preview build mismatch: ${name}`);
    manifest.push({path: name, sha256: createHash('sha256').update(disk).digest('hex')});
  }
  const names = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '--cached', '--others', '--exclude-standard'], {cwd: WORKSPACE, encoding: 'utf8'}).trim().split(/\r?\n/);
  const source = [...new Set(names)].sort().filter(name => existsSync(join(WORKSPACE, name)))
    .map(name => name + '\t' + createHash('sha256').update(readFileSync(join(WORKSPACE, name))).digest('hex').toUpperCase()).join('\n');
  return {manifest, sourceFingerprint: createHash('sha256').update(source).digest('hex').toUpperCase()};
}
