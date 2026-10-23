import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePromotionTag, resolvePromotion } from '../scripts/release-promotion.mjs';
import { validatePromotion, validateEvidence, validatePublicationAssets, legacyPublicationRecovery } from '../scripts/release.mjs';
import { validateFragment, renderNotes } from '../scripts/release-notes.mjs';
const dev = 'navet-cards-dev-0.1.0-dev.20261007120000';
const beta = 'v0.1.0-beta.1';
const source = (tag) => ({tag,sha:'a'.repeat(40)});
test('channel selection follows Dev to beta to stable without reserving tags in previews', () => {
  assert.equal(parsePromotionTag(dev).channel,'dev');
  assert.equal(resolvePromotion({tags:[dev,beta], sources:[source(dev)]}).release_tag,'v0.1.0-beta.2');
  assert.equal(resolvePromotion({channel:'stable',tags:[dev,beta],sources:[source(beta)]}).release_tag,'v0.1.0');
  assert.throws(() => resolvePromotion({channel:'stable',tags:[dev],sources:[source(dev)]}));
  assert.throws(() => resolvePromotion({releaseTag:beta,tags:[dev,beta],sources:[source(dev)]}));
});
test('stable requires installation acceptance, same base and a candidate source', () => {
  assert.throws(() => validatePromotion(beta,'v0.1.0'));
  assert.equal(validatePromotion(beta,'v0.1.0',{installationTested:true}).channel,'stable');
  assert.equal(validatePromotion(beta,'v0.1.0',{previewOnly:true}).channel,'stable');
  assert.throws(() => validatePromotion(beta,'v0.2.0',{installationTested:true}));
  assert.throws(() => validatePromotion(dev,'v0.1.0',{installationTested:true}));
  assert.throws(() => validatePromotion(beta,'v0.1.0-beta.2'));
});
test('source evidence binds repository, tag, version, commit, digest and run', () => {
  const evidence = {schema:1,repository:'navet-app/navet-cards',tag:beta,version:'0.1.0-beta.1',commit:'a'.repeat(40),sha256:'b'.repeat(64),runId:123};
  const expected = {repo:evidence.repository,tag:beta,sha:evidence.commit};
  validateEvidence(evidence,expected);
  for(const patch of [{repository:'other/repo'},{commit:'c'.repeat(40)},{tag:'v0.1.0-beta.2'},{version:'0.1.0'},{sha256:'bad'},{runId:0}]) assert.throws(() => validateEvidence({...evidence,...patch},expected));
  assert.throws(() => validateEvidence({...evidence,tag:'v0.1.0',version:'0.1.0'},{...expected,tag:'v0.1.0'}));
});
test('notes combine complete-range fragments, omit internal changes and validate summaries', () => {
  const fragments = [{type:'fixed',summary:'Fixed room controls.'},{type:'internal',summary:'Updated tooling.'},{type:'fixed',summary:'Fixed room controls.'}].map(validateFragment);
  assert.equal(renderNotes(fragments),'## Improvements and bug fixes\n\n- Fixed room controls.\n');
  assert.equal(renderNotes([fragments[1]]),'No user-facing changes in this release.\n');
  for(const fragment of [{type:'other',summary:'Something'},{type:'fixed',summary:'two\nlines'},{type:'fixed',summary:'word '.repeat(21)}]) assert.throws(() => validateFragment(fragment));
});

