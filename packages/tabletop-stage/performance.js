const rounded = (value, digits = 2) => Number(value.toFixed(digits));

/** Resume tempos reais entre frames sem depender de Three.js ou do navegador. */
export function summarizeFrameTimes(frameTimes, metadata = {}) {
  const samples = frameTimes.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!samples.length) throw new Error('O benchmark precisa de pelo menos um frame válido.');
  const totalMs = samples.reduce((total, value) => total + value, 0);
  const percentile = (ratio) => samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * ratio))];
  const averageFrameMs = totalMs / samples.length;
  return Object.freeze({
    ...metadata,
    frameCount: samples.length,
    sampledMs: rounded(totalMs, 1),
    averageFps: rounded(1000 / averageFrameMs),
    averageFrameMs: rounded(averageFrameMs),
    medianFrameMs: rounded(percentile(0.5)),
    p95FrameMs: rounded(percentile(0.95)),
    p99FrameMs: rounded(percentile(0.99)),
    slowFrameRatio: rounded(samples.filter((value) => value > 20).length / samples.length, 4),
    longFrameCount: samples.filter((value) => value > 50).length,
  });
}

/** Estado de uma run: aquecimento, amostragem e resolução de um único resultado. */
export class FrameBenchmark {
  constructor({ timestamp = () => new Date().toISOString() } = {}) {
    this.timestamp = timestamp;
    this.run = null;
  }

  start({ label = 'tabletop', warmupMs = 1500, durationMs = 10000, metadata = {} } = {}) {
    if (this.run) throw new Error('Já existe um benchmark 3D em andamento.');
    return new Promise((resolve) => {
      this.run = {
        label,
        warmupMs: Math.max(0, Number(warmupMs) || 0),
        durationMs: Math.max(1000, Number(durationMs) || 10000),
        warmupElapsedMs: 0,
        sampledElapsedMs: 0,
        frameTimes: [],
        metadata,
        resolve,
      };
    });
  }

  state() {
    const run = this.run;
    if (!run) return null;
    const warmingUp = run.warmupElapsedMs < run.warmupMs;
    return Object.freeze({
      phase: warmingUp ? 'warmup' : 'sampling',
      progress: warmingUp
        ? run.warmupMs === 0
          ? 1
          : run.warmupElapsedMs / run.warmupMs
        : run.sampledElapsedMs / run.durationMs,
      frameCount: run.frameTimes.length,
    });
  }

  record(frameMs, { eligible = true, metadata = {} } = {}) {
    const run = this.run;
    if (!run || !eligible || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 1000) return null;
    if (run.warmupElapsedMs < run.warmupMs) {
      run.warmupElapsedMs = Math.min(run.warmupMs, run.warmupElapsedMs + frameMs);
      return null;
    }
    run.frameTimes.push(frameMs);
    run.sampledElapsedMs += frameMs;
    if (run.sampledElapsedMs < run.durationMs) return null;
    const completionMetadata = typeof metadata === 'function' ? metadata() : metadata;
    const result = summarizeFrameTimes(run.frameTimes, {
      label: run.label,
      recordedAt: this.timestamp(),
      ...run.metadata,
      ...completionMetadata,
    });
    this.run = null;
    run.resolve(result);
    return result;
  }

  cancel(result = null) {
    if (!this.run) return;
    const run = this.run;
    this.run = null;
    run.resolve(result);
  }
}
