import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

// A disposable, loopback-only HA host. Never reads an existing HA installation.
const version = process.argv[2] ?? '2026.9.4';
const port = Number(process.argv[3] ?? 18124);
if (!/^\d{4}\.\d+\.\d+$/.test(version) || !Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Usage: node scripts/ha-validation.mjs HA_VERSION [PORT]');
const name = `navet-cards-ha-${version.replaceAll('.', '-')}`;
const root = resolve('.ha-validation', version);
const base = `http://127.0.0.1:${port}`;
const client = `${base}/`;
const image = `ghcr.io/home-assistant/home-assistant:${version}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
if (docker('ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'))
  throw new Error(`Container ${name} already exists. Reuse it; this script will not reset it.`);
await mkdir(`${root}/config/www`, { recursive: true });
try {
  await readFile(`${root}/session.json`);
  throw new Error(`A previous session exists in ${root}. Choose another version or archive it before starting fresh.`);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await copyFile('dist/navet-cards.js', `${root}/config/www/navet-cards.js`);
await writeFile(`${root}/config/configuration.yaml`, `default_config:
light:
  - platform: demo
switch:
  - platform: demo
sensor:
  - platform: demo
climate:
  - platform: demo
cover:
  - platform: demo
media_player:
  - platform: demo
input_boolean:
  navet_test:
    name: Navet verification switch
lovelace:
  mode: storage
`);
docker('run', '-d', '--name', name, '--label', 'navet-cards.validation=true', '-p', `127.0.0.1:${port}:8123`, '-v', `${root}/config:/config`, image);
console.log(`Started ${name}. Waiting for ${base} …`);
let ready = false;
const startupDeadline = Date.now() + 120_000;
while (Date.now() < startupDeadline) {
  const controller = new AbortController();
  // Keep a referenced timer while fetch waits for a container that may still be booting.
  const timeout = setTimeout(() => controller.abort(), Math.min(1000, startupDeadline - Date.now()));
  try {
    const response = await fetch(`${base}/api/onboarding`, { signal: controller.signal });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    // Connection failures and timeouts are expected during startup.
  } finally {
    clearTimeout(timeout);
  }
  const retryDelay = Math.min(1000, startupDeadline - Date.now());
  if (retryDelay > 0) await new Promise((resolve) => setTimeout(resolve, retryDelay));
}
if (!ready) throw new Error(`HA did not start. Inspect: docker logs ${name}`);
async function post(path, data, token, form = false) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form ? new URLSearchParams(data) : JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
const password = randomBytes(24).toString('base64url');
const username = 'navet-verification';
const { auth_code } = await post('/api/onboarding/users', { name: 'Navet verification', username, password, client_id: client, language: 'en' });
const tokens = await post('/auth/token', { grant_type: 'authorization_code', code: auth_code, client_id: client }, undefined, true);
await writeFile(`${root}/session.json`, JSON.stringify({ base, name, version, username, password, ...tokens }, null, 2), { mode: 0o600 });
for (const step of ['core_config', 'analytics', 'integration'])
  await post(`/api/onboarding/${step}`, { client_id: client, redirect_uri: client }, tokens.access_token);

const socket = new WebSocket(`${base.replace('http:', 'ws:')}/api/websocket`);
const pending = new Map();
let id = 0;
await new Promise((done, reject) => {
  const timer = setTimeout(() => reject(new Error('WebSocket authentication timed out')), 30000);
  socket.addEventListener('error', reject, { once: true });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: tokens.access_token }));
    if (message.type === 'auth_ok') { clearTimeout(timer); done(); }
    if (message.type === 'auth_invalid') { clearTimeout(timer); reject(new Error('WebSocket authentication failed')); }
    if (message.type === 'result') {
      const request = pending.get(message.id);
      pending.delete(message.id);
      message.success ? request?.resolve(message.result) : request?.reject(new Error(JSON.stringify(message.error)));
    }
  });
});
function call(type, data = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${type} timed out`)); }, 30000);
    pending.set(requestId, { resolve: (result) => { clearTimeout(timer); resolve(result); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: requestId, type, ...data }));
  });
}
try {
  const verificationUsers = {};
  for (const [role, group] of [['member', 'system-users'], ['readonly', 'system-read-only']]) {
    const username = `navet-${role}`;
    const password = randomBytes(24).toString('base64url');
    const { user } = await call('config/auth/create', { name: `Navet ${role}`, group_ids: [group], local_only: true });
    await call('config/auth_provider/homeassistant/create', { user_id: user.id, username, password });
    verificationUsers[role] = { username, password };
  }
  await writeFile(`${root}/session.json`, JSON.stringify({ base, name, version, username, password, ...tokens, verificationUsers }, null, 2), { mode: 0o600 });
  await call('lovelace/resources/create', { res_type: 'module', url: '/local/navet-cards.js?v=verification' });
  await call('lovelace/dashboards/create', { url_path: 'navet-verification', title: 'Navet verification', icon: 'mdi:test-tube', show_in_sidebar: true, require_admin: false });
  const area = await call('config/area_registry/create', { name: 'Navet test room' });
  const entities = ['light.bed_light', 'input_boolean.navet_test', 'sensor.outside_temperature'];
  for (const entity_id of entities) await call('config/entity_registry/update', { entity_id, area_id: area.area_id });
  const cards = [
    { type: 'custom:navet-light-card', entity: 'light.bed_light' },
    { type: 'custom:navet-switch-card', entity: 'input_boolean.navet_test' },
    { type: 'custom:navet-sensor-card', entity: 'sensor.outside_temperature' },
    { type: 'custom:navet-room-card', area: area.area_id },
    { type: 'custom:navet-media-card', entity: 'media_player.living_room' },
    { type: 'custom:navet-climate-card', entity: 'climate.hvac' },
    { type: 'custom:navet-cover-card', entity: 'cover.living_room_window' },
    { type: 'tile', entity: 'input_boolean.navet_test' },
  ];
  const config = {
    title: 'Navet verification',
    views: [
      { title: 'Masonry', path: 'masonry', cards },
      { title: 'Sections', path: 'sections', type: 'sections', sections: [{ type: 'grid', cards }] },
      { title: 'Themes and load', path: 'themes', type: 'sections', sections: ['auto', 'light', 'dark', 'black', 'glass'].map((theme) => ({ type: 'grid', cards: Array.from({ length: 6 }, (_, i) => ({ ...cards[i % 3], appearance: { theme }, name: `${theme}: a long household device title for verification ${i + 1}` })) })) },
      { title: 'Missing entities', path: 'missing', cards: [ { type: 'custom:navet-light-card', entity: 'light.navet_missing' }, { type: 'custom:navet-room-card', entities: ['light.navet_missing'] } ] },
    ],
  };
  await call('lovelace/config/save', { url_path: 'navet-verification', config });
  await writeFile(`${root}/dashboard.json`, JSON.stringify(config, null, 2));
  console.log(`Ready: ${base}/navet-verification/masonry`);
  console.log(`Disposable login is in ${root}/session.json (keep it private).`);
  console.log(`Stop when finished: docker stop ${name}`);
} finally { socket.close(); }
