let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('nv_muted') === '1';
} catch {
  muted = false;
}

function audio() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { dur = 0.08, type = 'sine', gain = 0.06, at = 0, slide = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  click: () => tone(520, { dur: 0.04, type: 'square', gain: 0.025 }),
  tick: () => tone(1400, { dur: 0.025, type: 'square', gain: 0.015 }),
  peg: () => tone(900 + Math.random() * 500, { dur: 0.03, type: 'triangle', gain: 0.02 }),
  card: () => tone(300, { dur: 0.05, type: 'triangle', gain: 0.04, slide: -120 }),
  gem: () => { tone(880, { dur: 0.09 }); tone(1320, { dur: 0.12, at: 0.06 }); },
  win: () => { [523, 659, 784].forEach((f, i) => tone(f, { dur: 0.14, type: 'triangle', gain: 0.05, at: i * 0.07 })); },
  bigWin: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { dur: 0.22, type: 'triangle', gain: 0.06, at: i * 0.09 })); },
  lose: () => tone(220, { dur: 0.25, type: 'sawtooth', gain: 0.035, slide: -120 }),
  boom: () => { tone(120, { dur: 0.4, type: 'sawtooth', gain: 0.06, slide: -80 }); tone(60, { dur: 0.5, type: 'square', gain: 0.04 }); },
  isMuted: () => muted,
  setMuted(flag) {
    muted = flag;
    try {
      localStorage.setItem('nv_muted', flag ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  },
};
