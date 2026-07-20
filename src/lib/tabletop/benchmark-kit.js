export const TABLETOP_BENCHMARK_HISTORY_KEY = 'la-corte-3d-benchmarks';
export const TABLETOP_BENCHMARK_DEFAULTS = Object.freeze({
  warmupMs: 2000,
  durationMs: 8000,
  historyLimit: 20,
});

export function benchmarkOptionsFromSearch(search) {
  const parameters = new URLSearchParams(search);
  const requestedDuration = Number(parameters.get('duration'));
  return Object.freeze({
    autorun: parameters.get('benchmark') === '1',
    durationMs: Number.isFinite(requestedDuration)
      ? Math.min(60000, Math.max(2000, requestedDuration))
      : TABLETOP_BENCHMARK_DEFAULTS.durationMs,
  });
}

export function readBenchmarkHistory(storage) {
  try {
    const value = JSON.parse(storage.getItem(TABLETOP_BENCHMARK_HISTORY_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function appendBenchmarkHistory(storage, result, limit = TABLETOP_BENCHMARK_DEFAULTS.historyLimit) {
  const history = [result, ...readBenchmarkHistory(storage)].slice(0, limit);
  storage.setItem(TABLETOP_BENCHMARK_HISTORY_KEY, JSON.stringify(history));
  return history;
}

/** Protocolo canônico do laboratório, independente de seus controles HTML. */
export class TabletopBenchmarkKit {
  constructor({ scene, prepare, storage, eventTarget, globalScope, logger } = {}) {
    if (!scene) throw new Error('O benchmark precisa de uma cena 3D.');
    this.scene = scene;
    this.prepare = prepare;
    this.storage = storage;
    this.eventTarget = eventTarget;
    this.globalScope = globalScope;
    this.logger = logger;
    this.running = false;
  }

  state() {
    return this.scene.performanceBenchmarkState();
  }

  async run({ durationMs = TABLETOP_BENCHMARK_DEFAULTS.durationMs } = {}) {
    if (this.running) return null;
    this.running = true;
    this.prepare?.();
    if (this.globalScope) this.globalScope.__TABLETOP_BENCHMARK__ = { status: 'running', result: null };
    try {
      const result = await this.scene.runPerformanceBenchmark({
        label: 'coup-claim-table',
        warmupMs: TABLETOP_BENCHMARK_DEFAULTS.warmupMs,
        durationMs,
      });
      if (!result) return null;
      if (this.storage) appendBenchmarkHistory(this.storage, result);
      if (this.globalScope) this.globalScope.__TABLETOP_BENCHMARK__ = { status: 'complete', result };
      const EventConstructor = this.globalScope?.CustomEvent;
      if (this.eventTarget && EventConstructor) {
        this.eventTarget.dispatchEvent(new EventConstructor('tabletop-benchmark-complete', { detail: result }));
      }
      this.logger?.info?.('[tabletop-benchmark]', JSON.stringify(result));
      return result;
    } finally {
      this.running = false;
    }
  }
}
