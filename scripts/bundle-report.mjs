import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { posix } from 'node:path';

export function dependencyClosure(outputs, entry, includeDynamic = false) {
  const seen = new Set();
  function visit(file) {
    if (seen.has(file)) return;
    const output = outputs[file];
    if (!output) throw new Error(`Missing output dependency: ${file}`);
    seen.add(file);
    for (const imported of output.imports ?? []) {
      if (imported.external || (!includeDynamic && imported.kind === 'dynamic-import')) continue;
      const target = outputs[imported.path] ? imported.path : posix.normalize(posix.join(posix.dirname(file), imported.path));
      visit(target);
    }
  }
  visit(entry);
  return [...seen].sort();
}

export function measureOutputs(metafile, outputFiles, gzipOptions = { level: 6 }) {
  const contents = new Map(outputFiles.map(file => [file.path.replaceAll('\\', '/'), file.contents]));
  const files = Object.fromEntries(Object.entries(metafile.outputs).map(([path, output]) => {
    const bytes = contents.get(path) ?? [...contents].find(([full]) => full.endsWith(`/${path}`))?.[1];
    if (!bytes) throw new Error(`Output bytes unavailable: ${path}`);
    return [path, {
      raw: bytes.length,
      gzip: gzipSync(bytes, gzipOptions).length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      contributions: Object.entries(output.inputs).map(([source, input]) => ({ source, bytes: input.bytesInOutput })).sort((a, b) => b.bytes - a.bytes),
    }];
  }));
  return files;
}

export function sumFiles(files, paths) {
  return paths.reduce((sum, path) => ({ raw: sum.raw + files[path].raw, gzip: sum.gzip + files[path].gzip, requests: sum.requests + 1 }), { raw: 0, gzip: 0, requests: 0 });
}

export function reportSize(name, measured, baseline) {
  const measurement = { actual: measured,
    ...(baseline ? { delta: { raw: measured.raw - baseline.raw, gzip: measured.gzip - baseline.gzip } } : {}),
  };
  for (const metric of ['raw', 'gzip']) {
    const delta = baseline ? `; delta ${measurement.delta[metric] >= 0 ? '+' : ''}${measurement.delta[metric]}` : '';
    console.log(`${name} ${metric}: ${measured[metric]} bytes${delta}`);
  }
  return measurement;
}
