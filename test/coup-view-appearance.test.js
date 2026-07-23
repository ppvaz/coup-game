import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/coup.js';
import { projectCoupTableView } from '../src/lib/tabletop/coup-view.js';
import { characterForSeat } from '../src/lib/tabletop/coup-table/character.js';

const seats = () => [
  { id: 'me', name: 'Eu', kind: 'human' },
  { id: 'bot-0', name: 'Beatrice', kind: 'bot' },
  { id: 'bot-1', name: 'Vittorio', kind: 'bot' },
];

test('a aparência escolhida do jogador viaja para o assento', () => {
  const game = createGame(seats());
  const meu = { figure: 'cultist', cultist: { robe: 'abyss', hood: 'spire' } };
  const view = projectCoupTableView(game, 'me', { appearances: { me: meu } });
  const eu = view.seats.find((seat) => seat.id === 'me');
  assert.equal(eu.appearance, meu);
});

test('rivais sem escolha caem no padrão determinístico do assento', () => {
  const game = createGame(seats());
  const view = projectCoupTableView(game, 'me', { appearances: {} });
  view.seats.forEach((seat, index) => {
    assert.deepEqual(seat.appearance, characterForSeat(index));
  });
});

test('sem o parâmetro appearances a mesa ainda recebe uma aparência por assento', () => {
  const game = createGame(seats());
  const view = projectCoupTableView(game, 'me');
  for (const seat of view.seats) assert.ok(seat.appearance && seat.appearance.figure);
});
