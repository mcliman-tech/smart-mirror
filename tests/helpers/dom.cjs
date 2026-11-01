/* ============================================
   SMART MIRROR — Harness di test (Node, zero dipendenze)

   voice.js e app.js sono script da browser: per poterli testare
   senza un browser, qui ricreiamo il minimo di ambiente DOM di cui
   hanno bisogno. Ogni test ottiene un DOM nuovo e pulito.
   ============================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

// ── DOM finto, abbastanza per questi script ──
function createElement(tag = 'div', id = '') {
  const el = {
    tagName: tag.toUpperCase(),
    id,
    textContent: '',
    innerHTML: '',
    title: '',
    hidden: false,
    className: '',
    dataset: {},
    style: {},
    value: '',
    type: '',
    children: [],
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      toggle(c, force) {
        const on = force === undefined ? !this._set.has(c) : force;
        if (on) this._set.add(c); else this._set.delete(c);
        return on;
      },
      contains(c) { return this._set.has(c); },
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) { this.children.push(child); return child; },
    append(...kids) { kids.forEach(k => this.children.push(k)); },
    prepend(...kids) { this.children.unshift(...kids); },
    replaceChildren(...kids) { this.children = kids; },
    remove() {},
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
  };
  return el;
}

function createDOM(ids = []) {
  const registry = new Map();
  ids.forEach(id => registry.set(id, createElement('div', id)));

  const document = {
    readyState: 'complete',
    visibilityState: 'visible',
    body: createElement('body'),
    head: createElement('head'),
    getElementById(id) {
      if (!registry.has(id)) registry.set(id, createElement('div', id));
      return registry.get(id);
    },
    querySelector(sel) {
      return sel && sel.startsWith('#') ? document.getElementById(sel.slice(1)) : null;
    },
    querySelectorAll() { return []; },
    createElement(tag) { return createElement(tag); },
    addEventListener() {},
    removeEventListener() {},
    _registry: registry,
  };
  return document;
}

// Tutti gli id presenti in index.html, così i test li trovano già.
function idsFromIndexHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]);
}

function makeContext(overrides = {}) {
  const document = createDOM(idsFromIndexHtml());
  const storage = new Map();

  const ctx = {
    console,
    document,
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
    },
    navigator: { userAgent: 'node-test', onLine: true },
    location: {
      hostname: 'localhost',
      protocol: 'https:',
      href: 'https://localhost/',
      assign() {},
      reload() {},
    },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    fetch: async () => { throw new Error('fetch non simulata in questo test'); },
    URL,
    URLSearchParams,
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    AudioContext: function () {
      return {
        state: 'running',
        currentTime: 0,
        destination: {},
        createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} } }),
        createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }),
        createMediaStreamSource: () => ({ connect() {} }),
        createScriptProcessor: () => ({ connect() {} }),
        close() { return Promise.resolve(); },
      };
    },
    DOMParser: function () {
      return { parseFromString: () => ({ querySelector: () => null, querySelectorAll: () => [] }) };
    },
  };

  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  ctx.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {} };
  Object.assign(ctx, overrides);

  vm.createContext(ctx);
  return ctx;
}

// Carica uno script del progetto nel contesto dato.
function loadScript(ctx, filename) {
  const code = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  vm.runInContext(code, ctx, { filename });
  return ctx;
}

// Contesto con config.js + app.js + voice.js caricati.
function loadApp(overrides = {}) {
  const ctx = makeContext(overrides);
  loadScript(ctx, 'config.js');
  if (overrides.__withApp !== false) loadScript(ctx, 'app.js');
  loadScript(ctx, 'voice.js');
  // Le classi dichiarate con `class` non diventano proprietà del contesto:
  // le recuperiamo dal contesto stesso per usarle nei test.
  ctx.VoiceControl = vm.runInContext('VoiceControl', ctx);
  return ctx;
}

module.exports = { createDOM, createElement, makeContext, loadScript, loadApp, idsFromIndexHtml, ROOT };
