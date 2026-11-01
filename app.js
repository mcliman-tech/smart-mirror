/* ============================================
   SMART MIRROR — App Logic
   ============================================ */

// ── Utility ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

const WEATHER_ICONS = {
  '01d': '☀️', '01n': '🌙',
  '02d': '⛅', '02n': '☁️',
  '03d': '☁️', '03n': '☁️',
  '04d': '☁️', '04n': '☁️',
  '09d': '🌧️', '09n': '🌧️',
  '10d': '🌦️', '10n': '🌧️',
  '11d': '⛈️', '11n': '⛈️',
  '13d': '❄️', '13n': '❄️',
  '50d': '🌫️', '50n': '🌫️',
};

// ============================================
// CLOCK & DATE
// ============================================
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');

  $('#clock-time').textContent = `${h}:${m}`;
  $('#clock-seconds').textContent = s;

  const day = DAYS[now.getDay()];
  const date = now.getDate();
  const month = MONTHS[now.getMonth()];
  const year = now.getFullYear();
  $('#clock-date').textContent = `${day} ${date} ${month} ${year}`;

  // Saluto
  const hour = now.getHours();
  let greeting = '';
  if (hour >= 5 && hour < 12) greeting = '🌅 Buongiorno';
  else if (hour >= 12 && hour < 18) greeting = '☀️ Buon pomeriggio';
  else if (hour >= 18 && hour < 22) greeting = '🌆 Buonasera';
  else greeting = '🌙 Buonanotte';
  $('#clock-greeting').textContent = greeting;
}

// ============================================
// WEATHER
// ============================================
let weatherData = null;

// Stato del meteo, per non spacciare mai dati finti per reali.
// 'unconfigured' | 'loading' | 'live' | 'stale' | 'error'
let weatherStatus = 'loading';
let weatherLastOk = 0;
let weatherRetryTimer = null;

function setWeatherStatus(status, message) {
  weatherStatus = status;
  const widget = document.getElementById('weather-widget');
  if (!widget) return;
  widget.dataset.status = status;
  widget.classList.toggle('is-unconfigured', status === 'unconfigured');
  widget.classList.toggle('is-error', status === 'error');
  widget.classList.toggle('is-stale', status === 'stale');
  const badge = document.getElementById('weather-source');
  if (badge) {
    badge.textContent = message || '';
    badge.hidden = !message;
  }
}

async function updateWeather() {
  const { apiKey, city, units, lang } = CONFIG.weather;

  if (!apiKey) {
    showDemoWeather();
    setWeatherStatus('unconfigured', 'Meteo non configurato · aggiungi la chiave dal menu ⚙️');
    return;
  }

  try {
    // Current weather
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${units}&lang=${lang}&appid=${apiKey}`
    );
    const data = await res.json();

    if (data.cod !== 200) {
      console.error('Weather API error:', data.cod, data.message);
      showDemoWeather();
      const reason = Number(data.cod) === 401
        ? 'chiave non valida o non ancora attiva (può servire fino a 2 ore)'
        : Number(data.cod) === 404
          ? `città "${city}" non trovata`
          : Number(data.cod) === 429
            ? 'troppe richieste, limite giornaliero raggiunto'
            : 'errore del servizio meteo';
      setWeatherStatus('error', `Meteo non disponibile · ${reason}`);
      return;
    }

    weatherData = data;
    weatherLastOk = Date.now();
    const icon = WEATHER_ICONS[data.weather[0].icon] || '🌡️';
    $('#weather-icon').textContent = icon;
    $('#weather-temp').textContent = `${Math.round(data.main.temp)}°`;
    $('#weather-desc').textContent = data.weather[0].description;
    $('#weather-humidity').textContent = `💧 ${data.main.humidity}%`;
    renderWindAndRain(data);
    $('#weather-location').textContent = `📍 ${data.name}`;
    setWeatherStatus('live', '');

    // Forecast
    const forecastRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=${units}&lang=${lang}&appid=${apiKey}`
    );
    const forecastData = await forecastRes.json();
    renderForecast(forecastData);

  } catch (err) {
    console.error('Weather fetch error:', err);
    showDemoWeather();
    setWeatherStatus('error', 'Meteo non disponibile · riprovo tra 2 minuti');
  }
}

