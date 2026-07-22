import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame } from '../src/game/coup.js';
import { projectCoupTableView } from '../src/lib/tabletop/coup-view.js';
import {
  cameraDecisionKey,
  claimCameraForSeat,
  coinTransferCameraForSeats,
  confirmationCameraForElements,
  directCamera,
  duelCameraForSeats,
  influenceRevealCamera,
  interventionCameraForElements,
  throneCameraForSeat,
} from '../src/lib/tabletop/camera-director.js';

const seats = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Bia' },
  { id: 'c', name: 'Caio' },
];
const newGame = () => createGame(seats, { random: () => 0.42 });

test('turno local vai para a câmera Jogador; turno rival fica na Mesa', () => {
  const game = newGame();
  assert.deepEqual(directCamera(projectCoupTableView(game, 'a')), { act: 'player', seatIds: ['a'] });
  assert.deepEqual(directCamera(projectCoupTableView(game, 'b')), { act: 'table', seatIds: [] });
});

test('escolha de alvo começa geral e focaliza o rival pré-selecionado', () => {
  const view = projectCoupTableView(newGame(), 'a', { targetAction: 'steal' });
  assert.deepEqual(directCamera(view), { act: 'targeting', seatIds: ['b', 'c'] });
  const selected = projectCoupTableView(newGame(), 'a', { targetAction: 'steal', selectedTargetId: 'c' });
  assert.deepEqual(directCamera(selected), { act: 'targeting-seat', seatIds: ['c'] });
});

test('a intervenção local prioriza o tríptico; observadores continuam vendo alegação e duelo', () => {
  const tax = dispatchGame(newGame(), { type: 'declare_action', actorId: 'a', action: 'tax' });
  assert.deepEqual(directCamera(projectCoupTableView(tax, 'b')), { act: 'intervention', seatIds: ['b'] });
  assert.deepEqual(directCamera(projectCoupTableView(tax, 'c')), { act: 'claim', seatIds: ['a'] });
  const steal = dispatchGame(newGame(), { type: 'declare_action', actorId: 'a', action: 'steal', targetId: 'b' });
  assert.deepEqual(directCamera(projectCoupTableView(steal, 'c')), { act: 'duel', seatIds: ['a', 'b'] });
});

test('a câmera só vai à bancada quando a resposta chega ao observador', () => {
  let game = dispatchGame(newGame(), { type: 'declare_action', actorId: 'a', action: 'tax' });
  const before = cameraDecisionKey(directCamera(projectCoupTableView(game, 'c')));
  assert.equal(before, 'claim:a');
  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  assert.equal(cameraDecisionKey(directCamera(projectCoupTableView(game, 'c'))), 'intervention:c');
});

test('janela de bloqueio e contestação do bloqueio dirigem o duelo certo', () => {
  let game = dispatchGame(newGame(), { type: 'declare_action', actorId: 'a', action: 'foreign_aid' });
  assert.equal(game.phase, 'block');
  assert.deepEqual(directCamera(projectCoupTableView(game, 'c')), { act: 'claim', seatIds: ['a'] });
  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  game = dispatchGame(game, { type: 'block', actorId: 'c', role: 'Duque' });
  assert.equal(game.phase, 'challenge_block');
  assert.deepEqual(directCamera(projectCoupTableView(game, 'b')), { act: 'duel', seatIds: ['c', 'a'] });
});

test('perda de influência enquadra a vítima; a própria mão usa Jogador', () => {
  const game = newGame();
  game.players.find((player) => player.id === 'a').coins = 7;
  const coup = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'coup', targetId: 'b' });
  assert.equal(coup.phase, 'choose_influence');
  assert.deepEqual(directCamera(projectCoupTableView(coup, 'b')), { act: 'player', seatIds: ['b'] });
  assert.deepEqual(directCamera(projectCoupTableView(coup, 'a')), { act: 'evidence', seatIds: ['b'] });
});

test('depois da escolha, a câmera de confirmação preserva o foco em quem revelou a carta', () => {
  const game = newGame();
  game.players.find((player) => player.id === 'a').coins = 7;
  const awaitingReveal = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'coup', targetId: 'b' });
  const card = awaitingReveal.players.find((player) => player.id === 'b').cards[0];
  const revealed = dispatchGame(awaitingReveal, { type: 'reveal_influence', actorId: 'b', cardId: card.id });

  const selfView = projectCoupTableView(revealed, 'b');
  assert.equal(selfView.latestInfluenceLoss.role, card.role);
  assert.deepEqual(influenceRevealCamera(selfView), { act: 'player', seatIds: ['b'] });
  assert.deepEqual(influenceRevealCamera(projectCoupTableView(revealed, 'c')), {
    act: 'evidence',
    seatIds: ['b'],
  });
});

