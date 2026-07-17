const MUTE_KEY = 'la-corte-muted';

const PATTERNS = {
  turn: [
    { frequency: 523.25, at: 0, duration: 0.12, volume: 0.035 },
    { frequency: 659.25, at: 0.13, duration: 0.18, volume: 0.04 },
  ],
  warning: [{ frequency: 880, at: 0, duration: 0.08, volume: 0.028, type: 'square' }],
  action: [{ frequency: 392, at: 0, duration: 0.09, volume: 0.018 }],
  message: [
    { frequency: 659.25, at: 0, duration: 0.06, volume: 0.018 },
    { frequency: 783.99, at: 0.07, duration: 0.09, volume: 0.02 },
  ],
  victory: [
    { frequency: 392, at: 0, duration: 0.16, volume: 0.035 },
    { frequency: 523.25, at: 0.16, duration: 0.16, volume: 0.04 },
    { frequency: 659.25, at: 0.32, duration: 0.3, volume: 0.045 },
  ],
  defeat: [
    { frequency: 392, at: 0, duration: 0.18, volume: 0.03 },
    { frequency: 329.63, at: 0.18, duration: 0.18, volume: 0.028 },
    { frequency: 261.63, at: 0.36, duration: 0.3, volume: 0.025 },
  ],
};

const readMuted = (storage) => {
  try {
    return storage?.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
};

export function createSoundManager(options = {}) {
  const AudioContext = options.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const storage = options.storage ?? globalThis.localStorage;
  let context = null;
  let muted = readMuted(storage);

  const getContext = () => {
    if (!context && AudioContext) context = new AudioContext();
    return context;
  };

  const unlock = async () => {
    const audio = getContext();
    if (audio?.state === 'suspended') await audio.resume();
    return Boolean(audio);
  };

  const setMuted = (value) => {
    muted = Boolean(value);
    try {
      storage?.setItem(MUTE_KEY, String(muted));
    } catch {
      // A preferência fica válida nesta página mesmo sem storage.
    }
    return muted;
  };

  const play = async (name) => {
    if (muted || !PATTERNS[name]) return false;
    let available = false;
    try {
      available = await unlock();
    } catch {
      return false;
    }
    if (!available) return false;
    const start = context.currentTime;
    for (const note of PATTERNS[name]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = start + note.at;
      oscillator.type = note.type ?? 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(note.volume, noteStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + note.duration + 0.02);
    }
    return true;
  };

  return {
    isMuted: () => muted,
    setMuted,
    toggle: () => setMuted(!muted),
    unlock,
    play,
  };
}