// Vento e pioggia: se un dato manca lo diciamo, non lo inventiamo.
// OpenWeatherMap manda `rain`/`snow` solo quando piove o nevica davvero:
// l'assenza del campo significa "asciutto", non "dato mancante".
function renderWindAndRain(data) {
  const windEl = $('#weather-wind');
  const rainEl = $('#weather-rain');
  if (!windEl || !rainEl) return;

  // ── Vento ──
  const speed = data.wind?.speed;
  if (Number.isFinite(speed)) {
    const kmh = Math.round(speed * 3.6);
    const gust = data.wind?.gust;
    const dir = Number.isFinite(data.wind?.deg) ? ` ${windDirectionLabel(data.wind.deg)}` : '';
    windEl.textContent = `💨 ${kmh}${dir} km/h`;
    windEl.title = Number.isFinite(gust)
      ? `Vento ${kmh} km/h, raffiche fino a ${Math.round(gust * 3.6)} km/h`
      : `Vento ${kmh} km/h`;
    windEl.classList.remove('is-missing');
  } else {
    windEl.textContent = '💨 vento n/d';
    windEl.title = 'Il servizio meteo non fornisce il vento per questa località.';
    windEl.classList.add('is-missing');
  }

  // ── Pioggia ──
  const rain1h = data.rain?.['1h'];
  const rain3h = data.rain?.['3h'];
  const snow1h = data.snow?.['1h'];
  const snow3h = data.snow?.['3h'];
  const mm = Number.isFinite(rain1h) ? `${rain1h} mm/ultima ora`
    : Number.isFinite(rain3h) ? `${rain3h} mm/3h`
    : null;
  const snow = Number.isFinite(snow1h) ? `${snow1h} cm neve`
    : Number.isFinite(snow3h) ? `${snow3h} cm neve/3h`
    : null;

  if (mm || snow) {
    rainEl.textContent = `🌧️ ${[mm, snow].filter(Boolean).join(' · ')}`;
    rainEl.title = 'Precipitazioni misurate nella località.';
    rainEl.classList.remove('is-missing');
  } else if (Number.isFinite(data.main?.humidity)) {
    // Nessun campo rain = non sta piovendo adesso.
    rainEl.textContent = '🌧️ asciutto';
    rainEl.title = 'Nessuna precipitazione in corso secondo il servizio meteo.';
    rainEl.classList.remove('is-missing');
  } else {
    rainEl.textContent = '🌧️ pioggia n/d';
    rainEl.title = 'Il servizio meteo non fornisce le precipitazioni.';
    rainEl.classList.add('is-missing');
  }
}

function windDirectionLabel(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return names[Math.round(((deg % 360) / 45)) % 8];
}

// ============================================
// DIAGNOSI DELLA CHIAVE METEO
// Dice esattamente cosa non va, invece di un generico "chiave non valida".
// ============================================
async function verifyWeatherKey(apiKey) {
  const target = $('#weather-key-status');
  const report = (text, ok) => {
    if (!target) return;
    target.textContent = text;
    target.className = `weather-key-status ${ok ? 'ok' : 'ko'}`;
  };

  if (!apiKey) {
    report('Nessuna chiave inserita.', false);
    return;
  }
  if (!/^[a-f0-9]{32}$/i.test(apiKey)) {
    report(`La chiave ha ${apiKey.length} caratteri: dovrebbero essere 32. Controlla di aver copiato tutta la riga.`, false);
    return;
  }

  report('Verifico la chiave…', true);
  const city = CONFIG.weather.city;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&lang=it&appid=${apiKey}`
    );
    const data = await res.json();

    if (Number(data.cod) === 200) {
      report(`✅ Chiave valida · ${data.name}: ${Math.round(data.main.temp)}°`, true);
      return;
    }

    const messages = {
      401: 'Chiave non valida o non ancora attiva. Una chiave nuova impiega da 10 minuti a 2 ore prima di funzionare.',
      429: 'Troppe richieste: il piano gratuito è stato superato per oggi.',
      404: `Città non trovata: "${city}". Prova con il formato "Sinnai,IT".`,
    };
    report(`❌ ${messages[Number(data.cod)] || data.message || 'Risposta inattesa dall\'API.'}`, false);
  } catch (error) {
    report('❌ Impossibile contattare OpenWeatherMap: controlla la connessione.', false);
  }
}

// Ritenta più spesso quando qualcosa non va, così lo specchio si riprende da solo.
function scheduleWeatherRetry() {
  clearTimeout(weatherRetryTimer);
  weatherRetryTimer = setTimeout(async () => {
    if (weatherStatus === 'error' || weatherStatus === 'unconfigured') {
      await updateWeather();
    }
    scheduleWeatherRetry();
  }, weatherStatus === 'live' ? CONFIG.weather.updateInterval : 2 * 60 * 1000);
}

// ============================================
// AIR QUALITY, UV, SUNRISE / SUNSET (Open-Meteo)
// ============================================
function getEuropeanAirQualityLabel(value) {
  if (value <= 20) return 'buona';
  if (value <= 40) return 'discreta';
  if (value <= 60) return 'moderata';
  if (value <= 80) return 'scarsa';
  if (value <= 100) return 'molto scarsa';
  return 'estremamente scarsa';
}

async function updateAirQuality() {
  const { latitude, longitude } = CONFIG.environment;
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: 'european_aqi,pm2_5,pm10',
    timezone: 'Europe/Rome',
  });

  try {
    const response = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const air = data.current;
    if (!air || !Number.isFinite(air.european_aqi)) {
      throw new Error('Dati di qualità dell’aria non disponibili.');
    }

    const element = $('#air-quality');
    element.textContent = `🌫️ Aria ${Math.round(air.european_aqi)} · ${getEuropeanAirQualityLabel(air.european_aqi)}`;
    element.title = `Indice europeo ${Math.round(air.european_aqi)} · PM2.5 ${air.pm2_5 ?? '—'} µg/m³ · PM10 ${air.pm10 ?? '—'} µg/m³. Stima esterna per ${CONFIG.environment.location}.`;
  } catch (error) {
    console.error('Qualità dell’aria non disponibile:', error);
    $('#air-quality').textContent = '🌫️ Aria n/d';
    $('#air-quality').title = 'Dati di qualità dell’aria temporaneamente non disponibili.';
  }
}

async function updateSunAndUv() {
  const { latitude, longitude } = CONFIG.environment;
  const params = new URLSearchParams({
    latitude,
    longitude,
    daily: 'sunrise,sunset,uv_index_max',
    timezone: 'Europe/Rome',
    forecast_days: '1',
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { daily } = await response.json();
    const sunrise = daily?.sunrise?.[0]?.slice(-5);
    const sunset = daily?.sunset?.[0]?.slice(-5);
    const uvMax = daily?.uv_index_max?.[0];
    if (!sunrise || !sunset || !Number.isFinite(uvMax)) {
      throw new Error('Dati UV e luce solare non disponibili.');
    }

    $('#uv-index').textContent = `☀️ UV max ${uvMax.toFixed(1)}`;
    $('#sunrise-time').textContent = `🌅 Alba ${sunrise}`;
    $('#sunset-time').textContent = `🌇 Tramonto ${sunset}`;
  } catch (error) {
    console.error('Indice UV e orari solari non disponibili:', error);
    $('#uv-index').textContent = '☀️ UV n/d';
    $('#sunrise-time').textContent = '🌅 Alba n/d';
    $('#sunset-time').textContent = '🌇 Tramonto n/d';
  }
}

function updateEnvironmentalData() {
  updateAirQuality();
  updateSunAndUv();
}

async function getWeatherForCurrentLocation() {
  const { apiKey, units, lang } = CONFIG.weather;
  if (!apiKey) {
    throw new Error('Aggiungi la chiave OpenWeather nelle impostazioni per chiedere il meteo.');
  }
  if (!navigator.geolocation) {
    throw new Error('La posizione non è disponibile in questo browser.');
  }

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 5 * 60 * 1000,
      timeout: 15000,
    });
  });
  const query = `lat=${position.coords.latitude}&lon=${position.coords.longitude}`;
  const params = `units=${units}&lang=${lang}&appid=${encodeURIComponent(apiKey)}`;
  const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?${query}&${params}`);
  const data = await response.json();

  if (!response.ok || Number(data.cod) !== 200) {
    throw new Error(data.message || 'Non riesco a recuperare il meteo per la tua posizione.');
  }

  weatherData = data;
  const condition = data.weather?.[0]?.description || 'condizioni non disponibili';
  const temperature = Math.round(data.main.temp);
  const city = data.name || 'la tua posizione';
  $('#weather-icon').textContent = WEATHER_ICONS[data.weather?.[0]?.icon] || '🌡️';
  $('#weather-temp').textContent = `${temperature}°`;
  $('#weather-desc').textContent = condition;
  $('#weather-humidity').textContent = `💧 ${data.main.humidity}%`;
  $('#weather-wind').textContent = `💨 ${Math.round(data.wind.speed * 3.6)} km/h`;
  $('#weather-location').textContent = `📍 ${city}`;

  const forecastResponse = await fetch(`https://api.openweathermap.org/data/2.5/forecast?${query}&${params}`);
  if (forecastResponse.ok) {
    renderForecast(await forecastResponse.json());
  }

  return { city, condition, temperature };
}

