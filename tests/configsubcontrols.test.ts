import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config';

const base = { type: 'custom:navet-switch-card', entity: 'switch.coffee' };
test('rich sub-control configuration validates without mutating advanced fields or order', () => {
  const input = { ...base, sub_controls_position: 'top', sub_control_groups: [{ id: 'readings', name: 'Readings', collapsed: true, future_group: { keep: true } }], sub_controls: [
    { entity: 'sensor.temperature', name: 'Indoor', icon: 'mdi:thermometer', attribute: 'current', unit: '°C', show_name: false, show_state: true, read_only: true, group: 'readings', control: 'state', future_sub: { keep: true }, visible_when: { entity: 'sensor.temperature', available: true }, hold_action: { action: 'url', url_path: 'https://example.com' }, double_tap_action: { action: 'navigate', navigation_path: '#room' } },
    { entity: 'switch.coffee', control: 'toggle' },
  ] };
  const saved = validateConfig(input, 'switch');
  assert.deepEqual(saved, input);
  (saved.sub_controls![0].future_sub as {keep:boolean}).keep = false;
  assert.equal(input.sub_controls[0].future_sub?.keep, true);
  assert.deepEqual(saved.sub_controls?.map((sub) => sub.entity), ['sensor.temperature','switch.coffee']);
});
test('legacy flat sub-controls retain defaults and saved shape', () => {
  const input = { ...base, sub_controls: [{ entity:'light.kitchen',control:'slider',tap_action:{action:'more-info'},future:true }] };
  assert.deepEqual(validateConfig(input,'switch'), input);
});
test('groups and rich fields reject invalid references, IDs, booleans and actions', () => {
  const valid = { ...base, sub_control_groups: [{id:'one',name:'One'}],sub_controls:[{entity:'sensor.temperature',group:'one'}] };
  for (const patch of [
    {sub_controls_position:'left'}, {sub_control_groups:[{id:'one',name:' '}]},
    {sub_control_groups:[{id:'one',name:'One'},{id:'one',name:'Duplicate'}]},
    {sub_control_groups:[{id:'bad id',name:'One'}]}, {sub_control_groups:[{id:'one',name:'One',collapsed:'yes'}]},
    ...[{group:'missing'},{icon:'javascript:alert(1)'},{show_name:'yes'},{show_state:0},{read_only:'yes'},{attribute:4},{unit:{}},{hold_action:{action:'url',url_path:'javascript:alert(1)'}},{double_tap_action:{action:'navigate',navigation_path:'//evil'}}].map((sub) => ({sub_controls:[{entity:'sensor.temperature',...sub}]})),
  ]) assert.throws(() => validateConfig({...valid,...patch},'switch'));
  assert.throws(() => validateConfig({...base,sub_controls:Array.from({length:9},()=>({entity:'sensor.temperature'}))},'switch'));
});
