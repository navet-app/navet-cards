import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createArtifactManifest, copyArtifact, validateArtifactManifest, safeAssetPath } from '../scripts/artifact-manifest.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'navet-artifacts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src/editor.mjs'), 'export const name = "editor-ready";');
  const outdir = join(root, 'build');
  const result = await build({ stdin: { contents: 'export async function edit() { return (await import("./editor.mjs")).name; }', resolveDir: join(root, 'src'), sourcefile: 'entry.mjs' }, outdir, entryNames: 'navet-cards', chunkNames: 'chunks/[name]-[hash]', bundle: true, splitting: true, format: 'esm', write: false, metafile: true, banner: { js: '/* Navet Cards 0.1.0-beta.3 | test */' } });
  for (const file of result.outputFiles) {
    await mkdir(join(file.path, '..'), { recursive: true });
    await writeFile(file.path, file.contents);
  }
  const manifest = createArtifactManifest({ version: '0.1.0-beta.3', profile: 'modular', root: outdir, entry: 'navet-cards.js', metafile: result.metafile, outputFiles: result.outputFiles });
  await writeFile(join(outdir, 'artifact-manifest.json'), JSON.stringify(manifest));
  return { root, outdir, manifest };
}

test('manifest describes complete hashed ESM closure that survives nested installation prefixes', async t => {
  const { root, outdir, manifest } = await fixture(t);
  assert.equal(manifest.files.length, 2);
  assert.match(manifest.files.find(file => file.path !== manifest.entry).path, /^chunks\/editor-[A-Z0-9]+\.js$/);
  await validateArtifactManifest(outdir, manifest, { strict: true, version: '0.1.0-beta.3' });
  // package.json allows native Node import of emitted .js ESM for this extraction fixture.
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  for (const prefix of ['local/navet', 'hacsfiles/navet-cards', 'reverse/proxy/preview/dist']) {
    const target = join(root, prefix);
    await copyArtifact(outdir, target, manifest);
    await validateArtifactManifest(target, manifest, { strict: true });
    const module = await import(pathToFileURL(join(target, manifest.entry)));
    assert.equal(await module.edit(), 'editor-ready');
  }
});

test('integrity rejects altered, missing, extra assets and incorrect versions', async t => {
  const { outdir, manifest } = await fixture(t);
  await assert.rejects(validateArtifactManifest(outdir, manifest, { version: '0.2.0' }), /version/);
  await writeFile(join(outdir, 'unexpected.js'), 'extra');
  await assert.rejects(validateArtifactManifest(outdir, manifest, { strict: true }), /Unexpected artifact/);
  await rm(join(outdir, 'unexpected.js'));
  const asset = join(outdir, manifest.entry);
  const bytes = await readFile(asset);
  await writeFile(asset, Buffer.concat([bytes, Buffer.from(' ')]));
  await assert.rejects(validateArtifactManifest(outdir, manifest), /integrity/);
  await writeFile(asset, bytes);
  const chunk = manifest.files.find(file => file.path !== manifest.entry);
  await rm(join(outdir, chunk.path));
  await assert.rejects(validateArtifactManifest(outdir, manifest), /ENOENT/);
});

test('unsafe, duplicate and incomplete manifests fail before packaging', async t => {
  const { outdir, manifest } = await fixture(t);
  for (const path of ['../secret', '/tmp/secret', 'chunks/../secret', 'chunks\\secret', 'https://host/secret', 'chunks/%2e%2e/secret', './main.js']) assert.throws(() => safeAssetPath(path), /Unsafe/);
  await assert.rejects(validateArtifactManifest(outdir, { ...manifest, files: [...manifest.files, manifest.files[0]] }), /Duplicate/);
  const withoutChunk = { ...manifest, files: manifest.files.filter(file => file.path === manifest.entry) };
  await assert.rejects(validateArtifactManifest(outdir, withoutChunk), /Missing imported/);
  await assert.rejects(validateArtifactManifest(outdir, { ...manifest, files: [{ ...manifest.files[0], path: '../secret' }] }), /Unsafe/);
});

test('symlink assets cannot escape the artifact snapshot', async t => {
  const { root, outdir, manifest } = await fixture(t);
  const chunk = manifest.files.find(file => file.path !== manifest.entry);
  const contents = await readFile(join(outdir, chunk.path));
  await writeFile(join(root, 'outside.js'), contents);
  await rm(join(outdir, chunk.path));
  await symlink(join(root, 'outside.js'), join(outdir, chunk.path));
  await assert.rejects(validateArtifactManifest(outdir, manifest), /Symbolic artifact/);
});
