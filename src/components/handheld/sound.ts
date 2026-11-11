/**
 * The handheld's beeper, with Web Audio. Three sounds, as the app makes them:
 * a short tick per read, "tit-tit" when a send goes through, and three low
 * tones when it fails — so the result is heard without looking.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // no audio (tests, locked-down browsers): stay silent
  }
}

function tone(freq: number, at: number, ms: number, volume: number, type: OscillatorType = 'square') {
  const a = audio();
  if (!a || volume <= 0) return;
  const start = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Square waves are loud: keep the ceiling well below clipping.
  gain.gain.setValueAtTime(0.08 * volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
  osc.connect(gain).connect(a.destination);
  osc.start(start);
  osc.stop(start + ms / 1000 + 0.02);
}

/** volume is 0..1 */
export const beep = {
  read: (v: number) => tone(2700, 0, 35, v * 0.6),
  sent: (v: number) => {
    tone(2200, 0, 70, v);
    tone(2200, 0.11, 70, v);
  },
  failed: (v: number) => {
    tone(320, 0, 160, v, 'sawtooth');
    tone(320, 0.22, 160, v, 'sawtooth');
    tone(320, 0.44, 160, v, 'sawtooth');
  },
};
