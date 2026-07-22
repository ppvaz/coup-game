import * as THREE from 'three';
import { CameraRig } from './camera-rig.js';
import { InsetCameraPass } from './inset-camera.js';
import { FrameBenchmark } from './performance.js';
import { RenderPipeline } from './render-pipeline.js';
import { disposeObject3D } from './scene-utils.js';

export { FrameBenchmark, summarizeFrameTimes } from './performance.js';
export { canvasTexture, disposeObject3D, textTexture } from './scene-utils.js';

const DEFAULT_CLEAR = 0x080706;
const PORTRAIT_ASPECT_MAX = 0.82;

/**
 * Runtime gráfico compartilhável. Ele coordena cena, câmera, renderização,
 * ciclo de animação e descarte — mas não conhece regras, cartas ou fases.
 */
export class TabletopStage {
  constructor(canvas, options = {}) {
    if (!canvas) throw new Error('TabletopStage precisa de um canvas.');
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(options.clearColor ?? DEFAULT_CLEAR);
    this.scene.fog = new THREE.FogExp2(options.fogColor ?? DEFAULT_CLEAR, options.fogDensity ?? 0.025);
    this.root = new THREE.Group();
    this.root.name = 'tabletop-presentation';
    this.scene.add(this.root);
    this.reducedMotion = options.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.cameraRig = new CameraRig(canvas, { reducedMotion: this.reducedMotion });
    this.camera = this.cameraRig.camera;
    this.cameraTarget = this.cameraRig.target;
    this.cameraActs = this.cameraRig.acts;
    this.pipeline = new RenderPipeline(canvas, options);
    this.renderer = this.pipeline.renderer;
    this.renderTarget = this.pipeline.renderTarget;
    this.post = this.pipeline.post;
    this.insetPass = new InsetCameraPass(canvas, this.renderer);
    this.insetCamera = this.insetPass.camera;
    this.insetCameraTarget = this.insetPass.target;
    this.insetRenderTarget = this.insetPass.renderTarget;
    this.insetComposite = this.insetPass.composite;

    this.pixelScale = Math.max(1, options.pixelScale ?? 1.35);
    this.maxDevicePixelRatio = Math.max(1, options.maxDevicePixelRatio ?? 2);
    this.viewportMode = null;
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.updaters = new Set();
    this.performanceSampler = new FrameBenchmark();
    this.lastFrameNow = null;
    this.lastRendererStats = { calls: 0, triangles: 0, points: 0, lines: 0 };
    this.disposed = false;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
  }

  get activeCameraActName() {
    return this.cameraRig.activeActName;
  }

  get cameraTween() {
    return this.cameraRig.tween;
  }

  get insetViewportElement() {
    return this.insetPass.viewportElement;
  }

  get insetMirror() {
    return this.insetPass.mirror;
  }

  get insetCameraEnabled() {
    return this.insetPass.enabled;
  }

  add(object) {
    this.root.add(object);
    return object;
  }

  addUpdater(updater) {
    this.updaters.add(updater);
    return () => this.updaters.delete(updater);
  }

  setVisualProfile({ clearColor, fogColor, fogDensity, exposure, grain, vignette }) {
    if (clearColor !== undefined) this.scene.background.set(clearColor);
    if (fogColor !== undefined) this.scene.fog.color.set(fogColor);
    if (fogDensity !== undefined) this.scene.fog.density = fogDensity;
    this.pipeline.setVisualProfile({ exposure, grain, vignette });
  }

  setResolutionProfile({ pixelScale, maxDevicePixelRatio } = {}) {
    if (pixelScale !== undefined) this.pixelScale = Math.max(1, Number(pixelScale) || 1);
    if (maxDevicePixelRatio !== undefined) {
      this.maxDevicePixelRatio = Math.max(1, Number(maxDevicePixelRatio) || 1);
    }
    this.resize();
  }

