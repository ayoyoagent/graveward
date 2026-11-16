// Procedural audio for GRAVEWARD: every sound is synthesized with the
// WebAudio API, so the game ships no audio files. The context is created
// lazily on the first user gesture (browsers block audio before that).
// Nothing here is needed for the game to run; calls are no-ops until the
// context exists.

let ctx = null;
let master = null;
let musicTimer = null;

function ensure() {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

export function initAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
  startMusic();
}

function tone({ freq = 440, freqEnd = null, dur = 0.15, type = 'sine', vol = 0.3, when = 0 }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.1, vol = 0.3, freq = 1200, when = 0 }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + when;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t0);
}

export const sfx = {
  shoot() { noise({ dur: 0.08, vol: 0.25, freq: 2400 }); tone({ freq: 320, freqEnd: 90, dur: 0.09, type: 'square', vol: 0.12 }); },
  bow() { noise({ dur: 0.06, vol: 0.15, freq: 3600 }); },
  swing() { noise({ dur: 0.14, vol: 0.2, freq: 900 }); },
  hit() { tone({ freq: 220, freqEnd: 140, dur: 0.07, type: 'triangle', vol: 0.22 }); },
  kill() { tone({ freq: 660, dur: 0.08, type: 'sine', vol: 0.25 }); tone({ freq: 990, dur: 0.14, type: 'sine', vol: 0.22, when: 0.07 }); },
  coin() { tone({ freq: 1320, dur: 0.06, type: 'sine', vol: 0.18 }); tone({ freq: 1760, dur: 0.1, type: 'sine', vol: 0.15, when: 0.05 }); },
  hurt() { tone({ freq: 180, freqEnd: 70, dur: 0.22, type: 'sawtooth', vol: 0.3 }); },
  dash() { noise({ dur: 0.16, vol: 0.18, freq: 1800 }); },
  upgrade() { [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'sine', vol: 0.22, when: i * 0.08 })); },
  boss() { tone({ freq: 98, freqEnd: 55, dur: 0.8, type: 'sawtooth', vol: 0.3 }); tone({ freq: 147, freqEnd: 82, dur: 0.8, type: 'sawtooth', vol: 0.2, when: 0.1 }); },
  slam() { noise({ dur: 0.25, vol: 0.35, freq: 500 }); tone({ freq: 90, freqEnd: 40, dur: 0.25, type: 'sine', vol: 0.35 }); },
  victory() { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'sine', vol: 0.25, when: i * 0.12 })); },
  defeat() { [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'triangle', vol: 0.22, when: i * 0.16 })); },
  click() { tone({ freq: 880, dur: 0.05, type: 'sine', vol: 0.15 }); },
};

// A quiet two-note bass pulse under the run, scheduled on a timer. Kept
// soft so it never fights the effects.
const BASS = [110, 110, 131, 98];
let musicStep = 0;
function startMusic() {
  if (musicTimer || !ensure()) return;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const f = BASS[musicStep % BASS.length];
    musicStep += 1;
    tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.05 });
  }, 480);
}
