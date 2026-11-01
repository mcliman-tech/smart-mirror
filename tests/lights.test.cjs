/* ============================================
   SMART MIRROR — Test del controllo luci

   Il difetto da non far tornare: con un unico trigger toggle, due comandi
   ravvicinati facevano accendere e spegnere la luce a raffica.
   ============================================ */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadController(options = {}) {
  const ctx = { console, setTimeout, clearTimeout, Date, queueMicrotask };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'lights.js'), 'utf8'), ctx);
  return ctx.SmartMirrorLights.createLightController(options);
}

const toggleHandlers = { urlFor: () => 'https://esempio/toggle' };
const splitHandlers = { urlFor: (state) => `https://esempio/${state ? 'on' : 'off'}` };

test('trigger toggle: tre tocchi ravvicinati producono UN solo invio', async () => {
  const invii = [];
  const c = loadController({ send: async (url) => { invii.push(url); } });

  await Promise.all([
    c.request(0, null, toggleHandlers),
    c.request(0, null, toggleHandlers),
    c.request(0, null, toggleHandlers),
  ]);

  assert.equal(invii.length, 1, 'la luce non deve lampeggiare');
  assert.equal(c.getKnown(0), true);
});

test('trigger toggle: due comandi in sequenza si alternano davvero', async () => {
  const invii = [];
  const c = loadController({ send: async (url) => { invii.push(url); } });

  await c.request(0, null, toggleHandlers);   // accende
  await c.request(0, null, toggleHandlers);   // spegne

  assert.equal(invii.length, 2);
  assert.equal(c.getKnown(0), false);
});

test('richiesta uguale allo stato noto: nessun invio', async () => {
  const invii = [];
  const c = loadController({ send: async (url) => { invii.push(url); } });

  c.setKnown(0, true);
  await c.request(0, true, toggleHandlers);

  assert.equal(invii.length, 0);
});

test('webhook separati ON/OFF: stesso comando ripetuto non si ripete', async () => {
  const invii = [];
  const c = loadController({ send: async (url) => { invii.push(url); } });

  await c.request(0, true, splitHandlers);
  await c.request(0, true, splitHandlers);

  assert.equal(invii.length, 1, 'accendere due volte non serve');
  assert.equal(c.getKnown(0), true);
});

test('webhook separati: accendi poi spegni manda i due URL giusti', async () => {
  const invii = [];
  const c = loadController({ send: async (url) => { invii.push(url); } });

  await c.request(0, true, splitHandlers);
  await c.request(0, false, splitHandlers);

  assert.deepEqual(invii, ['https://esempio/on', 'https://esempio/off']);
});

test('se l\'invio fallisce lo stato noto non cambia', async () => {
  const c = loadController({ send: async () => { throw new Error('rete'); } });

  await assert.rejects(() => c.request(0, true, splitHandlers));
  assert.equal(c.getKnown(0), null, 'non deve credere di aver acceso');
  assert.equal(c.isBusy(0), false, 'non deve restare bloccato');
});

test('senza webhook configurato non manda nulla e non si blocca', async () => {
  const invii = [];
  const c = loadController({ send: async (url) => { invii.push(url); } });

  const result = await c.request(0, true, { urlFor: () => '' });

  assert.equal(result.skipped, 'no-url');
  assert.equal(invii.length, 0);
  // Il lock si libera un attimo dopo (il finally gira in microtask):
  // aspettiamo un tick prima di verificare.
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(c.isBusy(0), false);
});

test('luci diverse non si bloccano a vicenda', async () => {
  const invii = [];
  const c = loadController({ send: async (url) => { invii.push(url); } });

  await Promise.all([
    c.request(0, true, splitHandlers),
    c.request(1, true, splitHandlers),
  ]);

  assert.equal(invii.length, 2);
  assert.equal(c.getKnown(0), true);
  assert.equal(c.getKnown(1), true);
});

test('config.local.js fornisce i webhook senza finire nel sito pubblico', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');

  // Il file locale esiste ed è ignorato da git
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(gitignore, /config\.local\.js/);

  // Non deve essere incluso nella cartella pubblicata
  const build = fs.readFileSync(path.join(ROOT, 'tools', 'build-site.cjs'), 'utf8');
  assert.doesNotMatch(build, /config\.local\.js/);

  // index.html lo carica, ma la pagina funziona anche senza
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<script src="config\.local\.js"/);
});
