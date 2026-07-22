/**
 * Trilha de gestos: o jogo declara um vocabulário, o motor cuida de duração,
 * atropelo e avaliação por quadro. Nada aqui conhece cartas, papéis ou fases —
 * os nomes de gesto são opacos e vêm de quem monta a cena.
 *
 * A pose de um gesto é sempre **aditiva** e endereçada a *encaixes* nomeados
 * (`body`, `head`, `handLeft`...). O modelo publica os encaixes que possui e a
 * composição descarta o que não existir, então um gesto escrito para um boneco
 * com mãos ainda lê num boneco que só tem tronco: perde o detalhe, não quebra.
 */

const OFFSET_KEYS = Object.freeze(['x', 'y', 'z', 'rotationX', 'rotationY', 'rotationZ', 'scale']);

export const SOCKET_REST = Object.freeze(Object.fromEntries(OFFSET_KEYS.map((key) => [key, 0])));

const offset = (values) => {
  const result = { ...SOCKET_REST };
  for (const key of OFFSET_KEYS) if (values[key]) result[key] = values[key];
  return result;
};

/**
 * Congela um vocabulário `{ nome: { duration, priority, pose } }`. `pose`
 * recebe o progresso (0 a 1) e devolve `{ encaixe: deslocamento }`.
 */
export function defineGestureVocabulary(entries) {
  const vocabulary = {};
  for (const [kind, entry] of Object.entries(entries)) {
    if (typeof entry.pose !== 'function') throw new Error(`O gesto ${kind} precisa de uma pose.`);
    if (!(entry.duration > 0)) throw new Error(`O gesto ${kind} precisa de uma duração positiva.`);
    vocabulary[kind] = Object.freeze({
      duration: entry.duration,
      priority: entry.priority ?? 0,
      pose: entry.pose,
    });
  }
  return Object.freeze(vocabulary);
}

/**
 * Decide qual gesto o corpo passa a executar. Um gesto em curso só é
 * interrompido por outro de prioridade igual ou maior — assim um golpe não
 * apaga uma derrota, mas dois golpes seguidos continuam sendo dois golpes.
 * Devolve o gesto atual quando o novo não tem passagem.
 */
export function startGesture(vocabulary, current, kind, elapsed) {
  const definition = vocabulary[kind];
  if (!definition) return current;
  const running = current && elapsed < current.startedAt + current.duration ? vocabulary[current.kind] : null;
  if (running && running.priority > definition.priority) return current;
  return Object.freeze({ kind, startedAt: elapsed, duration: definition.duration });
}

export function gestureProgress(gesture, elapsed) {
  if (!gesture) return 1;
  return Math.min(Math.max((elapsed - gesture.startedAt) / gesture.duration, 0), 1);
}

/**
 * Deslocamentos do gesto no instante `elapsed`, já normalizados e restritos aos
 * encaixes que o modelo oferece. Devolve `null` quando não há nada a somar.
 */
export function gesturePose(vocabulary, gesture, elapsed, sockets = null) {
  const definition = gesture && vocabulary[gesture.kind];
  if (!definition) return null;
  const pose = definition.pose(gestureProgress(gesture, elapsed));
  const composed = {};
  for (const [socket, values] of Object.entries(pose)) {
    if (sockets && !sockets.includes(socket)) continue;
    composed[socket] = offset(values);
  }
  return composed;
}

/** Aplica os deslocamentos sobre a pose de repouso de cada encaixe. */
export function applyGesturePose(objects, pose) {
  for (const [socket, values] of Object.entries(pose ?? {})) {
    const object = objects[socket];
    if (!object) continue;
    object.position.x += values.x;
    object.position.y += values.y;
    object.position.z += values.z;
    object.rotation.x += values.rotationX;
    object.rotation.y += values.rotationY;
    object.rotation.z += values.rotationZ;
    if (values.scale) object.scale.setScalar(object.scale.x + values.scale);
  }
}
