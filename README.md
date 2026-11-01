# Smart Mirror

Specchio intelligente come PWA: orologio, meteo, calendario, notizie e comandi
vocali in italiano (riconoscimento **locale**, l'audio non esce dal dispositivo).
Nessun framework, nessuna build: solo HTML, CSS e JavaScript.

## Avvio in locale

```bash
cd ~/Documents/smart-mirror
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Serve un server HTTP (non `file://`): service worker e microfono richiedono
un'origine sicura (`localhost` o HTTPS).

## Struttura

| File | Cosa contiene |
| --- | --- |
| `index.html` | Struttura dei widget dello specchio |
| `style.css` | Stile, layout a specchio (testo chiaro su nero) |
| `config.js` | Configurazione: città, feed notizie, luci, intervalli |
| `app.js` | Orologio, meteo, qualità dell'aria, calendario, notizie, luci Alexa |
| `voice.js` | Riconoscimento vocale locale (Vosk), comandi e risposte TTS |
| `sw.js` | Service worker: cache offline, esclusa la cache del modello vocale |
| `manifest.json` | Metadati PWA (installazione su Home Screen) |
| `netlify/functions/news.js` | Function serverless che aggrega i feed RSS |
| `vendor/`, `models/` | Vosk Browser 0.0.8 e modello italiano small 0.22 |

## Configurazione

- **Città e meteo**: `config.js` → `weather`; la API key OpenWeatherMap si
  inserisce dal menu ⚙️ nell'app (salvata in `localStorage`).
- **Dati ambientali (aria, UV, alba/tramonto)**: coordinate in
  `config.js` → `environment` (Open-Meteo, nessuna chiave).
- **Luci**: webhook in `config.js` → `alexa.lights` oppure dal menu ⚙️.
- **Notizie**: elenco feed in `config.js` → `news.feeds`.

Nessun segreto va scritto nel codice: chiavi e webhook restano in `localStorage`.

## Comandi vocali

Meteo, ora, data, notizie, luci (accendi/spegni cucina o cortile), timer,
promemoria, luminosità, riepilogo, aiuto. L'elenco completo è in
`voice.js` → `processCommand()`.

## Deploy

Netlify, con `netlify.toml` (publish `.`, functions in `netlify/functions`).
Il modello vocale è servito con cache immutabile.

## Note

- Target di prova: iPad Air 2 in Safari via HTTPS, aggiunto alla Home Screen.
  Tenere l'app in primo piano: iPadOS sospende il microfono in background.
- Dettagli sul riconoscimento vocale: vedi `VOICE-RECOGNITION.md`.
