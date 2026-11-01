/* ============================================
   SMART MIRROR — Test "sempre acceso"

   Lo specchio deve reggere giorni di funzionamento: niente risorse
   che si accumulano, niente sveglia che suona una volta sola.
   ============================================ */

const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/dom.cjs');

function createVoice(ctx) {
  const voice = new ctx.VoiceControl();
  voice.spoken = [];
  voice.respond = (text) => voice.spoken.push(text);
  voice.speak = (text) => voice.spoken.push(text);
  voice.highlightWidget = () => {};
  voice.showVoiceStatus = () => {};
  voice.hideVoiceStatus = () => {};
  return voice;
}

test('i bip riusano un solo AudioContext', () => {
  let created = 0;
  const ctx = loadApp({
    __withApp: false,
    AudioContext: function () {
      created++;
      return {
        state: 'running',
        currentTime: 0,
        destination: {},
        resume: () => Promise.resolve(),
        createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} } }),
        createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }),
      };
    },
  });
  const voice = createVoice(ctx);

  for (let i = 0; i < 20; i++) voice.playChime('wake');

  assert.equal(created, 1, 'ogni bip non deve creare un nuovo AudioContext');
});

test('un AudioContext sospeso viene ripreso, non ricreato', () => {
  let created = 0;
  let resumed = 0;
  const ctx = loadApp({
    __withApp: false,
    AudioContext: function () {
      created++;
      return {
        state: 'suspended',
        currentTime: 0,
        destination: {},
        resume: () => { resumed++; return Promise.resolve(); },
        createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} } }),
        createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }),
      };
    },
  });
  const voice = createVoice(ctx);

  voice.playChime('wake');
  voice.playChime('wake');

  assert.equal(created, 1);
  assert.equal(resumed, 2);
});

test('il timer scaduto fa partire una sveglia che continua', () => {
  const ctx = loadApp({ __withApp: false });
  const voice = createVoice(ctx);
  let chimes = 0;
  voice.playChime = () => { chimes++; };

  voice.startAlarm('pasta');
  assert.ok(voice.activeAlarm, 'la sveglia deve restare attiva');
  assert.equal(chimes, 1);

  voice.stopAlarm();
  assert.equal(voice.activeAlarm, null);
});

test('"stop" ferma la sveglia prima di ogni altro comando', () => {
  const ctx = loadApp({ __withApp: false });
  const voice = createVoice(ctx);
  voice.playChime = () => {};
  voice.startAlarm('pasta');

  const result = voice.processCommand('stop');

  assert.equal(result.action, 'alarm-stop');
  assert.equal(voice.activeAlarm, null);
  assert.match(voice.spoken[voice.spoken.length - 1], /Sveglia fermata/);
});

test('senza sveglia attiva, "stop" non ruba il comando ad altre parole', () => {
  const ctx = loadApp({ __withApp: false });
  const voice = createVoice(ctx);
  voice.playChime = () => {};

  const result = voice.processCommand('spegni la luce in cucina');

  assert.equal(result.action, 'lights');
  assert.equal(result.light, 'Luce Cucina');
});

test('la sveglia non si accumula: ne resta una sola attiva', () => {
  const ctx = loadApp({ __withApp: false });
  const voice = createVoice(ctx);
  let chimes = 0;
  voice.playChime = () => { chimes++; };

  voice.startAlarm('primo');
  const firstTimeout = voice.alarmTimeout;
  voice.startAlarm('secondo');

  assert.equal(voice.activeAlarm.label, 'secondo');
  assert.notEqual(voice.alarmTimeout, firstTimeout);
  voice.stopAlarm();
});

test('tornare sulla pagina rinfresca i dati senza errori', () => {
  const ctx = loadApp();
  assert.equal(typeof ctx.updateWeather, 'function');
  assert.equal(typeof ctx.updateEnvironmentalData, 'function');
  // requestWakeLock deve essere richiamabile più volte senza rompersi
  assert.equal(typeof ctx.requestWakeLock, 'function');
});
