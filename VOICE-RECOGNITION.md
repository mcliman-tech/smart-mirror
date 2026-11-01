# Local voice recognition

Smart Mirror uses Vosk Browser 0.0.8 and the Italian Vosk small model 0.22.
The model is about 48 MB and is downloaded from this site when voice
recognition is started. Speech recognition then runs locally in the browser;
audio is not sent to a transcription API. The service worker bypasses this
large model file; Netlify sends it with long-lived browser cache headers, though
the browser can evict cached data and require another download.

Open the site in Safari over HTTPS, add it to the Home Screen, and tap the
microphone once after opening it to grant microphone access and start continuous
listening. Leave Smart Mirror in the foreground. iPadOS may suspend microphone
or audio processing when the app is backgrounded or the screen is locked; tap
the microphone to resume if the listening indicator reports that audio paused.

The browser demo can confirm that the model loads, but continuous listening and
Italian command accuracy still need to be verified on the target iPad Air 2.
