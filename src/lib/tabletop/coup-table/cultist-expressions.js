// Expressões do cultista e o mapa gesto→rosto. Puro de propósito: a face reage
// aos mesmos beats que animam o corpo (COURT_GESTURES), então a regra da reação
// precisa ser testável sem construir malha nem abrir WebGL.

export const CULTIST_EXPRESSIONS = Object.freeze(['neutro', 'riso', 'choque', 'desprezo', 'sono']);

// Cada gesto da corte carrega um humor. Desafiar e bloquear são desdém; provar,
// reverenciar e vencer abrem um riso; apanhar e cair viram choque.
const GESTURE_EXPRESSION = Object.freeze({
  assert: 'desprezo',
  challenge: 'desprezo',
  block: 'desprezo',
  prove: 'riso',
  grace: 'riso',
  victory: 'riso',
  impact: 'choque',
  defeat: 'choque',
});

export function expressionForGesture(gesture) {
  return GESTURE_EXPRESSION[gesture] ?? 'neutro';
}
