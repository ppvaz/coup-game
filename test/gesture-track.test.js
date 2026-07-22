import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGesturePose,
  defineGestureVocabulary,
  gesturePose,
  gestureProgress,
  startGesture,
} from '../packages/tabletop-stage/gesture-track.js';

const vocabulary = defineGestureVocabulary({
  soft: { duration: 1, priority: 1, pose: () => ({ body: { y: 0.2 } }) },
  hard: { duration: 2, priority: 3, pose: (progress) => ({ body: { y: progress, rotationX: -progress } }) },
  handed: { duration: 1, priority: 1, pose: () => ({ body: { y: 0.1 }, handRight: { x: 0.5 } }) },
});

test('um vocabulário exige pose e duração de cada gesto', () => {
  assert.throws(() => defineGestureVocabulary({ mudo: { duration: 1 } }), /mudo/u);
  assert.throws(() => defineGestureVocabulary({ eterno: { pose: () => ({}) } }), /eterno/u);
  assert.equal(vocabulary.soft.priority, 1);
});

test('o gesto mais forte atropela o fraco, e o fraco espera sua vez', () => {
  const soft = startGesture(vocabulary, null, 'soft', 0);
  assert.equal(soft.kind, 'soft');

  const hard = startGesture(vocabulary, soft, 'hard', 0.3);
  assert.equal(hard.kind, 'hard');
  assert.equal(hard.startedAt, 0.3);

  // Prioridade menor não interrompe o que ainda está em curso...
  assert.equal(startGesture(vocabulary, hard, 'soft', 1), hard);
  // ...mas assume assim que o forte termina.
  assert.equal(startGesture(vocabulary, hard, 'soft', 2.4).kind, 'soft');
});

test('gestos de mesma prioridade se substituem para que dois golpes sejam dois', () => {
  const first = startGesture(vocabulary, null, 'hard', 0);
  const second = startGesture(vocabulary, first, 'hard', 0.5);
  assert.equal(second.startedAt, 0.5);
});

test('um gesto desconhecido não derruba nem substitui o que está tocando', () => {
  const running = startGesture(vocabulary, null, 'soft', 0);
  assert.equal(startGesture(vocabulary, running, 'inexistente', 0.1), running);
  assert.equal(startGesture(vocabulary, null, 'inexistente', 0), null);
});

test('o progresso satura nas pontas em vez de extrapolar a pose', () => {
  const gesture = startGesture(vocabulary, null, 'hard', 10);
  assert.equal(gestureProgress(gesture, 9), 0);
  assert.equal(gestureProgress(gesture, 11), 0.5);
  assert.equal(gestureProgress(gesture, 99), 1);
});

test('a pose sai completa e some quando não há gesto', () => {
  const gesture = startGesture(vocabulary, null, 'hard', 0);
  assert.deepEqual(gesturePose(vocabulary, gesture, 1).body, {
    x: 0,
    y: 0.5,
    z: 0,
    rotationX: -0.5,
    rotationY: 0,
    rotationZ: 0,
    scale: 0,
  });
  assert.equal(gesturePose(vocabulary, null, 1), null);
});

test('o encaixe que o modelo não publica é descartado, não quebra o gesto', () => {
  const gesture = startGesture(vocabulary, null, 'handed', 0);
  const pose = gesturePose(vocabulary, gesture, 0.5, ['body']);
  assert.deepEqual(Object.keys(pose), ['body']);
  assert.equal(gesturePose(vocabulary, gesture, 0.5).handRight.x, 0.5);
});

test('aplicar a pose soma sobre o repouso e ignora encaixe ausente', () => {
  const body = {
    position: { x: 0, y: 1, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: {
      x: 1,
      setScalar(value) {
        this.x = value;
      },
    },
  };
  const gesture = startGesture(vocabulary, null, 'handed', 0);
  applyGesturePose({ body }, gesturePose(vocabulary, gesture, 0.5));
  assert.equal(body.position.y, 1.1);
  assert.equal(body.scale.x, 1);
});
