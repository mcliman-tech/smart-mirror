/* ============================================
   SMART MIRROR — Test di integrità del progetto

   Cose che si rompono in silenzio: un id rinominato in index.html,
   una versione dimenticata, un file non più in cache.
   ============================================ */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const idsInHtml = new Set(
  [...read('index.html').matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1])
);

test('ogni id usato da app.js esiste in index.html', () => {
  const used = new Set(
    [...read('app.js').matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)/g)].map(m => m[1])
  );
  const missing = [...used].filter(id => !idsInHtml.has(id));
  assert.deepEqual(missing, [], `id mancanti in index.html: ${missing.join(', ')}`);
});

test('ogni id usato da voice.js esiste in index.html (se scritto con #)', () => {
  const used = new Set(
    [...read('voice.js').matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)/g)].map(m => m[1])
  );
  const missing = [...used].filter(id => !idsInHtml.has(id));
  assert.deepEqual(missing, []);
});

test('nessun ?v= scritto a mano: la versione vive solo in version.js', () => {
  const offenders = [];
  ['index.html', 'manifest.json', 'sw.js'].forEach(file => {
    const content = read(file);
    const matches = content.match(/\?v=\d+/g) || [];
    if (matches.length) offenders.push(`${file}: ${matches.join(', ')}`);
  });
  assert.deepEqual(offenders, []);
});

test('version.js espone SM_VERSION in un formato valido', () => {
  const version = read('version.js').match(/SM_VERSION\s*=\s*'([^']+)'/);
  assert.ok(version, 'SM_VERSION non trovata in version.js');
  assert.match(version[1], /^\d{8}-\d+$/);
});

test('il service worker mette in cache tutti i file critici', () => {
  const sw = read('sw.js');
  ['index.html', 'version.js', 'style.css', 'config.js', 'app.js', 'voice.js', 'manifest.json']
    .forEach(file => {
      assert.ok(sw.includes(`./${file}`), `${file} non è nella lista di cache del service worker`);
    });
});

test('il service worker non mette in cache URL con segreti', () => {
  const sw = read('sw.js');
  assert.match(sw, /appid\|api_\?key\|token\|secret/);
});

test('gli script sono caricati nell\'ordine giusto in index.html', () => {
  const html = read('index.html');
  const order = ['version.js', "'config.js'", "'app.js'", 'vosk-browser', "'voice.js'"];
  let last = -1;
  order.forEach(item => {
    const index = html.indexOf(item);
    assert.ok(index > -1, `${item} non caricato`);
    assert.ok(index > last, `${item} fuori ordine`);
    last = index;
  });
});

test('nessun dato meteo finto cablato nel codice', () => {
  const app = read('app.js');
  // I vecchi valori demo (22°, 55%, 12 km/h) non devono tornare
  assert.doesNotMatch(app, /textContent\s*=\s*'22°'/);
  assert.doesNotMatch(app, /💧 55%/);
  assert.doesNotMatch(app, /💨 12 km\/h/);
});
