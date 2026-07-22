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
const ensureRadius = ([x, y, z], min) => {
  const radius = Math.hypot(x, z);
  if (radius >= min) return [x, y, z];
  const scale = min / (radius || 1);
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

// O trono vê o rosto do vencedor de um ângulo mais baixo, com a efígie do
// centro fora do eixo da visada.
export const throneCameraForSeat = (seat, seatCount) =>
  sideShot(seat, seatCount, {
    azimuthOffset: 0.5,
    radiusFactor: 1.95,
    height: 3.2,
    targetY: 1.8,
    fov: 36,
    portraitFov: 50,
  });
