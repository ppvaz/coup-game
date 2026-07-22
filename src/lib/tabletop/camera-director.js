// Diretor automático de câmera do salão. `directCamera` decide o ato e os
// assentos enquadrados a partir da visão projetada — puro, para os testes de
// Node — e os helpers de geometria resolvem as coordenadas de atos dirigidos.
// A cena aplica o corte somente quando `cameraDecisionKey` muda.

export function directCamera(view) {
  const seats = view?.seats ?? [];
  const bySummary = (summary) => seats.find((seat) => seat.id === summary?.id) ?? null;
  const self = seats.find((seat) => seat.isSelf) ?? null;
  const actor = seats.find((seat) => seat.isActor) ?? null;
  const target = seats.find((seat) => seat.isTarget) ?? null;
  const blocker = seats.find((seat) => seat.isBlocker) ?? null;
  const table = { act: 'table', seatIds: [] };
  if (view?.targeting) {
    const selected = seats.find((seat) => seat.id === view.targeting.selectedTargetId);
    return selected
      ? { act: 'targeting-seat', seatIds: [selected.id] }
      : { act: 'targeting', seatIds: view.targeting.targetIds };
  }
  // Quando a decisão pertence ao observador, a bancada é o próprio palco de
  // escolha. O duelo volta ao quadro assim que a intenção for enviada.
  if (view?.decision && self)
    return { act: view.decision.kind === 'action' ? 'player' : 'intervention', seatIds: [self.id] };
  switch (view?.beat) {
    case 'claim':
    case 'block-window': {
      if (!actor) return table;
      const rival = target && target.id !== actor.id ? target : null;
      return rival ? { act: 'duel', seatIds: [actor.id, rival.id] } : { act: 'claim', seatIds: [actor.id] };
    }
    case 'block-claim': {
      if (!blocker) return table;
      const rival = actor && actor.id !== blocker.id ? actor : null;
      return { act: 'duel', seatIds: rival ? [blocker.id, rival.id] : [blocker.id] };
    }
    case 'influence-loss': {
      const loser = bySummary(view.influenceLoser);
      if (!loser) return table;
      return { act: loser.isSelf ? 'player' : 'evidence', seatIds: [loser.id] };
    }
    case 'exchange': {
      if (!actor) return table;
      return { act: actor.isSelf ? 'player' : 'evidence', seatIds: [actor.id] };
    }
    case 'victory': {
      const winner = seats.find((seat) => seat.isWinner) ?? bySummary(view.winner);
      return { act: 'throne', seatIds: winner ? [winner.id] : [] };
    }
    default:
      return self?.isCurrent ? { act: 'player', seatIds: [self.id] } : table;
  }
}

export const cameraDecisionKey = (decision) => `${decision.act}:${decision.seatIds.join('+')}`;

export function targetingCameraAct() {
  return {
    position: [0, 6.05, 11.85],
    target: [0, 1.2, -0.15],
    fov: 54,
    portrait: { position: [0, 6.85, 11.25], target: [0, 1.35, -0.35], fov: 70 },
  };
}

function cameraForElements(elements, { tight = false } = {}) {
  const points = (elements ?? []).filter(
    (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z),
  );
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const zs = points.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const spread = Math.max(tight ? 1.6 : 3.2, maxX - minX + (maxZ - minZ) * 0.45);
  return {
    position: [centerX, centerY + (tight ? 2.25 : 2.85), maxZ + (tight ? 5.3 : 7.7) + spread * 0.18],
    target: [centerX, centerY, centerZ],
    fov: tight ? 40 : 46,
    portrait: {
      position: [centerX, centerY + (tight ? 3.1 : 4.05), maxZ + (tight ? 7.2 : 9.8) + spread * 0.32],
      target: [centerX, centerY - 0.08, centerZ],
      fov: tight ? 54 : 61,
    },
  };
}

/** Enquadra objetos móveis sem assumir que o tríptico continua no centro. */
export const interventionCameraForElements = (elements) => cameraForElements(elements);

