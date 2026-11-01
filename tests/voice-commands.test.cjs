/* ============================================
   SMART MIRROR — Test dei comandi vocali

   Il punto più fragile del progetto: processCommand() riconosce i comandi
   con `includes()` su una lista di sinonimi. Qui blocchiamo il
   comportamento attuale, così le modifiche future non rompono nulla
   di nascosto.
   ============================================ */

const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/dom.cjs');

// Istanza di VoiceControl con le risposte catturate invece che parlate.
function createVoice() {
  const ctx = loadApp();
  const voice = new ctx.VoiceControl();
  voice.spoken = [];
  voice.respond = (text) => voice.spoken.push(text);
  voice.speak = (text) => voice.spoken.push(text);
  voice.highlightWidget = () => {};
  voice.showVoiceStatus = () => {};
  voice.hideVoiceStatus = () => {};
  voice.setLightState = (index, state) => { voice.lastLight = { index, state }; };
  return voice;
}

const say = (voice, command) => voice.processCommand(command);
const lastSaid = (voice) => voice.spoken[voice.spoken.length - 1] || '';

test('orario: "che ore sono" risponde con l\'ora', () => {
  const voice = createVoice();
  say(voice, 'che ore sono');
  assert.match(lastSaid(voice), /Sono le ore \d+/);
});

test('data: "che giorno è" risponde con la data', () => {
  const voice = createVoice();
  say(voice, 'che giorno è oggi');
  assert.match(lastSaid(voice), /Oggi è/);
});

test('luci: "accendi la luce in cucina" agisce sulla cucina', () => {
  const voice = createVoice();
  const result = say(voice, 'accendi la luce in cucina');
  assert.equal(result.action, 'lights');
  assert.equal(result.light, 'Luce Cucina');
  assert.equal(result.on, true);
  assert.match(lastSaid(voice), /Ho acceso Luce Cucina/);
});

test('luci: "spegni cortile" agisce sul cortile', () => {
  const voice = createVoice();
  const result = say(voice, 'spegni cortile');
  assert.equal(result.light, 'Luce Cortile');
  assert.equal(result.on, false);
});

test('luci: "accendi luce" senza ambiente non sceglie una luce a caso', () => {
  const voice = createVoice();
  const result = say(voice, 'accendi luce');
  assert.equal(result.action, 'lights-unknown');
  assert.equal(voice.lastLight, undefined);
  assert.match(lastSaid(voice), /Quale luce/);
});

test('luci: "accendi tutte le luci" le accende tutte', () => {
  const voice = createVoice();
  const result = say(voice, 'accendi tutte le luci');
  assert.equal(result.action, 'lights-all');
  assert.equal(result.on, true);
});

test('timer: "timer 5 minuti" conferma i minuti', () => {
  const voice = createVoice();
  say(voice, 'timer 5 minuti');
  assert.match(lastSaid(voice), /5 minuti/);
});

test('promemoria: "ricordami di comprare il latte" annota il testo', () => {
  const voice = createVoice();
  say(voice, 'ricordami di comprare il latte');
  assert.match(lastSaid(voice), /comprare il latte/);
});

test('comando sconosciuto: non finge di aver capito', () => {
  const voice = createVoice();
  say(voice, 'asdfgh qwerty');
  assert.match(lastSaid(voice), /Ho sentito/);
});

test('ricetta: restituisce una ricerca, non naviga subito', () => {
  const voice = createVoice();
  const result = say(voice, 'ricetta di carbonara');
  assert.equal(result.action, 'search');
  assert.match(result.url, /giallozafferano/);
  assert.match(decodeURIComponent(result.url), /carbonara/);
});

test('spotify: "metti musica dei Pink Floyd" costruisce la ricerca', () => {
  const voice = createVoice();
  const result = say(voice, 'metti musica dei Pink Floyd');
  assert.equal(result.action, 'open');
  // Il comando arriva in minuscolo: la query deve contenere il nome, senza "dei"
  assert.match(decodeURIComponent(result.url).toLowerCase(), /pink floyd/);
  assert.doesNotMatch(decodeURIComponent(result.url).toLowerCase(), /dei pink/);
});

