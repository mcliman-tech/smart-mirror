/* ============================================
   SMART MIRROR — Preparazione della cartella di pubblicazione

   GitHub Pages pubblica SOLO ciò che sta nel branch gh-pages, e quel
   branch deve contenere soltanto il sito: codice, icone, modello vocale.
   Niente .git, niente test, niente screenshot da 9 MB.

   Uso:  node tools/build-site.cjs
   Crea ./_site pronto da copiare nel branch gh-pages.
   ============================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_site');

// Tutto ciò che serve al sito in produzione.
const INCLUDE = [
  'index.html',
  'version.js',
  'style.css',
  'config.js',
  'app.js',
  'voice.js',
  'sw.js',
  'manifest.json',
  'icons',
  'vendor',
  'models',
  'README.md',
];

function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(entry => copyRecursive(path.join(from, entry), path.join(to, entry)));
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

INCLUDE.forEach(item => {
  const source = path.join(ROOT, item);
  if (!fs.existsSync(source)) {
    console.warn(`⚠️  manca: ${item}`);
    return;
  }
  copyRecursive(source, path.join(OUT, item));
});

// GitHub Pages: niente Jekyll, altrimenti ignora le cartelle con underscore.
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// File di controllo per il dominio personalizzato (facoltativo).
fs.writeFileSync(path.join(OUT, 'CNAME'), '');
fs.rmSync(path.join(OUT, 'CNAME')); // lo si crea solo se serve un dominio

const size = (dir) => {
  let total = 0;
  const walk = (d) => fs.readdirSync(d).forEach(entry => {
    const p = path.join(d, entry);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p); else total += s.size;
  });
  walk(dir);
  return total;
};

console.log(`✅ Cartella di pubblicazione pronta: ${path.relative(ROOT, OUT)}`);
console.log(`   Dimensione: ${(size(OUT) / 1024 / 1024).toFixed(1)} MB`);