function showDemoWeather() {
  // ATTENZIONE: questi sono dati di esempio, NON letture reali.
  // Vengono mostrati solo senza chiave API o in caso di errore, sempre
  // accompagnati dall'etichetta "dati di esempio" (vedi setWeatherStatus).
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour > 20;

  $('#weather-icon').textContent = isNight ? '🌙' : '☀️';
  $('#weather-temp').textContent = '--°';
  $('#weather-desc').textContent = isNight ? 'sereno (esempio)' : 'soleggiato (esempio)';
  $('#weather-humidity').textContent = '💧 --%';
  $('#weather-wind').textContent = '💨 -- km/h';
  $('#weather-location').textContent = `📍 ${CONFIG.weather.city.split(',')[0]}`;

  // Demo forecast
  const demoForecast = [
    { day: 'Lun', icon: '☀️', temp: '--' },
    { day: 'Mar', icon: '⛅', temp: '--' },
    { day: 'Mer', icon: '🌧️', temp: '--' },
    { day: 'Gio', icon: '⛅', temp: '--' },
    { day: 'Ven', icon: '☀️', temp: '--' },
  ];

  const forecastHTML = demoForecast.map(d =>
    `<div class="forecast-day">
       <span class="forecast-label">${d.day}</span>
       <span class="forecast-icon">${d.icon}</span>
       <span class="forecast-temp">${d.temp}</span>
     </div>`
  ).join('');
  $('#weather-forecast').innerHTML = forecastHTML;
}

function renderForecast(data) {
  if (!data || !data.list) return;

  // Get one entry per day (noon)
  const days = {};
  data.list.forEach(item => {
    const date = new Date(item.dt * 1000);
    const key = date.toDateString();
    if (!days[key] && date.getHours() >= 11 && date.getHours() <= 14) {
      days[key] = item;
    }
  });

  const forecasts = Object.entries(days).slice(0, 5);
  const shortDays = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

  const forecastHTML = forecasts.map(([_, item]) => {
    const date = new Date(item.dt * 1000);
    const icon = WEATHER_ICONS[item.weather[0].icon] || '🌡️';
    return `<div class="forecast-day">
              <span class="forecast-label">${shortDays[date.getDay()]}</span>
              <span class="forecast-icon">${icon}</span>
              <span class="forecast-temp">${Math.round(item.main.temp)}°</span>
            </div>`;
  }).join('');

  $('#weather-forecast').innerHTML = forecastHTML;
}

