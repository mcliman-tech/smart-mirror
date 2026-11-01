#!/usr/bin/env node
/* ============================================
   SMART MIRROR — Pubblica su GitHub Pages

   Uso:  npm run deploy

   Crea il branch gh-pages con il contenuto di _site/ e lo carica su origin.
   Non tocca il branch main: si può sempre tornare indietro.
   ============================================ */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, '_site');

const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
const capture = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();

// 1. Costruisce la cartella di pubblicazione
run('node tools/build-site.cjs');

if (!fs.existsSync(SITE)) {
  console.error('❌ _site non creata.');
  process.exit(1);
}

// 2. Verifica che esista un remote
let remote = '';
try {
  remote = capture('git remote get-url origin');
} catch {
  console.error('❌ Nessun remote "origin". Prima: gh repo create smart-mirror --public --source=. --remote=origin --push');
  process.exit(1);
}

const version = fs.readFileSync(path.join(ROOT, 'version.js'), 'utf8').match(/SM_VERSION\s*=\s*'([^']+)'/)?.[1] || 'dev';
console.log(`🚀 Pubblico la versione ${version} su ${remote}`);

// 3. Crea un albero git temporaneo con il solo contenuto del sito
const tree = capture(`git --work-tree="${SITE}" add -A -- . && git write-tree`);
const commit = capture(`git commit-tree ${tree} -m "Deploy Smart Mirror ${version}"`);
run(`git update-ref refs/heads/gh-pages ${commit}`);

// 4. Carica il branch
run('git push -f origin gh-pages');

// 5. Riporta l'index del repo principale allo stato reale
try {
  run('git reset -q');
} catch {
  /* nessun problema se fallisce */
}

console.log('\n✅ Pubblicato.');
console.log('   GitHub Pages impiega circa un minuto a servire la nuova versione.');
console.log('   Sull\'iPad: chiudi e riapri l\'app dalla Home, oppure aspetta il ricaricamento automatico.');
