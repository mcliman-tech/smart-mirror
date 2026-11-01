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

async function updateWeather() {
  const { apiKey, city, units, lang } = CONFIG.weather;

  if (!apiKey) {
    // Demo data
    showDemoWeather();
    return;
  }

  try {
    // Current weather
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${units}&lang=${lang}&appid=${apiKey}`
    );
    const data = await res.json();

    if (data.cod !== 200) {
      console.error('Weather API error:', data.message);
      showDemoWeather();
      return;
    }

    weatherData = data;
    const icon = WEATHER_ICONS[data.weather[0].icon] || '🌡️';
    $('#weather-icon').textContent = icon;
    $('#weather-temp').textContent = `${Math.round(data.main.temp)}°`;
    $('#weather-desc').textContent = data.weather[0].description;
    $('#weather-humidity').textContent = `💧 ${data.main.humidity}%`;
    $('#weather-wind').textContent = `💨 ${Math.round(data.wind.speed * 3.6)} km/h`;
    $('#weather-location').textContent = `📍 ${data.name}`;

    // Forecast
    const forecastRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=${units}&lang=${lang}&appid=${apiKey}`
    );
    const forecastData = await forecastRes.json();
    renderForecast(forecastData);

  } catch (err) {
    console.error('Weather fetch error:', err);
    showDemoWeather();
  }
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
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour > 20;

  $('#weather-icon').textContent = isNight ? '🌙' : '☀️';
  $('#weather-temp').textContent = '22°';
  $('#weather-desc').textContent = isNight ? 'Sereno' : 'Soleggiato';
  $('#weather-humidity').textContent = '💧 55%';
  $('#weather-wind').textContent = '💨 12 km/h';
  $('#weather-location').textContent = `📍 ${CONFIG.weather.city.split(',')[0]}`;

  // Demo forecast
  const demoForecast = [
    { day: 'Lun', icon: '☀️', temp: '24°' },
    { day: 'Mar', icon: '⛅', temp: '21°' },
    { day: 'Mer', icon: '🌧️', temp: '18°' },
    { day: 'Gio', icon: '⛅', temp: '20°' },
    { day: 'Ven', icon: '☀️', temp: '23°' },
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
}

function renderAlexaLights() {
  const container = $('#alexa-grid');
  if (!container) return;

  loadAlexaLights();

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
  let targetUrl = nextState
    ? (light.webhookOn || light.webhook)
    : (light.webhookOff || light.webhook);

  if (!targetUrl || !isValidWebhookUrl(targetUrl)) {
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

  const singleWebhook = !light.webhookOff && Boolean(light.webhookOn || light.webhook);
  if (singleWebhook && !targetUrl.includes('activate.php')) {
    const requestUrl = new URL(targetUrl);
    requestUrl.searchParams.set('state', nextState ? 'on' : 'off');
    targetUrl = requestUrl.href;
  }

  light.state = nextState;
  saveAlexaLightsState();
  renderAlexaLights();
  sendWebhook(targetUrl);

  // Feedback sonoro se voiceControl è pronto
  if (window.voiceControl && typeof window.voiceControl.playChime === 'function') {
    window.voiceControl.playChime('wake');
  }
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

async function fetchNews() {
  const feedResults = await Promise.all(CONFIG.news.feeds.map(async feed => {
    try {
      const res = await fetch(`/.netlify/functions/news?feed=${encodeURIComponent(feed.id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
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
  alert(`Trigger inviato a ${isTurnOn ? 'ON (Accendi)' : 'OFF (Spegni)'}!\nControlla se Alexa ha risposto.`);
}

function saveSettings() {
  const weatherApi = $('#setting-weather-api').value.trim();
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
  CONFIG.weather.apiKey = weatherApi;
  CONFIG.weather.city = city || 'Sinnai, Sardegna, IT';

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
  renderAlexaLights();

  toggleSettings();
  updateWeather();
}

// ============================================
// PREVENT SCREEN SLEEP (Fullscreen + Wake Lock)
// ============================================
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      await navigator.wakeLock.request('screen');
      console.log('Wake Lock active');
    }
  } catch (err) {
    console.log('Wake Lock not available:', err);
  }
}

// Re-request wake lock on visibility change
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    requestWakeLock();
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
