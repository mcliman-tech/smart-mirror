# Deploy su GitHub Pages

Netlify è stato abbandonato: il piano gratuito è passato a un sistema a crediti
che si esaurisce. GitHub Pages non ha function (non servono più) e accetta file
fino a 100 MB, quindi il modello vocale da 48 MB ci sta.

## Cosa cambia nel codice

| Prima (Netlify) | Adesso (GitHub Pages) |
| --- | --- |
| `netlify/functions/news.js` leggeva i RSS | il browser legge i RSS direttamente, con un proxy CORS come ripiego (`app.js` → `fetchFeedText`) |
| URL `/.netlify/functions/news?feed=…` | URL del feed in `config.js` → `news.feeds[].url` |
| `netlify.toml` con gli header | `.nojekyll` nella cartella pubblicata |

Il file `netlify/functions/news.js` e `netlify.toml` restano nel repo come
documentazione: non vengono pubblicati.

## Struttura del repository

- `main` → il codice sorgente, i test, gli strumenti (`npm test`, `npm run bump`).
- `gh-pages` → **solo il sito**, generato da `tools/build-site.cjs`.

GitHub Pages pubblica il branch `gh-pages`, non la root di `main`: così la
cartella pubblicata contiene 53 MB di sito e nient'altro (niente test, niente
`.git`, niente screenshot da 9 MB).

## Pubblicare una modifica

```bash
cd ~/Documents/mirror
npm run bump          # incrementa la versione: obbligatorio, altrimenti l'iPad usa la cache
npm test              # devono passare tutti
npm run deploy        # rigenera _site e la pubblica su gh-pages
```

`npm run deploy` fa, in un colpo solo:

1. `node tools/build-site.cjs` → crea `_site/`;
2. crea (o aggiorna) il branch `gh-pages` con il contenuto di `_site/`;
3. lo carica su `origin`.

## Prima volta: creare il repository

```bash
gh auth login                     # una volta sola
gh repo create smart-mirror --public --source=. --remote=origin --push
```

Poi su GitHub: **Settings → Pages → Source: Deploy from a branch → `gh-pages` / (root)**.

L'indirizzo sarà `https://<utente>.github.io/smart-mirror/`.

## Se il repo è privato

GitHub Pages gratuito pubblica solo repository **pubblici**. Con un repo privato
servirebbe un piano a pagamento. Non c'è nulla di segreto nel sito (la API key
del meteo sta nel `localStorage` dell'iPad, non nel codice), quindi pubblico va
bene.

## Comandi npm

| Comando | Cosa fa |
| --- | --- |
| `npm test` | 33 test (comandi vocali, meteo, integrità, sempre acceso) |
| `npm run bump` | incrementa `version.js` |
| `npm run build` | rigenera `_site/` senza pubblicare |
| `npm run deploy` | build + pubblica su `gh-pages` |
| `npm run serve` | server locale sulla porta 8000 |
