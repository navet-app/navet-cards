import { mkdir, readFile, writeFile, copyFile, cp, readdir, utimes, rm } from 'node:fs/promises';
import { copyArtifact, validateArtifactManifest } from './artifact-manifest.mjs';
import { createHash } from 'node:crypto';
import { posix, resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const { version: packageVersion } = JSON.parse(await readFile('package.json', 'utf8'));
const version = process.env.NAVET_CARDS_BUILD_VERSION || packageVersion;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:beta|rc|dev)\.[1-9]\d*)?$/.test(version)) throw new Error('Invalid build version');
const modular = process.argv.includes('--modular');
const profileSuffix = modular ? '-modular' : '';
const artifactRoot = modular ? 'dist/modular' : 'dist';
const artifactManifest = JSON.parse(await readFile(modular ? 'dist/modular/artifact-manifest.json' : 'dist/navet-cards.manifest.json', 'utf8'));
await validateArtifactManifest(artifactRoot, artifactManifest, { version, strict: modular });
const manifest = JSON.parse(await readFile('hacs.json', 'utf8'));
const resource = await readFile(`${artifactRoot}/navet-cards.js`);
if (!resource.toString().startsWith(`/* Navet Cards ${version} |`)) throw new Error('Build the matching resource first');
if (manifest.filename !== 'navet-cards.js') throw new Error('HACS filename must match the resource');
const output = `dist/verification-${version}${profileSuffix}`;
await rm(output, { recursive: true, force: true });
await rm(`dist/navet-cards-${version}${profileSuffix}.zip`, { force: true });
await mkdir(output, { recursive: true });
await mkdir(`${output}/docs/plans`, { recursive: true });
await copyArtifact(artifactRoot, output, artifactManifest);
for (const [source, target] of [
  ['README.md', 'README.md'], ['LICENSE', 'LICENSE'], ['hacs.json', 'hacs.json'],
  ...['CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md'].map(name => [name, name]),
  ...['human-verification', 'verification-status', 'release-checklist', 'implementation', 'room-setup', 'release-workflow'].map((name) => [`docs/${name}.md`, `docs/${name}.md`]),
]) await copyFile(source, `${output}/${target}`);
// Keep the implementation plan's evidence and progress links usable in dirty local candidates.
await cp('docs/plans', `${output}/docs/plans`, { recursive: true });
await cp('docs/audits', `${output}/docs/audits`, { recursive: true });
await mkdir(`${output}/scripts`, { recursive: true });
await mkdir(`${output}/.changes`, { recursive: true });
for (const name of ['bundle-budgets.json', 'ha-frontend-check.mjs', 'ha-coexistence-check.mjs',
  'ha-calendar-interaction-check.mjs', 'ha-recipes-check.mjs', 'ha-templates-check.mjs'])
  await copyFile(`scripts/${name}`, `${output}/scripts/${name}`);
await copyFile('.changes/bundle-analysis.json', `${output}/.changes/bundle-analysis.json`);
await copyFile(process.env.NAVET_CARDS_BUILD_VERSION ? 'dist/release-notes.md' : 'docs/release-notes.md', `${output}/docs/release-notes.md`);
await cp('docs/images', `${output}/docs/images`, { recursive: true });
const hash = createHash('sha256').update(resource).digest('hex');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
// Keep local installation links usable; source-only references resolve to tagged code.
async function fixDocumentLinks(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) { await fixDocumentLinks(`${directory}/${entry.name}`, name); continue; }
    if (!name.endsWith('.md')) continue;
    const content = await readFile(`${output}/${name}`, 'utf8');
    const replacements = new Map();
    for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
      const link = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(link)) continue;
      const [path, anchor] = link.split('#');
      const target = posix.normalize(posix.join(posix.dirname(name), path));
      if (target.startsWith('../')) throw new Error(`Documentation link escapes package: ${link}`);
      try { await access(resolve(output, target)); }
      catch { replacements.set(link, `https://github.com/navet-app/navet-cards/blob/${commit}/${target.split('/').map(encodeURIComponent).join('/')}${anchor ? '#' + anchor : ''}`); }
    }
    const updated = content.replace(/\]\(([^\s)]+)\)/g, (match, link) => replacements.has(link) ? `](${replacements.get(link)})` : match);
    if (updated !== content) await writeFile(`${output}/${name}`, updated);
  }
}
await fixDocumentLinks(output);

const artifactManifestHash = createHash('sha256').update(await readFile(`${output}/artifact-manifest.json`)).digest('hex');
await writeFile(`${output}/SHA256SUMS`, artifactManifest.files.map(file => `${file.sha256}  ${file.path}\n`).join('') + `${artifactManifestHash}  artifact-manifest.json\n`);
await writeFile(`${output}/build.json`, JSON.stringify({ version, commit, dirty, bytes: resource.length, sha256: hash, profile: artifactManifest.profile, artifactManifest: 'artifact-manifest.json', runtimeFiles: artifactManifest.files.length }, null, 2) + '\n');
console.log(`Verification bundle: ${output}/`);
console.log(`SHA-256: ${hash}`);
// Fixed timestamps, sorted entries and stripped metadata make retries reproducible.
const entries = [];
async function collect(directory, relative = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await collect(`${directory}/${entry.name}`, name);
    else { await utimes(`${directory}/${entry.name}`, new Date('1980-01-01T00:00:00Z'), new Date('1980-01-01T00:00:00Z')); entries.push(name); }
  }
}
await collect(output);
execFileSync('zip', ['-Xq', `../navet-cards-${version}${profileSuffix}.zip`, ...entries], { cwd: output, env: { ...process.env, TZ: 'UTC' } });
console.log(`Archive: dist/navet-cards-${version}${profileSuffix}.zip`);
