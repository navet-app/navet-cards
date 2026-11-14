import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMediaGroups, listMediaGroupCandidates, prepareMediaGroupCommand, type MediaGroupCommand } from '../src/providers/media-groups';
import type { Hass, HassEntity } from '../src/providers/home-assistant';

const raw = (id: string, attributes: Record<string,unknown> = {}, state = 'playing'): HassEntity => ({ entity_id: id, state, attributes });
function fixture() {
  const owner = raw('media_player.living', { supported_features: 524288, group_members: ['media_player.living','media_player.kitchen'] });
  const host: Pick<Hass,'states'> = { states: {
    [owner.entity_id]: owner,
    'media_player.kitchen': raw('media_player.kitchen', { friendly_name: 'Kitchen speaker' }, 'off'),
    'media_player.bedroom': raw('media_player.bedroom', { friendly_name: 'Bedroom speaker' }),
    'media_player.offline': raw('media_player.offline', { friendly_name: 'Offline speaker' }, 'unavailable'),
    'light.kitchen': raw('light.kitchen'),
  } };
  return { owner,host };
}

test('media grouping flag is independent of reported membership and invalid masks grant no controls', () => {
  const { owner } = fixture(); const original = structuredClone(owner);
  assert.deepEqual(mapMediaGroups(owner), { capabilities: ['media_join','media_unjoin'], mediaGroupMembers: ['media_player.living','media_player.kitchen'] });
  for (const features of [undefined,0,262144,32768,-1,Infinity,NaN,524288.5,'524288']) {
    assert.deepEqual(mapMediaGroups({...owner,attributes:{...owner.attributes,supported_features:features}}).capabilities,[]);
  }
  assert.deepEqual(owner,original);
  assert.deepEqual(mapMediaGroups(undefined),{capabilities:[]});
  assert.deepEqual(mapMediaGroups({...owner,entity_id:'light.fake'}),{capabilities:[]});
});

test('reported membership normalizes valid media IDs without inventing unknown membership', () => {
  const { owner } = fixture();
  assert.deepEqual(mapMediaGroups({...owner,attributes:{group_members:['media_player.kitchen','media_player.kitchen','light.other',null,'bad','media_player.living']}}),{capabilities:[],mediaGroupMembers:['media_player.kitchen','media_player.living']});
  assert.equal(mapMediaGroups({...owner,attributes:{group_members:'media_player.kitchen'}}).mediaGroupMembers,undefined);
  assert.deepEqual(mapMediaGroups({...owner,attributes:{group_members:[]}}).mediaGroupMembers,[]);
});

test('normalized group candidates exclude owner, foreign domains and mismatched raw owners; unavailable stays explicit', () => {
  const { host } = fixture();
  host.states['media_player.mismatch'] = raw('media_player.other');
  const original = structuredClone(host.states);
  assert.deepEqual(listMediaGroupCandidates(host,'media_player.living'),[
    {id:'media_player.bedroom',name:'Bedroom speaker',available:true},
    {id:'media_player.kitchen',name:'Kitchen speaker',available:true},
    {id:'media_player.offline',name:'Offline speaker',available:false},
  ]);
  assert.deepEqual(listMediaGroupCandidates(host,'light.kitchen'),[]);
  assert.deepEqual(host.states,original);
});

test('explicit join and unjoin prepare exact payloads against the owning player without mutating selections', () => {
  const { host } = fixture();
  const members = ['media_player.kitchen','media_player.bedroom'];
  const intent = prepareMediaGroupCommand(host,'media_player.living',{type:'media_join',members});
  assert.deepEqual(intent,{domain:'media_player',service:'join',data:{group_members:members},target:{entity_id:'media_player.living'}});
  assert.notEqual(intent.data.group_members,members);
  assert.deepEqual(prepareMediaGroupCommand(host,'media_player.living',{type:'media_unjoin'}),{domain:'media_player',service:'unjoin',data:{},target:{entity_id:'media_player.living'}});
});

test('grouping dispatch rejects changed owner/features/availability and changed selected member state', () => {
  for (const state of ['unknown','unavailable','missing']) {
    const { owner,host } = fixture(); host.states[owner.entity_id] = {...owner,state};
    assert.throws(() => prepareMediaGroupCommand(host,owner.entity_id,{type:'media_unjoin'}));
  }
  for (const change of [{entity_id:'media_player.other'}, {attributes:{supported_features:0}}]) {
    const { owner,host } = fixture(); host.states[owner.entity_id] = {...owner,...change};
    assert.throws(() => prepareMediaGroupCommand(host,owner.entity_id,{type:'media_unjoin'}));
  }
  for (const member of ['media_player.offline','media_player.missing']) {
    const { host } = fixture(); assert.throws(() => prepareMediaGroupCommand(host,'media_player.living',{type:'media_join',members:[member]}));
  }
  const { host } = fixture(); host.states['media_player.kitchen'] = raw('media_player.changed');
  assert.throws(() => prepareMediaGroupCommand(host,'media_player.living',{type:'media_join',members:['media_player.kitchen']}));
});

test('group join rejects empty, duplicate, self, malformed and foreign-domain selections instead of widening them', () => {
  const { host } = fixture();
  for (const members of [[],['media_player.kitchen','media_player.kitchen'],['media_player.living'],['light.kitchen'],['bad'],[undefined],null,'media_player.kitchen']) {
    assert.throws(() => prepareMediaGroupCommand(host,'media_player.living',{type:'media_join',members} as MediaGroupCommand));
  }
  assert.throws(() => prepareMediaGroupCommand(host,'light.kitchen',{type:'media_unjoin'}));
  assert.throws(() => prepareMediaGroupCommand(host,'media_player.living',{type:'future'} as never));
});