/** Aproxima a efígie armada sem perder a carta que ela está respondendo. */
export const confirmationCameraForElements = (elements) => cameraForElements(elements, { tight: true });

export function influenceRevealCamera(view) {
  const playerId = view?.latestInfluenceLoss?.player?.id;
  const seat = view?.seats?.find((candidate) => candidate.id === playerId);
  if (!seat) return null;
  return { act: seat.isSelf ? 'player' : 'evidence', seatIds: [seat.id] };
}

// Mesma elipse de assentos usada pelas câmeras POV/Jogador da cena.
const seatRadii = (seatCount) => (seatCount <= 3 ? { x: 5.15, z: 4.25 } : { x: 5.55, z: 4.65 });

const seatPoint = (seat, seatCount) => {
  const { x, z } = seatRadii(seatCount);
  return { x: Math.sin(seat.azimuthRad) * x, z: Math.cos(seat.azimuthRad) * z };
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Empurra a posição radialmente para fora do miolo da mesa quando preciso.
const ensureRadius = ([x, y, z], min, max = Number.POSITIVE_INFINITY) => {
  const radius = Math.hypot(x, z);
  if (radius >= min && radius <= max) return [x, y, z];
  const scale = clamp(radius, min, max) / (radius || 1);
  return [x * scale, y, z * scale];
};

// Alegações sem alvo pertencem ao centro da mesa. A câmera permanece atrás
// do ator, mostrando-o como origem, mas mira a carta pública, a efígie e o
// selo em vez de transformar a declaração num retrato lateral.
export function claimCameraForSeat(seat, seatCount) {
  const { x, z } = seatRadii(seatCount);
  const outwardX = Math.sin(seat.azimuthRad);
  const outwardZ = Math.cos(seat.azimuthRad);
  return {
    position: [outwardX * x * 2.05, 5.25, outwardZ * z * 2.05],
    target: [0, 1.65, 0],
    fov: 47,
    portrait: {
      position: [outwardX * x * 2.07, 6.15, outwardZ * z * 2.07],
      target: [0, 1.6, 0],
      fov: 64,
    },
  };
}

// Nenhum plano dirigido se aproxima do centro da mesa (raio < 6): a carta de
// ação e a efígie vivem ali, e cruzar o miolo cortaria esses elementos.
// Plano lateral elevado sobre a elipse dos assentos: enquadra o assento em
// três quartos sem cruzar o centro nem colar nos vizinhos.
function sideShot(seat, seatCount, { azimuthOffset, radiusFactor, height, targetY, fov, portraitFov }) {
  const { x, z } = seatRadii(seatCount);
  const point = seatPoint(seat, seatCount);
  const az = seat.azimuthRad + azimuthOffset;
  const target = [point.x * 0.85, targetY, point.z * 0.85];
  // O recuo extra do portrait respeita o teto de raio do salão.
  const portraitFactor = Math.min(radiusFactor + 0.12, 2.02);
  return {
    position: [Math.sin(az) * x * radiusFactor, height, Math.cos(az) * z * radiusFactor],
    target,
    fov,
    portrait: {
      position: [Math.sin(az) * x * portraitFactor, height + 0.8, Math.cos(az) * z * portraitFactor],
      target,
      fov: portraitFov,
    },
  };
}

// Confronto com a corte inteira: frontal de raio longo — a câmera fica bem
// atrás da fileira de assentos do lado oposto, quase alinhada ao ator (offset
// pequeno tira a carta central do eixo), vendo o rosto sem vizinho no quadro.
const confrontCamera = (seat, seatCount) =>
  sideShot(seat, seatCount, {
    azimuthOffset: 0.6,
    radiusFactor: 1.9,
    height: 3.8,
    targetY: 1.6,
    fov: 40,
    portraitFov: 52,
  });

export function duelCameraForSeats(subjects, seatCount) {
  if (subjects.length < 2) return confrontCamera(subjects[0], seatCount);
  const [first, second] = subjects.map((seat) => seatPoint(seat, seatCount));
  const mid = { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 };
  const separation = Math.hypot(second.x - first.x, second.z - first.z) || 1;
  const side = { x: -(second.z - first.z) / separation, z: (second.x - first.x) / separation };
  const distance = clamp(separation * 0.95, 6.6, 11.2);
  // Dois candidatos perpendiculares ao eixo do duelo; vence o de raio mais
  // próximo do ideal, evitando tanto o miolo da mesa quanto as paredes.
  const sign = [1, -1]
    .map((candidate) => ({
      candidate,
      radius: Math.hypot(mid.x + side.x * distance * candidate, mid.z + side.z * distance * candidate),
    }))
    .sort((left, right) => Math.abs(left.radius - 9.8) - Math.abs(right.radius - 9.8))[0].candidate;
  const height = 3.7 + separation * 0.12;
  const position = [mid.x + side.x * distance * sign, height, mid.z + side.z * distance * sign];
  const target = [mid.x * 0.92, 1.45, mid.z * 0.92];
  const fov = clamp(Math.round((2 * Math.atan2(separation / 2 + 1.3, distance) * 180) / Math.PI), 42, 62);
  // Portrait não comporta o eixo horizontal do duelo: vira over-the-shoulder
  // vertical — câmera atrás e acima do primeiro envolvido, rival ao fundo no
  // terço superior — sem deixar a lente entrar no miolo da mesa.
  const axis = { x: (second.x - first.x) / separation, z: (second.z - first.z) / separation };
  const overShoulder = ensureRadius([first.x - axis.x * 3.6, 4.3, first.z - axis.z * 3.6], 6.2);
  return {
    position,
    target,
    fov,
    portrait: {
      position: overShoulder,
      target: [second.x * 0.9, 1.5, second.z * 0.9],
      fov: 54,
    },
  };
}

// Resultado financeiro: conserva as duas bancadas no quadro e inclina o
// portrait para enxergar a trajetória sobre a mesa, sem usar um personagem
// em primeiro plano como acontece no duelo dramático.
export function coinTransferCameraForSeats(subjects, seatCount) {
  if (subjects.length < 2) return claimCameraForSeat(subjects[0], seatCount);
  const [first, second] = subjects.map((seat) => seatPoint(seat, seatCount));
  const mid = { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 };
  const separation = Math.hypot(second.x - first.x, second.z - first.z) || 1;
  const axis = { x: (second.x - first.x) / separation, z: (second.z - first.z) / separation };
  // Recuo longo reduz a perspectiva do assento próximo: ele deixa de cobrir
  // a bancada distante, mas ambos continuam alinhados verticalmente.
  const portraitPosition = ensureRadius([first.x - axis.x * 7, 7.3, first.z - axis.z * 7], 7.2, 11.2);
  const duel = duelCameraForSeats(subjects, seatCount);
  const target = [mid.x * 0.9, 1.15, mid.z * 0.9];
  return {
    ...duel,
    target,
    fov: Math.max(duel.fov, 48),
    portrait: {
      position: portraitPosition,
      target,
      fov: 61,
    },
  };
}

// Na vitória o cortesão deixa a cadeira e ocupa o centro do salão. O plano
// precisa acompanhar essa nova posição cênica, não a geografia do assento que
// ele ocupava durante a partida.
export const throneCameraForSeat = (seat, seatCount) => {
  // O meio passo angular coloca a lente no vão entre duas cadeiras. Partir da
  // antiga posição do vencedor mantém o plano estável em qualquer lotação.
  const gapAzimuth = seat.azimuthRad + Math.PI / Math.max(2, seatCount);
  return {
    position: [Math.sin(gapAzimuth) * 6.9, 3.35, Math.cos(gapAzimuth) * 6.9],
    target: [0, 1.76, 0],
    fov: 32,
    portrait: {
      position: [Math.sin(gapAzimuth) * 7.2, 3.75, Math.cos(gapAzimuth) * 7.2],
      target: [0, 1.8, 0],
      fov: 42,
    },
  };
};
