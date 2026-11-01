# Smart Mirror

Specchio intelligente come PWA: orologio, meteo, calendario, notizie e comandi
vocali in italiano (riconoscimento **locale**, l'audio non esce dal dispositivo).
Nessun framework, nessuna build: solo HTML, CSS e JavaScript.

Obiettivo d'uso: un iPad Air 2 lasciato sempre acceso in casa, come pannello
di consultazione e controllo.

## Avvio in locale

```bash
cd ~/Documents/mirror
npm run serve        # oppure: python3 -m http.server 8000
# poi apri http://localhost:8000
```

Serve un server HTTP (non `file://`): service worker e microfono richiedono
un'origine sicura (`localhost` o HTTPS).

## Comandi utili

```bash
npm test             # 31 test: comandi vocali, meteo, integrità, "sempre acceso"
npm run bump         # incrementa la versione (version.js)
npm run serve        # server locale sulla porta 8000
```

## Struttura

| File | Cosa contiene |
| --- | --- |
| `index.html` | Struttura dei widget dello specchio |
| `version.js` | **Unico punto di verità** della versione (cache-busting) |
| `style.css` | Stile, layout a specchio (testo chiaro su nero) |
| `config.js` | Configurazione: città, feed notizie, luci, intervalli |
| `app.js` | Orologio, meteo, qualità dell'aria, calendario, notizie, luci, wake lock |
| `voice.js` | Riconoscimento vocale locale (Vosk), comandi, TTS, sveglia |
| `sw.js` | Service worker: cache offline e aggiornamento automatico orario |
| `manifest.json` | Metadati PWA (installazione su Home Screen) |
| `netlify/functions/news.js` | Function serverless che aggrega i feed RSS |
| `vendor/`, `models/` | Vosk Browser 0.0.8 e modello italiano small 0.22 |
| `tests/` | Test Node (nessuna dipendenza esterna) |
| `tools/bump-version.cjs` | Script per incrementare la versione |

## Configurazione

- **Città e meteo**: `config.js` → `weather`; la API key OpenWeatherMap si
  inserisce dal menu ⚙️ nell'app (salvata in `localStorage`).
- **Dati ambientali (aria, UV, alba/tramonto)**: coordinate in
  `config.js` → `environment` (Open-Meteo, nessuna chiave).
- **Luci**: webhook in `config.js` → `alexa.lights` oppure dal menu ⚙️.
- **Notizie**: elenco feed in `config.js` → `news.feeds`.

Nessun segreto va scritto nel codice: chiavi e webhook restano in `localStorage`.

### Il meteo non mente

Se la chiave OpenWeatherMap manca o la chiamata fallisce, lo specchio mostra
`--°` e un'etichetta esplicita (*Meteo non configurato* / *Meteo non
disponibile*), mai numeri inventati. In caso di errore riprova ogni 2 minuti
finché non torna online.

## Comandi vocali

Meteo, ora, data, notizie, luci (accendi/spegni cucina o cortile), timer,
promemoria, luminosità, riepilogo, aiuto. Durante una sveglia basta dire
"stop". L'elenco completo è in `voice.js` → `processCommand()`.

## Tenere lo specchio acceso per giorni

1. Apri il sito in **Safari** via HTTPS, poi *Condividi → Aggiungi a Home*.
2. Apri l'app dalla Home: parte a schermo intero, senza barre.
3. Tocca il microfono una volta: sblocca l'audio e avvia l'ascolto locale.
4. In *Impostazioni → Display e luminosità → Blocco automatico* metti
   **Mai** (o 15 minuti come compromesso). Il wake lock della pagina aiuta,
   ma iPadOS può revocarlo: il blocco automatico è la rete di sicurezza.
5. Alimentatore sempre collegato; *Risparmio energetico* disattivato.

Cosa fa l'app per restare viva da sola:

- richiede di nuovo il wake lock ogni 30 secondi e al ritorno in primo piano;
- al ritorno in primo piano rinfresca meteo e dati ambientali;
- controlla ogni ora se c'è una versione nuova e, se c'è, si ricarica da sola;
- meteo e dati ambientali in errore vengono ritentati automaticamente;
- la sveglia del timer continua a suonare finché non la si ferma.

## Deploy

Netlify, con `netlify.toml` (publish `.`, functions in `netlify/functions`).
Il modello vocale è servito con cache immutabile.

**Prima di ogni deploy**: `npm run bump`, altrimenti l'iPad può continuare a
usare i file vecchi dalla cache.

## Note

- Target: iPad Air 2 in Safari via HTTPS, aggiunto alla Home Screen.
  Tenere l'app in primo piano: iPadOS sospende il microfono in background.
- Dettagli sul riconoscimento vocale: vedi `VOICE-RECOGNITION.md`.
