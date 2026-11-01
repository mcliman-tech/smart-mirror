/* ============================================
   SMART MIRROR — Voice Control System
   Ottimizzato per Safari, iPad Air 2 & Desktop
   ============================================ */

class VoiceControl {
  constructor() {
    this.synthesis = window.speechSynthesis;
    this.recognition = null;
    this.recognizedCommand = '';
    this.isListening = false;
    this.isProcessingVoice = false;
    this.isAwake = false;
    this.wakeTimeout = null;
    this.italianVoice = null;
    this.timers = [];
    this.reminders = [];
    this.hasUnlockedAudio = false;
    this.voskModel = null;
    this.voskRecognizer = null;
    this.audioContext = null;
    this.microphoneStream = null;
    this.audioProcessor = null;
    this.audioSource = null;
    this.mutedAudio = null;
    this.isSpeaking = false;

    this.init();
  }

  // ── Inizializzazione ──
  init() {
    this.loadVoice();
    if (this.synthesis) {
      this.synthesis.onvoiceschanged = () => this.loadVoice();
    }

    // Costruisce la grafica
    this.createUI();

    // Timer loop
    setInterval(() => this.checkTimers(), 1000);

    this.showVoiceStatus('Tocca il microfono una volta per avviare l’ascolto continuo.', 'awake');
    console.log('🎙️ Voice Control pronto');
  }

  loadVoice() {
    if (!this.synthesis) return;
    const voices = this.synthesis.getVoices();
    this.italianVoice = voices.find(v => v.lang === 'it-IT' && (v.name.includes('Alice') || v.name.includes('Federica'))) ||
                        voices.find(v => v.lang === 'it-IT') ||
                        voices.find(v => v.lang.startsWith('it')) ||
                        voices[0];
  }

  // ── Interfaccia Grafica ──
  createUI() {
    // Rimuovi se già presente
    const old = document.getElementById('voice-indicator');
    if (old) old.remove();

    const indicator = document.createElement('div');
    indicator.id = 'voice-indicator';
    indicator.className = 'voice-indicator';
    indicator.innerHTML = `
      <div class="voice-status" id="voice-status">Tocca il microfono per avviare l’ascolto continuo</div>
      <form class="voice-fallback" id="voice-fallback" hidden>
        <input type="text" id="voice-command-input" placeholder="Scrivi o detta un comando" aria-label="Comando vocale">
        <button type="submit">Invia</button>
      </form>
      <button type="button" class="voice-mic" id="voice-mic" title="Avvia o ferma l’ascolto vocale" aria-label="Avvia o ferma l’ascolto vocale">🎙️</button>
      <button type="button" class="voice-diag-btn" id="voice-diag-btn" title="Diagnostica vocale">🔍</button>
    `;
    document.body.appendChild(indicator);

    // Timer overlay
    if (!document.getElementById('timer-overlay')) {
      const timerOverlay = document.createElement('div');
      timerOverlay.id = 'timer-overlay';
      timerOverlay.className = 'timer-overlay';
      document.body.appendChild(timerOverlay);
    }

    const micBtn = document.getElementById('voice-mic');
    if (!micBtn) return;

    // Pulsante 🔍: apre la diagnostica in qualunque momento.
    const diagBtn = document.getElementById('voice-diag-btn');
    diagBtn?.addEventListener('click', () => {
      this.diagEnvironment();
      this.showDiagPanel('Diagnostica richiesta a mano.');
    });

    const fallbackForm = document.getElementById('voice-fallback');
    fallbackForm?.addEventListener('submit', event => {
      event.preventDefault();
      const input = document.getElementById('voice-command-input');
      const command = input?.value.trim();
      if (!command) {
        this.showVoiceStatus('Scrivi o detta un comando prima di inviarlo.', 'error');
        return;
      }
      input.value = '';
      this.recognizedCommand = '';
      fallbackForm.hidden = true;
      this.hideVoiceStatus();
      this.processCommand(command);
    });

    let lastTapTime = 0;
    const handleTap = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      const now = Date.now();
      if (now - lastTapTime < 500) {
        return; // Previene il doppio trigger (touchend + click su iOS)
      }
      lastTapTime = now;

      // Sblocca audio TTS
      this.unlockAudio();

      if (this.voskRecognizer && this.audioContext?.state === 'suspended') {
        this.resumeLocalListening();
      } else if (this.isListening) {
        this.stopListening();
      } else if (this.isProcessingVoice) {
        return;
      } else {
        this.startRecording();
      }
    };

