// The record player: a warm little loop made in the browser (no files to download), with vinyl crackle.
// When Sean uploads his own tracks, they replace this.
let ctx = null, master = null, timer = null, crackle = null;
const CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // Fmaj7 Em7 Dm7 Cmaj7
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function noiseBuffer() {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.012;
  return b;
}

function pad(time, notes, dur) {
  for (const m of notes) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = det;
      g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(0.05, time + 0.4); g.gain.linearRampToValueAtTime(0.0001, time + dur);
      o.connect(g).connect(master); o.start(time); o.stop(time + dur + 0.05);
    }
  }
  const b = ctx.createOscillator(), bg = ctx.createGain();
  b.type = 'sine'; b.frequency.value = hz(notes[0] - 12);
  bg.gain.setValueAtTime(0.18, time); bg.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.9);
  b.connect(bg).connect(master); b.start(time); b.stop(time + dur);
}

function kick(time) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(110, time); o.frequency.exponentialRampToValueAtTime(40, time + 0.18);
  g.gain.setValueAtTime(0.5, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  o.connect(g).connect(master); o.start(time); o.stop(time + 0.32);
}

export function playing() { return !!timer; }

export function play() {
  if (timer) return;
  ctx ||= new AudioContext();
  ctx.resume();
  master = ctx.createGain(); master.gain.value = 0.0001;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
  master.connect(lp).connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.2);
  crackle = ctx.createBufferSource(); crackle.buffer = noiseBuffer(); crackle.loop = true; crackle.connect(master); crackle.start();
  const beat = 60 / 76; let bar = 0, next = ctx.currentTime + 0.1;
  const schedule = () => {
    while (next < ctx.currentTime + 1.5) {
      pad(next, CHORDS[bar % 4], beat * 4);
      for (const k of [0, 2.5]) kick(next + k * beat);
      next += beat * 4; bar++;
    }
  };
  schedule(); timer = setInterval(schedule, 400);
}

export function stop() {
  if (!timer) return;
  clearInterval(timer); timer = null;
  const g = master, c = crackle;
  g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
  setTimeout(() => { try { c.stop(); g.disconnect(); } catch { /* already stopped */ } }, 700);
}
