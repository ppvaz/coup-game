import { defineGestureVocabulary } from '@la-corte/tabletop-stage/gesture-track';

/**
 * O vocabulário corporal da corte. Cada pose é aditiva sobre a respiração do
 * assento e endereça o encaixe `body`, o único que o cortesão publica hoje —
 * ele não tem mãos nem rosto articulados. Um gesto que quisesse mão escreveria
 * `handRight` aqui e o motor descartaria sozinho até o modelo ganhar o encaixe.
 *
 * `priority` resolve o atropelo: um tomate no ombro não apaga a queda de uma
 * influência, e nada interrompe a reverência final.
 */
export const COURT_GESTURES = defineGestureVocabulary({
  assert: {
    duration: 0.9,
    priority: 1,
    pose: (progress) => ({ body: { y: wave(progress) * 0.2, rotationX: -wave(progress) * 0.12 } }),
  },
  // Reverência: agradece a rosa curvando-se, sem sair da cadeira.
  grace: {
    duration: 1.1,
    priority: 1,
    pose: (progress) => ({ body: { y: -wave(progress) * 0.05, rotationX: wave(progress) * 0.22 } }),
  },
  block: {
    duration: 0.9,
    priority: 2,
    pose: (progress) => ({ body: { y: wave(progress) * 0.1, rotationZ: wave(progress) * 0.2 } }),
  },
  challenge: {
    duration: 0.9,
    priority: 2,
    pose: (progress) => ({
      body: { y: wave(progress) * 0.14, rotationZ: Math.sin(progress * Math.PI * 2) * 0.13 },
    }),
  },
  prove: {
    duration: 1,
    priority: 3,
    pose: (progress) => ({ body: { y: wave(progress) * 0.12, scale: wave(progress) * 0.09 } }),
  },
  // Recuo seco: o baque acontece no primeiro terço e o resto é o cortesão se
  // recompondo — na corte, perder a postura é pior que apanhar.
  impact: {
    duration: 0.75,
    priority: 3,
    pose: (progress) => {
      const blow = Math.sin(Math.min(1, progress / 0.42) * Math.PI);
      const recovery = 1 - Math.max(0, (progress - 0.42) / 0.58);
      return {
        body: {
          y: blow * 0.07,
          rotationX: -0.26 * blow * Math.max(0.25, recovery),
          rotationZ: Math.sin(progress * Math.PI * 7) * 0.07 * recovery,
        },
      };
    },
  },
  defeat: {
    duration: 1.15,
    priority: 4,
    pose: (progress) => ({
      body: {
        y: -wave(progress) * 0.08,
        rotationX: Math.sin(Math.min(1, progress * 1.25) * (Math.PI / 2)) * 0.27,
      },
    }),
  },
  victory: {
    duration: 1.35,
    priority: 4,
    pose: (progress) => ({ body: { y: wave(progress) * 0.28, scale: wave(progress) * 0.12 } }),
  },
});

function wave(progress) {
  return Math.sin(progress * Math.PI);
}

// A rosa é cortesia; o resto do arsenal da corte chega como agressão.
const THROWABLE_GESTURES = Object.freeze({ rose: 'grace' });

export const impactGesture = (throwable) => THROWABLE_GESTURES[throwable] ?? 'impact';
