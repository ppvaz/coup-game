import * as THREE from 'three';

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

export { CRT_VERTEX };

export class RenderPipeline {
  constructor(canvas, { exposure = 1.05, grain = 0.018, vignette = 0.82 } = {}) {
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
    this.renderer.toneMappingExposure = exposure;
    this.renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.post = createPostProcess(this.renderTarget.texture, grain, vignette);
  }

  setVisualProfile({ exposure, grain, vignette }) {
    if (exposure !== undefined) this.renderer.toneMappingExposure = exposure;
    if (grain !== undefined) this.post.material.uniforms.uGrain.value = grain;
    if (vignette !== undefined) this.post.material.uniforms.uVignette.value = vignette;
  }

  resize({ width, height, sourceDpr, outputDpr, pixelScale }) {
    this.renderer.setPixelRatio(outputDpr);
    this.renderer.setSize(width, height, false);
    this.renderTarget.setSize(
      Math.max(1, Math.floor((width * sourceDpr) / pixelScale)),
      Math.max(1, Math.floor((height * sourceDpr) / pixelScale)),
    );
  }

  render(scene, camera, elapsed) {
    this.post.material.uniforms.uTime.value = elapsed;
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(scene, camera);
    const stats = { ...this.renderer.info.render };
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.post.scene, this.post.camera);
    return stats;
  }

  dispose() {
    this.post.quad.geometry.dispose();
    this.post.material.dispose();
    this.renderTarget.dispose();
    this.renderer.dispose();
  }
}
