import { SALON_SEAT_RING, seatRingPoint } from './seat-ring.js';

export function povCameraForSeat(seat, seatCount, ring = SALON_SEAT_RING) {
  const { x: seatX, z: seatZ, outwardX, outwardZ } = seatRingPoint(ring, seat, seatCount);
  return {
    position: [seatX + outwardX * 3.05, 2.8, seatZ + outwardZ * 3.05],
    target: [-outwardX * 1.85, 1.35, -outwardZ * 1.85],
    fov: 55,
    portrait: {
      position: [seatX + outwardX * 3.55, 3.15, seatZ + outwardZ * 3.55],
      target: [-outwardX * 1.55, 1.45, -outwardZ * 1.55],
      fov: 59,
    },
  };
}

export function playerCameraForSeat(seat, seatCount, ring = SALON_SEAT_RING) {
  const { x: seatX, z: seatZ, outwardX, outwardZ } = seatRingPoint(ring, seat, seatCount);
  return {
    position: [seatX + outwardX * 3.6, 4.35, seatZ + outwardZ * 3.6],
    target: [seatX + outwardX * 1.15, 1.22, seatZ + outwardZ * 1.15],
    fov: 46,
    portrait: {
      position: [seatX + outwardX * 4.05, 6.4, seatZ + outwardZ * 4.05],
      target: [seatX + outwardX * 0.75, 1.2, seatZ + outwardZ * 0.75],
      fov: 60,
    },
  };
}
