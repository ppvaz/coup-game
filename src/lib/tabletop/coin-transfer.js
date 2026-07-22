const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function coinTransferPoint(from, to, progress, { index = 0, reducedMotion = false } = {}) {
  const t = clamp01(progress);
  const inverse = 1 - t;
  const lateral = reducedMotion ? 0 : Math.sin((index + 1) * 2.17) * 0.24;
  const control = {
    x: (from.x + to.x) / 2 + lateral,
    y: reducedMotion ? (from.y + to.y) / 2 : Math.max(from.y, to.y) + 1.35 + (index % 3) * 0.12,
    z: (from.z + to.z) / 2 - lateral * 0.55,
  };
  return Object.freeze({
    x: from.x * inverse * inverse + control.x * 2 * inverse * t + to.x * t * t,
    y: from.y * inverse * inverse + control.y * 2 * inverse * t + to.y * t * t,
    z: from.z * inverse * inverse + control.z * 2 * inverse * t + to.z * t * t,
  });
}

export function coinTransferProgress(elapsed, startedAt, index, { reducedMotion = false } = {}) {
  const delay = reducedMotion ? 0 : Math.max(0, index) * 0.055;
  const duration = reducedMotion ? 0.18 : 0.72;
  return clamp01((elapsed - startedAt - delay) / duration);
}

export function coinTransferDuration(amount, { reducedMotion = false } = {}) {
  const count = Math.max(1, Math.floor(Number(amount) || 1));
  return reducedMotion ? 0.18 : 0.72 + (count - 1) * 0.055;
}
