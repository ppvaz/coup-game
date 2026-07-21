import * as THREE from 'three';
import { FrameBenchmark } from './performance.js';

export { FrameBenchmark, summarizeFrameTimes } from './performance.js';

const DEFAULT_CLEAR = 0x080706;
const PORTRAIT_ASPECT_MAX = 0.82;

const CRT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const CRT_FRAGMENT = /* glsl */ `
  uniform sampler2D uScene;
  uniform float uTime;
  uniform float uGrain;
  uniform float uVignette;
  varying vec2 vUv;

  float random(vec2 point) {
    return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 centered = vUv * 2.0 - 1.0;
    float radius = dot(centered, centered);
    vec2 curved = centered * (1.0 + radius * 0.025);
    vec2 uv = curved * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.015, 0.012, 0.01, 1.0);
      return;
    }

    vec3 color = texture2D(uScene, uv).rgb;
    float scanline = sin(gl_FragCoord.y * 3.14159) * 0.018;
    float noise = (random(gl_FragCoord.xy + uTime * 71.0) - 0.5) * uGrain;
    float vignette = smoothstep(1.25, 0.18, radius) * uVignette + (1.0 - uVignette);
    color = (color - scanline + noise) * vignette;
    color = floor(color * 28.0) / 28.0;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose?.();
}

export function disposeObject3D(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
    else disposeMaterial(child.material);
  });
  object.removeFromParent();
}

export function canvasTexture(draw, { width = 512, height = 256 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  draw(context, canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function textTexture({
  title,
  kicker = '',
  footer = '',
  background = '#17120e',
  foreground = '#eee6d6',
  accent = '#d9b56b',
  width = 512,
  height = 256,
}) {
  return canvasTexture(
    (context) => {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = accent;
      context.lineWidth = 10;
      context.strokeRect(12, 12, width - 24, height - 24);
      context.textBaseline = 'top';
      context.fillStyle = accent;
      context.font = "700 24px 'DM Sans', sans-serif";
      context.fillText(kicker.toUpperCase(), 36, 30);
      context.fillStyle = foreground;
      context.font = "600 46px 'Cormorant Garamond', serif";
      const words = String(title).split(/\s+/);
      const lines = [];
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width > width - 72 && line) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      if (line) lines.push(line);
      lines.slice(0, 3).forEach((value, index) => context.fillText(value, 36, 76 + index * 48));
      context.fillStyle = 'rgba(238,230,214,.62)';
      context.font = "600 18px 'DM Sans', sans-serif";
      context.fillText(footer.toUpperCase(), 36, height - 48);
    },
    { width, height },
  );
}

function createPostProcess(texture, grain, vignette) {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uScene: { value: texture },
      uTime: { value: 0 },
      uGrain: { value: grain },
      uVignette: { value: vignette },
    },
    vertexShader: CRT_VERTEX,
    fragmentShader: CRT_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);
  return { scene, camera, material, quad };
}

function createInsetComposite(texture) {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const material = new THREE.ShaderMaterial({
    uniforms: { uScene: { value: texture } },
    vertexShader: CRT_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D uScene;
      varying vec2 vUv;

      void main() {
        float radius = distance(vUv, vec2(0.5));
        if (radius >= 0.5) discard;
        float edge = 1.0 - smoothstep(0.475, 0.5, radius);
        gl_FragColor = vec4(texture2D(uScene, vUv).rgb, edge);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);
  return { scene, camera, material, quad };
}

/**
 * Runtime gráfico compartilhável. Ele conhece câmera, resize, pós-processo,
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
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    this.insetCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.insetCameraTarget = new THREE.Vector3();
    this.insetViewportElement = null;
    this.insetCameraEnabled = false;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = options.exposure ?? 1.05;

    this.pixelScale = Math.max(1, options.pixelScale ?? 1.35);
    this.maxDevicePixelRatio = Math.max(1, options.maxDevicePixelRatio ?? 2);
    this.renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.post = createPostProcess(this.renderTarget.texture, options.grain ?? 0.018, options.vignette ?? 0.82);
    this.insetRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    this.insetRenderTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.insetComposite = createInsetComposite(this.insetRenderTarget.texture);
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.updaters = new Set();
    this.cameraActs = new Map();
    this.activeCameraActName = null;
    this.viewportMode = null;
    this.cameraTarget = new THREE.Vector3();
    this.cameraTween = null;
    this.performanceSampler = new FrameBenchmark();
    this.lastFrameNow = null;
    this.lastRendererStats = { calls: 0, triangles: 0, points: 0, lines: 0 };
    this.drag = null;
    this.disposed = false;
    this.reducedMotion = options.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.onPointerDown = (event) => {
      this.drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
    };
    this.onPointerMove = (event) => {
      if (!this.drag || this.cameraTween) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      this.drag = { x: event.clientX, y: event.clientY };
      const offset = this.camera.position.clone().sub(this.cameraTarget);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta -= dx * 0.004;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + dy * 0.003, 0.28, Math.PI / 2.02);
      this.camera.position.copy(this.cameraTarget).add(new THREE.Vector3().setFromSpherical(spherical));
      this.camera.lookAt(this.cameraTarget);
    };
    this.onPointerUp = (event) => {
      this.drag = null;
      canvas.releasePointerCapture?.(event.pointerId);
    };
    this.onWheel = (event) => {
      event.preventDefault();
      if (this.cameraTween) return;
      const offset = this.camera.position.clone().sub(this.cameraTarget);
      const maximumDistance = this.viewportMode === 'portrait' ? 22 : 16;
      offset.setLength(THREE.MathUtils.clamp(offset.length() + event.deltaY * 0.008, 4.2, maximumDistance));
      this.camera.position.copy(this.cameraTarget).add(offset);
    };
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
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
    if (exposure !== undefined) this.renderer.toneMappingExposure = exposure;
    if (grain !== undefined) this.post.material.uniforms.uGrain.value = grain;
    if (vignette !== undefined) this.post.material.uniforms.uVignette.value = vignette;
  }

  setResolutionProfile({ pixelScale, maxDevicePixelRatio } = {}) {
    if (pixelScale !== undefined) this.pixelScale = Math.max(1, Number(pixelScale) || 1);
    if (maxDevicePixelRatio !== undefined) {
      this.maxDevicePixelRatio = Math.max(1, Number(maxDevicePixelRatio) || 1);
    }
    this.resize();
  }

  setInsetCamera({ position, target, fov = 32, viewportElement = null } = {}) {
    if (position) this.insetCamera.position.set(...position);
    if (target) this.insetCameraTarget.set(...target);
    this.insetCamera.fov = fov;
    this.insetCamera.lookAt(this.insetCameraTarget);
    this.insetViewportElement = viewportElement;
  }

  setInsetCameraEnabled(enabled) {
    this.insetCameraEnabled = Boolean(enabled);
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

  defineCameraAct(name, { position, target, fov = 48, portrait = null }) {
    const makeAct = (definition) => ({
      position: new THREE.Vector3(...definition.position),
      target: new THREE.Vector3(...definition.target),
      fov: definition.fov,
    });
    this.cameraActs.set(name, {
      landscape: makeAct({ position, target, fov }),
      portrait: portrait
        ? makeAct({
            position: portrait.position ?? position,
            target: portrait.target ?? target,
            fov: portrait.fov ?? fov,
          })
        : null,
    });
  }

  setCameraAct(name, { immediate = false } = {}) {
    const definition = this.cameraActs.get(name);
    if (!definition) throw new Error(`Ato de câmera desconhecido: ${name}`);
    const act = this.viewportMode === 'portrait' && definition.portrait ? definition.portrait : definition.landscape;
    this.activeCameraActName = name;
    if (immediate || this.reducedMotion) {
      this.camera.position.copy(act.position);
      this.cameraTarget.copy(act.target);
      this.camera.fov = act.fov;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.cameraTarget);
      this.cameraTween = null;
      return;
    }
    this.cameraTween = {
      startedAt: performance.now(),
      duration: 720,
      fromPosition: this.camera.position.clone(),
      toPosition: act.position.clone(),
      fromTarget: this.cameraTarget.clone(),
      toTarget: act.target.clone(),
      fromFov: this.camera.fov,
      toFov: act.fov,
    };
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const viewportMode = width / height < PORTRAIT_ASPECT_MAX ? 'portrait' : 'landscape';
    const viewportModeChanged = this.viewportMode !== null && viewportMode !== this.viewportMode;
    this.viewportMode = viewportMode;
    const sourceDpr = Math.min(window.devicePixelRatio || 1, 2);
    const outputDpr = Math.min(sourceDpr, this.maxDevicePixelRatio);
    this.renderer.setPixelRatio(outputDpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderTarget.setSize(
      Math.max(1, Math.floor((width * sourceDpr) / this.pixelScale)),
      Math.max(1, Math.floor((height * sourceDpr) / this.pixelScale)),
    );
    if (viewportModeChanged && this.activeCameraActName) {
      this.setCameraAct(this.activeCameraActName, { immediate: true });
    }
  }

  updateCameraTween(now) {
    if (!this.cameraTween) return;
    const tween = this.cameraTween;
    const progress = Math.min(1, (now - tween.startedAt) / tween.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    this.camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
    this.cameraTarget.lerpVectors(tween.fromTarget, tween.toTarget, eased);
    this.camera.fov = THREE.MathUtils.lerp(tween.fromFov, tween.toFov, eased);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.cameraTarget);
    if (progress === 1) this.cameraTween = null;
  }

  renderInsetCamera() {
    if (!this.insetCameraEnabled || !this.insetViewportElement?.isConnected) return;
    const canvasBounds = this.canvas.getBoundingClientRect();
    const insetBounds = this.insetViewportElement.getBoundingClientRect();
    const left = Math.max(canvasBounds.left, insetBounds.left);
    const right = Math.min(canvasBounds.right, insetBounds.right);
    const top = Math.max(canvasBounds.top, insetBounds.top);
    const bottom = Math.min(canvasBounds.bottom, insetBounds.bottom);
    const width = Math.floor(right - left);
    const height = Math.floor(bottom - top);
    if (width < 2 || height < 2) return;

    const x = Math.floor(left - canvasBounds.left);
    const y = Math.floor(canvasBounds.bottom - bottom);
    this.insetCamera.aspect = width / height;
    this.insetCamera.updateProjectionMatrix();
    this.insetCamera.lookAt(this.insetCameraTarget);
    const pixelRatio = this.renderer.getPixelRatio();
    this.insetRenderTarget.setSize(
      Math.max(1, Math.floor(width * pixelRatio)),
      Math.max(1, Math.floor(height * pixelRatio)),
    );
    this.renderer.setRenderTarget(this.insetRenderTarget);
    this.renderer.render(this.scene, this.insetCamera);
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(x, y, width, height);
    this.renderer.setScissor(x, y, width, height);
    this.renderer.setScissorTest(true);
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.render(this.insetComposite.scene, this.insetComposite.camera);
    this.renderer.autoClear = autoClear;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, canvasBounds.width, canvasBounds.height);
  }

  animate(now) {
    if (this.disposed) return;
    const rawFrameMs = this.lastFrameNow == null ? 0 : now - this.lastFrameNow;
    this.lastFrameNow = now;
    this.timer.update(now);
    const delta = Math.min(this.timer.getDelta(), 0.05);
    const elapsed = this.timer.getElapsed();
    this.updateCameraTween(now);
    for (const updater of this.updaters) updater({ delta, elapsed, now, reducedMotion: this.reducedMotion });
    this.post.material.uniforms.uTime.value = elapsed;
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);
    this.lastRendererStats = { ...this.renderer.info.render };
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.post.scene, this.post.camera);
    this.renderInsetCamera();
    this.recordPerformanceFrame(rawFrameMs);
    this.frame = requestAnimationFrame(this.animate);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.performanceSampler.cancel();
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    disposeObject3D(this.root);
    this.post.quad.geometry.dispose();
    this.post.material.dispose();
    this.insetComposite.quad.geometry.dispose();
    this.insetComposite.material.dispose();
    this.insetRenderTarget.dispose();
    this.renderTarget.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.updaters.clear();
  }
}