test('motore vocale: di default usa quello di iPadOS, non Vosk', () => {
  const ctx = loadApp();
  const voice = new ctx.VoiceControl();
  let usato = null;
  voice.startLocalListening = () => { usato = 'local'; };
  voice.startBrowserRecording = () => { usato = 'browser'; };
  ctx.window.Vosk = { createModel: () => {} };
  voice.startRecording();
  assert.equal(usato, 'browser', 'senza scelta esplicita non deve scaricare 48 MB');
});

test('motore vocale: con "local" salvato usa Vosk', () => {
  const ctx = loadApp();
  ctx.localStorage.setItem('sm_voice_engine', 'local');
  const voice = new ctx.VoiceControl();
  let usato = null;
  voice.startLocalListening = () => { usato = 'local'; };
  voice.startBrowserRecording = () => { usato = 'browser'; };
  ctx.window.Vosk = { createModel: () => {} };
  voice.startRecording();
  assert.equal(usato, 'local');
});

test('in modalità app il fallimento del riconoscimento apre la dettatura', () => {
  const ctx = loadApp({ __withApp: false });
  ctx.navigator.standalone = true;
  ctx.matchMedia = () => ({ matches: true, addEventListener() {}, addListener() {} });
  const fake = function () {
    this.start = () => { setTimeout(() => this.onerror && this.onerror({ error: 'service-not-allowed' }), 0); };
    this.stop = () => {};
    this.abort = () => {};
  };
  ctx.SpeechRecognition = fake;
  ctx.webkitSpeechRecognition = fake;

  const voice = new ctx.VoiceControl();
  let dettaturaAperta = false;
  voice.showVoiceInput = () => { dettaturaAperta = true; };
  voice.finishRecording = () => {};
  voice.showVoiceStatus = () => {};
  voice.startBrowserRecording();

  return new Promise(resolve => setTimeout(() => {
    assert.equal(dettaturaAperta, true, 'deve aprire la dettatura invece di arrendersi');
    resolve();
  }, 30));
});

test('fuori dalla modalità app il messaggio resta quello normale', () => {
  const ctx = loadApp({ __withApp: false });
  ctx.navigator.standalone = false;
  ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  const fake = function () {
    this.start = () => { setTimeout(() => this.onerror && this.onerror({ error: 'no-speech' }), 0); };
    this.stop = () => {};
    this.abort = () => {};
  };
  ctx.SpeechRecognition = fake;
  ctx.webkitSpeechRecognition = fake;

  const voice = new ctx.VoiceControl();
  let messaggio = '';
  voice.showVoiceInput = () => {};
  voice.finishRecording = (m) => { messaggio = m; };
  voice.showVoiceStatus = () => {};
  voice.startBrowserRecording();

  return new Promise(resolve => setTimeout(() => {
    assert.match(messaggio, /Non ho rilevato la voce/);
    resolve();
  }, 30));
});

test('in modalità app il tocco sul microfono apre subito la dettatura', () => {
  const ctx = loadApp({ __withApp: false });
  ctx.navigator.standalone = true;
  ctx.matchMedia = () => ({ matches: true, addEventListener() {}, addListener() {} });
  // In modalità app iPadOS non espone il riconoscimento vocale: il codice
  // deve comunque portare alla dettatura, non arrendersi.
  delete ctx.SpeechRecognition;
  delete ctx.webkitSpeechRecognition;

  const voice = new ctx.VoiceControl();
  let dettaturaAperta = false;
  let stato = '';
  voice.showVoiceInput = () => { dettaturaAperta = true; };
  voice.showVoiceStatus = (m) => { stato = m; };
  voice.logDiag = () => {};

  voice.startBrowserRecording();

  assert.equal(dettaturaAperta, true, 'deve aprire la dettatura al primo tocco');
  assert.match(stato, /microfono della tastiera/);
});
