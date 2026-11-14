import { copyArtifact } from './artifact-manifest.mjs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

// Package only public fixtures and the built resource, never host sessions or credentials.
const modular = process.argv.includes('--modular');
const output = modular ? 'dist/preview-modular' : 'dist/preview';
const source = modular ? 'dist/modular' : 'dist';
const manifest = JSON.parse(await readFile(modular ? 'dist/modular/artifact-manifest.json' : 'dist/navet-cards.manifest.json', 'utf8'));
await rm(output, { recursive: true, force: true });
await mkdir(`${output}/dist`, { recursive: true });
await cp('demo', `${output}/demo`, { recursive: true });
await copyArtifact(source, `${output}/dist`, manifest);
const { version } = manifest;
await writeFile(`${output}/index.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Navet Cards PR preview</title>
<style>body{margin:0;background:#16191f;color:#eef0f4;font:16px system-ui,sans-serif}main{max-width:640px;margin:10vh auto;padding:24px}a{color:#f4b58c}li{margin:16px 0}p{line-height:1.6;color:#a4abb8}</style></head>
<body><main><h1>Navet Cards preview</h1><p>Version ${version}. These cards use simulated devices and do not control a home.</p><ul><li><a href="./demo/">Card catalog — all families, sizes, themes and unavailable states</a></li><li><a href="./demo/composition.html">Room composition and controls</a></li></ul><p>Review desktop and phone layouts, keyboard controls, long names, and action failures before merging.</p></main></body></html>\n`);
await writeFile(`${output}/_headers`, '/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n');
console.log(`Static PR preview: ${output}/`);