// ============================================
// CALENDAR (Grande Calendario Mensile)
// ============================================
function updateCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();

  // Header Mese e Anno
  const monthName = MONTHS[month].toUpperCase();
  const monthYearEl = $('#cal-month-year');
  if (monthYearEl) {
    monthYearEl.textContent = `${monthName} ${year}`;
  }

  // Giorno odierno in risalto
  const dayName = DAYS[now.getDay()];
  const todayFullEl = $('#cal-today-full');
  if (todayFullEl) {
    todayFullEl.textContent = `${dayName} ${todayDate}`;
  }

  const daysContainer = $('#calendar-days');
  if (!daysContainer) return;

  // Primo giorno del mese corrente
  const firstDayOfMonth = new Date(year, month, 1);
  // getDay(): 0 = Domenica, 1 = Lunedì... Convertiamo a Lunedì = 0 ... Domenica = 6
  let startingDay = firstDayOfMonth.getDay() - 1;
  if (startingDay === -1) startingDay = 6;

  // Giorni totali nel mese corrente
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Giorni nel mese precedente (per riempire i vuoti a inizio mese)
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  let html = '';

  // Giorni finali del mese precedente
  for (let i = startingDay - 1; i >= 0; i--) {
    const prevDay = daysInPrevMonth - i;
    html += `<div class="cal-day other-month">${prevDay}</div>`;
  }

  // Giorni del mese corrente (con oggi in evidenza)
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = day === todayDate;
    if (isToday) {
      html += `<div class="cal-day today"><span class="today-circle">${day}</span></div>`;
    } else {
      html += `<div class="cal-day">${day}</div>`;
    }
  }

  // Giorni iniziali del mese successivo per completare le righe
  const totalRendered = startingDay + daysInMonth;
  const remainingCells = (7 - (totalRendered % 7)) % 7;
  for (let nextDay = 1; nextDay <= remainingCells; nextDay++) {
    html += `<div class="cal-day other-month">${nextDay}</div>`;
  }

  daysContainer.innerHTML = html;
}

// ============================================
// ALEXA LIGHTS (Controllo Luci Casa)
// ============================================
function loadAlexaLights() {
  // 1. Prima la configurazione locale (config.local.js): contiene i webhook
  //    veri e non viene pubblicata su GitHub.
  const localLights = window.SM_LOCAL_CONFIG?.alexa?.lights;
  if (Array.isArray(localLights)) {
    localLights.forEach((local, index) => {
      const current = CONFIG.alexa.lights[index];
      if (!current || !local) return;
      CONFIG.alexa.lights[index] = {
        ...current,
        name: local.name || current.name,
        webhookOn: local.webhookOn || current.webhookOn || '',
        webhookOff: local.webhookOff || current.webhookOff || '',
        webhook: local.webhookOn || local.webhookOff || current.webhook || '',
      };
    });
  }

  // 2. Poi ciò che è stato salvato dal pannello su questo dispositivo.
  try {
    const saved = localStorage.getItem('sm_alexa_lights');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        for (let i = 0; i < 2; i++) {
          CONFIG.alexa.lights[i] = {
            ...CONFIG.alexa.lights[i],
            ...parsed[i],
            // Mantieni i webhook se presenti in config.js e non in localStorage
            webhookOn: parsed[i].webhookOn || CONFIG.alexa.lights[i].webhookOn || parsed[i].webhook || '',
            webhookOff: parsed[i].webhookOff || CONFIG.alexa.lights[i].webhookOff || '',
            webhook: parsed[i].webhook || CONFIG.alexa.lights[i].webhook || '',
          };
        }
      }
    }
  } catch (e) {
    console.warn('Errore lettura localStorage luci:', e);
  }

  // Lo stato salvato è l'unica verità all'avvio: il controllore deve
  // conoscerlo, altrimenti con un trigger toggle il primo tocco sbaglia.
  const controller = getLightController();
  CONFIG.alexa.lights.forEach((light, index) => {
    controller.setKnown(index, Boolean(light.state));
  });
}

function renderAlexaLights() {
  const container = $('#alexa-grid');
  if (!container) return;

  const lights = CONFIG.alexa.lights;
  const activeCount = lights.filter(l => l.state).length;
  const countEl = $('#alexa-active-count');
  if (countEl) {
    countEl.textContent = activeCount === 0 ? 'Tutte spente' : `${activeCount} ${activeCount === 1 ? 'accesa' : 'accese'}`;
    countEl.className = `alexa-status-text ${activeCount > 0 ? 'active' : ''}`;
  }

  container.replaceChildren(...lights.map((light, index) => {
    const isOn = Boolean(light.state);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `alexa-btn ${isOn ? 'on' : 'off'}`;
    button.addEventListener('click', () => toggleAlexaLight(index));

    const bulb = document.createElement('div');
    bulb.className = 'alexa-btn-bulb';
    bulb.textContent = isOn ? '💡' : '🌑';

    const content = document.createElement('div');
    content.className = 'alexa-btn-content';
    const name = document.createElement('div');
    name.className = 'alexa-btn-name';
    name.textContent = light.name;
    const state = document.createElement('div');
    state.className = 'alexa-btn-state';
    state.textContent = isOn ? 'ACCESA' : 'SPENTA';
    content.append(name, state);
    button.append(bulb, content);
    return button;
  }));
}

function isValidWebhookUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sendWebhook(url) {
  if (!url || !isValidWebhookUrl(url)) {
    console.warn('Webhook non configurato o URL non valido.');
    return;
  }
  console.log('💡 Invio trigger webhook.');
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('_sm_ts', Date.now());
  fetch(requestUrl.href, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
    .catch(err => console.warn('Invio webhook non riuscito:', err));
}

async function setAlexaLight(index, targetState) {
  const light = CONFIG.alexa.lights[index];
  if (!light) return;

  const nextState = Boolean(targetState);

  if (!hasAnyWebhook(light)) {
    const countEl = $('#alexa-active-count');
    if (countEl) {
      countEl.textContent = 'Configura i webhook ⚙️';
      setTimeout(renderAlexaLights, 3000);
    }
    if (window.voiceControl && typeof window.voiceControl.respond === 'function') {
      window.voiceControl.respond('Configura i webhook delle luci nelle impostazioni.');
    }
    return;
  }

  // Passa dal controllore: una sola richiesta in volo per luce, niente
  // raffiche di accensione/spegnimento con i trigger toggle.
  const controller = getLightController();
  const result = await controller.request(index, nextState, {
    urlFor: state => buildLightUrl(light, state),
  });

  if (result && result.skipped === 'already') {
    // Già nello stato richiesto: nessun invio, nessun suono, nessun lampeggio.
    return;
  }
  if (result && result.sent !== undefined) {
    // Feedback sonoro se voiceControl è pronto
    if (window.voiceControl && typeof window.voiceControl.playChime === 'function') {
      window.voiceControl.playChime('wake');
    }
  }
}

function hasAnyWebhook(light) {
  return Boolean(light.webhookOn || light.webhookOff || light.webhook);
}

// Costruisce l'URL da chiamare per portare la luce in `state`.
// Con webhook separati ON/OFF l'invio è idempotente (ripetibile).
// Con un unico trigger toggle l'URL è lo stesso per entrambi gli stati.
function buildLightUrl(light, state) {
  const onUrl = (light.webhookOn || '').trim();
  const offUrl = (light.webhookOff || '').trim();
  const singleUrl = (light.webhook || '').trim();

  // Con un solo trigger l'URL è lo stesso per accendere e spegnere:
  // è un interruttore, non due comandi.
  if (!offUrl && !onUrl) return singleUrl && isValidWebhookUrl(singleUrl) ? singleUrl : '';

  const targetUrl = state
    ? (onUrl || singleUrl || offUrl)
    : (offUrl || onUrl || singleUrl);

  if (!targetUrl || !isValidWebhookUrl(targetUrl)) return '';

  // virtualsmarthome: activate.php fa da toggle, non accetta un parametro
  // di stato affidabile: si manda così com'è, senza aggiungere nulla.
  if (targetUrl.includes('activate.php')) return targetUrl;

  // Un solo trigger (toggle) e nessun OFF dedicato: stesso URL, nessun
  // parametro inventato — l'interruttore sa invertire da solo.
  const hasSeparateOff = Boolean(offUrl && isValidWebhookUrl(offUrl));
  const hasSeparateOn = Boolean(onUrl && isValidWebhookUrl(onUrl));
  if (!hasSeparateOff || !hasSeparateOn) {
    const requestUrl = new URL(targetUrl);
    if (light.sendStateParam) {
      requestUrl.searchParams.set('state', state ? 'on' : 'off');
    }
    return requestUrl.href;
  }

  return targetUrl;
}

// Un solo controllore per tutta l'app.
let lightControllerInstance = null;
function getLightController() {
  if (lightControllerInstance) return lightControllerInstance;
  const factory = window.SmartMirrorLights?.createLightController;
  if (!factory) {
    // Ripiego: senza lights.js si comporta come prima.
    lightControllerInstance = {
      request: async (index, state, handlers) => {
        const url = handlers.urlFor(state);
        if (!url) return { skipped: 'no-url' };
        sendWebhook(url);
        return { sent: state };
      },
      setKnown: () => {},
      getKnown: () => null,
    };
    return lightControllerInstance;
  }

  lightControllerInstance = factory({
    send: (url) => {
      sendWebhook(url);
      return Promise.resolve();
    },
    onChange: (index, state) => {
      const light = CONFIG.alexa.lights[index];
      if (!light) return;
      light.state = state;
      saveAlexaLightsState();
      renderAlexaLights();
    },
    log: (message) => console.log(message),
  });
  return lightControllerInstance;
}

async function toggleAlexaLight(index) {
  const light = CONFIG.alexa.lights[index];
  if (!light) return;
  await setAlexaLight(index, !light.state);
}

function saveAlexaLightsState() {
  localStorage.setItem('sm_alexa_lights', JSON.stringify(CONFIG.alexa.lights));
}

// ============================================
// NEWS (Cagliari, Sardegna and national feeds)
// ============================================
let newsItems = [];
let currentNewsIndex = 0;
let newsRotateTimer = null;

// Alcuni lettori RSS non mandano gli header CORS, quindi il browser non può
// leggerli direttamente. Per quei feed passiamo da un proxy CORS pubblico.
// Se un feed risponde direttamente (come SardiniaPost) non serve nessun proxy.
const NEWS_CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
];

