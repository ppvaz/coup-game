const MUTE_KEY = 'la-corte-muted';
const VOICES_MUTE_KEY = 'la-corte-voices-muted';
const MUSIC_MUTE_KEY = 'la-corte-music-muted';

// A trilha fica bem abaixo das falas (0.9) para nunca cobrir uma contestação.
const MUSIC_VOLUME = 0.3;

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

const readMuted = (storage, key, defaultValue = false) => {
  try {
    const saved = storage?.getItem(key);
    return saved == null ? defaultValue : saved === 'true';
  } catch {
    return defaultValue;
  }
};

export function createSoundManager(options = {}) {
  const AudioContext = options.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const AudioPlayer = options.Audio ?? globalThis.Audio;
  const storage = options.storage ?? globalThis.localStorage;
  let context = null;
  let muted = readMuted(storage, MUTE_KEY);
  let voicesMuted = readMuted(storage, VOICES_MUTE_KEY, true);
  let musicMuted = readMuted(storage, MUSIC_MUTE_KEY);
  let currentVoice = null;
  let voiceQueue = [];
  let voiceRun = 0;
  let music = null;
  let musicSource = null;

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

  const stopVoices = () => {
    voiceRun += 1;
    voiceQueue = [];
    currentVoice?.pause();
    currentVoice = null;
  };

  const setVoicesMuted = (value) => {
    voicesMuted = Boolean(value);
    if (voicesMuted) stopVoices();
    try {
      storage?.setItem(VOICES_MUTE_KEY, String(voicesMuted));
    } catch {
      // A preferência fica válida nesta página mesmo sem storage.
    }
    return voicesMuted;
  };

  const playNextVoice = (run) => {
    if (run !== voiceRun || voicesMuted || !voiceQueue.length) return;
    const source = voiceQueue.shift();
    let voice;
    try {
      voice = new AudioPlayer(source);
    } catch {
      playNextVoice(run);
      return;
    }
    currentVoice = voice;
    voice.preload = 'auto';
    voice.volume = 0.9;
    const advance = () => {
      if (run !== voiceRun || currentVoice !== voice) return;
      currentVoice = null;
      playNextVoice(run);
    };
    voice.addEventListener('ended', advance, { once: true });
    voice.addEventListener('error', advance, { once: true });
    Promise.resolve(voice.play()).catch(advance);
  };

  const playVoices = (sources) => {
    const playable = (Array.isArray(sources) ? sources : [sources]).filter(Boolean);
    if (voicesMuted || !AudioPlayer || !playable.length) return false;
    if (currentVoice || voiceQueue.length) return false;
    voiceQueue = [playable[0]];
    playNextVoice(voiceRun);
    return true;
  };

  const stopMusic = () => {
    music?.pause();
    music = null;
    musicSource = null;
  };

  const setMusicMuted = (value) => {
    musicMuted = Boolean(value);
    // Pausar em vez de descartar preserva a posição da trilha ao religar.
    if (musicMuted) music?.pause();
    else if (music) Promise.resolve(music.play()).catch(() => {});
    try {
      storage?.setItem(MUSIC_MUTE_KEY, String(musicMuted));
    } catch {
      // A preferência fica válida nesta página mesmo sem storage.
    }
    return musicMuted;
  };

  const playMusic = (source) => {
    if (musicMuted || !AudioPlayer || !source) return false;
    // Cada render chama isto; repetir a mesma faixa não pode reiniciá-la.
    if (music && musicSource === source) {
      // Uma tentativa feita antes do primeiro gesto pode ter sido bloqueada
      // pelo navegador. Nesse caso, o próximo gesto retoma a mesma instância.
      if (music.paused) {
        Promise.resolve(music.play()).catch(() => {});
        return true;
      }
      return false;
    }
    stopMusic();
    let track;
    try {
      track = new AudioPlayer(source);
    } catch {
      return false;
    }
    music = track;
    musicSource = source;
    track.loop = true;
    track.preload = 'auto';
    track.volume = MUSIC_VOLUME;
    Promise.resolve(track.play()).catch(() => {});
    return true;
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
    isVoicesMuted: () => voicesMuted,
    setVoicesMuted,
    toggleVoices: () => setVoicesMuted(!voicesMuted),
    isVoicePlaying: () => Boolean(currentVoice || voiceQueue.length),
    isMusicMuted: () => musicMuted,
    setMusicMuted,
    toggleMusic: () => setMusicMuted(!musicMuted),
    playMusic,
    stopMusic,
    // O foley do salão 3D sintetiza os próprios timbres, mas precisa do mesmo
    // contexto para que exista uma única cadeia de áudio e um único mudo.
    audioContext: () => getContext(),
    unlock,
    play,
    playVoices,
    stopVoices,
  };
}
