/**
 * O anel de assentos: onde cada cortesão senta e onde as peças dele pousam.
 *
 * A mesma elipse estava copiada nas cadeiras, nas câmeras de assento, nos
 * planos dirigidos e na composição Conselho — trocar a moldura de uma mesa
 * exigia caçar todas as cópias, e quem esquecia uma via as peças saírem do
 * tampo. Cada composição descreve o anel dela uma vez; o resto deriva daqui.
 *
 * Os deslocamentos das peças são locais ao cortesão, que olha para -Z: descer
 * em z é caminhar para o centro da mesa, e +x é a mão esquerda dele.
 */
export const SALON_SEAT_RING = Object.freeze({
  wide: Object.freeze({ x: 5.55, z: 4.65 }),
  compact: Object.freeze({ x: 5.15, z: 4.25 }),
  /**
   * Giro das peças deitadas, em torno do próprio eixo vertical: decide de que
   * lado da peça o texto fica de pé. O Salão senta o cortesão de costas para a
   * mesa e encena a bancada por fora do tampo — quem lê é a câmera. Uma
   * composição que sente o jogador na cadeira precisa do giro oposto, senão a
   * própria influência aparece de cabeça para baixo na tela.
   */
  facing: Object.freeze({ plaque: Math.PI, influences: Math.PI }),
  props: Object.freeze({
    plaque: Object.freeze([0, 1.265, -1.92]),
    influences: Object.freeze([0.05, 1.28, -1.14]),
    exchange: Object.freeze([0, 1.43, -1.12]),
    coins: Object.freeze([-1, 1.34, -1.2]),
    treasure: Object.freeze([-0.78, 2.05, -1.12]),
  }),
});

/** Mesa de até três lugares encolhe o anel para a moldura não abrir vãos. */
export function seatRingRadii(ring, seatCount) {
  return seatCount <= 3 ? ring.compact : ring.wide;
}

/** Onde o assento pousa e para onde ele aponta, sem depender de Three.js. */
export function seatRingPoint(ring, seat, seatCount) {
  const { x: radiusX, z: radiusZ } = seatRingRadii(ring, seatCount);
  const outwardX = Math.sin(seat.azimuthRad);
  const outwardZ = Math.cos(seat.azimuthRad);
  return { x: outwardX * radiusX, z: outwardZ * radiusZ, outwardX, outwardZ, radiusX, radiusZ };
}