test('Git-range notes include every new fragment since stable and exclude released fragments', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(),'navet-cards-notes-'));
  const git = (...args) => execFileSync('git',args,{cwd:dir,stdio:'pipe'});
  try {
    git('init'); git('config','user.name','Release tests'); git('config','user.email','test@example.invalid');
    mkdirSync(join(dir,'.changes'));
    writeFileSync(join(dir,'.changes/old.json'),JSON.stringify({type:'fixed',summary:'Previously released fix.'}));
    git('add','.');git('commit','-m','test: baseline');git('tag','v0.1.0');
    for(const [name,type,summary] of [['first','new','Added room controls.'],['second','fixed','Fixed unavailable readings.'],['internal','internal','Updated test tooling.']]) {
      writeFileSync(join(dir,`.changes/${name}.json`),JSON.stringify({type,summary}));
      git('add','.');git('commit','-m',`test: ${name}`);
    }
    execFileSync(process.execPath,[resolve('scripts/release-notes.mjs')],{cwd:dir,env:{...process.env,RELEASE_SHA:'HEAD',RELEASE_TAG:'v0.2.0-beta.1',NOTES_BASE:''}});
    const notes = readFileSync(join(dir,'dist/release-notes.md'),'utf8');
    assert.match(notes,/Added room controls\./);assert.match(notes,/Fixed unavailable readings\./);
    assert.doesNotMatch(notes,/Previously released|test tooling/);
    execFileSync(process.execPath,[resolve('scripts/release-notes.mjs'),'check'],{cwd:dir,env:{...process.env,RELEASE_SHA:'HEAD',NOTES_BASE:'v0.1.0'}});
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('schema-2 publication evidence binds standalone manifest and downloaded runtime bytes', () => {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const resource = Buffer.from('/* Navet Cards 0.1.0-beta.1 | test */\nexport {};');
  const file = {path:'navet-cards.js',bytes:resource.length,sha256:digest(resource),imports:[]};
  const manifest = Buffer.from(JSON.stringify({schemaVersion:1,version:'0.1.0-beta.1',profile:'standalone',entry:'navet-cards.js',files:[file]}));
  const evidence = {schema:2,repository:'navet-app/navet-cards',tag:beta,version:'0.1.0-beta.1',commit:'a'.repeat(40),sha256:digest(resource),runId:123,profile:'standalone',artifactManifest:{name:'artifact-manifest.json',sha256:digest(manifest)},assets:[{name:file.path,bytes:file.bytes,sha256:file.sha256}]};
  const expected = {repo:evidence.repository,tag:beta,sha:evidence.commit};
  validateEvidence(evidence, expected);
  validatePublicationAssets(evidence, resource, manifest);
  assert.throws(() => validatePublicationAssets(evidence, Buffer.from('tampered'), manifest), /resource/);
  assert.throws(() => validatePublicationAssets(evidence, resource, Buffer.from('{}')), /manifest/);
  assert.throws(() => validatePublicationAssets(evidence, resource), /manifest/);
  for (const patch of [{profile:'modular'},{artifactManifest:{name:'../manifest',sha256:digest(manifest)}},{assets:[]},{assets:[{name:'navet-cards.js',bytes:0,sha256:evidence.sha256}]}]) assert.throws(() => validateEvidence({...evidence,...patch},expected));
  const alteredManifest = Buffer.from(JSON.stringify({...JSON.parse(manifest),files:[{...file,path:'../resource.js'}]}));
  assert.throws(() => validatePublicationAssets({...evidence,artifactManifest:{...evidence.artifactManifest,sha256:digest(alteredManifest)}},resource,alteredManifest),/manifest/);
  validatePublicationAssets({...evidence,schema:1},resource);
});

test('legacy recovery retains schema-1 assets without downgrading schema-2 publications', () => {
  const published = {draft:false,assets:[{name:'navet-cards.js'},{name:'navet-cards-release-evidence.json'}]};
  assert.equal(legacyPublicationRecovery(published,{schema:1}),true);
  assert.throws(() => legacyPublicationRecovery(published,{schema:2}),/manifest/);
  assert.throws(() => legacyPublicationRecovery(published,undefined),/manifest/);
  assert.equal(legacyPublicationRecovery({...published,draft:true},undefined),false);
  assert.equal(legacyPublicationRecovery({...published,assets:[...published.assets,{name:'artifact-manifest.json'}]},{schema:2}),false);
});

test('downloaded release archives contain the same evidenced manifest and runtime', async () => {
  const {mkdtempSync,writeFileSync,rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {execFileSync} = await import('node:child_process');
  const {validatePublicationArchive} = await import('../scripts/release.mjs');
  const dir = mkdtempSync(join(tmpdir(),'navet-release-archive-'));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  try {
    const resource = Buffer.from('/* Navet Cards 0.1.0-beta.1 | test */\nexport {};');
    const file = {path:'navet-cards.js',bytes:resource.length,sha256:hash(resource),imports:[]};
    const manifest = Buffer.from(JSON.stringify({schemaVersion:1,version:'0.1.0-beta.1',profile:'standalone',entry:'navet-cards.js',files:[file]}));
    const evidence = {schema:2,version:'0.1.0-beta.1',sha256:hash(resource),artifactManifest:{sha256:hash(manifest)},assets:[{name:file.path,bytes:file.bytes,sha256:file.sha256}]};
    writeFileSync(join(dir,'navet-cards.js'),resource);
    writeFileSync(join(dir,'artifact-manifest.json'),manifest);
    execFileSync('zip',['-q','valid.zip','navet-cards.js','artifact-manifest.json'],{cwd:dir});
    validatePublicationArchive(join(dir,'valid.zip'),evidence);
    writeFileSync(join(dir,'navet-cards.js'),'tampered');
    execFileSync('zip',['-q','tampered.zip','navet-cards.js','artifact-manifest.json'],{cwd:dir});
    assert.throws(()=>validatePublicationArchive(join(dir,'tampered.zip'),evidence),/resource/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
