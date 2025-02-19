import cps from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { env, c, warnMark } from './env.ts';
import { allSources as allCssSources } from './sass.ts';
import { jsLogger } from './console.ts';
import { shallowSort, isEquivalent } from './algo.ts';

type SplitAsset = { hash?: string; path?: string; imports?: string[]; inline?: string; mtime?: number };
export type Manifest = { [key: string]: SplitAsset };

let writeTimer: NodeJS.Timeout;

export function stopManifest(): void {
  clearTimeout(writeTimer);
}

export function updateManifest(update: Partial<typeof env.manifest> = {}): void {
  if (update?.dirty) env.manifest.dirty = true;
  for (const key of Object.keys(update ?? {}) as (keyof typeof env.manifest)[]) {
    if (key === 'dirty' || isEquivalent(env.manifest[key], update?.[key])) continue;
    env.manifest[key] = shallowSort({ ...env.manifest[key], ...update?.[key] });
    env.manifest.dirty = true;
  }
  if (!env.manifest.dirty) return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeManifest, 500);
}

async function writeManifest() {
  if (!env.manifestOk || !(await isComplete())) return;

  const commitMessage = cps
    .execSync('git log -1 --pretty=%s', { encoding: 'utf-8' })
    .trim()
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');

  const clientJs: string[] = [
    'if (!window.site) window.site={};',
    'if (!window.site.info) window.site.info={};',
    `window.site.info.commit='${cps.execSync('git rev-parse -q HEAD', { encoding: 'utf-8' }).trim()}';`,
    `window.site.info.message='${commitMessage}';`,
    `window.site.debug=${env.debug};`,
  ];
  if (env.remoteLog) clientJs.push(jsLogger());

  const pairLine = ([name, info]: [string, SplitAsset]) => `'${name.replaceAll("'", "\\'")}':'${info.hash}'`;
  const jsLines = Object.entries(env.manifest.js)
    .filter(([name, _]) => !/common\.[A-Z0-9]{8}/.test(name))
    .map(pairLine)
    .join(',');
  const cssLines = Object.entries(env.manifest.css).map(pairLine).join(',');
  const hashedLines = Object.entries(env.manifest.hashed).map(pairLine).join(',');

  clientJs.push(`window.site.manifest={\ncss:{${cssLines}},\njs:{${jsLines}},\nhashed:{${hashedLines}}\n};`);

  const hashable = clientJs.join('\n');
  const hash = crypto.createHash('sha256').update(hashable).digest('hex').slice(0, 8);
  // add the date after hashing
  const clientManifest =
    hashable +
    `\nwindow.site.info.date='${
      new Date(new Date().toUTCString()).toISOString().split('.')[0] + '+00:00'
    }';\n`;
  const serverManifest = {
    js: { manifest: { hash }, ...env.manifest.js, ...env.manifest.i18n },
    css: { ...env.manifest.css },
    hashed: { ...env.manifest.hashed },
  };

  await Promise.all([
    fs.promises.writeFile(path.join(env.jsOutDir, `manifest.${hash}.js`), clientManifest),
    fs.promises.writeFile(
      path.join(env.jsOutDir, `manifest.${env.prod ? 'prod' : 'dev'}.json`),
      JSON.stringify(serverManifest, null, env.prod ? undefined : 2),
    ),
  ]);
  env.manifest.dirty = false;
  env.log(
    `Manifest '${c.cyan(`public/compiled/manifest.${env.prod ? 'prod' : 'dev'}.json`)}' -> '${c.cyan(
      `public/compiled/manifest.${hash}.js`,
    )}'`,
  );
}

async function isComplete() {
  for (const bundle of [...env.packages.values()].map(x => x.bundle ?? []).flat()) {
    if (!bundle.module) continue;
    const name = path.basename(bundle.module, '.ts');
    if (!env.manifest.js[name]) {
      env.log(`${warnMark} - No manifest without building '${c.cyan(name + '.ts')}'`);
      return false;
    }
  }
  for (const css of await allCssSources()) {
    const name = path.basename(css, '.scss');
    if (!env.manifest.css[name]) {
      env.log(`${warnMark} - No manifest without building '${c.cyan(name + '.scss')}'`);
      return false;
    }
  }
  return Object.keys(env.manifest.i18n).length > 0;
}
