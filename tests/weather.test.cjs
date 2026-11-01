/* ============================================
   SMART MIRROR — Test del meteo onesto

   Regola: lo specchio non deve MAI mostrare numeri che sembrano
   letture reali quando non lo sono. Senza chiave API o in caso di
   errore mostra "--" e un'etichetta esplicita.
   ============================================ */

const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/dom.cjs');

function setup({ apiKey = '', fetchImpl } = {}) {
  const ctx = loadApp({
    __withApp: false,
    fetch: fetchImpl || (async () => { throw new Error('rete assente'); }),
  });
  // app.js ha bisogno di CONFIG (già caricato) e di un DOM con i suoi id.
  const vm = require('vm');
  const fs = require('fs');
  const path = require('path');
  const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'app.js' });
  if (apiKey) vm.runInContext(`CONFIG.weather.apiKey = ${JSON.stringify(apiKey)}`, ctx);
  return ctx;
}

test('senza chiave API: temperatura "--" e nessun dato inventato', async () => {
  const ctx = setup();
  await ctx.updateWeather();

  const temp = ctx.document.getElementById('weather-temp').textContent;
  const humidity = ctx.document.getElementById('weather-humidity').textContent;
  const wind = ctx.document.getElementById('weather-wind').textContent;

  assert.equal(temp, '--°');
  assert.match(humidity, /--/);
  assert.match(wind, /--/);
  // Nessun numero che possa passare per una lettura reale
  assert.doesNotMatch(temp, /\d/);
});

test('senza chiave API: etichetta "non configurato" visibile', async () => {
  const ctx = setup();
  await ctx.updateWeather();

  const badge = ctx.document.getElementById('weather-source');
  assert.equal(badge.hidden, false);
  assert.match(badge.textContent, /non configurato/i);
  assert.equal(ctx.document.getElementById('weather-widget').dataset.status, 'unconfigured');
});

test('chiave presente ma rete in errore: stato "error", non "live"', async () => {
  const ctx = setup({ apiKey: 'chiave-finta' });
  await ctx.updateWeather();

  const badge = ctx.document.getElementById('weather-source');
  assert.equal(ctx.document.getElementById('weather-widget').dataset.status, 'error');
  assert.equal(badge.hidden, false);
  assert.match(badge.textContent, /non disponibile/i);
  assert.equal(ctx.document.getElementById('weather-temp').textContent, '--°');
});

test('risposta valida: mostra i dati reali e nasconde l\'etichetta', async () => {
  const weather = {
    cod: 200,
    name: 'Sinnai',
    main: { temp: 18.4, humidity: 63 },
    wind: { speed: 3.1 },
    weather: [{ icon: '01d', description: 'cielo sereno' }],
  };
  const forecast = { cod: '200', list: [] };

  const ctx = setup({
    apiKey: 'chiave-finta',
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => (String(url).includes('forecast') ? forecast : weather),
    }),
  });
  await ctx.updateWeather();

  assert.equal(ctx.document.getElementById('weather-temp').textContent, '18°');
  assert.equal(ctx.document.getElementById('weather-desc').textContent, 'cielo sereno');
  assert.equal(ctx.document.getElementById('weather-location').textContent, '📍 Sinnai');
  assert.equal(ctx.document.getElementById('weather-widget').dataset.status, 'live');
  assert.equal(ctx.document.getElementById('weather-source').hidden, true);
});

test('chiave rifiutata dall\'API: stato "error" con messaggio chiaro', async () => {
  const ctx = setup({
    apiKey: 'chiave-sbagliata',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ cod: 401, message: 'Invalid API key' }),
    }),
  });
  await ctx.updateWeather();

  const badge = ctx.document.getElementById('weather-source');
  assert.equal(ctx.document.getElementById('weather-widget').dataset.status, 'error');
  assert.match(badge.textContent, /chiave non valida/i);
});
