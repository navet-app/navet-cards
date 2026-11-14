import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createArtifactManifest } from './artifact-manifest.mjs';
import { reportSize, dependencyClosure, measureOutputs, sumFiles } from './bundle-report.mjs';

const { version: packageVersion } = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const policy = JSON.parse(await readFile(new URL('./bundle-budgets.json', import.meta.url)));
const version = process.env.NAVET_CARDS_BUILD_VERSION || packageVersion;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:beta|rc|dev)\.[1-9]\d*)?$/.test(version)) throw new Error('Invalid build version');
const analyze = process.argv.includes('--analyze');
const modularRequested = analyze || process.argv.includes('--modular');
const cssPlugin = { name: 'compact-card-css', setup(builder) {
  builder.onLoad({ filter: /(?:\/|-)styles\.ts$/ }, async ({ path }) => {
    const source = await readFile(path, 'utf8');
    const marker = source.indexOf('css`');
    const start = marker + 4, end = source.lastIndexOf('`');
    if (marker < 0 || end < start || source.slice(start, end).includes('${')) throw new Error(`Unsupported CSS template in ${path}`);
    const compact = await transform(source.slice(start, end), { loader: 'css', minify: true, target: ['chrome111', 'safari16'] });
    return { contents: source.slice(0, start) + compact.code.trim() + source.slice(end), loader: 'ts' };
  });
} };
// Standalone retains synchronous editor registration for existing host/demo callers.
const eagerEntry = { stdin: { contents: "import './src/editor'; import './src/index';", resolveDir: process.cwd(), sourcefile: 'navet-standalone.ts', loader: 'ts' } };
const common = {
  entryPoints: ['src/index.ts'], bundle: true, minify: true, format: 'esm', target: 'es2022', legalComments: 'eof',
  metafile: true, write: false,
  define: { __VERSION__: JSON.stringify(version) },
  banner: { js: `/* Navet Cards ${version} | AGPL-3.0-only | github.com/navet-app/navet-cards */` },
};
async function emit(result) {
  for (const file of result.outputFiles) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents);
  }
}
const standalone = await build({ ...common, entryPoints: undefined, ...eagerEntry, outfile: 'dist/navet-cards.js', plugins: [cssPlugin] });
await emit(standalone);
const standaloneManifest = createArtifactManifest({ version, profile: 'standalone', root: 'dist', entry: 'navet-cards.js', metafile: standalone.metafile, outputFiles: standalone.outputFiles });
await writeFile('dist/navet-cards.manifest.json', JSON.stringify(standaloneManifest, null, 2) + '\n');
const standaloneFiles = measureOutputs(standalone.metafile, standalone.outputFiles, policy.gzip);
const standaloneTotal = sumFiles(standaloneFiles, Object.keys(standaloneFiles));
const report = { schemaVersion: 2, mode: 'report-only', version, gzip: policy.gzip, policy, standalone: { files: standaloneFiles, total: standaloneTotal } };
await writeFile('dist/bundle-report.json', JSON.stringify(report, null, 2) + '\n');
const measurements = [['standalone', standaloneTotal, policy.baseline.standalone]];
console.log('Largest standalone contributions:', Object.values(standaloneFiles)[0].contributions.slice(0, 8));
if (modularRequested) {
  await rm('dist/modular', { recursive: true, force: true });
  const modular = await build({ ...common, outdir: 'dist/modular', entryNames: 'navet-cards', chunkNames: 'chunks/[name]-[hash]', splitting: true, plugins: [cssPlugin] });
  await emit(modular);
  const modularManifest = createArtifactManifest({ version, profile: 'modular', root: 'dist/modular', entry: 'navet-cards.js', metafile: modular.metafile, outputFiles: modular.outputFiles });
  await writeFile('dist/modular/artifact-manifest.json', JSON.stringify(modularManifest, null, 2) + '\n');
  const files = measureOutputs(modular.metafile, modular.outputFiles, policy.gzip);
  const entry = Object.keys(modular.metafile.outputs).find(path => modular.metafile.outputs[path].entryPoint === 'src/index.ts');
  if (!entry) throw new Error('Modular entry missing');
  const initialPaths = dependencyClosure(modular.metafile.outputs, entry);
  const editorEntry = Object.keys(modular.metafile.outputs).find(path => modular.metafile.outputs[path].entryPoint === 'src/editor.ts');
  if (!editorEntry) throw new Error('Modular editor entry missing');
  const editPaths = [...new Set([...initialPaths, ...dependencyClosure(modular.metafile.outputs, editorEntry)])].sort();
  const dataEntry = Object.keys(modular.metafile.outputs).find(path => modular.metafile.outputs[path].entryPoint === 'src/providers/card-data.ts');
  const dataPaths = dataEntry ? [...new Set([...initialPaths, ...dependencyClosure(modular.metafile.outputs, dataEntry)])].sort() : initialPaths;
  const dataIncremental = dataPaths.filter(path => !initialPaths.includes(path));
  const incrementalPaths = editPaths.filter(path => !initialPaths.includes(path));
  const contentEntry = Object.keys(modular.metafile.outputs).find(path => modular.metafile.outputs[path].entryPoint === 'src/custom-content.ts');
  if (!contentEntry) throw new Error('Modular rich-content entry missing');
  const contentPaths = [...new Set([...initialPaths, ...dependencyClosure(modular.metafile.outputs, contentEntry)])].sort();
  const contentIncremental = contentPaths.filter(path => !initialPaths.includes(path));
  const subControlsEntry = Object.keys(modular.metafile.outputs).find(path => modular.metafile.outputs[path].entryPoint === 'src/composition/sub-controls.ts');
  if (!subControlsEntry) throw new Error('Modular sub-controls entry missing');
  const subControlsPaths = [...new Set([...initialPaths, ...dependencyClosure(modular.metafile.outputs, subControlsEntry)])].sort();
  const subControlsIncremental = subControlsPaths.filter(path => !initialPaths.includes(path));
  const chipsEntry = Object.keys(modular.metafile.outputs).find(path => modular.metafile.outputs[path].entryPoint === 'src/composition/chips.ts');
  if (!chipsEntry) throw new Error('Modular chips entry missing');
  const chipsPaths = [...new Set([...initialPaths, ...dependencyClosure(modular.metafile.outputs, chipsEntry)])].sort();
  const chipsIncremental = chipsPaths.filter(path => !initialPaths.includes(path));
  const templatesEntry=Object.keys(modular.metafile.outputs).find(path=>modular.metafile.outputs[path].entryPoint==='src/providers/templates.ts');
  if(!templatesEntry)throw new Error('Modular template provider entry missing');
  const templatePaths=[...new Set([...initialPaths,...dependencyClosure(modular.metafile.outputs,templatesEntry)])].sort();
  const templateIncremental=templatePaths.filter(path=>!initialPaths.includes(path));
  const calendarEntry=Object.keys(modular.metafile.outputs).find(path=>modular.metafile.outputs[path].entryPoint==='src/composition/calendar.ts');
  if(!calendarEntry)throw new Error('Modular calendar entry missing');
  const calendarPaths=[...new Set([...initialPaths,...dependencyClosure(modular.metafile.outputs,calendarEntry)])].sort();
  const calendarIncremental=calendarPaths.filter(path=>!initialPaths.includes(path));
  const childrenEntry = Object.keys(modular.metafile.outputs).find(path => modular.metafile.outputs[path].entryPoint === 'src/composition/child-cards.ts');
  if (!childrenEntry) throw new Error('Modular child-card host entry missing');
  const childPaths = [...new Set([...initialPaths, ...dependencyClosure(modular.metafile.outputs, childrenEntry)])].sort();
  const childIncremental = childPaths.filter(path => !initialPaths.includes(path));
  const advancedEntry = Object.keys(modular.metafile.outputs).find(path => modular.metafile.outputs[path].entryPoint === 'src/controls/advanced-controls.ts');
  if (!advancedEntry) throw new Error('Modular advanced controls entry missing');
  const advancedPaths = [...new Set([...initialPaths, ...dependencyClosure(modular.metafile.outputs, advancedEntry)])].sort();
  const advancedIncremental = advancedPaths.filter(path => !initialPaths.includes(path));
  const widgets = {
    advancedControls: { paths: advancedPaths, ...sumFiles(files, advancedPaths) },
    advancedControlsIncremental: { paths: advancedIncremental, ...sumFiles(files, advancedIncremental) },
  };
  // These aliases deliberately report the full shared pack cost on the first feature use.
  for (const name of ['color', 'range', 'tilt', 'fan', 'climateOptions', 'vacuumOptions', 'mediaOptions', 'comfort', 'remote', 'mediaGroups', 'update']) {
    widgets[name] = { ...widgets.advancedControls, transportPack: 'advancedControls' };
    widgets[`${name}Incremental`] = { ...widgets.advancedControlsIncremental, transportPack: 'advancedControls' };
  }
  report.modularExperiment = {
    supportedInstallation: false,
    files,
    scenarios: {
      ...widgets,
      view: { paths: initialPaths, ...sumFiles(files, initialPaths) },
      openRoom: { paths: initialPaths, ...sumFiles(files, initialPaths) },
      firstEdit: { paths: editPaths, ...sumFiles(files, editPaths) },
      templates: {paths:templatePaths,...sumFiles(files,templatePaths)},
      templatesIncremental: {paths:templateIncremental,...sumFiles(files,templateIncremental)},
      calendar: {paths:calendarPaths,...sumFiles(files,calendarPaths)},
      calendarIncremental: {paths:calendarIncremental,...sumFiles(files,calendarIncremental)},
      childCards: { paths: childPaths, ...sumFiles(files, childPaths) },
      childCardsIncremental: { paths: childIncremental, ...sumFiles(files, childIncremental) },
      chips: { paths: chipsPaths, ...sumFiles(files, chipsPaths) },
      chipsIncremental: { paths: chipsIncremental, ...sumFiles(files, chipsIncremental) },
      subControls: { paths: subControlsPaths, ...sumFiles(files, subControlsPaths) },
      subControlsIncremental: { paths: subControlsIncremental, ...sumFiles(files, subControlsIncremental) },
      richContent: { paths: contentPaths, ...sumFiles(files, contentPaths) },
      contentIncremental: { paths: contentIncremental, ...sumFiles(files, contentIncremental) },
      visibleData: { paths: dataPaths, ...sumFiles(files, dataPaths) },
      dataIncremental: { paths: dataIncremental, ...sumFiles(files, dataIncremental) },
      editorIncremental: { paths: incrementalPaths, ...sumFiles(files, incrementalPaths) },
    },
    installed: sumFiles(files, Object.keys(files)),
  };
  await mkdir('dist/bundle-analysis', { recursive: true });
  await writeFile('dist/bundle-analysis/metafile.json', JSON.stringify(modular.metafile, null, 2) + '\n');
  await writeFile('dist/bundle-analysis/standalone-metafile.json', JSON.stringify(standalone.metafile, null, 2) + '\n');
  await writeFile('dist/bundle-report.json', JSON.stringify(report, null, 2) + '\n');
  measurements.push(['modularInitial', report.modularExperiment.scenarios.view]);
  measurements.push(['editorIncremental', report.modularExperiment.scenarios.editorIncremental]);
  measurements.push(['subControlsIncremental', report.modularExperiment.scenarios.subControlsIncremental]);
  measurements.push(['templatesIncremental',report.modularExperiment.scenarios.templatesIncremental]);
  measurements.push(['calendarIncremental',report.modularExperiment.scenarios.calendarIncremental]);
  measurements.push(['childCardsIncremental', report.modularExperiment.scenarios.childCardsIncremental]);
  measurements.push(['chipsIncremental', report.modularExperiment.scenarios.chipsIncremental]);
  measurements.push(['contentIncremental', report.modularExperiment.scenarios.contentIncremental]);
  measurements.push(['dataIncremental', report.modularExperiment.scenarios.dataIncremental]);
  measurements.push(['modularInstalled', report.modularExperiment.installed]);
  measurements.push(['advancedControlsIncremental', widgets.advancedControlsIncremental]);
}

// Report every profile and complete dependency closure without size-based build gates.
report.measurements = Object.fromEntries(measurements.map(([name, actual, baseline]) => [name, reportSize(name, actual, baseline)]));
await writeFile('dist/bundle-report.json', JSON.stringify(report, null, 2) + '\n');