test('troca da Embaixadora é privada para o ator e testemunhada pelos rivais', () => {
  let game = dispatchGame(newGame(), { type: 'declare_action', actorId: 'a', action: 'exchange' });
  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  game = dispatchGame(game, { type: 'pass', actorId: 'c' });
  assert.equal(game.phase, 'exchange');
  assert.deepEqual(directCamera(projectCoupTableView(game, 'a')), { act: 'player', seatIds: ['a'] });
  assert.deepEqual(directCamera(projectCoupTableView(game, 'c')), { act: 'evidence', seatIds: ['a'] });
});

test('vitória corta para o trono do vencedor', () => {
  const duo = createGame(seats.slice(0, 2), { random: () => 0.42, startingPlayerId: 'a' });
  duo.players.find((player) => player.id === 'a').coins = 7;
  const bia = duo.players.find((player) => player.id === 'b');
  bia.cards[0].revealed = true;
  // Com uma única influência restante, o motor resolve a perda na declaração.
  const game = dispatchGame(duo, { type: 'declare_action', actorId: 'a', action: 'coup', targetId: 'b' });
  assert.equal(game.status, 'finished');
  assert.deepEqual(directCamera(projectCoupTableView(game, 'b')), { act: 'throne', seatIds: ['a'] });
  const shot = throneCameraForSeat(projectCoupTableView(game, 'b').seats[0], 2);
  assert.deepEqual(shot.target, [0, 1.76, 0]);
  assert.equal(Math.hypot(shot.position[0], shot.position[2]) > 6.5, true);
  // Dois jogadores ocupam lados opostos; o plano de vitória entra pelo vão.
  assert.equal(Math.abs(shot.position[2]) < 0.001, true);
});

test('foco de elementos acompanha posição e abertura do tríptico', () => {
  const points = [
    { x: -1.75, y: 2.3, z: 0 },
    { x: 0, y: 2.35, z: 0 },
    { x: 1.75, y: 2.3, z: 0 },
  ];
  const base = interventionCameraForElements(points);
  const shifted = interventionCameraForElements(points.map((point) => ({ ...point, x: point.x + 2, z: point.z - 1 })));
  assert.equal(shifted.target[0], base.target[0] + 2);
  assert.equal(shifted.target[2], base.target[2] - 1);
  assert.equal(shifted.position[0], base.position[0] + 2);
  const wider = interventionCameraForElements([
    { x: -3, y: 2.3, z: 0 },
    { x: 3, y: 2.3, z: 0 },
  ]);
  assert.ok(wider.position[2] > base.position[2]);
  const confirmation = confirmationCameraForElements(points.slice(0, 2));
  assert.ok(confirmation.position[2] < base.position[2]);
  assert.ok(confirmation.fov < base.fov);
});

test('a geometria dirigida evita o centro da mesa e as paredes em mesas de 2 a 6 assentos', () => {
  const finite = (values) => values.every((value) => Number.isFinite(value));
  // Centro < 6 cortaria a carta de ação e a efígie; raio > 11.5 sai do salão.
  const withinCourt = (shot) => {
    for (const position of [shot.position, shot.portrait.position]) {
      const radius = Math.hypot(position[0], position[2]);
      assert.ok(radius >= 6 && radius <= 11.5, `raio ${radius.toFixed(2)} fora da faixa segura`);
    }
  };
  for (let count = 2; count <= 6; count += 1) {
    const table = Array.from({ length: count }, (_, index) => ({
      id: `s${index}`,
      azimuthRad: (Math.PI * 2 * index) / count,
    }));
    for (const first of table) {
      for (const second of table) {
        if (first === second) continue;
        const shot = duelCameraForSeats([first, second], count);
        assert.ok(finite(shot.position) && finite(shot.target) && finite(shot.portrait.position));
        withinCourt(shot);
        assert.ok(shot.fov >= 42 && shot.fov <= 62);
        assert.ok(shot.portrait.fov <= 66);
      }
      const solo = duelCameraForSeats([first], count);
      const claim = claimCameraForSeat(first, count);
      const transfer = coinTransferCameraForSeats([first, table[(table.indexOf(first) + 1) % count]], count);
      const throne = throneCameraForSeat(first, count);
      assert.ok(
        finite(solo.position) && finite(claim.position) && finite(transfer.position) && finite(throne.position),
      );
      withinCourt(solo);
      withinCourt(claim);
      withinCourt(transfer);
      withinCourt(throne);
      assert.ok(transfer.portrait.position[1] > solo.portrait.position[1]);
      assert.deepEqual(claim.target, [0, 1.65, 0]);
      assert.deepEqual(claim.portrait.target, [0, 1.6, 0]);
    }
  }
});
