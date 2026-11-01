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
    feeds: [
      { id: 'casteddu', name: 'Casteddu Online', category: 'Cagliari · Casteddu' },
      { id: 'sardiniapost', name: 'SardiniaPost', category: 'Sardegna · SardiniaPost' },
      { id: 'ansa-sardegna', name: 'ANSA Sardegna', category: 'Sardegna · ANSA' },
      { id: 'unionesarda', name: "L'Unione Sarda", category: "Sardegna · L'Unione Sarda" },
      { id: 'breaking', name: 'Adnkronos', category: "Italia · Ultim'ora" },
      { id: 'frontpage', name: 'Adnkronos Prima Pagina', category: 'Italia · Adnkronos' },
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
