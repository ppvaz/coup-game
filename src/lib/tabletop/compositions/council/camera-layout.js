import { seatRingPoint } from '../../coup-table/seat-ring.js';
import { COUNCIL_SEAT_RING } from './seat-ring.js';

function seatFrame(seat, seatCount) {
  const { x, z, outwardX, outwardZ } = seatRingPoint(COUNCIL_SEAT_RING, seat, seatCount);
  return { seatX: x, seatZ: z, inwardX: -outwardX, inwardZ: -outwardZ };
}

/** Olhos do cortesão: a posição fica fixa e o arrasto muda apenas o olhar. */
export function councilPovCameraForSeat(seat, seatCount) {
  const frame = seatFrame(seat, seatCount);
  const position = [frame.seatX + frame.inwardX * 0.2, 2.08, frame.seatZ + frame.inwardZ * 0.2];
  // A mira desce à altura do tampo: seis graus abaixo do horizonte bastam para
  // as próprias cartas entrarem no terço inferior do quadro — antes ficavam
  // debaixo da lente — sem tirar do enquadramento os rostos do outro lado, que
  // continuam acima do centro.
  const target = [position[0] + frame.inwardX * 8.2, 1.22, position[2] + frame.inwardZ * 8.2];
  return {
    position,
    target,
    fov: 58,
    transitionMs: 360,
    navigation: {
      mode: 'first-person',
      maxYaw: Math.PI * 0.39,
      minPolar: 0.72,
      // O teto antigo travava o olhar vinte graus abaixo do horizonte, e a
      // carta mais próxima do dono está a trinta e dois: quem quisesse conferir
      // a própria influência esbarrava no limite do arrasto.
      maxPolar: 2.15,
    },
    portrait: {
      position,
      target,
      fov: 72,
    },
  };
}

export const COUNCIL_CAMERA_ACTS = {
  table: {
    position: [0, 4.65, 10.15],
    target: [0, 1.38, -0.25],
    fov: 48,
    transitionMs: 380,
    portrait: { position: [0, 6.1, 10.55], target: [0, 1.36, -0.1], fov: 66 },
  },
  overhead: {
    position: [0, 9.2, 0.5],
    target: [0, 1.1, 0],
    fov: 48,
    transitionMs: 320,
    portrait: { position: [0, 10.2, 1.8], target: [0, 1.05, 0], fov: 58 },
  },
};
