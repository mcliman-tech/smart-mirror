/* ============================================
   SMART MIRROR — Controllo luci con un solo trigger

   Problema reale: con un webhook che fa da interruttore (toggle), ogni
   invio cambia lo stato senza sapere quale fosse. Se due comandi partono
   vicini — un doppio tocco, un comando vocale più un tocco, un ridisegno
   della pagina che rilegge lo stato — la luce si accende e si spegne a
   raffica.

   Qui la logica è isolata e testabile:

   - una sola richiesta in volo per luce: se ne arriva un'altra mentre la
     prima sta partendo, si scarta (un doppio tocco = un cambio, non due);
   - "desiderato" e "noto" sono due cose diverse: lo stato noto cambia solo
     quando il trigger è effettivamente partito;
   - se il noto coincide già col desiderato, non si manda niente;
   - debounce: due richieste identiche ravvicinate diventano una sola.

   Funziona sia con webhook separati ON/OFF (idempotenti: si può sempre
   ripetere) sia con un unico trigger toggle.
   ============================================ */

(function (global) {
  'use strict';

  const DEFAULT_DEBOUNCE = 1200; // ms

  function createLightController(options) {
    const opts = Object.assign({
      debounce: DEFAULT_DEBOUNCE,
      send: () => {},           // (url) => Promise
      onChange: () => {},       // (index, state) => void — per ridisegnare
      log: () => {},
    }, options);

    const inflight = new Map();   // index -> Promise in corso
    const known = new Map();      // index -> boolean | null
    const lastSent = new Map();   // index -> { state, at }

    function setKnown(index, state) {
      known.set(index, state);
    }

    function getKnown(index) {
      return known.has(index) ? known.get(index) : null;
    }

    // Toggle: inverte il noto. Se il noto è ignoto, si assume spento.
    function nextToggleState(index) {
      const current = getKnown(index);
      return current === null ? true : !current;
    }

    function isBusy(index) {
      return inflight.has(index);
    }

    /**
     * Richiede uno stato.
     * @param {number} index
     * @param {boolean|null} desiredState  null/undefined = inverti (toggle)
     * @param {object} handlers { urlFor(state) -> string }
     */
    function request(index, desiredState, handlers) {
      const desired = (desiredState === null || desiredState === undefined)
        ? nextToggleState(index)
        : Boolean(desiredState);

      // Una sola richiesta in volo per luce: le ravvicinate si scartano.
      if (inflight.has(index)) {
        opts.log(`[luce ${index}] comando in corso, richiesta ravvicinata ignorata`);
        return inflight.get(index);
      }

      // Debounce: stessa richiesta ripetuta a raffica → una sola.
      const last = lastSent.get(index);
      if (last && last.state === desired && Date.now() - last.at < opts.debounce) {
        opts.log(`[luce ${index}] richiesta identica ignorata (debounce)`);
        return Promise.resolve({ skipped: 'debounce' });
      }

      // Se lo stato noto coincide già col desiderato, non c'è niente da fare.
      // Con un trigger toggle questo è ciò che evita l'accensione a raffica.
      const current = getKnown(index);
      if (current !== null && current === desired) {
        opts.log(`[luce ${index}] già ${desired ? 'accesa' : 'spenta'}, nessun invio`);
        return Promise.resolve({ skipped: 'already' });
      }

      const task = (async () => {
        try {
          const url = handlers.urlFor(desired);
          if (!url) {
            opts.log(`[luce ${index}] nessun webhook configurato`);
            return { skipped: 'no-url' };
          }
          await opts.send(url);
          // Lo stato noto cambia solo ORA: il trigger è partito davvero.
          setKnown(index, desired);
          lastSent.set(index, { state: desired, at: Date.now() });
          opts.onChange(index, desired);
          return { sent: desired };
        } finally {
          // Il lock va liberato DOPO che la promessa è risolta, altrimenti
          // il chiamante la vede ancora occupata al proprio await.
          queueMicrotask(() => inflight.delete(index));
        }
      })();

      inflight.set(index, task);
      return task;
    }

    return { request, setKnown, getKnown, nextToggleState, isBusy };
  }

  global.SmartMirrorLights = { createLightController };
})(typeof window !== 'undefined' ? window : globalThis);
