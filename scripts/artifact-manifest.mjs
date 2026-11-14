import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep, posix } from 'node:path';

export function safeAssetPath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('%') || path.startsWith('/') || path.includes(':') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe artifact path: ${path}`);
  return path;
}
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function createArtifactManifest({ version, profile, root, entry, metafile, outputFiles }) {
  const files = outputFiles.map(output => {
    const path = safeAssetPath(relative(resolve(root), output.path).split(sep).join('/'));
    const metaPath = Object.keys(metafile.outputs).find(candidate => resolve(candidate) === output.path);
    if (!metaPath) throw new Error(`Output metadata absent: ${path}`);
    return { path, bytes: output.contents.length, sha256: digest(output.contents), imports: metafile.outputs[metaPath].imports.map(imported => {
      if (imported.external) throw new Error(`External runtime dependency: ${imported.path}`);
      const target = metafile.outputs[imported.path] ? resolve(imported.path) : resolve(dirname(output.path), imported.path);
      return { path: safeAssetPath(relative(resolve(root), target).split(sep).join('/')), kind: imported.kind };
    }) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  return { schemaVersion: 1, version, profile, entry: safeAssetPath(entry), files };
}
export async function validateArtifactManifest(root, manifest, { version = manifest.version, strict = false, manifestName = 'artifact-manifest.json' } = {}) {
  if (manifest.schemaVersion !== 1 || manifest.version !== version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:beta|rc|dev)\.[1-9]\d*)?$/.test(manifest.version) || !['standalone', 'modular'].includes(manifest.profile) || !Array.isArray(manifest.files)) throw new Error('Artifact manifest schema/version/profile mismatch');
  safeAssetPath(manifest.entry);
  const paths = new Set();
  for (const file of manifest.files) {
    safeAssetPath(file.path);
    if (paths.has(file.path)) throw new Error(`Duplicate artifact: ${file.path}`);
    paths.add(file.path);
    // Reject symlinks in every component, including parent directories.
    let location = resolve(root);
    for (const part of file.path.split('/')) {
      location = resolve(location, part);
      if ((await lstat(location)).isSymbolicLink()) throw new Error(`Symbolic artifact: ${file.path}`);
    }
    const bytes = await readFile(location);
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error(`Artifact integrity mismatch: ${file.path}`);
    if (!bytes.toString().startsWith(`/* Navet Cards ${version} |`)) throw new Error(`Artifact version mismatch: ${file.path}`);
  }
  if (!paths.has(manifest.entry)) throw new Error('Manifest entry absent');
  for (const file of manifest.files) for (const imported of file.imports ?? []) {
    safeAssetPath(imported.path);
    if (!paths.has(imported.path)) throw new Error(`Missing imported artifact: ${imported.path}`);
    // Entries/chunks must resolve relative imports, independent of installation prefix.
    const relativePath = posix.relative(posix.dirname(file.path), imported.path);
    if (!relativePath) throw new Error(`Self-imported artifact: ${file.path}`);
  }
  if (strict) {
    const actual = [];
    async function collect(directory, prefix = '') {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const path = prefix + item.name;
        if (item.isDirectory()) await collect(resolve(directory, item.name), path + '/');
        else actual.push(path);
      }
    }
    await collect(root);
    const expected = new Set([...paths, manifestName]);
    for (const path of actual) if (!expected.has(path)) throw new Error(`Unexpected artifact: ${path}`);
  }
  return manifest;
}
export async function copyArtifact(root, target, manifest, { manifestName = 'artifact-manifest.json' } = {}) {
  await validateArtifactManifest(root, manifest);
  for (const file of manifest.files) {
    await mkdir(dirname(resolve(target, file.path)), { recursive: true });
    await copyFile(resolve(root, file.path), resolve(target, file.path));
  }
  await writeFile(resolve(target, safeAssetPath(manifestName)), JSON.stringify(manifest, null, 2) + '\n');
}