  /**
   * Picture-in-picture: uma segunda câmera composta sobre o retângulo de um
   * elemento do DOM a cada quadro. O jogo fornece apenas pose e encaixe.
   */
  setInsetCamera(definition = {}) {
    this.insetPass.configure(definition);
  }

  setInsetCameraEnabled(enabled) {
    this.insetPass.enabled = Boolean(enabled);
  }

  runPerformanceBenchmark({ label = 'tabletop', warmupMs = 1500, durationMs = 10000, metadata = {} } = {}) {
    return this.performanceSampler.start({ label, warmupMs, durationMs, metadata });
  }

  performanceBenchmarkState() {
    return this.performanceSampler.state();
  }

  recordPerformanceFrame(frameMs) {
    this.performanceSampler.record(frameMs, {
      eligible: document.visibilityState !== 'hidden',
      metadata: () => {
        let activeLights = 0;
        let meshCount = 0;
        let shadowCasters = 0;
        const materials = new Set();
        this.scene.traverse((object) => {
          if (object.isLight && object.visible && object.intensity > 0) activeLights += 1;
          if (!object.isMesh) return;
          meshCount += 1;
          if (object.castShadow) shadowCasters += 1;
          const values = Array.isArray(object.material) ? object.material : [object.material];
          values.forEach((value) => value?.uuid && materials.add(value.uuid));
        });
        return {
          cssWidth: Math.round(this.canvas.clientWidth || 0),
          cssHeight: Math.round(this.canvas.clientHeight || 0),
          viewportMode: this.viewportMode,
          renderWidth: this.renderTarget.width,
          renderHeight: this.renderTarget.height,
          outputWidth: this.renderer.domElement.width,
          outputHeight: this.renderer.domElement.height,
          outputPixelRatio: this.renderer.getPixelRatio(),
          devicePixelRatio: window.devicePixelRatio || 1,
          pixelScale: this.pixelScale,
          drawCalls: this.lastRendererStats.calls,
          triangles: this.lastRendererStats.triangles,
          activeLights,
          meshCount,
          materialCount: materials.size,
          shadowCasters,
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency ?? null,
          deviceMemoryGb: navigator.deviceMemory ?? null,
        };
      },
    });
  }

  defineCameraAct(name, definition) {
    this.cameraRig.defineAct(name, definition);
  }

  setCameraAct(name, options = {}) {
    this.cameraRig.setAct(name, options);
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.viewportMode = width / height < PORTRAIT_ASPECT_MAX ? 'portrait' : 'landscape';
    const sourceDpr = Math.min(window.devicePixelRatio || 1, 2);
    const outputDpr = Math.min(sourceDpr, this.maxDevicePixelRatio);
    this.pipeline.resize({ width, height, sourceDpr, outputDpr, pixelScale: this.pixelScale });
    this.cameraRig.resize(width, height, this.viewportMode);
  }

  updateCameraTween(now) {
    this.cameraRig.update(now);
  }

  renderInsetCamera() {
    this.insetPass.render(this.scene);
  }

  animate(now) {
    if (this.disposed) return;
    const rawFrameMs = this.lastFrameNow == null ? 0 : now - this.lastFrameNow;
    this.lastFrameNow = now;
    this.timer.update(now);
    const delta = Math.min(this.timer.getDelta(), 0.05);
    const elapsed = this.timer.getElapsed();
    this.cameraRig.update(now);
    for (const updater of this.updaters) updater({ delta, elapsed, now, reducedMotion: this.reducedMotion });
    this.lastRendererStats = this.pipeline.render(this.scene, this.camera, elapsed);
    this.insetPass.render(this.scene);
    this.recordPerformanceFrame(rawFrameMs);
    this.frame = requestAnimationFrame(this.animate);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.performanceSampler.cancel();
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.cameraRig.dispose();
    disposeObject3D(this.root);
    this.insetPass.dispose();
    this.pipeline.dispose();
    this.timer.dispose();
    this.updaters.clear();
  }
}
