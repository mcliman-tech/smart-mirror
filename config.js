/* ============================================
   SMART MIRROR — Configurazione
   ============================================ */

if (localStorage.getItem('sm_city') === 'Roma, IT') {
  localStorage.setItem('sm_city', 'Sinnai, Sardegna, IT');
}

const CONFIG = {
  // ── Meteo (OpenWeatherMap) ──
  weather: {
    apiKey: localStorage.getItem('sm_weather_api') || '',   // Inserisci la tua API key OpenWeatherMap
    city: localStorage.getItem('sm_city') || 'Sinnai, Sardegna, IT',
    units: 'metric',
    lang: 'it',
    updateInterval: 15 * 60 * 1000, // 15 minuti
  },

  // ── Qualità dell'aria, UV e luce solare (Open-Meteo, coordinate di Sinnai) ──
  environment: {
    latitude: 39.30286,
    longitude: 9.20283,
    location: 'Sinnai',
    updateInterval: 30 * 60 * 1000,
  },

  // ── Notizie locali, regionali e nazionali ──
  news: {
    // Ogni feed porta con sé il proprio URL: niente più function server-side.
    // Se un feed non manda gli header CORS, app.js ripiega su un proxy pubblico.
    feeds: [
      { id: 'casteddu', name: 'Casteddu Online', category: 'Cagliari · Casteddu',
        url: 'https://www.castedduonline.it/feed/' },
      { id: 'sardiniapost', name: 'SardiniaPost', category: 'Sardegna · SardiniaPost',
        url: 'https://www.sardiniapost.it/feed/' },
      { id: 'ansa-sardegna', name: 'ANSA Sardegna', category: 'Sardegna · ANSA',
        url: 'https://www.ansa.it/sardegna/notizie/sardegna_rss.xml' },
      { id: 'unionesarda', name: "L'Unione Sarda", category: "Sardegna · L'Unione Sarda",
        url: 'https://www.unionesarda.it/sitemaps/rss' },
      { id: 'breaking', name: 'Adnkronos', category: "Italia · Ultim'ora",
        url: 'https://www.adnkronos.com/RSS_Ultimora.xml' },
      { id: 'frontpage', name: 'Adnkronos Prima Pagina', category: 'Italia · Adnkronos',
        url: 'https://www.adnkronos.com/RSS_PrimaPagina.xml' },
    ],
    rotateInterval: 9 * 1000, // 9 secondi per notizia
    maxItems: 25,
  },

  // ── Calendario (aggiornamento data) ──
  calendar: {
    updateInterval: 60 * 1000, // 1 minuto
  },

  // ── Luci Alexa (Virtual Smart Home / IFTTT / Webhook) ──
  // Configura gli URL dei webhook dal menu ⚙️; non inserire token nel codice sorgente.
  alexa: {
    lights: [
      {
        id: 'light-1',
        name: 'Luce Cucina',
        icon: '💡',
        state: false,
        webhookOn: '',
        webhookOff: '',
        webhook: '',
      },
      {
        id: 'light-2',
        name: 'Luce Cortile',
        icon: '💡',
        state: false,
        webhookOn: '',
        webhookOff: '',
        webhook: '',
      },
    ],
  },

  // ── Generale ──
  screenSaverTimeout: 0, // 0 = disabilitato
};
