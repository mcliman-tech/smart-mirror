/* ============================================
   SMART MIRROR — Versione (unico punto di verità)

   Cambia SOLO questo numero quando modifichi un file della PWA.
   index.html, il service worker e il manifest leggono da qui:
   niente più ?v=27 copiato a mano in dieci posti diversi.

   Cache-busting: viene letto come parametro della query
   (es. app.js?v=20261101-1) così il browser ricarica i file nuovi.
   ============================================ */

self.SM_VERSION = '20261101-9';