function extractNewsXml(text) {
  const trimmed = text.trim();
  // allorigins in modalità /get incapsula l'XML in JSON: lo estraiamo.
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      if (typeof data.contents === 'string') return data.contents;
    } catch (error) {
      console.warn('Risposta proxy non leggibile:', error.message);
    }
  }
  return trimmed;
}

// Scarica il testo di un feed: prima diretto, poi con i proxy in ordine.
async function fetchFeedText(url) {
  const attempts = [
    () => fetch(url, { cache: 'no-store' }),
    ...NEWS_CORS_PROXIES.map(proxy => () => fetch(proxy(url), { cache: 'no-store' })),
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const response = await attempt();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = extractNewsXml(await response.text());
      if (!text.includes('<item') && !text.includes('<entry')) {
        throw new Error('Il feed non contiene notizie.');
      }
      return text;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Feed non raggiungibile.');
}

async function fetchNews() {
  const feedResults = await Promise.all(CONFIG.news.feeds.map(async feed => {
    try {
      const text = await fetchFeedText(feed.url);
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      if (doc.querySelector('parsererror')) throw new Error('XML non valido.');

      const items = [...doc.querySelectorAll('item')].slice(0, 12);
      if (items.length === 0) throw new Error('Il feed non contiene notizie.');

      return items.flatMap(item => {
        const feedCategories = [...item.querySelectorAll('category')]
          .map(category => category.textContent.trim().toLocaleLowerCase('it-IT'));
        if (
          feed.id === 'casteddu' &&
          !feedCategories.some(category => ['cagliari', 'hinterland', 'area-vasta'].includes(category))
        ) {
          return [];
        }

        const title = (item.querySelector('title')?.textContent || '').trim();
        if (!title) return [];

        const rawDesc = item.querySelector('description')?.textContent || '';
        const desc = rawDesc
          .replace(/<!\[CDATA\[|\]\]>/g, '')
          .replace(/^\(Adnkronos\)\s*-\s*/i, '')
          .replace(/<[^>]+>/g, '')
          .trim();
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        const publishedAt = Date.parse(pubDate) || 0;
        const time = publishedAt
          ? `Ore ${new Date(publishedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
          : feed.name;

        return [{
          title,
          desc: desc || `Leggi il servizio completo su ${feed.name}.`,
          category: feed.category,
          time,
          publishedAt,
        }];
      });
    } catch (err) {
      console.error(`Errore caricamento feed ${feed.name}:`, err);
      return [];
    }
  }));

  const seenTitles = new Set();
  newsItems = feedResults
    .flat()
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter(item => {
      const normalizedTitle = item.title.toLocaleLowerCase('it-IT').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (!normalizedTitle || seenTitles.has(normalizedTitle)) return false;
      seenTitles.add(normalizedTitle);
      return true;
    })
    .slice(0, CONFIG.news.maxItems);
  currentNewsIndex = 0;
  if (newsItems.length === 0) {
    renderNewsUnavailable();
    startNewsRotation();
    return;
  }
  renderCurrentNews();
  startNewsRotation();
}

function renderNewsUnavailable() {
  const titleEl = $('#news-title');
  const descEl = $('#news-desc');
  const catEl = $('#news-cat');
  const timeEl = $('#news-time');
  const counterEl = $('#news-counter');
  const bar = $('#news-timer-bar');

  if (titleEl) titleEl.textContent = 'Notizie momentaneamente non disponibili';
  if (descEl) descEl.textContent = 'I feed locali e nazionali non rispondono. Riproverò tra qualche minuto.';
  if (catEl) catEl.textContent = 'FEED NON DISPONIBILE';
  if (timeEl) timeEl.textContent = '';
  if (counterEl) counterEl.textContent = '—';
  if (bar) {
    bar.style.transition = 'none';
    bar.style.width = '0%';
  }
}

function renderCurrentNews() {
  if (newsItems.length === 0) return;
  const item = newsItems[currentNewsIndex];

  const titleEl = $('#news-title');
  const descEl = $('#news-desc');
  const catEl = $('#news-cat');
  const timeEl = $('#news-time');
  const counterEl = $('#news-counter');

  if (titleEl) titleEl.textContent = item.title;
  if (descEl) descEl.textContent = item.desc;
  if (catEl) catEl.textContent = item.category.toUpperCase();
  if (timeEl) timeEl.textContent = item.time;
  if (counterEl) counterEl.textContent = `${currentNewsIndex + 1} / ${newsItems.length}`;

  // Reset e avvio progress bar
  const bar = $('#news-timer-bar');
  if (bar) {
    bar.style.transition = 'none';
    bar.style.width = '0%';
    setTimeout(() => {
      bar.style.transition = `width ${CONFIG.news.rotateInterval}ms linear`;
      bar.style.width = '100%';
    }, 50);
  }
}

function nextNews() {
  if (newsItems.length === 0) return;
  currentNewsIndex = (currentNewsIndex + 1) % newsItems.length;
  renderCurrentNews();
  resetNewsRotation();
}

function prevNews() {
  if (newsItems.length === 0) return;
  currentNewsIndex = (currentNewsIndex - 1 + newsItems.length) % newsItems.length;
  renderCurrentNews();
  resetNewsRotation();
}

function startNewsRotation() {
  clearInterval(newsRotateTimer);
  newsRotateTimer = setInterval(() => {
    if (newsItems.length > 1) {
      currentNewsIndex = (currentNewsIndex + 1) % newsItems.length;
      renderCurrentNews();
    }
  }, CONFIG.news.rotateInterval);
}

function resetNewsRotation() {
  startNewsRotation();
}

// ============================================
// SETTINGS
// ============================================
let tapCount = 0;
let tapTimer = null;

document.addEventListener('touchstart', (e) => {
  tapCount++;
  if (tapCount === 3) {
    toggleSettings();
    tapCount = 0;
    clearTimeout(tapTimer);
    return;
  }
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 500);
});

// Also support triple-click on desktop
document.addEventListener('click', (e) => {
  if (e.detail === 3) {
    toggleSettings();
  }
});

function toggleSettings() {
  const overlay = $('#settings-overlay');
  if (!overlay) return;
  overlay.classList.toggle('visible');

  if (overlay.classList.contains('visible')) {
    $('#setting-weather-api').value = localStorage.getItem('sm_weather_api') || CONFIG.weather.apiKey || '';
    $('#setting-city').value = localStorage.getItem('sm_city') || CONFIG.weather.city || 'Sinnai, Sardegna, IT';
    $('#setting-voice-engine').value = localStorage.getItem('sm_voice_engine') || 'browser';

    loadAlexaLights();
    const lights = CONFIG.alexa.lights;
    for (let i = 0; i < 2; i++) {
      const nameInput = $(`#setting-light${i + 1}-name`);
      const urlOnInput = $(`#setting-light${i + 1}-url-on`);
      const urlOffInput = $(`#setting-light${i + 1}-url-off`);
      if (nameInput) nameInput.value = lights[i]?.name || '';
      if (urlOnInput) urlOnInput.value = lights[i]?.webhookOn || lights[i]?.webhook || '';
      if (urlOffInput) urlOffInput.value = lights[i]?.webhookOff || '';
    }
    document.body.style.cursor = 'auto';
  } else {
    document.body.style.cursor = 'none';
  }
}

function testLightWebhook(index, isTurnOn) {
  const inputId = isTurnOn ? `#setting-light${index + 1}-url-on` : `#setting-light${index + 1}-url-off`;
  let url = $(inputId) ? $(inputId).value.trim() : '';

  // Se OFF è vuoto, prova con URL ON
  if (!url && !isTurnOn) {
    const onInput = $(`#setting-light${index + 1}-url-on`);
    if (onInput) url = onInput.value.trim();
  }

  if (!url || !isValidWebhookUrl(url)) {
    alert('Inserisci prima un URL valido che inizia con http o https.');
    return;
  }

  // Se è un webhook generico e non ha parametri ON/OFF
  let testUrl = url;
  if (!url.includes('activate.php') && !url.includes('state=')) {
    testUrl = url.includes('?') ? `${url}&state=${isTurnOn ? 'on' : 'off'}` : `${url}?state=${isTurnOn ? 'on' : 'off'}`;
  }

  sendWebhook(testUrl);

  // Il test cambia lo stato reale della luce: allineiamo il controllore,
  // altrimenti il prossimo tocco invertirebbe partendo da un'idea sbagliata.
  if (hasAnyWebhook(CONFIG.alexa.lights[index])) {
    const isToggle = url.includes('activate.php') || !CONFIG.alexa.lights[index].webhookOff;
    if (isToggle) {
      getLightController().setKnown(index, null);
    } else {
      getLightController().setKnown(index, isTurnOn);
      CONFIG.alexa.lights[index].state = isTurnOn;
      saveAlexaLightsState();
    }
  }

  alert(`Trigger inviato a ${isTurnOn ? 'ON (Accendi)' : 'OFF (Spegni)'}!\nControlla se Alexa ha risposto.`);
}

function saveSettings() {
  // iOS aggiunge spesso spazi o un a capo quando si incolla: li togliamo
  // e scartiamo i caratteri invisibili che rompono la chiave.
  const weatherApi = $('#setting-weather-api').value
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  const city = $('#setting-city').value.trim();
  const webhookValues = [0, 1].map(i => ({
    on: $(`#setting-light${i + 1}-url-on`).value.trim(),
    off: $(`#setting-light${i + 1}-url-off`).value.trim(),
  }));

  const missingOnIndex = webhookValues.findIndex(({ on, off }) => off && !on);
  if (missingOnIndex !== -1) {
    alert(`Per la luce ${missingOnIndex + 1}, inserisci l'URL ON o lascia vuoto l'URL OFF.`);
    return;
  }

  const invalidIndex = webhookValues.findIndex(({ on, off }) =>
    (on && !isValidWebhookUrl(on)) || (off && !isValidWebhookUrl(off))
  );
  if (invalidIndex !== -1) {
    alert(`L'URL webhook della luce ${invalidIndex + 1} non è valido. Usa un indirizzo http o https.`);
    return;
  }

  localStorage.setItem('sm_weather_api', weatherApi);
  localStorage.setItem('sm_city', city || 'Sinnai, Sardegna, IT');

  // Motore vocale: 'browser' (iPadOS) oppure 'local' (Vosk).
  const engineSelect = $('#setting-voice-engine');
  const engine = engineSelect?.value === 'local' ? 'local' : 'browser';
  localStorage.setItem('sm_voice_engine', engine);
  const engineStatus = $('#voice-engine-status');
  if (engineStatus) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    engineStatus.className = `weather-key-status ${SpeechRecognition ? 'ok' : 'ko'}`;
    engineStatus.textContent = engine === 'local'
      ? 'Motore locale attivo: il modello da 48 MB viene scaricato al primo uso.'
      : SpeechRecognition
        ? 'Motore iPadOS attivo: nessun download, risposta immediata.'
        : 'Questo browser non offre il riconoscimento vocale: resta disponibile la dettatura da tastiera.';
  }

  CONFIG.weather.apiKey = weatherApi;
  CONFIG.weather.city = city || 'Sinnai, Sardegna, IT';

  // Diagnosi immediata: la chiave viene provata subito e l'esito è visibile
  // sia nel pannello impostazioni sia sull'etichetta del widget meteo.
  verifyWeatherKey(weatherApi);

  loadAlexaLights();

  for (let i = 0; i < 2; i++) {
    const nameInput = $(`#setting-light${i + 1}-name`);
    const urlOnInput = $(`#setting-light${i + 1}-url-on`);
    const urlOffInput = $(`#setting-light${i + 1}-url-off`);

    if (CONFIG.alexa.lights[i]) {
      if (nameInput && nameInput.value.trim()) {
        CONFIG.alexa.lights[i].name = nameInput.value.trim();
      }
      const { on: onVal, off: offVal } = webhookValues[i];
      CONFIG.alexa.lights[i].webhookOn = onVal;
      CONFIG.alexa.lights[i].webhookOff = offVal;
      CONFIG.alexa.lights[i].webhook = onVal || offVal || '';
    }
  }

  saveAlexaLightsState();

  // Webhook appena cambiati: il controllore riparte da zero, così non
  // confronta con uno stato noto che si riferisce alla vecchia configurazione.
  lightControllerInstance = null;
  loadAlexaLights();

  renderAlexaLights();

  toggleSettings();
  updateWeather();
}

// ============================================
// PREVENT SCREEN SLEEP (Fullscreen + Wake Lock)
// ============================================
async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return false;
    if (wakeLockSentinel && !wakeLockSentinel.released) return true;
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    console.log('Wake Lock attivo');
    return true;
  } catch (err) {
    console.log('Wake Lock non disponibile:', err);
    return false;
  }
}

let wakeLockSentinel = null;

// Il sistema può revocare il wake lock (batteria, chiamata, app in background)
// senza cambiare la visibilità della pagina. Riproviamo ogni 30 secondi:
// è quello che tiene acceso lo schermo dell'iPad per giorni.
setInterval(() => {
  if (document.visibilityState === 'visible') requestWakeLock();
}, 30 * 1000);

// Re-request wake lock on visibility change
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    requestWakeLock();
    // Al ritorno sullo specchio i dati possono essere vecchi: rinfreschiamoli.
    if (typeof updateWeather === 'function') updateWeather();
    if (typeof updateEnvironmentalData === 'function') updateEnvironmentalData();
  }
});

