// Foley do salão 3D: sons curtos amarrados aos mesmos eventos autoritativos
// que já movem a cena — moedas, cartas viradas e arremessos. Tudo é
// sintetizado no AudioContext da mesa 2D, então entrar no salão não baixa
// nenhum asset de áudio e o mudo de sons continua tendo uma fonte de verdade
// só. Este módulo entra pelo import dinâmico de `coup-table.js`, junto do
// resto do salão.

// Vários assentos podem mudar no mesmo snapshot (um roubo mexe em dois, o fim
// de uma rodada de moedas em mais). Um gesto deve soar como um gesto, não como
// uma salva, então cada evento tem um intervalo mínimo próprio.
const MIN_GAP_MS = 70;

const NOISE_SECONDS = 0.4;
const noiseBuffers = new WeakMap();

const noiseBuffer = (context) => {
  const cached = noiseBuffers.get(context);
  if (cached) return cached;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * NOISE_SECONDS), context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
  noiseBuffers.set(context, buffer);
  return buffer;
};

// Tinido metálico de uma moeda pousando na pilha.
const clink = (context, at, frequency, volume) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, at);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.86, at + 0.06);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.085);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + 0.1);
};

// Ruído filtrado: papel da carta batendo na mesa e o ar do arremesso.
const rustle = (context, at, { frequency, sweepTo, q, volume, duration }) => {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer(context);
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(frequency, at);
  filter.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + duration * 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(at);
  source.stop(at + duration + 0.02);
};

// Ganho sobe de tom e gasto desce: dá para ouvir de que lado da mesa o tesouro
// se moveu sem tirar os olhos da carta que está sendo jogada.
export const FOLEY_EVENTS = {
  'coins-gain': (context, at) => {
    clink(context, at, 1180, 0.03);
    clink(context, at + 0.055, 1520, 0.024);
  },
  'coins-loss': (context, at) => {
    clink(context, at, 1420, 0.028);
    clink(context, at + 0.06, 1010, 0.022);
  },
  card: (context, at) => {
    rustle(context, at, { frequency: 1750, sweepTo: 780, q: 0.9, volume: 0.03, duration: 0.11 });
  },
  throw: (context, at) => {
    rustle(context, at, { frequency: 620, sweepTo: 2450, q: 1.6, volume: 0.026, duration: 0.34 });
  },
  // Baque surdo do adereço chegando no ombro: o arremesso precisa terminar em
  // algum lugar, senão o objeto some no ar e o gesto do alvo vem sem causa.
  impact: (context, at) => {
    rustle(context, at, { frequency: 420, sweepTo: 140, q: 0.8, volume: 0.03, duration: 0.13 });
    clink(context, at + 0.02, 260, 0.014);
  },
  declare: (context, at) => {
    rustle(context, at, { frequency: 1280, sweepTo: 620, q: 1.05, volume: 0.028, duration: 0.14 });
    clink(context, at + 0.07, 760, 0.018);
  },
  block: (context, at) => {
    clink(context, at, 540, 0.032);
    clink(context, at + 0.07, 430, 0.024);
  },
  challenge: (context, at) => {
    rustle(context, at, { frequency: 740, sweepTo: 3100, q: 1.8, volume: 0.03, duration: 0.2 });
    clink(context, at + 0.04, 1720, 0.021);
  },
  defeat: (context, at) => {
    clink(context, at, 820, 0.026);
    clink(context, at + 0.08, 390, 0.022);
  },
  victory: (context, at) => {
    clink(context, at, 880, 0.024);
    clink(context, at + 0.08, 1110, 0.026);
    clink(context, at + 0.16, 1480, 0.028);
  },
};

export function createTabletopFoley({ sounds, now = () => performance.now() } = {}) {
  const lastPlayedAt = new Map();

  const play = async (name) => {
    const voice = FOLEY_EVENTS[name];
    if (!voice || !sounds || sounds.isMuted()) return false;
    const at = now();
    if (at - (lastPlayedAt.get(name) ?? -Infinity) < MIN_GAP_MS) return false;
    lastPlayedAt.set(name, at);
    let available = false;
    try {
      available = await sounds.unlock();
    } catch {
      return false;
    }
    const context = available ? sounds.audioContext() : null;
    if (!context) return false;
    voice(context, context.currentTime);
    return true;
  };

  return { play };
}
