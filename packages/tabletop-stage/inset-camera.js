import * as THREE from 'three';
import { CRT_VERTEX } from './render-pipeline.js';

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

export class InsetCameraPass {
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.target = new THREE.Vector3();
    this.viewportElement = null;
    this.mirror = null;
    this.enabled = false;
    this.renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    this.renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.composite = createInsetComposite(this.renderTarget.texture);
  }

  configure({ position, target, fov, viewportElement, mirror } = {}) {
    if (position) this.camera.position.set(...position);
    if (target) this.target.set(...target);
    if (fov !== undefined) this.camera.fov = fov;
    this.camera.lookAt(this.target);
    if (viewportElement !== undefined) this.viewportElement = viewportElement;
    if (mirror !== undefined) this.mirror = mirror;
  }

  render(scene) {
    if (!this.enabled || !this.viewportElement?.isConnected) return;
    const canvasBounds = this.canvas.getBoundingClientRect();
    const insetBounds = this.viewportElement.getBoundingClientRect();
    const left = Math.max(canvasBounds.left, insetBounds.left);
    const right = Math.min(canvasBounds.right, insetBounds.right);
    const top = Math.max(canvasBounds.top, insetBounds.top);
    const bottom = Math.min(canvasBounds.bottom, insetBounds.bottom);
    const width = Math.floor(right - left);
    const height = Math.floor(bottom - top);
    if (width < 2 || height < 2) return;

    const x = Math.floor(left - canvasBounds.left);
    const y = Math.floor(canvasBounds.bottom - bottom);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);
    const pixelRatio = this.renderer.getPixelRatio();
    this.renderTarget.setSize(
      Math.max(1, Math.floor(width * pixelRatio)),
      Math.max(1, Math.floor(height * pixelRatio)),
    );
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(x, y, width, height);
    this.renderer.setScissor(x, y, width, height);
    this.renderer.setScissorTest(true);
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.render(this.composite.scene, this.composite.camera);
    this.renderer.autoClear = autoClear;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, canvasBounds.width, canvasBounds.height);
    this.blitMirror({
      sourceX: (left - canvasBounds.left) * pixelRatio,
      sourceY: (top - canvasBounds.top) * pixelRatio,
      width: width * pixelRatio,
      height: height * pixelRatio,
    });
  }

  blitMirror({ sourceX, sourceY, width, height }) {
    if (!this.mirror?.isConnected) return;
    const targetWidth = Math.max(1, Math.round(width));
    const targetHeight = Math.max(1, Math.round(height));
    if (this.mirror.width !== targetWidth) this.mirror.width = targetWidth;
    if (this.mirror.height !== targetHeight) this.mirror.height = targetHeight;
    const context = this.mirror.getContext('2d');
    context.clearRect(0, 0, targetWidth, targetHeight);
    context.drawImage(this.canvas, sourceX, sourceY, targetWidth, targetHeight, 0, 0, targetWidth, targetHeight);
  }

  dispose() {
    this.composite.quad.geometry.dispose();
    this.composite.material.dispose();
    this.renderTarget.dispose();
  }
}
