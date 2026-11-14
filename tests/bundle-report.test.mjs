import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyClosure, measureOutputs, sumFiles, reportSize } from '../scripts/bundle-report.mjs';

test('initial and dynamic closures count shared code once and resolve relative chunks', () => {
  const outputs = {
    'dist/main.js': { imports: [{ path: './chunks/shared.js', kind: 'import-statement' }, { path: './chunks/editor.js', kind: 'dynamic-import' }, { path: 'external', external: true }] },
    'dist/chunks/shared.js': { imports: [] },
    'dist/chunks/editor.js': { imports: [{ path: 'dist/chunks/shared.js', kind: 'import-statement' }] },
  };
  assert.deepEqual(dependencyClosure(outputs, 'dist/main.js'), ['dist/chunks/shared.js', 'dist/main.js']);
  assert.deepEqual(dependencyClosure(outputs, 'dist/main.js', true), ['dist/chunks/editor.js', 'dist/chunks/shared.js', 'dist/main.js']);
  assert.throws(() => dependencyClosure({ 'bad.js': { imports: [{ path: 'missing.js' }] } }, 'bad.js'), /Missing output/);
});

test('measurement hashes actual bytes and accounts for full file gzip rather than attribution estimates', () => {
  const contents = new TextEncoder().encode('const x = 1;');
  const files = measureOutputs({ outputs: { 'dist/main.js': { inputs: { 'src/a.ts': { bytesInOutput: 9 }, 'src/b.ts': { bytesInOutput: 2 } } } } }, [{ path: '/repo/dist/main.js', contents }]);
  assert.equal(files['dist/main.js'].raw, contents.length);
  assert.match(files['dist/main.js'].sha256, /^[0-9a-f]{64}$/);
  assert.equal(files['dist/main.js'].contributions[0].source, 'src/a.ts');
  assert.deepEqual(sumFiles(files, ['dist/main.js']), { raw: contents.length, gzip: files['dist/main.js'].gzip, requests: 1 });
  assert.throws(() => measureOutputs({ outputs: { 'absent.js': { inputs: {} } } }, []), /unavailable/);
});

test('size reporting keeps measurements and baseline deltas without imposing limits', () => {
  const actual = {raw: 10_000_000, gzip: 1_000_000, requests: 1};
  assert.deepEqual(reportSize('fixture', actual, {raw: 10, gzip: 5}), {
    actual, delta: {raw: 9_999_990, gzip: 999_995},
  });
  assert.deepEqual(reportSize('fixture', actual), {actual});
});

test('an oversized build succeeds and reports every modular scenario without size ceilings', async t => {
  const {mkdtemp, mkdir, readFile, writeFile, cp, symlink, rm} = await import('node:fs/promises');
  const {join, resolve} = await import('node:path');
  const {tmpdir} = await import('node:os');
  const {execFileSync} = await import('node:child_process');
  const root = await mkdtemp(join(tmpdir(),'navet-size-report-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'scripts'));
  await mkdir(join(root,'src/controls'),{recursive:true});
  await mkdir(join(root,'src/providers'),{recursive:true});
  await mkdir(join(root,'src/composition'),{recursive:true});
  await symlink(resolve('node_modules'),join(root,'node_modules'));
  for(const script of ['build.mjs','bundle-report.mjs','artifact-manifest.mjs']) await cp(`scripts/${script}`,join(root,'scripts',script));
  const policy=JSON.parse(await readFile('scripts/bundle-budgets.json','utf8'));
  assert.equal(policy.schemaVersion,2);
  assert.equal(policy.mode,'report-only');
  assert.deepEqual(Object.keys(policy).sort(),['baseline','gzip','mode','schemaVersion']);
  await writeFile(join(root,'scripts/bundle-budgets.json'),JSON.stringify(policy));
  await writeFile(join(root,'package.json'),JSON.stringify({type:'module',version:'0.1.0'}));
  const features=['custom-content','editor','providers/card-data','controls/advanced-controls','composition/sub-controls','composition/chips','composition/child-cards','composition/calendar','providers/templates'];
  for(const [i,path] of features.entries()) await writeFile(join(root,'src',path+'.ts'),`export const value=${i};`);
  await writeFile(join(root,'src/index.ts'),`globalThis.oversized=${JSON.stringify('fixture-'.repeat(50000))};\n`+features.map((path,i)=>`export const load${i}=()=>import('./${path}');`).join('\n'));
  execFileSync(process.execPath,['scripts/build.mjs','--modular'],{cwd:root,stdio:'pipe'});
  const report=JSON.parse(await readFile(join(root,'dist/bundle-report.json'),'utf8'));
  assert.equal(report.schemaVersion,2);
  assert.equal(report.mode,'report-only');
  assert.equal(Object.keys(report.measurements).length,12);
  assert.ok(report.measurements.standalone.actual.raw>280000);
  assert.equal(report.measurements.standalone.delta.raw,report.standalone.total.raw-policy.baseline.standalone.raw);
  assert.ok(!/budget|headroom|passed|ceiling|\"hard\"|\"target\"/i.test(JSON.stringify(report)));
  assert.ok(Object.values(report.measurements).every(item=>item.actual.raw>0 && item.actual.gzip>0));
  assert.ok(report.modularExperiment.scenarios.colorIncremental.raw>0);
  assert.ok(report.modularExperiment.scenarios.rangeIncremental.raw>0);
  assert.ok(report.modularExperiment.scenarios.tiltIncremental.raw>0);
  assert.ok(report.modularExperiment.scenarios.fanIncremental.raw>0);
  assert.ok(report.modularExperiment.scenarios.contentIncremental.raw>0);
  assert.ok(report.modularExperiment.scenarios.subControlsIncremental.raw>0);
  assert.ok(report.modularExperiment.scenarios.chipsIncremental.raw>0);
  assert.ok(report.modularExperiment.scenarios.childCardsIncremental.raw>0);
  assert.ok(report.modularExperiment.scenarios.climateOptionsIncremental.raw>0);
  assert.ok(report.modularExperiment.scenarios.vacuumOptionsIncremental.raw>0);
  assert.deepEqual(report.modularExperiment.scenarios.colorIncremental.paths,report.modularExperiment.scenarios.advancedControlsIncremental.paths);
  assert.equal(report.modularExperiment.scenarios.colorIncremental.transportPack,'advancedControls');
  const content=report.modularExperiment.scenarios.richContent.paths;
  assert.ok(!content.some(path=>/editor-|card-data-|light-color-|climate-range-|cover-tilt-|fan-options-|climate-options-|vacuum-options-|advanced-controls-|sub-controls-/.test(path)));
  const editor=report.modularExperiment.scenarios.firstEdit.paths;
  assert.ok(!editor.some(path=>/custom-content-|card-data-|light-color-|climate-range-|cover-tilt-|fan-options-|climate-options-|vacuum-options-|advanced-controls-|sub-controls-/.test(path)));
  const data=report.modularExperiment.scenarios.visibleData.paths;
  assert.ok(!data.some(path=>/custom-content-|editor-|light-color-|climate-range-|cover-tilt-|fan-options-|climate-options-|vacuum-options-|advanced-controls-|sub-controls-/.test(path)));
});
