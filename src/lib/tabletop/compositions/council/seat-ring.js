import { COUNCIL_TABLE } from './environment.js';

/**
 * Mesa redonda pede anel redondo. Herdar a elipse do Salão deixava as cadeiras
 * da frente e do fundo encostadas no tampo — e, como as peças pendem do eixo
 * radial do assento, cada cortesão largava cartas e moedas num raio diferente:
 * quatro conjuntos atravessavam o filete dourado e dois ficavam ilhados no
 * meio do feltro.
 *
 * A lotação não muda o raio: quem encolhe a roda numa mesa redonda afasta o
 * cortesão do próprio tampo.
 */
const SEAT_RADIUS = 5.5;
const RING = Object.freeze({ x: SEAT_RADIUS, z: SEAT_RADIUS });

/** Peça a `radius` do centro da mesa, vista do assento que olha para -Z. */
const inward = (radius) => radius - SEAT_RADIUS;

/** Altura de repouso de uma peça de meia espessura `halfThickness` no feltro. */
const onFelt = (halfThickness) => COUNCIL_TABLE.feltTop + halfThickness;

// O feltro termina em 4,34: as peças ocupam a faixa de 2,7 a 4,1, da beirada
// para o centro — cartas ao alcance da mão, placa virada para a roda. O
// tesouro corre ao lado das cartas, e não atrás delas, porque a pilha cresce
// em direção ao dono e passaria do filete se dividisse a mesma faixa; o
// conjunto carta + moeda fica centrado no assento para não parecer do vizinho.
export const COUNCIL_SEAT_RING = Object.freeze({
  wide: RING,
  compact: RING,
  // Aqui a câmera são os olhos do cortesão: tudo o que está à frente dele — a
  // influência e a própria placa — tem de estar de pé na tela, senão o jogador
  // lê a mesa de cabeça para baixo.
  facing: Object.freeze({ plaque: 0, influences: 0 }),
  props: Object.freeze({
    plaque: Object.freeze([0, onFelt(0.0015), inward(2.85)]),
    influences: Object.freeze([0.12, onFelt(0.0175), inward(3.6)]),
    exchange: Object.freeze([0, COUNCIL_TABLE.feltTop + 0.18, inward(3.55)]),
    coins: Object.freeze([-1.04, onFelt(0.0175), inward(3.2)]),
    treasure: Object.freeze([-0.76, 2.0, inward(3.55)]),
  }),
});
