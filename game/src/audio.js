// SOLMAR audio: every sound is synthesized with WebAudio. No audio files,
// no external URLs. All methods no-op safely before unlock() (which must be
// called from a user gesture), and every method is guarded so audio can
// never crash the game.

const CHORDS = [
  // Am – F – C – G, each as [root, third, fifth] in Hz (equal temperament).
  [110.00, 130.81, 164.81], // A2 C3 E3
  [87.31, 130.81, 174.61], // F2 C3 F3
  [130.81, 164.81, 196.00], // C3 E3 G3
  [98.00, 146.83, 196.00], // G2 D3 G3
];
const CHORD_SECONDS = 8;
const MUSIC_VOLUME = 0.05;

export function createAudio() {
  let ctx = null;
  let master = null;

  // Engine: sawtooth osc + lowpass + filtered noise, gain follows speed.
  let engine = null; // {osc, noise, noiseGain, filter, gain, noiseSrc}
  // Siren: one oscillator whose frequency alternates 700/950 Hz.
  let siren = null; // {osc, gain}
  // Music: pad oscillators + bass, chord changes every CHORD_SECONDS.
  let music = null; // {padGain, bassGain, padOscs, bassOsc, chordIndex, timer}

  let lastSkidAt = 0;

  function ensureContext() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Short white-noise buffer, reused by every noise-based sound.
  function noiseBuffer(seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playNoise({ duration, filterType = 'lowpass', frequency = 1200, q = 1, gain = 0.3, when = 0 }) {
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  function playTone({ type = 'sine', freq = 440, freqEnd = null, duration = 0.2, gain = 0.2, when = 0, attack = 0.005 }) {
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function stopNode(node) {
    try { node.stop(); } catch (e) { /* already stopped */ }
    try { node.disconnect(); } catch (e) { /* already disconnected */ }
  }

  // --- engine loop (created lazily, kept alive while driving) ---
  function ensureEngine() {
    if (engine || !ctx) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      filter.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(master);
      osc.start();

      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer(2);
      noiseSrc.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 500;
      noiseFilter.Q.value = 0.6;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0;
      noiseSrc.connect(noiseFilter).connect(noiseGain).connect(master);
      noiseSrc.start();

      engine = { osc, filter, gain, noiseSrc, noiseFilter, noiseGain };
    } catch (e) {
      engine = null;
    }
  }

  function teardownEngine() {
    if (!engine) return;
    stopNode(engine.osc);
    stopNode(engine.noiseSrc);
    engine = null;
  }

  // --- siren loop ---
  function ensureSiren() {
    if (siren || !ctx) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 700;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(master);
      osc.start();
      siren = { osc, gain, phase: 0, timer: 0 };
    } catch (e) {
      siren = null;
    }
  }

  function teardownSiren() {
    if (!siren) return;
    stopNode(siren.osc);
    siren = null;
  }

  // --- music loop ---
  function startMusicNodes() {
    if (music || !ctx) return;
    try {
      const padGain = ctx.createGain();
      padGain.gain.value = 0;
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 900;
      padFilter.connect(padGain).connect(master);

      const padOscs = [];
      for (let i = 0; i < 3; i++) {
        for (const detune of [-6, 6]) {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = CHORDS[0][i];
          osc.detune.value = detune;
          osc.connect(padFilter);
          osc.start();
          padOscs.push(osc);
        }
      }
      const bassOsc = ctx.createOscillator();
      bassOsc.type = 'sine';
      bassOsc.frequency.value = CHORDS[0][0] / 2;
      const bassGain = ctx.createGain();
      bassGain.gain.value = 0;
      bassOsc.connect(bassGain).connect(master);
      bassOsc.start();

      padGain.gain.linearRampToValueAtTime(MUSIC_VOLUME, ctx.currentTime + 2);
      bassGain.gain.linearRampToValueAtTime(MUSIC_VOLUME * 0.9, ctx.currentTime + 2);
      music = { padGain, bassGain, padOscs, bassOsc, chordIndex: 0, timer: 0 };
    } catch (e) {
      music = null;
    }
  }

  function stopMusicNodes() {
    if (!music) return;
    const t = ctx ? ctx.currentTime : 0;
    try {
      music.padGain.gain.linearRampToValueAtTime(0, t + 0.5);
      music.bassGain.gain.linearRampToValueAtTime(0, t + 0.5);
    } catch (e) { /* ignore */ }
    const m = music;
    music = null;
    setTimeout(() => {
      for (const osc of m.padOscs) stopNode(osc);
      stopNode(m.bassOsc);
    }, 600);
  }

  function applyChord(index) {
    if (!music) return;
    const chord = CHORDS[index % CHORDS.length];
    const t = ctx.currentTime;
    // Pad oscillators are grouped in pairs per chord note (detuned +/-6).
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const osc = music.padOscs[i * 2 + j];
        if (osc) osc.frequency.linearRampToValueAtTime(chord[i], t + 1.2);
      }
    }
    music.bassOsc.frequency.linearRampToValueAtTime(chord[0] / 2, t + 1.2);
  }

  return {
    // Create/resume the AudioContext. Call on the first user gesture.
    unlock() {
      try {
        if (!ensureContext()) return;
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { /* audio unavailable; everything else no-ops */ }
    },

    // Engine hum. on=false silences it; speed01 0 (idle) .. 1 (top speed).
    setEngine(on, speed01) {
      try {
        if (!ctx) return;
        if (!on) { teardownEngine(); return; }
        ensureEngine();
        if (!engine) return;
        const s = Math.max(0, Math.min(1, speed01 || 0));
        const t = ctx.currentTime;
        engine.osc.frequency.setTargetAtTime(52 + s * 165, t, 0.08);
        engine.filter.frequency.setTargetAtTime(300 + s * 1400, t, 0.08);
        engine.gain.gain.setTargetAtTime(0.05 + s * 0.075, t, 0.08);
        engine.noiseFilter.frequency.setTargetAtTime(400 + s * 900, t, 0.08);
        engine.noiseGain.gain.setTargetAtTime(0.012 + s * 0.035, t, 0.08);
      } catch (e) { /* never crash the game */ }
    },

    // Short filtered-noise burst; rate-limited to ~150 ms.
    skid() {
      try {
        if (!ctx) return;
        const now = performance.now();
        if (now - lastSkidAt < 150) return;
        lastSkidAt = now;
        playNoise({ duration: 0.22, filterType: 'bandpass', frequency: 1800, q: 1.2, gain: 0.12 });
      } catch (e) { /* ignore */ }
    },

    // Sharp noise crack + low thump.
    shot() {
      try {
        if (!ctx) return;
        playNoise({ duration: 0.12, filterType: 'highpass', frequency: 900, gain: 0.5 });
        playTone({ type: 'sine', freq: 160, freqEnd: 45, duration: 0.16, gain: 0.5 });
      } catch (e) { /* ignore */ }
    },

    // Soft thud.
    punch() {
      try {
        if (!ctx) return;
        playNoise({ duration: 0.09, filterType: 'lowpass', frequency: 500, gain: 0.35 });
        playTone({ type: 'sine', freq: 110, freqEnd: 55, duration: 0.12, gain: 0.4 });
      } catch (e) { /* ignore */ }
    },

    // Two-tone police siren loop while on; off otherwise.
    siren(on) {
      try {
        if (!ctx) return;
        if (!on) { teardownSiren(); return; }
        ensureSiren();
        if (!siren) return;
        siren.gain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
      } catch (e) { /* ignore */ }
    },

    // Pleasant two-note pickup chime (E5 -> A5).
    chime() {
      try {
        if (!ctx) return;
        playTone({ type: 'sine', freq: 659.25, duration: 0.18, gain: 0.18 });
        playTone({ type: 'sine', freq: 880.00, duration: 0.3, gain: 0.18, when: 0.09 });
      } catch (e) { /* ignore */ }
    },

    // Short major-arpeggio jingle (C E G C).
    success() {
      try {
        if (!ctx) return;
        [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
          playTone({ type: 'triangle', freq: f, duration: 0.32, gain: 0.2, when: i * 0.11 });
        });
      } catch (e) { /* ignore */ }
    },

    // Low descending two-note (A3 -> E3).
    fail() {
      try {
        if (!ctx) return;
        playTone({ type: 'sawtooth', freq: 220.00, duration: 0.35, gain: 0.14 });
        playTone({ type: 'sawtooth', freq: 164.81, duration: 0.55, gain: 0.14, when: 0.28 });
      } catch (e) { /* ignore */ }
    },

    // UI tick.
    click() {
      try {
        if (!ctx) return;
        playTone({ type: 'square', freq: 1250, duration: 0.05, gain: 0.08 });
      } catch (e) { /* ignore */ }
    },

    // Coin blip (B5 -> E6, quick).
    pickup() {
      try {
        if (!ctx) return;
        playTone({ type: 'sine', freq: 987.77, duration: 0.08, gain: 0.16 });
        playTone({ type: 'sine', freq: 1318.51, duration: 0.16, gain: 0.16, when: 0.06 });
      } catch (e) { /* ignore */ }
    },

    // Car horn: two detuned saws, 0.4 s.
    horn() {
      try {
        if (!ctx) return;
        playTone({ type: 'sawtooth', freq: 370, duration: 0.4, gain: 0.12 });
        playTone({ type: 'sawtooth', freq: 466, duration: 0.4, gain: 0.12 });
      } catch (e) { /* ignore */ }
    },

    // Quiet ambient pad loop: Am – F – C – G, chord every 8 s, plus soft bass.
    setMusic(on) {
      try {
        if (!ctx) return;
        if (!on) { stopMusicNodes(); return; }
        startMusicNodes();
      } catch (e) { /* ignore */ }
    },

    // Advance the music chord timer; keep siren/engine nodes in sync.
    update(dt) {
      try {
        if (!ctx || ctx.state !== 'running') return;
        const step = Math.max(0, dt || 0);
        // Siren alternates 700 / 950 Hz every 0.45 s.
        if (siren) {
          siren.timer += step;
          if (siren.timer >= 0.45) {
            siren.timer = 0;
            siren.phase = 1 - siren.phase;
            siren.osc.frequency.setTargetAtTime(siren.phase ? 950 : 700, ctx.currentTime, 0.03);
          }
        }
        // Music chord change every 8 s.
        if (music) {
          music.timer += step;
          if (music.timer >= CHORD_SECONDS) {
            music.timer = 0;
            music.chordIndex = (music.chordIndex + 1) % CHORDS.length;
            applyChord(music.chordIndex);
          }
        }
      } catch (e) { /* ignore */ }
    },
  };
}
