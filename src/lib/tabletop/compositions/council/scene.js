import { disposeObject3D } from '@la-corte/tabletop-stage';
import { CoupTableScene as ClassicCoupTableScene } from '../../coup-table.js';
import { COUNCIL_CAMERA_ACTS, councilPovCameraForSeat } from './camera-layout.js';
import { COUNCIL_THEME_PROFILES, createCouncilEnvironment } from './environment.js';

export { ACTION_ART } from '../../coup-table.js';

/**
 * Composição experimental. O contrato público continua sendo o de
 * CoupTableScene; somente ambiente, layout dos assentos e câmera local mudam.
 */
export class CoupTableScene extends ClassicCoupTableScene {
  constructor(canvas, options = {}) {
    super(canvas, options);
    this.compositionId = 'council';
    disposeObject3D(this.environment.room);
    this.environment = createCouncilEnvironment(this.stage, { theme: this.theme });
    this.stage.setVisualProfile(COUNCIL_THEME_PROFILES[this.theme]);
    this.stage.defineCameraAct('table', COUNCIL_CAMERA_ACTS.table);
    this.stage.defineCameraAct('overhead', COUNCIL_CAMERA_ACTS.overhead);
    this.stage.setCameraAct('table', { immediate: true });
    this.seal.visible = false;
  }

  povCameraForSeat(seat, seatCount) {
    return councilPovCameraForSeat(seat, seatCount);
  }

  localCameraForSeat(seat, seatCount) {
    return councilPovCameraForSeat(seat, seatCount);
  }

  rebuildSeats(view) {
    super.rebuildSeats(view);
    for (const seatView of view.seats) {
      const seat = this.seats.get(seatView.id);
      if (!seat) continue;
      // createNoble olha para -Z; rotacionar apenas pelo azimute aponta todos
      // para o centro e leva a bancada local para cima do tampo.
      seat.group.rotation.y = seatView.azimuthRad;
      seat.plaque.rotation.z = 0;
      seat.plaque.scale.setScalar(0.82);
    }
  }

  setTheme(theme) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    if (nextTheme === this.theme) return;
    this.theme = nextTheme;
    disposeObject3D(this.environment.room);
    this.environment = createCouncilEnvironment(this.stage, { theme: nextTheme });
    this.environment.setMood(this.view?.beat ?? 'turn');
    this.stage.setVisualProfile(COUNCIL_THEME_PROFILES[nextTheme]);
    this.victoryLight.color.setHex(nextTheme === 'light' ? 0xffe6ae : 0xffd78f);
  }

  update(elapsed, reducedMotion, delta) {
    super.update(elapsed, reducedMotion, delta);
    const self = this.view?.seats.find((seat) => seat.isSelf);
    const seat = self ? this.seats.get(self.id) : null;
    if (!seat) return;
    // No POV ocupamos a cadeira do jogador local: o corpo atravessaria a lente
    // e a placa dele ficaria espelhada no primeiro plano. Nos demais atos a
    // cadeira volta a ser vista de fora, então tudo reaparece.
    const embodied = this.cameraName === 'player';
    seat.body.visible = !embodied;
    seat.plaque.visible = !embodied;
  }
}
