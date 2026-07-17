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
