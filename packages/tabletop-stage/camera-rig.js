import * as THREE from 'three';

export class CameraRig {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    this.target = new THREE.Vector3();
    this.acts = new Map();
    this.activeActName = null;
    this.viewportMode = null;
    this.tween = null;
    this.drag = null;

    this.onPointerDown = (event) => {
      this.drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
    };
    this.onPointerMove = (event) => {
      if (!this.drag || this.tween) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      this.drag = { x: event.clientX, y: event.clientY };
      const offset = this.camera.position.clone().sub(this.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta -= dx * 0.004;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + dy * 0.003, 0.28, Math.PI / 2.02);
      this.camera.position.copy(this.target).add(new THREE.Vector3().setFromSpherical(spherical));
      this.camera.lookAt(this.target);
    };
    this.onPointerUp = (event) => {
      this.drag = null;
      canvas.releasePointerCapture?.(event.pointerId);
    };
    this.onWheel = (event) => {
      event.preventDefault();
      if (this.tween) return;
      const offset = this.camera.position.clone().sub(this.target);
      const maximumDistance = this.viewportMode === 'portrait' ? 22 : 16;
      offset.setLength(THREE.MathUtils.clamp(offset.length() + event.deltaY * 0.008, 4.2, maximumDistance));
      this.camera.position.copy(this.target).add(offset);
    };
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  defineAct(name, { position, target, fov = 48, portrait = null }) {
    const makeAct = (definition) => ({
      position: new THREE.Vector3(...definition.position),
      target: new THREE.Vector3(...definition.target),
      fov: definition.fov,
    });
    this.acts.set(name, {
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

  setAct(name, { immediate = false } = {}) {
    const definition = this.acts.get(name);
    if (!definition) throw new Error(`Ato de câmera desconhecido: ${name}`);
    const act = this.viewportMode === 'portrait' && definition.portrait ? definition.portrait : definition.landscape;
    this.activeActName = name;
    if (immediate || this.reducedMotion) {
      this.camera.position.copy(act.position);
      this.target.copy(act.target);
      this.camera.fov = act.fov;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.target);
      this.tween = null;
      return;
    }
    this.tween = {
      startedAt: performance.now(),
      duration: 720,
      fromPosition: this.camera.position.clone(),
      toPosition: act.position.clone(),
      fromTarget: this.target.clone(),
      toTarget: act.target.clone(),
      fromFov: this.camera.fov,
      toFov: act.fov,
    };
  }

  // Atualiza o destino de um ato ativo sem reiniciar o tempo do cinemático.
  // Depois da chegada, mantém a câmera vinculada ao elemento que continuar
  // mudando de posição.
  retargetAct(name, definition) {
    this.defineAct(name, definition);
    if (this.activeActName !== name) return false;
    const stored = this.acts.get(name);
    const act = this.viewportMode === 'portrait' && stored.portrait ? stored.portrait : stored.landscape;
    if (this.tween) {
      this.tween.toPosition.copy(act.position);
      this.tween.toTarget.copy(act.target);
      this.tween.toFov = act.fov;
      return true;
    }
    this.camera.position.copy(act.position);
    this.target.copy(act.target);
    this.camera.fov = act.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);
    return true;
  }

  resize(width, height, viewportMode) {
    const viewportModeChanged = this.viewportMode !== null && viewportMode !== this.viewportMode;
    this.viewportMode = viewportMode;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (viewportModeChanged && this.activeActName) this.setAct(this.activeActName, { immediate: true });
  }

  update(now) {
    if (!this.tween) return;
    const progress = Math.min(1, (now - this.tween.startedAt) / this.tween.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    this.camera.position.lerpVectors(this.tween.fromPosition, this.tween.toPosition, eased);
    this.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, eased);
    this.camera.fov = THREE.MathUtils.lerp(this.tween.fromFov, this.tween.toFov, eased);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);
    if (progress === 1) this.tween = null;
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
