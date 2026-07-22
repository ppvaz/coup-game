import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundManager } from '../src/lib/sounds.js';

const makeStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

class FakeAudioContext {
  static oscillators = [];
  currentTime = 10;
  destination = {};
  state = 'running';

  createOscillator() {
    const oscillator = {
      frequency: { setValueAtTime() {} },
      connect() {},
      start() {},
      stop() {},
    };
    FakeAudioContext.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    };
  }
}

class FakeAudio {
  static instances = [];

  constructor(source) {
    this.source = source;
    this.listeners = {};
    this.paused = false;
    FakeAudio.instances.push(this);
  }

  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  finish() {
    this.listeners.ended?.();
  }
}

test('mute é persistido e impede a criação de tons', async () => {
  FakeAudioContext.oscillators = [];
  const storage = makeStorage({ 'la-corte-muted': 'true' });
  const sounds = createSoundManager({ AudioContext: FakeAudioContext, storage });
  assert.equal(sounds.isMuted(), true);
  assert.equal(await sounds.play('turn'), false);
  assert.equal(FakeAudioContext.oscillators.length, 0);

  assert.equal(sounds.toggle(), false);
  assert.equal(await sounds.play('turn'), true);
  assert.equal(FakeAudioContext.oscillators.length, 2);
  assert.equal(storage.getItem('la-corte-muted'), 'false');
});

test('funciona silenciosamente quando Web Audio não está disponível', async () => {
  const sounds = createSoundManager({ AudioContext: null, storage: makeStorage() });
  assert.equal(await sounds.play('victory'), false);
});

test('toca somente a primeira fala e descarta qualquer áudio enquanto ela toca', () => {
  FakeAudio.instances = [];
  const storage = makeStorage({ 'la-corte-voices-muted': 'false' });
  const sounds = createSoundManager({ Audio: FakeAudio, AudioContext: null, storage });

  assert.equal(sounds.playVoices(['challenge.mp3', 'proved.mp3']), true);
  assert.equal(FakeAudio.instances[0].source, 'challenge.mp3');
  assert.equal(sounds.playVoices('lost.mp3'), false);
  assert.equal(FakeAudio.instances[0].paused, false);
  assert.equal(FakeAudio.instances.length, 1);

  FakeAudio.instances[0].finish();
  assert.equal(sounds.playVoices('lost.mp3'), true);
  assert.equal(FakeAudio.instances[1].source, 'lost.mp3');
});

test('persiste efeitos e vozes separadamente', async () => {
  FakeAudio.instances = [];
  FakeAudioContext.oscillators = [];
  const storage = makeStorage({ 'la-corte-voices-muted': 'false' });
  const sounds = createSoundManager({ Audio: FakeAudio, AudioContext: FakeAudioContext, storage });

  assert.equal(sounds.toggle(), true);
  assert.equal(storage.getItem('la-corte-muted'), 'true');
  assert.equal(sounds.playVoices('voice.mp3'), true);
  assert.equal(sounds.isVoicePlaying(), true);

  assert.equal(sounds.toggleVoices(), true);
  assert.equal(storage.getItem('la-corte-voices-muted'), 'true');
  assert.equal(FakeAudio.instances[0].paused, true);
  assert.equal(sounds.playVoices('another.mp3'), false);

  assert.equal(sounds.toggle(), false);
  assert.equal(await sounds.play('action'), true);
  assert.equal(FakeAudioContext.oscillators.length, 1);
});

test('a trilha entra em loop, num volume abaixo das falas, e não reinicia a cada render', () => {
  FakeAudio.instances = [];
  const sounds = createSoundManager({ Audio: FakeAudio, AudioContext: null, storage: makeStorage() });

  assert.equal(sounds.isMusicMuted(), false);
  assert.equal(sounds.playMusic('corte.ogg'), true);
  assert.equal(FakeAudio.instances.length, 1);
  assert.equal(FakeAudio.instances[0].loop, true);
  assert.ok(FakeAudio.instances[0].volume < 0.9);

  assert.equal(sounds.playMusic('corte.ogg'), false);
  assert.equal(FakeAudio.instances.length, 1);
});

test('silenciar a trilha pausa sem perder a posição e religar retoma a mesma faixa', () => {
  FakeAudio.instances = [];
  const storage = makeStorage();
  const sounds = createSoundManager({ Audio: FakeAudio, AudioContext: null, storage });

  sounds.playMusic('corte.ogg');
  assert.equal(sounds.toggleMusic(), true);
  assert.equal(storage.getItem('la-corte-music-muted'), 'true');
  assert.equal(FakeAudio.instances[0].paused, true);

  assert.equal(sounds.toggleMusic(), false);
  assert.equal(FakeAudio.instances[0].paused, false);
  // Retomar não pode criar um segundo elemento tocando por cima do primeiro.
  assert.equal(sounds.playMusic('corte.ogg'), false);
  assert.equal(FakeAudio.instances.length, 1);
});

test('parar a trilha descarta a instância e permite reiniciar na próxima mesa', () => {
  FakeAudio.instances = [];
  const sounds = createSoundManager({ Audio: FakeAudio, AudioContext: null, storage: makeStorage() });

  sounds.playMusic('corte.ogg');
  const first = FakeAudio.instances[0];
  sounds.stopMusic();
  assert.equal(first.paused, true);

  assert.equal(sounds.playMusic('corte.ogg'), true);
  assert.equal(FakeAudio.instances.length, 2);
});

test('trilha silenciada não cria áudio e é independente de efeitos e vozes', async () => {
  FakeAudio.instances = [];
  FakeAudioContext.oscillators = [];
  const sounds = createSoundManager({
    Audio: FakeAudio,
    AudioContext: FakeAudioContext,
    storage: makeStorage({ 'la-corte-music-muted': 'true', 'la-corte-voices-muted': 'false' }),
  });

  assert.equal(sounds.isMusicMuted(), true);
  assert.equal(sounds.playMusic('corte.ogg'), false);
  assert.equal(FakeAudio.instances.length, 0);

  assert.equal(await sounds.play('turn'), true);
  assert.equal(sounds.playVoices('voice.mp3'), true);
  assert.equal(sounds.isMusicMuted(), true);
});

test('inicia com vozes desligadas e respeita uma escolha salva', () => {
  FakeAudio.instances = [];
  const freshStorage = makeStorage();
  const freshSounds = createSoundManager({ Audio: FakeAudio, AudioContext: null, storage: freshStorage });

  assert.equal(freshSounds.isVoicesMuted(), true);
  assert.equal(freshSounds.playVoices('voice.mp3'), false);
  assert.equal(freshSounds.toggleVoices(), false);
  assert.equal(freshStorage.getItem('la-corte-voices-muted'), 'false');
  assert.equal(freshSounds.playVoices('voice.mp3'), true);

  const savedSounds = createSoundManager({
    Audio: FakeAudio,
    AudioContext: null,
    storage: makeStorage({ 'la-corte-voices-muted': 'false' }),
  });
  assert.equal(savedSounds.isVoicesMuted(), false);
});
