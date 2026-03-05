/**
 * SAPI4 TTS client — connects to sapi4-api Docker container
 * and provides voice synthesis with playback.
 */

// ── DOM elements ──
const statusDot = document.getElementById('tts-status') as HTMLElement;
const endpointInput = document.getElementById('tts-endpoint') as HTMLInputElement;
const connectBtn = document.getElementById('tts-connect-btn') as HTMLButtonElement;
const voiceSelect = document.getElementById('tts-voice-select') as HTMLSelectElement;
const useAgentCheckbox = document.getElementById('tts-use-agent') as HTMLInputElement;
const agentVoiceLabel = document.getElementById('tts-agent-label') as HTMLElement;
const pitchSlider = document.getElementById('tts-pitch') as HTMLInputElement;
const speedSlider = document.getElementById('tts-speed') as HTMLInputElement;
const gainSlider = document.getElementById('tts-gain') as HTMLInputElement;
const pitchVal = document.getElementById('tts-pitch-val') as HTMLElement;
const speedVal = document.getElementById('tts-speed-val') as HTMLElement;
const gainVal = document.getElementById('tts-gain-val') as HTMLElement;
const textInput = document.getElementById('tts-text') as HTMLInputElement;
const speakBtn = document.getElementById('tts-speak-btn') as HTMLButtonElement;

// ── State ──
// In dev, use Vite proxy (/tts) to avoid CORS. In prod, use direct URL.
let apiEndpoint = import.meta.env.DEV ? '/tts' : 'http://localhost:8085';
let connected = false;
let speaking = false;
let ttsAudioContext: AudioContext | null = null;

// The currently loaded agent filename (set from main.ts)
let currentAgentFile: string | null = null;

// ── Status helpers ──
function setStatus(state: 'disconnected' | 'connected' | 'loading' | 'error') {
  statusDot.className = 'tts-status';
  if (state === 'connected') statusDot.classList.add('connected');
  else if (state === 'error') statusDot.classList.add('error');
  else if (state === 'loading') statusDot.classList.add('loading');
  connected = state === 'connected';
  speakBtn.disabled = !connected || speaking;
}

// ── Slider value display ──
pitchSlider.addEventListener('input', () => { pitchVal.textContent = pitchSlider.value; });
speedSlider.addEventListener('input', () => { speedVal.textContent = speedSlider.value; });
gainSlider.addEventListener('input', () => { gainVal.textContent = gainSlider.value; });

// ── Connect to API ──
async function connect() {
  apiEndpoint = endpointInput.value.replace(/\/+$/, '');
  setStatus('loading');

  try {
    const res = await fetch(`${apiEndpoint}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status === 'ok') {
      setStatus('connected');
      await loadVoices();
    } else {
      throw new Error('Bad health response');
    }
  } catch (err) {
    console.error('TTS connect failed:', err);
    setStatus('error');
  }
}

// ── Load available voices ──
async function loadVoices() {
  try {
    const res = await fetch(`${apiEndpoint}/voices`);
    const data = await res.json();
    if (data.success && data.voices) {
      // Parse the voice list output from sapi4-rs
      // Format: "  Name: Adult Male #1, ..." etc.
      const voiceLines = data.voices.split('\n');
      const voices: { name: string; speaker: string }[] = [];
      let currentVoice: { name: string; speaker: string } = { name: '', speaker: '' };

      for (const line of voiceLines) {
        const nameMatch = line.match(/^\s+Name:\s+(.+)/);
        const speakerMatch = line.match(/^\s+Speaker:\s+(.+)/);
        if (nameMatch) {
          currentVoice = { name: nameMatch[1].trim(), speaker: '' };
        }
        if (speakerMatch) {
          currentVoice.speaker = speakerMatch[1].trim();
          voices.push({ ...currentVoice });
        }
      }

      // Populate dropdown
      voiceSelect.innerHTML = '<option value="">Default (Sam)</option>';
      for (const voice of voices) {
        const opt = document.createElement('option');
        opt.value = voice.name;
        opt.textContent = voice.speaker
          ? `${voice.name} (${voice.speaker})`
          : voice.name;
        voiceSelect.appendChild(opt);
      }
      voiceSelect.disabled = false;
    }
  } catch (err) {
    console.warn('Failed to load voices:', err);
  }
}

// ── Speak ──
async function speak() {
  const text = textInput.value.trim();
  if (!text || !connected || speaking) return;

  speaking = true;
  speakBtn.disabled = true;
  speakBtn.textContent = 'Speaking...';

  try {
    // Build request body
    const body: Record<string, unknown> = { text };

    // Use agent voice if checkbox is checked and an agent is loaded
    if (useAgentCheckbox.checked && currentAgentFile) {
      body.agent = currentAgentFile;
    } else if (voiceSelect.value) {
      body.voice = voiceSelect.value;
    }

    body.pitch = parseInt(pitchSlider.value);
    body.speed = parseInt(speedSlider.value);
    body.gain = parseFloat(gainSlider.value);

    const res = await fetch(`${apiEndpoint}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    // Get WAV audio and play it
    const arrayBuffer = await res.arrayBuffer();
    await playAudio(arrayBuffer);
  } catch (err) {
    console.error('TTS speak failed:', err);
    alert(`TTS Error: ${err}`);
  } finally {
    speaking = false;
    speakBtn.disabled = !connected;
    speakBtn.textContent = 'Speak';
  }
}

// ── Audio playback ──
async function playAudio(wavBuffer: ArrayBuffer) {
  if (!ttsAudioContext) {
    ttsAudioContext = new AudioContext();
  }

  if (ttsAudioContext.state === 'suspended') {
    await ttsAudioContext.resume();
  }

  const audioBuffer = await ttsAudioContext.decodeAudioData(wavBuffer);
  const source = ttsAudioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ttsAudioContext.destination);

  return new Promise<void>((resolve) => {
    source.onended = () => resolve();
    source.start();
  });
}

// ── Event listeners ──
connectBtn.addEventListener('click', connect);
speakBtn.addEventListener('click', speak);

// Enter key to speak
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    speak();
  }
});

// ── Public API for main.ts ──
export function setCurrentAgent(agentFilename: string | null) {
  currentAgentFile = agentFilename;
  // Update just the label text — don't destroy/recreate DOM elements
  if (agentFilename) {
    const name = agentFilename.replace('.acs', '').replace('.ACS', '');
    agentVoiceLabel.textContent = `Use ${name} voice`;
  } else {
    agentVoiceLabel.textContent = 'Use loaded agent voice';
  }
}

// Auto-connect on load
connect();
