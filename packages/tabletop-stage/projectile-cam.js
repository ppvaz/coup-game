// Matemática da segunda câmera que persegue um projétil, pura para os testes
// de Node. O palco compõe o PiP; quem decide *quando* e *para quem* abrir é o
// jogo. Aqui só existe uma parábola, um recorte de tela e uma pose de câmera.

export const PROJECTILE_CAM = Object.freeze({
  // Folga em NDC: o PiP abre um pouco antes de o objeto encostar na borda,
  // então o corte acontece com ele ainda visível, sem piscar no limite.
  margin: 0.06,
  size: 168,
  gap: 18,
  fov: 34,
  // A câmera fica atrás e acima do objeto, olhando à frente dele: o quadro
  // mostra o voo e o destino ao mesmo tempo.
  distance: 3.2,
  height: 1.15,
  lead: 1.4,
});

const lerp = (from, to, ratio) => from + (to - from) * ratio;

const clamp = (value, low, high) => {
  const bottom = Math.min(low, high);
  const top = Math.max(low, high);
  return Math.min(top, Math.max(bottom, value));
};

/** Ponto da quadrática de Bézier que descreve o arremesso. */
export function bezierPoint(start, control, end, t) {
  const inverse = 1 - t;
  const weight = { start: inverse * inverse, control: 2 * inverse * t, end: t * t };
  return {
    x: start.x * weight.start + control.x * weight.control + end.x * weight.end,
    y: start.y * weight.start + control.y * weight.control + end.y * weight.end,
    z: start.z * weight.start + control.z * weight.control + end.z * weight.end,
  };
}

/** Direção normalizada do voo no instante `t` — a derivada da mesma curva. */
export function bezierDirection(start, control, end, t) {
  const inverse = 1 - t;
  const x = 2 * inverse * (control.x - start.x) + 2 * t * (end.x - control.x);
  const y = 2 * inverse * (control.y - start.y) + 2 * t * (end.y - control.y);
  const z = 2 * inverse * (control.z - start.z) + 2 * t * (end.z - control.z);
  const length = Math.hypot(x, y, z);
  if (!length) return { x: 0, y: 0, z: 1 };
  return { x: x / length, y: y / length, z: z / length };
}

/**
 * O objeto saiu do quadro da câmera principal? `z > 1` cobre o caso de ele
 * passar atrás da câmera, quando as coordenadas projetadas ainda caem dentro
 * de [-1, 1] mas espelhadas.
 */
export function isOutsideFrame(ndc, margin = PROJECTILE_CAM.margin) {
  if (ndc.z > 1) return true;
  const limit = 1 - margin;
  return Math.abs(ndc.x) > limit || Math.abs(ndc.y) > limit;
}

/** Pose da câmera de perseguição: atrás e acima do objeto, mirando à frente. */
export function projectileCamPose({ position, direction }, options = {}) {
  const { distance, height, lead } = { ...PROJECTILE_CAM, ...options };
  return {
    position: [
      position.x - direction.x * distance,
      position.y - direction.y * distance + height,
      position.z - direction.z * distance,
    ],
    target: [position.x + direction.x * lead, position.y + direction.y * lead, position.z + direction.z * lead],
  };
}

/**
 * Onde encostar o PiP na tela: na borda por onde o objeto saiu, alinhado ao
 * ponto de saída. A janela aparece na direção do arremesso, e não num canto
 * fixo, então o olho segue o objeto para fora do quadro.
 */
export function projectileCamAnchor(ndc, viewport, options = {}) {
  const { size, gap } = { ...PROJECTILE_CAM, ...options };
  const behind = ndc.z > 1;
  const x = behind ? -ndc.x : ndc.x;
  const y = behind ? -ndc.y : ndc.y;
  const horizontal = Math.abs(x) >= Math.abs(y);
  const edge = horizontal ? (x >= 0 ? 'right' : 'left') : y >= 0 ? 'top' : 'bottom';
  const exitLeft = lerp(0, viewport.width, (clamp(x, -1, 1) + 1) / 2) - size / 2;
  const exitTop = lerp(0, viewport.height, (1 - clamp(y, -1, 1)) / 2) - size / 2;
  // Uma tela mais estreita que a própria janela ainda ancora dentro dela: o
  // respiro cede antes de a janela sair da viewport.
  const lastLeft = Math.max(0, viewport.width - gap - size);
  const lastTop = Math.max(0, viewport.height - gap - size);
  const firstLeft = Math.min(gap, lastLeft);
  const firstTop = Math.min(gap, lastTop);
  return {
    edge,
    size,
    left: horizontal ? (edge === 'right' ? lastLeft : firstLeft) : clamp(exitLeft, firstLeft, lastLeft),
    top: horizontal ? clamp(exitTop, firstTop, lastTop) : edge === 'top' ? firstTop : lastTop,
  };
}
