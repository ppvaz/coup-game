import test from 'node:test';
import assert from 'node:assert/strict';
import { createTabletopFoley, FOLEY_EVENTS } from '../src/lib/tabletop/foley.js';

const ramp = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });

class FakeAudioContext {
  currentTime = 4;
  destination = {};
  sampleRate = 48000;
  state = 'running';
  started = [];

  createOscillator() {
    const oscillator = {
      type: '',
      frequency: ramp(),
      connect() {},
      start: () => this.started.push('oscillator'),
      stop() {},
    };
    return oscillator;
  }

  createGain() {
    return { gain: ramp(), connect() {} };
  }

  createBufferSource() {
    return { buffer: null, connect() {}, start: () => this.started.push('noise'), stop() {} };
  }

  createBiquadFilter() {
    return { type: '', Q: { value: 0 }, frequency: ramp(), connect() {} };
  }

  createBuffer(channels, length) {
    return { getChannelData: () => new Float32Array(length) };
  }
}

const makeSounds = ({ muted = false, context = new FakeAudioContext() } = {}) => ({
  isMuted: () => muted,
  unlock: async () => Boolean(context),
  audioContext: () => context,
  context,
});

test('o mudo de sons também cala o foley do salão', async () => {
  const sounds = makeSounds({ muted: true });
  const foley = createTabletopFoley({ sounds });

  assert.equal(await foley.play('coins-gain'), false);
  assert.equal(await foley.play('card'), false);
  assert.deepEqual(sounds.context.started, []);
});

test('cada evento sintetiza a própria voz, sem baixar assets', async () => {
  const sounds = makeSounds();
  let clock = 0;
  const foley = createTabletopFoley({ sounds, now: () => clock });

  assert.equal(await foley.play('coins-gain'), true);
  clock += 500;
  assert.equal(await foley.play('card'), true);
  clock += 500;
  assert.equal(await foley.play('throw'), true);

  // Moedas são osciladores; carta e arremesso são ruído filtrado.
  assert.deepEqual(sounds.context.started, ['oscillator', 'oscillator', 'noise', 'noise']);
});

test('um evento sem voz definida não toca nada', async () => {
  const sounds = makeSounds();
  const foley = createTabletopFoley({ sounds, now: () => 0 });

  assert.equal(await foley.play('victory'), false);
  assert.deepEqual(sounds.context.started, []);
});

test('um snapshot que move vários assentos soa como um gesto só', async () => {
  const sounds = makeSounds();
  let clock = 0;
  const foley = createTabletopFoley({ sounds, now: () => clock });

  // Seis assentos perdendo moeda no mesmo quadro.
  const burst = await Promise.all(Array.from({ length: 6 }, () => foley.play('coins-loss')));
  assert.deepEqual(burst, [true, false, false, false, false, false]);

  // Um roubo mexe nos dois lados: ganho e perda são eventos distintos e ambos
  // soam, porque a direção do tesouro é a informação.
  assert.equal(await foley.play('coins-gain'), true);

  clock += 71;
  assert.equal(await foley.play('coins-loss'), true);
});

test('ganho e gasto de moedas são distinguíveis pelo tom', async () => {
  const frequencies = { 'coins-gain': [], 'coins-loss': [] };
  const context = {
    currentTime: 0,
    destination: {},
    createGain: () => ({ gain: ramp(), connect() {} }),
    createOscillator: () => ({ type: '', frequency: ramp(), connect() {}, start() {}, stop() {} }),
  };

  for (const name of ['coins-gain', 'coins-loss']) {
    context.createOscillator = () => ({
      type: '',
      frequency: { setValueAtTime: (value) => frequencies[name].push(value), exponentialRampToValueAtTime() {} },
      connect() {},
      start() {},
      stop() {},
    });
    FOLEY_EVENTS[name](context, 0);
  }

  const [gainFirst, gainSecond] = frequencies['coins-gain'];
  const [lossFirst, lossSecond] = frequencies['coins-loss'];
  assert.ok(gainSecond > gainFirst, 'ganho sobe de tom');
  assert.ok(lossSecond < lossFirst, 'gasto desce de tom');
});
