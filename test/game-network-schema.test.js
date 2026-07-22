import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitedPlayerId, timeoutCommand } from '../src/game/ai.js';
import { createGame, dispatchGame, viewForPlayer } from '../src/game/coup.js';
import { isCommandEnvelope, isGameCommand, isGameView } from '../src/game/network-schema.js';

const IDS = {
  ana: '11111111-1111-4111-8111-111111111111',
  bia: '22222222-2222-4222-8222-222222222222',
  caio: '33333333-3333-4333-8333-333333333333',
  game: '44444444-4444-4444-8444-444444444444',
  connection: '55555555-5555-4555-8555-555555555555',
  transport: '66666666-6666-4666-8666-666666666666',
};
const seats = [
  { id: IDS.ana, name: 'Ana', kind: 'human' },
  { id: IDS.bia, name: 'Bia', kind: 'human' },
  { id: IDS.caio, name: 'Caio', kind: 'human' },
];

const makeGame = () => createGame(seats, { gameId: IDS.game, random: () => 0.42 });
const networkView = (game, viewerId) => ({
  ...viewForPlayer(game, viewerId),
  log: game.log.slice(-20),
  clockRemaining: 20_000,
  clockTotal: 30_000,
});

test('aceita visões projetadas para cada jogador e fases reais do motor', () => {
  const game = makeGame();
  for (const viewerId of Object.values(IDS).slice(0, 3)) {
    assert.equal(isGameView(networkView(game, viewerId), { viewerId, expectedGameId: IDS.game }), true);
  }

  const claim = dispatchGame(game, { type: 'declare_action', actorId: IDS.ana, action: 'tax' });
  assert.equal(isGameView(networkView(claim, IDS.bia), { viewerId: IDS.bia, expectedGameId: IDS.game }), true);

  const aid = dispatchGame(makeGame(), { type: 'declare_action', actorId: IDS.ana, action: 'foreign_aid' });
  const block = dispatchGame(aid, { type: 'block', actorId: IDS.bia, role: 'Duque' });
  assert.equal(isGameView(networkView(block, IDS.caio), { viewerId: IDS.caio, expectedGameId: IDS.game }), true);
});

test('continua aceitando todas as visões de uma partida autoritativa até o fim', () => {
  let game = makeGame();
  for (let step = 0; game.status === 'playing' && step < 500; step += 1) {
    for (const { id } of game.players) {
      assert.equal(isGameView(networkView(game, id), { viewerId: id, expectedGameId: IDS.game }), true);
    }
    const playerId = awaitedPlayerId(game);
    game = dispatchGame(game, timeoutCommand(game, playerId), () => 0.42);
  }
  assert.equal(game.status, 'finished');
  for (const { id } of game.players) {
    assert.equal(isGameView(networkView(game, id), { viewerId: id, expectedGameId: IDS.game }), true);
  }
});

test('rejeita visão que vaza a mão rival ou esconde a mão do destinatário', () => {
  const game = makeGame();
  const view = networkView(game, IDS.ana);
  const leaked = structuredClone(view);
  leaked.players[1].cards[0] = game.players[1].cards[0];
  assert.equal(isGameView(leaked, { viewerId: IDS.ana, expectedGameId: IDS.game }), false);

  const hiddenOwnCard = structuredClone(view);
  hiddenOwnCard.players[0].cards[0].role = null;
  assert.equal(isGameView(hiddenOwnCard, { viewerId: IDS.ana, expectedGameId: IDS.game }), false);
});

test('rejeita enums, versões, arrays e relações entre IDs inválidos', () => {
  const view = networkView(makeGame(), IDS.ana);
  assert.equal(isGameView({ ...view, version: 0 }, { viewerId: IDS.ana }), false);
  assert.equal(isGameView({ ...view, phase: 'executar_script' }, { viewerId: IDS.ana }), false);
  assert.equal(isGameView({ ...view, responseQueue: [IDS.bia, IDS.bia] }, { viewerId: IDS.ana }), false);
  assert.equal(isGameView({ ...view, currentPlayerId: IDS.game }, { viewerId: IDS.ana }), false);
  assert.equal(isGameView(view, { viewerId: IDS.ana, expectedPlayerIds: [IDS.ana, IDS.bia] }), false);
  assert.equal(isGameView({ ...view, log: Array(101).fill(view.log[0]) }, { viewerId: IDS.ana }), false);
  assert.equal(isGameView({ ...view, log: [{ type: 'action_declared', at: 1 }] }, { viewerId: IDS.ana }), false);
  assert.equal(isGameView({ ...view, clockRemaining: 120_001 }, { viewerId: IDS.ana }), false);
  assert.equal(isGameView({ ...view, injected: '<img onerror=alert(1)>' }, { viewerId: IDS.ana }), false);
});

test('valida comandos e vincula o ator ao envelope', () => {
  const playerIds = seats.map((seat) => seat.id);
  const command = { type: 'declare_action', actorId: IDS.ana, action: 'tax' };
  const envelope = {
    playerId: IDS.ana,
    command,
    senderId: IDS.ana,
    senderConnectionId: IDS.connection,
  };
  assert.equal(isGameCommand(command, { playerIds }), true);
  assert.equal(isCommandEnvelope(envelope, { playerIds }), true);
  assert.equal(isCommandEnvelope({ ...envelope, id: IDS.transport }, { playerIds }), true);
  assert.equal(isCommandEnvelope({ ...envelope, id: 'transporte-inválido' }, { playerIds }), false);
  assert.equal(isCommandEnvelope({ ...envelope, playerId: IDS.bia }, { playerIds }), false);
  assert.equal(isCommandEnvelope({ ...envelope, senderId: IDS.bia }, { playerIds }), false);
  assert.equal(isGameCommand({ ...command, action: 'hack' }, { playerIds }), false);
  assert.equal(isGameCommand({ ...command, targetId: IDS.bia }, { playerIds }), false);
  assert.equal(isGameCommand({ type: 'declare_action', actorId: IDS.ana, action: 'coup' }, { playerIds }), false);
  assert.equal(
    isGameCommand({ type: 'declare_action', actorId: IDS.ana, action: 'coup', targetId: IDS.bia }, { playerIds }),
    true,
  );
  assert.equal(isGameCommand({ ...command, extra: true }, { playerIds }), false);
  assert.equal(isGameCommand({ type: 'choose_exchange', actorId: IDS.ana, cardIds: ['a', 'a'] }, { playerIds }), false);
});
