import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameBenchmark, summarizeFrameTimes } from '@la-corte/tabletop-stage/performance';
import {
  appendBenchmarkHistory,
  benchmarkOptionsFromSearch,
  readBenchmarkHistory,
} from '../src/lib/tabletop/benchmark-kit.js';
import {
  initialTabletopQuality,
  nextTabletopQuality,
  resolveTabletopQuality,
} from '../src/lib/tabletop/quality-profiles.js';

test('resume FPS médio e percentis a partir dos tempos reais dos frames', () => {
  const result = summarizeFrameTimes([16, 17, 15, 50], { label: 'fixture' });
  assert.equal(result.label, 'fixture');
  assert.equal(result.frameCount, 4);
  assert.equal(result.averageFps, 40.82);
  assert.equal(result.medianFrameMs, 16);
  assert.equal(result.p95FrameMs, 17);
  assert.equal(result.longFrameCount, 0);
});

test('separa aquecimento da janela de amostragem', async () => {
  const benchmark = new FrameBenchmark({ timestamp: () => '2026-07-20T00:00:00.000Z' });
  const completion = benchmark.start({ label: 'canonical', warmupMs: 200, durationMs: 1000 });
  benchmark.record(100);
  benchmark.record(100);
  assert.equal(benchmark.state().phase, 'sampling');
  for (let index = 0; index < 10; index += 1) benchmark.record(100, { metadata: { camera: 'table' } });
  const result = await completion;
  assert.equal(result.frameCount, 10);
  assert.equal(result.averageFps, 10);
  assert.equal(result.sampledMs, 1000);
  assert.equal(result.camera, 'table');
  assert.equal(result.recordedAt, '2026-07-20T00:00:00.000Z');
  assert.equal(benchmark.state(), null);
});

test('configura autorun e limita a duração solicitada pela URL', () => {
  assert.deepEqual(benchmarkOptionsFromSearch('?benchmark=1&duration=90000'), {
    autorun: true,
    durationMs: 60000,
  });
  assert.deepEqual(benchmarkOptionsFromSearch('?duration=100'), {
    autorun: false,
    durationMs: 2000,
  });
});

test('histórico tolera armazenamento corrompido e mantém o limite', () => {
  let value = '{corrompido';
  const storage = {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
  assert.deepEqual(readBenchmarkHistory(storage), []);
  appendBenchmarkHistory(storage, { averageFps: 55 }, 2);
  appendBenchmarkHistory(storage, { averageFps: 56 }, 2);
  appendBenchmarkHistory(storage, { averageFps: 57 }, 2);
  assert.deepEqual(readBenchmarkHistory(storage), [{ averageFps: 57 }, { averageFps: 56 }]);
});

test('qualidade preserva o cinematográfico por padrão e permite override reproduzível na URL', () => {
  const storage = { getItem: () => 'performance' };
  assert.equal(resolveTabletopQuality('desconhecido').id, 'cinematic');
  assert.equal(initialTabletopQuality({ storage }).id, 'performance');
  assert.equal(initialTabletopQuality({ search: '?quality=cinematic', storage }).id, 'cinematic');
  assert.equal(nextTabletopQuality('cinematic').id, 'balanced');
  assert.equal(nextTabletopQuality('balanced').id, 'performance');
  assert.equal(nextTabletopQuality('performance').id, 'cinematic');
});
