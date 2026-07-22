import test from 'node:test';
import assert from 'node:assert/strict';
import { gesturePose, startGesture } from '../packages/tabletop-stage/gesture-track.js';
import { COURT_GESTURES, impactGesture } from '../src/lib/tabletop/coup-table/gestures.js';
import { TABLETOP_THROWABLES } from '../src/lib/tabletop/reactions.js';

test('todo adereço arremessado tem um gesto de chegada no vocabulário', () => {
  for (const throwable of TABLETOP_THROWABLES) {
    const kind = impactGesture(throwable.id);
    assert.ok(COURT_GESTURES[kind], `${throwable.id} pede um gesto ${kind} que não existe`);
  }
  // A rosa é o único adereço cortês da mesa.
  assert.equal(impactGesture('rose'), 'grace');
  assert.equal(impactGesture('tomato'), 'impact');
});

test('o impacto cede à derrota e à vitória, mas atropela uma alegação', () => {
  const claim = startGesture(COURT_GESTURES, null, 'assert', 0);
  assert.equal(startGesture(COURT_GESTURES, claim, 'impact', 0.2).kind, 'impact');

  const loss = startGesture(COURT_GESTURES, null, 'defeat', 0);
  assert.equal(startGesture(COURT_GESTURES, loss, 'impact', 0.2), loss);

  const crown = startGesture(COURT_GESTURES, null, 'victory', 0);
  assert.equal(startGesture(COURT_GESTURES, crown, 'impact', 0.2), crown);
});

// Sem isso a interrupção salta: um gesto pode entrar a qualquer instante e
// precisa partir de onde o corpo já está.
test('toda pose da corte nasce no repouso do assento', () => {
  for (const kind of Object.keys(COURT_GESTURES)) {
    const pose = gesturePose(COURT_GESTURES, { kind, startedAt: 0, duration: 1 }, 0).body;
    for (const [axis, value] of Object.entries(pose)) {
      assert.ok(Math.abs(value) < 1e-9, `${kind} começa fora do repouso em ${axis}: ${value}`);
    }
  }
});

// `defeat` é a exceção conhecida: ele segura o tronco curvado até o fim e o
// assento volta ao repouso de um quadro para o outro.
test('os gestos de reação ao arremesso também terminam no repouso', () => {
  for (const kind of ['impact', 'grace']) {
    const gesture = { kind, startedAt: 0, duration: COURT_GESTURES[kind].duration };
    const pose = gesturePose(COURT_GESTURES, gesture, gesture.duration).body;
    for (const [axis, value] of Object.entries(pose)) {
      assert.ok(Math.abs(value) < 1e-9, `${kind} termina fora do repouso em ${axis}: ${value}`);
    }
  }
});

test('o cortesão só é tocado pelo encaixe que publica', () => {
  for (const kind of Object.keys(COURT_GESTURES)) {
    const gesture = { kind, startedAt: 0, duration: COURT_GESTURES[kind].duration };
    assert.deepEqual(Object.keys(gesturePose(COURT_GESTURES, gesture, 0.3)), ['body']);
  }
});

test('o recuo do impacto é para trás e acontece no primeiro terço', () => {
  const gesture = startGesture(COURT_GESTURES, null, 'impact', 0);
  const blow = gesturePose(COURT_GESTURES, gesture, gesture.duration * 0.21).body;
  const settling = gesturePose(COURT_GESTURES, gesture, gesture.duration * 0.85).body;
  assert.ok(blow.rotationX < -0.2, 'o baque precisa jogar o tronco para trás');
  assert.ok(Math.abs(settling.rotationX) < Math.abs(blow.rotationX), 'o cortesão precisa se recompor');
});

test('a reverência da rosa curva para a frente, ao contrário do baque', () => {
  const gesture = startGesture(COURT_GESTURES, null, 'grace', 0);
  assert.ok(gesturePose(COURT_GESTURES, gesture, gesture.duration / 2).body.rotationX > 0);
});
