import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame } from '../src/game/coup.js';
import { projectCoupTableView } from '../src/lib/tabletop/coup-view.js';
import {
  cameraDecisionKey,
  directCamera,
  duelCameraForSeats,
  influenceRevealCamera,
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

test('alegação sem alvo enquadra o ator; com alvo, o duelo entre os dois', () => {
  const tax = dispatchGame(newGame(), { type: 'declare_action', actorId: 'a', action: 'tax' });
  assert.deepEqual(directCamera(projectCoupTableView(tax, 'b')), { act: 'duel', seatIds: ['a'] });
  const steal = dispatchGame(newGame(), { type: 'declare_action', actorId: 'a', action: 'steal', targetId: 'b' });
  assert.deepEqual(directCamera(projectCoupTableView(steal, 'c')), { act: 'duel', seatIds: ['a', 'b'] });
});

test('a chave da decisão não muda enquanto as respostas coletivas chegam', () => {
  let game = dispatchGame(newGame(), { type: 'declare_action', actorId: 'a', action: 'tax' });
  const before = cameraDecisionKey(directCamera(projectCoupTableView(game, 'c')));
  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  assert.equal(cameraDecisionKey(directCamera(projectCoupTableView(game, 'c'))), before);
});

test('janela de bloqueio e contestação do bloqueio dirigem o duelo certo', () => {
  let game = dispatchGame(newGame(), { type: 'declare_action', actorId: 'a', action: 'foreign_aid' });
  assert.equal(game.phase, 'block');
  assert.deepEqual(directCamera(projectCoupTableView(game, 'c')), { act: 'duel', seatIds: ['a'] });
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
      const throne = throneCameraForSeat(first, count);
      assert.ok(finite(solo.position) && finite(throne.position));
      withinCourt(solo);
      withinCourt(throne);
    }
  }
});
