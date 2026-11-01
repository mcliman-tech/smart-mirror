#!/usr/bin/env node
/* ============================================
   SMART MIRROR — Aggiorna la versione

   Uso:  npm run bump
   Incrementa il contatore in version.js (es. 20261101-1 → 20261101-2).
   Non serve toccare altro: index.html, il service worker e il manifest
   leggono tutti da lì.
   ============================================ */

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'version.js');
const source = fs.readFileSync(file, 'utf8');

const match = source.match(/SM_VERSION\s*=\s*'(\d{8})-(\d+)'/);
if (!match) {
  console.error('❌ Formato inatteso in version.js: atteso SM_VERSION = \'AAAAMMGG-N\'');
  process.exit(1);
}

const [, day, counter] = match;
const next = `${day}-${Number(counter) + 1}`;
fs.writeFileSync(file, source.replace(match[0], `SM_VERSION = '${next}'`));

console.log(`✅ Versione aggiornata: ${day}-${counter} → ${next}`);
console.log('   Ora ricarica la pagina sull\'iPad (o aspetta che il service worker si aggiorni).');
