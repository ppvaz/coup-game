function seatFrame(seat, seatCount) {
  const radiusX = seatCount <= 3 ? 5.15 : 5.55;
  const radiusZ = seatCount <= 3 ? 4.25 : 4.65;
  const outwardX = Math.sin(seat.azimuthRad);
  const outwardZ = Math.cos(seat.azimuthRad);
  return {
    seatX: outwardX * radiusX,
    seatZ: outwardZ * radiusZ,
    inwardX: -outwardX,
    inwardZ: -outwardZ,
  };
}

/** Olhos do cortesão: a posição fica fixa e o arrasto muda apenas o olhar. */
export function councilPovCameraForSeat(seat, seatCount) {
  const frame = seatFrame(seat, seatCount);
  const position = [frame.seatX + frame.inwardX * 0.2, 2.08, frame.seatZ + frame.inwardZ * 0.2];
  // A mira nasce na altura das cabeças do outro lado (a esfera do rosto fica em
  // y ≈ 2.08). Mirar o tampo enchia dois terços do quadro com feltro vazio.
  const target = [position[0] + frame.inwardX * 8.2, 1.94, position[2] + frame.inwardZ * 8.2];
  return {
    position,
    target,
    fov: 58,
    transitionMs: 360,
    navigation: {
      mode: 'first-person',
      maxYaw: Math.PI * 0.39,
      minPolar: 0.72,
      maxPolar: 1.92,
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