    micBtn.addEventListener('touchstart', (e) => handleTap(e), { passive: false });
    micBtn.addEventListener('click', (e) => handleTap(e));
  }

  unlockAudio() {
    if (this.hasUnlockedAudio) return;
    try {
      if (this.synthesis) {
        const silent = new SpeechSynthesisUtterance(' ');
        silent.volume = 0.01;
        this.synthesis.speak(silent);
      }
      this.hasUnlockedAudio = true;
    } catch (e) {}
  }

  startRecording() {
    if (window.isSecureContext === false) {
      this.showVoiceStatus('Apri Smart Mirror dal sito HTTPS per usare il microfono.', 'error');
      return;
    }
    if (window.Vosk?.createModel) {
      this.startLocalListening();
      return;
    }
    this.startBrowserRecording();
  }

  async startLocalListening() {
    if (this.isProcessingVoice) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext || !navigator.mediaDevices?.getUserMedia) {
      this.showVoiceStatus('Questo browser non permette l’ascolto locale del microfono.', 'error');
      return;
    }

    this.isProcessingVoice = true;
    this.showVoiceStatus('Avvio del riconoscimento vocale italiano…', 'awake');
    const mic = document.getElementById('voice-mic');
    if (mic) mic.classList.add('awake');

    try {
      this.audioContext = new AudioContext();
      this.audioContext.onstatechange = () => {
        if (!this.voskRecognizer || this.audioContext?.state === 'running') return;
        this.isListening = false;
        const voiceButton = document.getElementById('voice-mic');
        if (voiceButton) voiceButton.classList.remove('listening');
        this.showVoiceStatus('Audio sospeso. Tocca il microfono per riprendere l’ascolto.', 'error');
      };
      const resumeAudio = this.audioContext.resume();
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
        video: false,
      });
      await resumeAudio;

      this.showVoiceStatus('Scarico il modello italiano (48 MB) e lo preparo. Al primo avvio può volerci qualche minuto…', 'awake');
      this.voskModel = await this.loadLocalModel();
      this.voskRecognizer = new this.voskModel.KaldiRecognizer(this.audioContext.sampleRate);
      this.voskRecognizer.on('result', message => {
        const command = message.result?.text?.trim();
        if (!command) return;
        this.showVoiceStatus(`Ho capito: ${command}`, 'awake');
        this.processCommand(command);
      });
      this.voskRecognizer.on('error', message => {
        console.error('Errore del riconoscimento vocale locale:', message.error);
        this.showVoiceStatus('Errore nel riconoscimento locale. Tocca il microfono per riprovare.', 'error');
        this.stopLocalListening().catch(error => {
          console.error('Arresto del riconoscimento locale non riuscito:', error);
        });
      });

      this.audioSource = this.audioContext.createMediaStreamSource(this.microphoneStream);
      this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.mutedAudio = this.audioContext.createGain();
      this.mutedAudio.gain.value = 0;
      this.audioProcessor.onaudioprocess = event => {
        if (this.isSpeaking || !this.voskRecognizer) return;
        try {
          this.voskRecognizer.acceptWaveform(event.inputBuffer);
        } catch (error) {
          console.error('Errore elaborando l’audio locale:', error);
          this.showVoiceStatus('Il riconoscimento locale si è interrotto. Tocca il microfono per riprovare.', 'error');
        }
      };
      this.audioSource.connect(this.audioProcessor);
      this.audioProcessor.connect(this.mutedAudio);
      this.mutedAudio.connect(this.audioContext.destination);

      this.isProcessingVoice = false;
      this.isListening = true;
      this.isAwake = true;
      if (mic) mic.classList.add('listening');
      this.showVoiceStatus('In ascolto continuo. Parla in italiano.', 'awake');
    } catch (error) {
      console.error('Avvio del riconoscimento vocale locale non riuscito:', error);
      this.logDiag(`Errore avvio: ${error.name} · ${error.message}`);
      await this.stopLocalListening();
      this.finishRecording(error.name === 'NotAllowedError'
        ? 'Consenti l’accesso al microfono per avviare l’ascolto.'
        : error.name === 'TimeoutError'
          ? 'Il modello non ha terminato il caricamento entro 3 minuti. Verifica la connessione, chiudi e riapri Smart Mirror, poi riprova.'
          : error.message?.startsWith('Vosk:')
            ? error.message.replace(/^Vosk:\s*/, '')
        : `Non riesco ad avviare il riconoscimento locale (${error.name || 'errore'}). Apri la diagnostica 🔍.`);
    }
  }

  loadLocalModel() {
    const Model = window.Vosk?.Model;
    if (!Model) {
      return Promise.reject(new Error('Vosk: la libreria di riconoscimento non è disponibile.'));
    }

    // URL ASSOLUTO, non relativo: Vosk crea un worker da un blob e dentro il
    // worker un percorso relativo verrebbe risolto rispetto al blob, non alla
    // pagina. Con il sito in un sottopercorso (GitHub Pages: /smart-mirror/)
    // questo causava un 404 sul modello.
    const modelUrl = new URL('models/vosk-it-small-0.22.tar.gz', window.location.href).href;
    this.logDiag(`Modello richiesto: ${modelUrl}`);
    const model = new Model(modelUrl, -1);
    this.voskModel = model;

    // Diagnostica: interroghiamo noi l'URL per sapere esattamente cosa risponde
    // il server, invece di fidarci solo dell'errore del worker.
    fetch(modelUrl, { method: 'HEAD' })
      .then(res => this.logDiag(`HEAD modello: HTTP ${res.status} · ${res.headers.get('content-length') || '?'} byte · ${res.headers.get('content-type') || '?'}`))
      .catch(err => this.logDiag(`HEAD modello fallita: ${err.message}`));

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        model.removeEventListener('load', onLoad);
        model.removeEventListener('error', onError);
      };
      const onLoad = event => {
        cleanup();
        if (event.detail?.result) {
          resolve(model);
        } else {
          reject(new Error('Vosk: Safari non è riuscito a preparare il modello. Ricarica la pagina e riprova.'));
        }
      };
      const onError = event => {
        cleanup();
        const detail = event.detail?.error || 'errore durante il caricamento del modello.';
        this.logDiag(`Worker Vosk: ${detail}`);
        // 404 sul modello è l'errore più comune: se il file non è dove ci
        // aspettiamo (es. cartella pubblicata diversa), lo segnaliamo chiaro.
        const message = /404|not found/i.test(detail)
          ? `Il file del modello vocale non è raggiungibile (404). Apri la diagnostica 🔍 per il dettaglio.`
          : `Vosk: ${detail}`;
        reject(new Error(message));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(Object.assign(new Error('Il caricamento del modello è scaduto.'), { name: 'TimeoutError' }));
      }, 180000);

      model.addEventListener('load', onLoad);
      model.addEventListener('error', onError);
    });
  }

  async resumeLocalListening() {
    if (!this.audioContext || !this.voskRecognizer) return;
    try {
      await this.audioContext.resume();
      this.isListening = true;
      this.isAwake = true;
      const mic = document.getElementById('voice-mic');
      if (mic) mic.classList.add('awake', 'listening');
      this.showVoiceStatus('In ascolto continuo. Parla in italiano.', 'awake');
    } catch (error) {
      console.error('Ripresa dell’audio locale non riuscita:', error);
      this.showVoiceStatus('Audio sospeso. Tocca di nuovo il microfono per riprendere.', 'error');
    }
  }

  async stopLocalListening() {
    this.isListening = false;
    this.isAwake = false;
    this.isProcessingVoice = false;
    const mic = document.getElementById('voice-mic');
    if (mic) mic.classList.remove('awake', 'listening');

    if (this.audioProcessor) {
      this.audioProcessor.onaudioprocess = null;
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }
    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }
    if (this.mutedAudio) {
      this.mutedAudio.disconnect();
      this.mutedAudio = null;
    }
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach(track => track.stop());
      this.microphoneStream = null;
    }
    if (this.voskRecognizer) {
      this.voskRecognizer.remove();
      this.voskRecognizer = null;
    }
    if (this.voskModel) {
      this.voskModel.terminate();
      this.voskModel = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;
  }

  startBrowserRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.showVoiceInput();
      this.showVoiceStatus('Riconoscimento del browser non disponibile. Detta il comando con il microfono della tastiera.', 'error');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      this.recognition = recognition;
      this.recognizedCommand = '';
      recognition.lang = 'it-IT';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onresult = event => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = event.results[index][0].transcript;
          if (event.results[index].isFinal) {
            this.recognizedCommand += `${transcript} `;
          } else {
            interim += transcript;
          }
        }
        if (interim) this.showVoiceStatus(`Ho capito: ${interim}`, 'awake');
      };
      recognition.onerror = event => {
        const messages = {
          'not-allowed': 'Il browser non ha concesso il microfono.',
          'service-not-allowed': 'Il browser non consente il riconoscimento vocale.',
          'no-speech': 'Non ho rilevato la voce.',
          'audio-capture': 'Il browser non riesce ad accedere al microfono.',
          network: 'Il riconoscimento vocale del browser non è raggiungibile.',
        };
        const message = messages[event.error] || `Riconoscimento vocale non riuscito (${event.error}).`;
        this.finishRecording(`${message} Puoi dettare il comando con la tastiera.`);
        this.showVoiceInput();
      };
      recognition.onend = () => {
        if (this.recognition !== recognition) return;
        clearTimeout(this.wakeTimeout);
        this.recognition = null;
        this.isListening = false;
        this.isAwake = false;
        this.isProcessingVoice = false;
        const mic = document.getElementById('voice-mic');
        if (mic) mic.classList.remove('awake', 'listening');
        const command = this.recognizedCommand.trim();
        this.recognizedCommand = '';
        if (!command) {
          this.showVoiceStatus('Non ho ricevuto un comando. Puoi dettarlo con la tastiera.', 'error');
          this.showVoiceInput();
          return;
        }
        const fallbackForm = document.getElementById('voice-fallback');
        if (fallbackForm) fallbackForm.hidden = true;
        this.hideVoiceStatus();
        this.processCommand(command);
      };
      recognition.start();
      this.isAwake = true;
      this.isListening = true;
      const mic = document.getElementById('voice-mic');
      if (mic) mic.classList.add('awake', 'listening');
      this.showVoiceStatus('In ascolto… parla in italiano.', 'awake');
      clearTimeout(this.wakeTimeout);
      this.wakeTimeout = setTimeout(() => this.stopListening(), 12000);
    } catch (error) {
      const message = error.name === 'NotAllowedError'
        ? 'Consenti l’accesso al microfono nelle impostazioni del browser.'
        : error.name === 'NotFoundError'
          ? 'Non trovo un microfono disponibile su questo dispositivo.'
          : `Non riesco ad avviare il riconoscimento vocale${error.message ? `: ${error.message}` : '.'}`;
      this.finishRecording(message);
    }
  }

  stopListening() {
    if (this.voskRecognizer) {
      this.stopLocalListening();
      this.showVoiceStatus('Ascolto continuo fermato.', 'awake');
      return;
    }
    clearTimeout(this.wakeTimeout);
    if (!this.recognition) return;
    this.isListening = false;
    const mic = document.getElementById('voice-mic');
    if (mic) mic.classList.remove('listening');
    this.isProcessingVoice = true;
    this.showVoiceStatus('Sto completando il riconoscimento…', 'awake');
    this.recognition.stop();
  }

  finishRecording(message) {
    this.recognition = null;
    this.isListening = false;
    this.isProcessingVoice = false;
    this.isAwake = false;
    clearTimeout(this.wakeTimeout);
    const mic = document.getElementById('voice-mic');
    if (mic) mic.classList.remove('awake', 'listening');
    this.showVoiceStatus(message, 'error');
    this.showDiagPanel(message);
  }

  // ── Diagnostica ──
  // Su iPad non c'è una console accessibile: senza questo, un errore del
  // worker resta invisibile e "non funziona" è tutto ciò che si può dire.
  logDiag(line) {
    this.diagLines = this.diagLines || [];
    const stamp = new Date().toLocaleTimeString('it-IT');
    this.diagLines.push(`${stamp}  ${line}`);
    if (this.diagLines.length > 60) this.diagLines.shift();
    const pre = document.getElementById('voice-diag-log');
    if (pre) pre.textContent = this.diagLines.join('\n');
    console.log('[diag]', line);
  }

  diagEnvironment() {
    this.logDiag(`Versione: ${window.SM_VERSION || '?'}`);
    this.logDiag(`Pagina: ${window.location.href}`);
    this.logDiag(`Contesto sicuro: ${window.isSecureContext}`);
    this.logDiag(`Vosk caricato: ${Boolean(window.Vosk?.Model)}`);
    this.logDiag(`Microfono API: ${Boolean(navigator.mediaDevices?.getUserMedia)}`);
    this.logDiag(`User-Agent: ${navigator.userAgent}`);
    this.logDiag(`Service worker: ${navigator.serviceWorker?.controller ? 'attivo' : 'nessuno'}`);
  }

  showDiagPanel(message) {
    this.diagLines = this.diagLines || [];
    this.diagLines.push(`${new Date().toLocaleTimeString('it-IT')}  ERRORE: ${message}`);

    let panel = document.getElementById('voice-diag-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'voice-diag-panel';
      panel.className = 'voice-diag-panel';
      panel.innerHTML = `
        <div class="voice-diag-head">
          <strong>Diagnostica vocale</strong>
          <button type="button" id="voice-diag-close" aria-label="Chiudi">✕</button>
        </div>
        <pre id="voice-diag-log"></pre>
        <div class="voice-diag-actions">
          <button type="button" id="voice-diag-copy">Copia tutto</button>
        </div>`;
      document.body.appendChild(panel);
      panel.querySelector('#voice-diag-close').addEventListener('click', () => panel.classList.remove('visible'));
      panel.querySelector('#voice-diag-copy').addEventListener('click', () => {
        const text = (this.diagLines || []).join('\n');
        navigator.clipboard?.writeText(text)
          .then(() => this.logDiag('Testo copiato negli appunti.'))
          .catch(() => this.logDiag('Copia non riuscita: seleziona il testo a mano.'));
      });
    }
    const pre = panel.querySelector('#voice-diag-log');
    if (pre) pre.textContent = this.diagLines.join('\n');
    panel.classList.add('visible');
  }

  showVoiceInput() {
    const fallbackForm = document.getElementById('voice-fallback');
    const input = document.getElementById('voice-command-input');
    if (fallbackForm) fallbackForm.hidden = false;
    if (input) input.placeholder = 'Scrivi o detta con il microfono della tastiera';
    input?.focus();
  }

  sleep() {
    if (this.recognition) {
      this.stopListening();
      return;
    }
    this.isAwake = false;
    this.isListening = false;
    const mic = document.getElementById('voice-mic');
    if (mic) mic.classList.remove('awake', 'listening');
    this.hideVoiceStatus();
    clearTimeout(this.wakeTimeout);
  }

  // ── Elaborazione Comandi ──
  processCommand(text) {
    const cmd = text.toLowerCase().trim();

    // Prima di tutto: fermare la sveglia. "stop" deve funzionare subito,
    // senza che altre parole del comando lo dirottino altrove.
    if (this.activeAlarm && this.matches(cmd, ['stop', 'basta', 'silenzio', 'ferma', 'zitto', 'spegni la sveglia'])) {
      this.stopAlarm();
      this.respond('Sveglia fermata.');
      return { action: 'alarm-stop' };
    }

    if (this.matches(cmd, ['ricetta', 'ricette', 'come preparare', 'come si prepara'])) {
      return this.cmdRecipe(cmd);
    }

    if (this.matches(cmd, ['spotify', 'canzone', 'musica', 'metti ', 'riproduci ', 'suona '])) {
      return this.cmdSpotify(cmd);
    }

    // ── Cambio Città Meteo ──
    if (this.matches(cmd, ['meteo a', 'tempo a', 'meteo di', 'tempo di', 'cambia città'])) {
      return this.cmdChangeCity(cmd);
    }

    // ── Meteo ──
    if (this.matches(cmd, ['tempo', 'meteo', 'temperatura', 'previsioni', 'piove', 'freddo', 'caldo', 'gradi'])) {
      return this.cmdWeather();
    }

    // ── Orario ──
    if (this.matches(cmd, ['ore', 'ora', 'orario', 'dimmi l\'ora', 'che ora'])) {
      return this.cmdTime();
    }

    // ── Data / Calendario ──
    if (this.matches(cmd, ['giorno', 'data', 'oggi', 'calendario', 'mese', 'anno'])) {
      return this.cmdDate();
    }

    // ── Notizie ──
    if (this.matches(cmd, ['notizie', 'notizia', 'news', 'ultim\'ora', 'succede', 'adnkronos', 'giornale'])) {
      return this.cmdNews();
    }

    // ── Luci Alexa (Cucina & Cortile) ──
    if (this.matches(cmd, ['luce', 'luci', 'cucina', 'cortile', 'accendi', 'spegni', 'lampada'])) {
      return this.cmdAlexaLights(cmd);
    }

    // ── Saluto ──
    if (this.matches(cmd, ['buongiorno', 'buonasera', 'buonanotte', 'ciao', 'salve'])) {
      return this.cmdGreeting(cmd);
    }

    // ── Timer ──
    if (this.matches(cmd, ['timer', 'sveglia', 'avvisami', 'conto alla rovescia'])) {
      return this.cmdTimer(cmd);
    }

    // ── Promemoria ──
    if (this.matches(cmd, ['promemoria', 'ricordami', 'segna', 'appunta'])) {
      return this.cmdReminder(cmd);
    }

    // ── Luminosità ──
    if (this.matches(cmd, ['luminosità', 'chiaro', 'scuro', 'abbassa', 'alza'])) {
      return this.cmdBrightness(cmd);
    }

    // ── Riepilogo ──
    if (this.matches(cmd, ['riepilogo', 'riassunto', 'situazione', 'come va'])) {
      return this.cmdSummary();
    }

    // ── Aiuto ──
    if (this.matches(cmd, ['aiuto', 'help', 'comandi', 'cosa sai fare'])) {
      return this.cmdHelp();
    }

    // ── Ringraziamenti ──
    if (this.matches(cmd, ['grazie', 'ottimo', 'bravo', 'perfetto'])) {
      return this.respond('Di nulla! Sempre a tua disposizione. 😊');
    }

    // Non compreso
    this.respond(`Ho sentito "${cmd}". Chiedimi ad esempio: "che tempo fa", "che ore sono", o "accendi cucina".`);
  }

  // ── Comandi Specifici ──

  async cmdWeather() {
    this.showVoiceStatus('Controllo il meteo nella tua posizione…', 'awake');
    try {
      if (typeof getWeatherForCurrentLocation !== 'function') {
        throw new Error('Aggiorna la pagina per usare il meteo vocale.');
      }
      const weather = await getWeatherForCurrentLocation();
      this.respond(`A ${weather.city}, oggi ci sono ${weather.temperature} gradi e ${weather.condition}.`);
    } catch (error) {
      console.error('Errore meteo vocale:', error);
      const message = error.code === 1
        ? 'Per darti il meteo della tua posizione, consenti l’accesso alla posizione in Safari.'
        : error.code === 2 || error.code === 3
          ? 'Non riesco a rilevare la posizione. Verifica che la localizzazione sia attiva e riprova.'
          : error.message || 'Non riesco a recuperare il meteo. Controlla la connessione e la chiave OpenWeather.';
      this.respond(message);
    } finally {
      this.hideVoiceStatus();
    }
    this.highlightWidget('weather-widget');
  }

  cmdRecipe(command) {
    const recipe = command
      .replace(/^(.*?)(?:dammi|cercami|trova|apri|mostrami)\s+/i, '')
      .replace(/^(?:la\s+)?ricett[ae]\s*(?:(?:di|per|del|della|con)\s+)?/i, '')
      .replace(/^come\s+(?:preparare|si prepara)\s+/i, '')
      .trim();
    const query = recipe || 'ricette';
    const searchUrl = new URL('https://www.google.com/search');
    searchUrl.searchParams.set('q', `site:giallozafferano.it ${query} ricetta`);
    const href = searchUrl.href;
    this.speak(`Cerco la ricetta di ${query} su Giallo Zafferano.`);
    this.armReturnReload();
    window.setTimeout(() => this.openSearch(href, true), 1800);
    return { action: 'search', query, url: href };
  }

  cmdSpotify(command) {
    const query = command
      .replace(/^(.*?)(?:metti|riproduci|suona|ascolta|cerca)\s+/i, '')
      .replace(/^(?:una\s+)?(?:canzone|musica)\s*(?:di|dei|del|della|dell'|per)?\s*/i, '')
      .replace(/\s+su\s+spotify$/i, '')
      .trim();
    const destination = query
      ? `https://open.spotify.com/search/${encodeURIComponent(query)}`
      : 'https://open.spotify.com/';
    this.speak(query ? `Apro Spotify e cerco ${query}.` : 'Apro Spotify.');
    this.armReturnReload();
    window.setTimeout(() => this.navigateTo(destination), 1800);
    return { action: 'open', query, url: destination };
  }

  navigateTo(url) {
    window.location.assign(url);
  }

  // Uscire dallo specchio (Spotify, ricette) lo lascia in background: su iPad
  // Safari sospende il microfono e il wake lock. Al ritorno ricarichiamo la
  // pagina, così lo specchio riparte pulito e riprende l'ascolto.
  armReturnReload() {
    if (this.returnReloadArmed) return;
    this.returnReloadArmed = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      this.returnReloadArmed = false;
      window.location.reload();
    }, { once: true });
  }

  openSearch(url, preferChrome) {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!preferChrome || !isIOS) {
      window.setTimeout(() => this.navigateTo(url), 700);
      return;
    }

    const fallback = window.setTimeout(() => {
      if (document.visibilityState === 'visible') this.navigateTo(url);
    }, 1200);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') clearTimeout(fallback);
    }, { once: true });
    const chromeUrl = new URL(url);
    chromeUrl.protocol = 'googlechromes:';
    this.navigateTo(chromeUrl.href);
  }

  cmdTime() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const mStr = m === 0 ? 'in punto' : (m < 10 ? `e zero ${m}` : `e ${m}`);
    this.respond(`Sono le ore ${h} ${mStr}.`);
    this.highlightWidget('clock-widget');
  }

  cmdDate() {
    const now = new Date();
    const day = DAYS[now.getDay()];
    const date = now.getDate();
    const month = MONTHS[now.getMonth()];
    const year = now.getFullYear();
    this.respond(`Oggi è ${day} ${date} ${month} del ${year}.`);
    this.highlightWidget('calendar-widget');
  }

  cmdNews() {
    const titleEl = document.getElementById('news-title');
    const descEl = document.getElementById('news-desc');
    const title = titleEl ? titleEl.textContent.trim() : '';
    const desc = descEl ? descEl.textContent.trim() : '';

    if (title && !title.includes('Caricamento') && !title.includes('non disponibili')) {
      this.respond(`Ultime notizie: ${title}. ${desc}`);
    } else {
      this.respond('Le notizie non sono al momento disponibili.');
    }
    this.highlightWidget('news-widget');
  }

  cmdAlexaLights(cmd) {
    const lights = CONFIG.alexa.lights || [];
    // Il nome della luce senza il prefisso "Luce ": così "quale luce" o
    // "la luce della cucina" non fanno scattare la prima luce a caso.
    const coreName = (name) => name.replace(/^luce\s+/i, '').trim().toLowerCase();
    const askedWhichLight = this.matches(cmd, ['quale luce', 'quali luci', 'che luce']);

    // Spegni tutte le luci
    if (this.matches(cmd, ['spegni tutte', 'spegni tutto', 'spegni tutte le luci'])) {
      lights.forEach((l, i) => this.setLightState(i, false));
      this.respond('Ho spento tutte le luci.');
      this.highlightWidget('alexa-widget');
      return { action: 'lights-all', on: false };
    }

    // Accendi tutte le luci
    if (this.matches(cmd, ['accendi tutte', 'accendi tutto', 'accendi tutte le luci'])) {
      lights.forEach((l, i) => this.setLightState(i, true));
      this.respond('Ho acceso tutte le luci.');
      this.highlightWidget('alexa-widget');
      return { action: 'lights-all', on: true };
    }

    const isTurnOn = this.matches(cmd, ['accendi', 'attiva']);
    const isTurnOff = this.matches(cmd, ['spegni', 'disattiva']);

    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const lightName = light.name.toLowerCase();
      const core = coreName(light.name);

      // Corrispondenza sul nome senza "luce" ("cucina", "cortile"): più precisa.
      const matched = (core.length > 3 && cmd.includes(core)) || cmd.includes(lightName);

      if (matched && !askedWhichLight) {
        if (isTurnOn) {
          this.setLightState(i, true);
          this.respond(`Ho acceso ${light.name}.`);
        } else if (isTurnOff) {
          this.setLightState(i, false);
          this.respond(`Ho spento ${light.name}.`);
        } else {
          const targetState = !light.state;
          this.setLightState(i, targetState);
          this.respond(`${light.name} ${targetState ? 'accesa' : 'spenta'}.`);
        }
        this.highlightWidget('alexa-widget');
        return { action: 'lights', light: light.name, index: i, on: isTurnOff ? false : isTurnOn ? true : !light.state };
      }
    }

    this.respond('Quale luce vuoi controllare? Puoi dire "accendi luce cucina" o "accendi luce cortile".');
    this.highlightWidget('alexa-widget');
    return { action: 'lights-unknown' };
  }

  // Unico punto in cui la voce cambia lo stato di una luce.
  // Se app.js non è caricato (o la funzione manca) non si rompe nulla.
  setLightState(index, targetState) {
    if (typeof setAlexaLight !== 'function') {
      console.warn('setAlexaLight non disponibile: comando luce ignorato.');
      return;
    }
    Promise.resolve(setAlexaLight(index, targetState)).catch(error => {
      console.warn('Comando luce non riuscito:', error);
    });
  }

  cmdGreeting(cmd) {
    const hour = new Date().getHours();
    let greeting = 'Ciao! Come posso aiutarti?';
    if (cmd.includes('buonanotte')) greeting = 'Buonanotte! Dormi bene. 🌙';
    else if (hour < 12) greeting = 'Buongiorno! Che sia una splendida giornata. ☀️';
    else if (hour < 18) greeting = 'Buon pomeriggio!';
    else greeting = 'Buonasera! Spero sia stata una bella giornata. 🌆';
    this.respond(greeting);
  }

  cmdTimer(cmd) {
    const minuteMatch = cmd.match(/(\d+)\s*minut/);
    const secondMatch = cmd.match(/(\d+)\s*second/);

    let seconds = 0;
    let label = '';
    if (minuteMatch) {
      seconds += parseInt(minuteMatch[1]) * 60;
      label = `${minuteMatch[1]} minuti`;
    }
    if (secondMatch) {
      seconds += parseInt(secondMatch[1]);
      label += (label ? ' e ' : '') + `${secondMatch[1]} secondi`;
    }

    if (seconds === 0) {
      this.respond('Per quanto tempo? Ad esempio: "timer 5 minuti".');
      return;
    }

    const timer = {
      id: Date.now(),
      endTime: new Date(Date.now() + seconds * 1000),
      label: label,
      totalSeconds: seconds,
    };

    this.timers.push(timer);
    this.respond(`Timer di ${label} impostato.`);
    this.showTimerOverlay();
  }

  checkTimers() {
    const now = Date.now();
    this.timers = this.timers.filter(timer => {
      if (now >= timer.endTime.getTime()) {
        this.startAlarm(timer.label);
        return false;
      }
      return true;
    });
    this.updateTimerOverlay();
  }

  // Una sveglia sola alla volta, che continua finché non la si ferma.
  // Un singolo bip su uno specchio in un'altra stanza non serve a niente.
  startAlarm(label) {
    this.stopAlarm();
    this.activeAlarm = { label };
    const ring = () => {
      if (!this.activeAlarm) return;
      this.playChime('alarm');
      this.alarmTimeout = setTimeout(ring, 2500);
    };
    ring();
    this.respond(`Tempo scaduto! Il timer di ${label} è terminato. Tocca lo schermo o di' "stop" per fermare la sveglia.`);
  }

  stopAlarm() {
    clearTimeout(this.alarmTimeout);
    this.alarmTimeout = null;
    this.activeAlarm = null;
  }

  showTimerOverlay() {
    const overlay = document.getElementById('timer-overlay');
    if (overlay) overlay.classList.add('visible');
    this.updateTimerOverlay();
  }

  updateTimerOverlay() {
    const overlay = document.getElementById('timer-overlay');
    if (!overlay) return;
    if (this.timers.length === 0) {
      overlay.classList.remove('visible');
      overlay.innerHTML = '';
      return;
    }

    overlay.innerHTML = this.timers.map(timer => {
      const remaining = Math.max(0, Math.ceil((timer.endTime.getTime() - Date.now()) / 1000));
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      const pct = ((timer.totalSeconds - remaining) / timer.totalSeconds) * 100;
      return `<div class="timer-item">
                <div class="timer-label">⏱️ ${timer.label}</div>
                <div class="timer-countdown">${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}</div>
                <div class="timer-progress-bar"><div class="timer-progress" style="width:${pct}%"></div></div>
              </div>`;
    }).join('');
  }

  cmdReminder(cmd) {
    let note = cmd.replace(/promemoria|ricordami di|ricordami|segna|appunta/gi, '').trim();
    if (!note) {
      this.respond('Cosa vuoi che ricordi?');
      return;
    }
    this.reminders.push({ text: note, time: new Date() });
    this.respond(`Ho annotato: "${note}".`);
  }

  cmdBrightness(cmd) {
    const container = document.querySelector('.mirror-container');
    if (!container) return;
    const current = parseFloat(container.style.opacity || 1);

    if (this.matches(cmd, ['scuro', 'abbassa', 'bassa'])) {
      const newVal = Math.max(0.2, current - 0.25);
      container.style.opacity = newVal;
      this.respond(`Luminosità ridotta a ${Math.round(newVal * 100)} percento.`);
    } else {
      const newVal = Math.min(1, current + 0.25);
      container.style.opacity = newVal;
      this.respond(`Luminosità aumentata a ${Math.round(newVal * 100)} percento.`);
    }
  }

  cmdChangeCity(cmd) {
    let city = cmd.replace(/meteo a|meteo di|tempo a|tempo di|cambia città/gi, '').trim();
    if (!city) {
      this.respond('Quale città? Ad esempio "meteo a Milano".');
      return;
    }
    city = city.charAt(0).toUpperCase() + city.slice(1);
    CONFIG.weather.city = city;
    localStorage.setItem('sm_city', city);
    this.respond(`Città impostata su ${city}. Aggiorno il meteo.`);
    if (typeof updateWeather === 'function') updateWeather();
    this.highlightWidget('weather-widget');
  }

  cmdSummary() {
    const time = document.getElementById('clock-time')?.textContent || '';
    const temp = document.getElementById('weather-temp')?.textContent || '';
    const desc = document.getElementById('weather-desc')?.textContent || '';
    this.respond(`Sono le ${time}. A ${CONFIG.weather.city.split(',')[0]} il meteo è ${desc}, ${temp}.`);
  }

  cmdHelp() {
    this.respond('Posso dirti il meteo della tua posizione, cercare una ricetta su Giallo Zafferano, aprire Spotify, controllare le luci e impostare timer.');
  }

  // ── Risposta vocale ──
  respond(text) {
    this.speak(text);
  }

  speak(text) {
    if (!this.synthesis) return;
    try {
      this.synthesis.cancel();
      // Rimuovi emoji prima di leggere per una voce naturale
      const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'it-IT';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      this.isSpeaking = true;
      utterance.onstart = () => { this.isSpeaking = true; };
      utterance.onend = () => { this.isSpeaking = false; };
      utterance.onerror = () => { this.isSpeaking = false; };

      if (this.italianVoice) {
        utterance.voice = this.italianVoice;
      }

      this.synthesis.speak(utterance);
    } catch (e) {
      this.isSpeaking = false;
      console.log('Errore sintesi vocale:', e);
    }
  }

  // ── Feedback Sonoro (Web Audio API) ──
  // Un solo AudioContext riusato: crearne uno a ogni bip, su iPad, porta
  // dopo qualche giorno al limite del sistema e i suoni smettono di partire.
  getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.audioChimeContext || this.audioChimeContext.state === 'closed') {
      this.audioChimeContext = new AudioCtx();
    }
    if (this.audioChimeContext.state === 'suspended') {
      this.audioChimeContext.resume().catch(() => {});
    }
    return this.audioChimeContext;
  }

  playChime(type) {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'wake') {
        osc.frequency.setValueAtTime(700, ctx.currentTime);
        osc.frequency.setValueAtTime(1050, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'alarm') {
        osc.frequency.setValueAtTime(850, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.2);
      }
    } catch (e) {
      console.warn('Bip non riprodotto:', e);
    }
  }

  // ── Visualizzazioni a Schermo ──
  showVoiceStatus(text, type) {
    const el = document.getElementById('voice-status');
    if (!el) return;
    el.textContent = text;
    el.className = `voice-status visible ${type || ''}`;
  }

  hideVoiceStatus() {
    const el = document.getElementById('voice-status');
    if (el) el.classList.remove('visible');
  }

  highlightWidget(widgetId) {
    const el = document.getElementById(widgetId);
    if (!el) return;
    el.classList.add('highlighted');
    setTimeout(() => el.classList.remove('highlighted'), 3000);
  }

  matches(text, keywords) {
    return keywords.some(kw => text.includes(kw));
  }
}

// Istanza globale
window.voiceControl = null;
document.addEventListener('DOMContentLoaded', () => {
  window.voiceControl = new VoiceControl();
});