// ============================================
// INIT
// ============================================
function init() {
  console.log('🪞 Smart Mirror starting...');

  // Clock (every second)
  updateClock();
  setInterval(updateClock, 1000);

  // Weather
  updateWeather();
  setInterval(updateWeather, CONFIG.weather.updateInterval);
  scheduleWeatherRetry();

  // External environmental data and daylight times for Sinnai
  updateEnvironmentalData();
  setInterval(updateEnvironmentalData, CONFIG.environment.updateInterval);

  // Calendar
  updateCalendar();
  setInterval(updateCalendar, CONFIG.calendar.updateInterval);

  // Alexa Lights
  renderAlexaLights();

  // News (Adnkronos)
  fetchNews();
  setInterval(fetchNews, 15 * 60 * 1000); // Ricarica notizie ogni 15 minuti

  // Wake Lock
  requestWakeLock();

  // Prevent context menu on long press
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Online/Offline status
  setupConnectivityIndicator();
}

// ============================================
// CONNECTIVITY INDICATOR
// ============================================
function setupConnectivityIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'connectivity-status';
  indicator.className = 'connectivity-status';
  document.body.appendChild(indicator);

  function updateStatus(refreshData = false) {
    if (navigator.onLine) {
      indicator.textContent = '';
      indicator.classList.remove('offline');
      if (refreshData) {
        updateWeather();
        updateEnvironmentalData();
        fetchNews();
      }
    } else {
      indicator.textContent = '📡 Offline';
      indicator.classList.add('offline');
    }
  }

  window.addEventListener('online', () => updateStatus(true));
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

// Start
document.addEventListener('DOMContentLoaded', init);
