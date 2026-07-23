import * as THREE from 'three';
import { TabletopStage, disposeObject3D } from '@la-corte/tabletop-stage';
import {
  PROJECTILE_CAM,
  bezierDirection,
  isOutsideFrame,
  projectileCamAnchor,
  projectileCamPose,
} from '@la-corte/tabletop-stage/projectile-cam';
import { applyGesturePose, gestureProgress, gesturePose, startGesture } from '@la-corte/tabletop-stage/gesture-track';
import {
  cameraDecisionKey,
  claimCameraForSeat,
  coinTransferCameraForSeats,
  confirmationCameraForElements,
  directCamera,
  duelCameraForSeats,
  influenceRevealCamera,
  interventionCameraForElements,
  targetingCameraAct,
  throneCameraForSeat,
} from './camera-director.js';
import { coinTransferDuration, coinTransferPoint, coinTransferProgress } from './coin-transfer.js';
import { createCoupEnvironment } from './coup-environment.js';
import { createTabletopFoley } from './foley.js';
import { resolveTabletopQuality } from './quality-profiles.js';
import { TABLETOP_THROWABLES } from './reactions.js';
import { actionCaptionTexture, createInfluenceCard, imageTexture, plaqueTexture } from './coup-table/cards.js';
import { playerCameraForSeat, povCameraForSeat } from './coup-table/seat-cameras.js';
import { SALON_SEAT_RING, seatRingPoint } from './coup-table/seat-ring.js';
import { ROLE_VISUALS, createRoleFigure } from './coup-table/figures.js';
import { createFigure } from './coup-table/figure.js';
import { expressionForGesture } from './coup-table/cultist-expressions.js';
import { createEmojiSprite, createThrowable } from './coup-table/reaction-models.js';
import { COURT_GESTURES, impactGesture } from './coup-table/gestures.js';
import { createCoinTreasury, createCourtCoin, createTreasureLabel } from './coup-table/coins.js';
import {
  DECISION_BUBBLE_ANCHOR,
  applyDecisionClock,
  createDecisionBubble,
  createDecisionEffigy,
  createDecisionHourglass,
} from './coup-table/decision-props.js';
import { COLORS, mesh, standardMaterial } from './coup-table/primitives.js';
import { ACTION_ART, ROLE_CARD_ACCENTS, THEME_PROFILES } from './coup-table/visual-theme.js';

export { ACTION_ART } from './coup-table/visual-theme.js';

const THROWABLE_TYPES = new Set(TABLETOP_THROWABLES.map((item) => item.id));
const INFLUENCE_REVEAL_HOLD_MS = 1900;
const TARGET_PICK_LAYER = 1;

function faceCameraYaw(object, camera, delta, offset = 0) {
  const target = Math.atan2(camera.position.x - object.position.x, camera.position.z - object.position.z) + offset;
  const difference = Math.atan2(Math.sin(target - object.rotation.y), Math.cos(target - object.rotation.y));
  object.rotation.y += difference * (1 - Math.exp(-Math.max(delta, 1 / 120) * 8));
}

export class CoupTableScene {
  constructor(canvas, options = {}) {
    this.theme = options.theme === 'light' ? 'light' : 'dark';
    this.quality = resolveTabletopQuality(options.quality);
    const profile = THEME_PROFILES[this.theme];
    this.stage = new TabletopStage(canvas, {
      clearColor: profile.clearColor,
      fogColor: profile.fogColor,
      fogDensity: profile.fogDensity,
      pixelScale: options.pixelScale ?? this.quality.pixelScale,
      maxDevicePixelRatio: options.maxDevicePixelRatio ?? this.quality.maxDevicePixelRatio,
      exposure: profile.exposure,
      grain: profile.grain,
      vignette: profile.vignette,
      reducedMotion: options.reducedMotion,
    });
    this.stage.defineCameraAct('table', {
      position: [0, 5.35, 11.45],
      target: [0, 1.45, -0.8],
      fov: 49,
      portrait: { position: [0, 6.85, 11.25], target: [0, 1.35, -0.35], fov: 70 },
    });
    this.stage.defineCameraAct('targeting', targetingCameraAct());
    this.stage.defineCameraAct('pov', {
      position: [0, 2.8, 7.8],
      target: [0, 1.35, -1.9],
      fov: 55,
      portrait: { position: [0, 3.25, 10.8], target: [0, 1.45, -1.05], fov: 57 },
    });
    this.stage.defineCameraAct('player', {
      position: [0, 4.35, 8.25],
      target: [0, 1.22, 5.8],
      fov: 46,
      portrait: { position: [0, 6.4, 8.7], target: [0, 1.2, 5.4], fov: 60 },
    });
    this.stage.defineCameraAct('intervention', {
      position: [0, 4.85, 8.7],
      target: [0, 1.95, -0.05],
      fov: 46,
      portrait: { position: [0, 6.15, 10.7], target: [0, 1.85, -0.05], fov: 61 },
    });
    this.stage.defineCameraAct('duel', {
      position: [7.7, 4.3, 8.6],
      target: [0, 1.45, 0],
      fov: 43,
      portrait: { position: [5.9, 4.8, 10.4], target: [0, 1.65, 0], fov: 60 },
    });
    this.stage.defineCameraAct('evidence', {
      position: [0, 4.7, 6.8],
      target: [0, 1.3, 0.1],
      fov: 40,
      portrait: { position: [0, 5.1, 9.4], target: [0, 1.45, 0], fov: 49 },
    });
    this.stage.defineCameraAct('overhead', {
      position: [0, 8.05, 6.4],
      target: [0, 0.5, 0],
      fov: 52,
      portrait: { position: [0, 8.05, 7.35], target: [0, 0.5, 0], fov: 58 },
    });
    this.stage.defineCameraAct('throne', {
      position: [0, 4.15, 10.2],
      target: [0, 1.75, 0],
      fov: 41,
      portrait: { position: [0, 5.4, 11.1], target: [0, 1.8, 0], fov: 62 },
    });
    this.stage.defineCameraAct('portal', {
      position: [0, 4.25, 5.8],
      target: [0, 3.3, 12.4],
      fov: 42,
      portrait: { position: [0, 4.9, 1.8], target: [0, 3.45, 12.5], fov: 54 },
    });
    this.stage.setCameraAct('table', { immediate: true });

    this.environment = createCoupEnvironment(this.stage, { theme: this.theme });
    this.seatLayer = this.stage.add(new THREE.Group());
    this.seatLayer.name = 'coup-seats';
    this.seats = new Map();
    this.seatSignature = '';
    this.view = null;
    this.autoCameraKey = '';
    this.autoCameraHold = null;
    this.latestInfluenceLossKey = '';
    this.cameraOverridden = false;
    this.cameraName = 'table';
    this.currentPovSeatId = null;
    this.currentFocusSeatId = null;
    this.decisionClock = { deadline: 0, total: 0, visible: false, focused: false };
    this.actionTexture = null;
    this.actionCaptionTexture = null;
    this.actionSignature = '';
    this.publicRole = null;
    this.publicRoleName = null;
    this.winnerAvatar = null;
    this.winnerAvatarId = null;
    this.elapsed = 0;
    this.emojiReactions = [];
    this.flyingReactions = [];
    this.coinTransfers = [];
    this.processedCoinMovements = new Set();
    this.throwCam = { element: null, allowed: () => true, onChange: () => {}, open: false };
    this.influenceReveals = [];
    this.selectableInfluences = [];
    this.hoveredInfluenceId = null;
    this.focusableInfluences = [];
    this.hoveredPrivateInfluenceId = null;
    this.focusedInfluenceId = null;
    this.privateCoinsHovered = false;
    this.hoveredTargetSeatId = null;
    this.exchangeGroup = null;
    this.exchangeCards = [];
    this.exchangeSignature = '';
    this.hoveredExchangeId = null;
    this.foley = options.sounds ? createTabletopFoley({ sounds: options.sounds }) : null;

    this.actionCard = new THREE.Group();
    const edge = standardMaterial(COLORS.gold, { metalness: 0.55, roughness: 0.3 });
    this.actionFace = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.actionCard.add(mesh(new THREE.BoxGeometry(1.42, 1.95, 0.08), [edge, edge, edge, edge, this.actionFace, edge]));
    this.actionCaptionMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.actionCard.add(
      mesh(new THREE.PlaneGeometry(1.34, 0.52), this.actionCaptionMaterial, {
        position: [0, -0.69, 0.047],
        cast: false,
        receive: false,
      }),
    );
    // Moldura branca de hover: sinaliza que a carta aceita interação.
    this.actionHoverFrame = new THREE.Group();
    const frameMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const framePieces = [
      { size: [1.56, 0.05], position: [0, 1.0] },
      { size: [1.56, 0.05], position: [0, -1.0] },
      { size: [0.05, 2.05], position: [0.755, 0] },
      { size: [0.05, 2.05], position: [-0.755, 0] },
    ];
    for (const piece of framePieces) {
      this.actionHoverFrame.add(
        mesh(new THREE.PlaneGeometry(...piece.size), frameMaterial, {
          position: [...piece.position, 0.047],
          cast: false,
          receive: false,
        }),
      );
    }
    this.actionHoverFrame.visible = false;
    this.actionCard.add(this.actionHoverFrame);
    this.actionCard.position.set(0.72, 2.35, -0.15);
    this.actionCard.rotation.y = -0.08;
    this.actionCard.visible = false;
    this.actionTargetX = 0;
    this.actionTargetZ = -0.15;
    this.publicRoleTargetX = 0;
    this.publicRoleTargetZ = -0.15;
    this.actionPresence = 0;
    this.actionPresenceTarget = 0;
    this.centerpiecePulseAt = -Infinity;
    this.actionCardFocusDirection = null;
    this.actionCardFocusFrameKey = '';
    this.stage.add(this.actionCard);

    this.seal = mesh(
      new THREE.TorusGeometry(0.74, 0.07, 8, 28),
      standardMaterial(COLORS.gold, { emissive: COLORS.gold, emissiveIntensity: 0.15 }),
      {
        position: [0, 1.31, 0],
        rotation: [-Math.PI / 2, 0, 0],
      },
    );
    this.stage.add(this.seal);
    this.hourglass = createDecisionHourglass();
    this.hourglass.group.position.set(0, 1.34, 0);
    this.stage.add(this.hourglass.group);
    this.decisionBubble = createDecisionBubble();
    this.stage.add(this.decisionBubble.group);
    this.decisionGroup = null;
    this.decisionOptions = [];
    this.decisionSignature = '';
    this.decisionPresentation = null;
    this.hoveredDecisionId = null;
    this.armedDecisionId = null;
    this.interventionFrameKey = '';
    this.interventionFocusCache = [];
    this.decisionAppearedAt = -Infinity;
    this.processedStageEvents = new Set();
    this.hasSyncedStageEvents = false;
    this.victoryLight = new THREE.SpotLight(0xffd78f, 0, 15, 0.38, 0.55, 1.4);
    this.victoryLight.position.set(0, 8, 4.2);
    this.victoryLight.target.position.set(0, 1.5, 0);
    this.stage.add(this.victoryLight);
    this.stage.add(this.victoryLight.target);

    this.stage.addUpdater(({ delta, elapsed, reducedMotion }) => this.update(elapsed, reducedMotion, delta));
  }

  rebuildSeats(view) {
    this.winnerAvatar?.removeFromParent();
    this.winnerAvatar = null;
    this.winnerAvatarId = null;
    this.exchangeGroup = null;
    this.exchangeCards = [];
    this.exchangeSignature = '';
    this.hoveredExchangeId = null;
    if (this.decisionGroup) disposeObject3D(this.decisionGroup);
    // Algumas figuras pintam texturas que não ficam presas a materiais vivos da
    // cena (os rostos alternativos do cultista); o descarte de malha não as
    // alcança, então cada figura limpa o que pintou antes de a camada sumir.
    for (const seat of this.seats.values()) seat.dispose?.();
    disposeObject3D(this.seatLayer);
    this.seatLayer = this.stage.add(new THREE.Group());
    this.seatLayer.name = 'coup-seats';
    this.seats.clear();
    this.influenceReveals = [];
    this.selectableInfluences = [];
    this.hoveredInfluenceId = null;
    this.focusableInfluences = [];
    this.hoveredPrivateInfluenceId = null;
    this.focusedInfluenceId = null;
    this.privateCoinsHovered = false;
    this.hoveredTargetSeatId = null;
    this.decisionGroup = null;
    this.decisionOptions = [];
    this.decisionSignature = '';
    this.decisionPresentation = null;
    this.hoveredDecisionId = null;
    this.armedDecisionId = null;
    this.interventionFrameKey = '';
    this.interventionFocusCache.length = 0;
    const count = view.seats.length;
    const { props, facing } = this.seatRing;
    for (const seatView of view.seats) {
      const angle = seatView.azimuthRad;
      const anchor = seatRingPoint(this.seatRing, seatView, count);
      const figure = createFigure(seatView.appearance, { name: seatView.name });
      figure.group.position.set(anchor.x, 0, anchor.z);
      figure.group.rotation.y = angle + Math.PI;

      const plaque = mesh(
        new THREE.PlaneGeometry(1.65, 0.41),
        new THREE.MeshBasicMaterial({
          map: plaqueTexture(seatView.name, seatView.isSelf ? 'VOCÊ' : 'CONSELHEIRO'),
          transparent: false,
        }),
        {
          position: props.plaque,
          rotation: [-Math.PI / 2, 0, facing.plaque],
          cast: false,
        },
      );
      figure.group.add(plaque);

      // Uma cadeira inteira funciona como alvo. A caixa invisível inclui o
      // cortesão e a bancada para que touch não dependa de acertar uma placa
      // ou carta pequena.
      const targetHitbox = mesh(
        new THREE.BoxGeometry(2.7, 3.15, 2.75),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        { position: [0, 1.72, -0.72], cast: false, receive: false },
      );
      targetHitbox.name = `target-seat-${seatView.id}`;
      targetHitbox.layers.set(TARGET_PICK_LAYER);
      figure.group.add(targetHitbox);

      const coinGroup = new THREE.Group();
      coinGroup.position.fromArray(props.coins);
      figure.group.add(coinGroup);
      const influenceGroup = new THREE.Group();
      influenceGroup.position.fromArray(props.influences);
      figure.group.add(influenceGroup);
      this.seatLayer.add(figure.group);
      const seat = {
        ...figure,
        plaque,
        targetHitbox,
        coinGroup,
        treasureLabel: null,
        influenceGroup,
        influenceSignature: '',
        influenceStates: [],
        coinCount: -1,
        baseY: figure.group.position.y,
        seed: seatView.index * 1.71,
      };
      this.seats.set(seatView.id, seat);
    }
  }

  povSelection() {
    const seats = this.view?.seats ?? [];
    const seat =
      seats.find((candidate) => candidate.id === this.currentPovSeatId) ?? seats.find((candidate) => candidate.isSelf);
    return seat ? { id: seat.id, name: seat.name } : null;
  }

  /** Moldura da composição: cadeiras, câmeras e peças derivam deste anel. */
  get seatRing() {
    return SALON_SEAT_RING;
  }

  povCameraForSeat(seat, seatCount) {
    return povCameraForSeat(seat, seatCount, this.seatRing);
  }

  playerCameraForSeat(seat, seatCount) {
    return playerCameraForSeat(seat, seatCount, this.seatRing);
  }

  localCameraForSeat(seat, seatCount) {
    return this.playerCameraForSeat(seat, seatCount);
  }

  setPovSeat(seatId, { immediate = false } = {}) {
    const seats = this.view?.seats ?? [];
    const seat =
      seats.find((candidate) => candidate.id === seatId) ?? seats.find((candidate) => candidate.isSelf) ?? seats[0];
    if (!seat) return null;
    this.focusedInfluenceId = null;
    this.currentPovSeatId = seat.id;
    this.stage.defineCameraAct('pov', this.povCameraForSeat(seat, seats.length));
    this.stage.setCameraNavigation('orbit');
    this.cameraOverridden = true;
    this.cameraName = 'pov';
    this.stage.setCameraAct('pov', { immediate });
    return this.povSelection();
  }

  cyclePovSeat() {
    const seats = this.view?.seats ?? [];
    if (!seats.length) return null;
    const currentIndex = seats.findIndex((seat) => seat.id === this.currentPovSeatId);
    return this.setPovSeat(seats[(currentIndex + 1 + seats.length) % seats.length].id);
  }

  setPlayerCamera({ immediate = false } = {}) {
    const seats = this.view?.seats ?? [];
    const self = seats.find((seat) => seat.isSelf);
    if (!self) return null;
    this.focusedInfluenceId = null;
    this.stage.defineCameraAct('player', this.localCameraForSeat(self, seats.length));
    this.stage.setCameraNavigation('orbit');
    this.cameraOverridden = true;
    this.cameraName = 'player';
    this.stage.setCameraAct('player', { immediate });
    return { id: self.id, name: self.name };
  }

  focusSeat(seatId, { immediate = false } = {}) {
    const seats = this.view?.seats ?? [];
    const seat = seats.find((candidate) => candidate.id === seatId);
    if (!seat) return null;
    this.focusedInfluenceId = null;
    this.currentFocusSeatId = seat.id;
    this.stage.defineCameraAct('inspect', this.playerCameraForSeat(seat, seats.length));
    this.stage.setCameraNavigation('orbit');
    this.cameraOverridden = true;
    this.cameraName = 'inspect';
    this.stage.setCameraAct('inspect', { immediate });
    return { id: seat.id, name: seat.name };
  }

  updateSeat(seatView) {
    const seat = this.seats.get(seatView.id);
    if (!seat) return;
    seat.view = seatView;
    seat.group.visible = seatView.connected || !seatView.eliminated;
    seat.group.scale.setScalar(seatView.eliminated ? 0.94 : 1);
    seat.group.rotation.z = seatView.eliminated ? 0.09 : 0;
    seat.body.rotation.x = seatView.eliminated ? -0.2 : 0;
    this.updateSeatFocus(seatView);

    if (seat.coinCount !== seatView.coins) {
      // -1 é a pilha recém-construída: entrar no salão ou reconstruir assentos
      // não é movimento de tesouro e não deve soar.
      const hadCoins = seat.coinCount >= 0;
      disposeObject3D(seat.coinGroup);
      seat.coinGroup = createCoinTreasury(seatView.coins);
      seat.coinGroup.position.fromArray(this.seatRing.props.coins);
      seat.group.add(seat.coinGroup);
      if (seat.treasureLabel) disposeObject3D(seat.treasureLabel);
      seat.treasureLabel = seatView.isSelf ? createTreasureLabel(seatView.coins) : null;
      if (seat.treasureLabel) {
        seat.treasureLabel.position.fromArray(this.seatRing.props.treasure);
        seat.treasureLabel.visible = this.privateCoinsHovered;
        seat.group.add(seat.treasureLabel);
      }
      if (hadCoins) this.foley?.play(seatView.coins > seat.coinCount ? 'coins-gain' : 'coins-loss');
      seat.coinCount = seatView.coins;
    }

    const influenceSignature = seatView.influences
      .map((card) => `${card.id}:${card.role}:${card.revealed}:${card.selectable}:${card.focusable}`)
      .join('|');
    if (influenceSignature !== seat.influenceSignature) {
      const previousInfluences = seat.influenceStates;
      const hadInfluences = seat.influenceSignature !== '';
      this.influenceReveals = this.influenceReveals.filter((reveal) => reveal.seatId !== seatView.id);
      this.selectableInfluences = this.selectableInfluences.filter((entry) => entry.seatId !== seatView.id);
      this.focusableInfluences = this.focusableInfluences.filter((entry) => entry.seatId !== seatView.id);
      disposeObject3D(seat.influenceGroup);
      seat.influenceGroup = new THREE.Group();
      seat.influenceGroup.position.fromArray(this.seatRing.props.influences);
      seat.group.add(seat.influenceGroup);
      seatView.influences.forEach((influence, index) => {
        const card = createInfluenceCard(influence);
        const baseY = influence.revealed ? 0.055 : 0;
        const newlyRevealed = hadInfluences && !previousInfluences[index]?.revealed && influence.revealed;
        card.position.set(index * 0.7, baseY, index * 0.08);
        card.rotation.x = newlyRevealed ? Math.PI * 0.96 : 0;
        card.rotation.y = this.seatRing.facing.influences + (index ? -0.12 : 0.1);
        card.rotation.z = influence.revealed ? 0.04 : 0;
        seat.influenceGroup.add(card);
        if (influence.selectable) {
          this.selectableInfluences.push({
            seatId: seatView.id,
            influenceId: influence.id,
            card,
            frame: card.userData.selectionFrame,
            material: card.userData.selectionMaterial,
          });
        }
        if (influence.focusable) {
          this.focusableInfluences.push({
            seatId: seatView.id,
            influenceId: influence.id,
            card,
            frame: card.userData.focusFrame,
          });
        }
        if (newlyRevealed) {
          this.foley?.play('card');
          this.influenceReveals.push({
            seatId: seatView.id,
            card,
            baseY,
            startedAt: this.elapsed,
            duration: 0.9,
          });
        }
      });
      seat.influenceSignature = influenceSignature;
      seat.influenceStates = seatView.influences.map((influence) => ({ revealed: influence.revealed }));
    }
  }

  updateSeatFocus(seatView) {
    const seat = this.seats.get(seatView.id);
    if (!seat) return;
    const targetHovered = seatView.isSelectableTarget && this.hoveredTargetSeatId === seatView.id;
    const targetSelected = seatView.isSelectableTarget && seatView.isSelectedTarget;
    const focusOpacity =
      targetHovered || targetSelected
        ? 0.82
        : seatView.isSelectableTarget
          ? 0.48
          : seatView.isWinner
            ? 0.72
            : seatView.isActor || seatView.isCurrent
              ? 0.48
              : seatView.isTarget || seatView.isBlocker
                ? 0.34
                : 0;
    seat.focus.visible = focusOpacity > 0;
    seat.focus.material.opacity = focusOpacity;
    seat.focus.material.color.setHex(
      targetHovered || targetSelected || seatView.isTarget ? COLORS.danger : COLORS.gold,
    );
    seat.focus.scale.setScalar(targetHovered ? 1.16 : targetSelected ? 1.1 : 1);
  }

  updateActionCard(view) {
    const action = view.action;
    const block = view.block;
    const visible = Boolean(action && ['claim', 'block-window', 'block-claim', 'influence-loss'].includes(view.beat));
    this.actionPresenceTarget = visible ? 1 : 0;
    if (!visible) {
      this.setActionCardHover(false);
      this.layoutCenterpiece();
      return;
    }
    this.actionCard.visible = true;
    const title = block?.role ?? action.claimedRole ?? action.label;
    const intervention = view.decision?.kind && view.decision.kind !== 'action';
    this.setPublicRole(!intervention && ROLE_VISUALS[title] ? title : null);
    this.layoutCenterpiece();
    const kicker = block ? 'BLOQUEIO DECLARADO' : action.claimedRole ? 'INFLUÊNCIA ALEGADA' : 'AÇÃO DA CORTE';
    const footer = block
      ? `${block.player.name} INTERVÉM`
      : action.target
        ? `${action.actor.name} → ${action.target.name}`
        : action.actor.name;
    const signature = `${action.id}|${title}|${kicker}|${footer}`;
    if (signature === this.actionSignature) return;
    this.actionTexture?.dispose();
    this.actionCaptionTexture?.dispose();
    const accent = ROLE_CARD_ACCENTS[title] ?? (block ? '#e16466' : '#e0bc74');
    this.actionTexture = imageTexture(ACTION_ART[action.id]);
    this.actionCaptionTexture = actionCaptionTexture(title, kicker, footer, accent);
    this.actionFace.map = this.actionTexture;
    this.actionFace.needsUpdate = true;
    this.actionCaptionMaterial.map = this.actionCaptionTexture;
    this.actionCaptionMaterial.needsUpdate = true;
    this.actionSignature = signature;
    this.centerpiecePulseAt = this.elapsed;
  }

  updateExchange(view) {
    const exchange = view.exchange;
    const selfView = view.seats.find((seat) => seat.isSelf);
    const selfSeat = selfView ? this.seats.get(selfView.id) : null;
    if (selfSeat) selfSeat.influenceGroup.visible = !exchange;
    const signature = exchange
      ? `${selfView?.id ?? ''}|${exchange.requiredCount}|${exchange.options.map((card) => `${card.id}:${card.role}`).join('|')}`
      : '';
    if (signature !== this.exchangeSignature) {
      if (this.exchangeGroup) disposeObject3D(this.exchangeGroup);
      this.exchangeGroup = null;
      this.exchangeCards = [];
      this.hoveredExchangeId = null;
      this.exchangeSignature = signature;
      if (!exchange || !selfSeat) return;

      const group = new THREE.Group();
      group.name = 'exchange-options';
      // A troca ocupa a borda privada do jogador: à frente do corpo e alguns
      // centímetros acima das fichas, para o leque não atravessar nenhum dos dois.
      group.position.fromArray(this.seatRing.props.exchange);
      const count = exchange.options.length;
      exchange.options.forEach((option, index) => {
        const card = createInfluenceCard({
          ...option,
          revealed: false,
          selectable: true,
        });
        card.position.set((index - (count - 1) / 2) * 0.72, option.selected ? 0.16 : 0, (index % 2) * 0.025);
        card.rotation.y = this.seatRing.facing.influences + (index - (count - 1) / 2) * -0.035;
        group.add(card);
        this.exchangeCards.push({
          id: option.id,
          card,
          selected: option.selected,
          material: card.userData.selectionMaterial,
        });
      });
      selfSeat.group.add(group);
      this.exchangeGroup = group;
    }

    for (const entry of this.exchangeCards) {
      entry.selected = Boolean(exchange?.options.find((option) => option.id === entry.id)?.selected);
      entry.material.color.setHex(entry.selected ? 0x9ed5a7 : 0xffdda0);
    }
  }

  updateDecision(view) {
    // As ações permanecem na faixa 2D compacta; só intervenções ganham
    // encenação volumétrica no centro da mesa.
    const decision = view.decision?.kind === 'action' ? null : view.decision;
    const selfView = view.seats.find((seat) => seat.isSelf);
    const selfSeat = selfView ? this.seats.get(selfView.id) : null;
    const signature = decision
      ? `${decision.key}|${decision.options.map((entry) => `${entry.id}:${entry.enabled}`).join('|')}`
      : '';
    if (signature === this.decisionSignature) return;
    if (this.decisionGroup) disposeObject3D(this.decisionGroup);
    this.decisionGroup = null;
    this.decisionOptions = [];
    this.decisionPresentation = null;
    this.hoveredDecisionId = null;
    this.armedDecisionId = null;
    this.decisionSignature = signature;
    this.interventionFrameKey = '';
    this.autoCameraKey = '';
    if (!decision || !selfSeat) return;

    const group = new THREE.Group();
    group.name = `tabletop-decision-${decision.kind}`;
    const interventionOptions = decision.options.filter((entry) => entry.id !== 'response:pass');
    decision.options.forEach((entry, index) => {
      const visual = createDecisionEffigy(entry);
      const interventionIndex = interventionOptions.findIndex((option) => option.id === entry.id);
      const point = {
        x:
          entry.id === 'response:pass'
            ? 1.75
            : interventionOptions.length === 1
              ? -1.75
              : -2.2 + interventionIndex * 1.08,
        y: 1.28,
        z: -0.06,
      };
      visual.group.position.set(point.x, point.y, point.z);
      visual.group.scale.setScalar(this.stage.reducedMotion ? 1 : 0.01);
      group.add(visual.group);
      this.decisionOptions.push({ ...visual, baseY: point.y, index, intervention: true });
    });
    this.stage.add(group);
    this.decisionGroup = group;
    this.decisionPresentation = 'intervention';
    this.decisionAppearedAt = this.elapsed;
  }

  showEmojiReaction(playerId, emoji) {
    const origin = this.reactionAnchor(playerId, { y: 2.95, z: -0.08 });
    if (!origin || !emoji) return false;
    if (this.emojiReactions.length >= 6) {
      const oldest = this.emojiReactions.shift();
      if (oldest) disposeObject3D(oldest.sprite);
    }
    const sprite = createEmojiSprite(emoji);
    sprite.position.copy(origin);
    this.stage.add(sprite);
    this.emojiReactions.push({ sprite, origin, startedAt: this.elapsed, duration: 2.2 });
    return true;
  }

  // Reações pertencem ao cortesão, não à cadeira. Durante a vitória isso
  // redireciona naturalmente a origem/destino para o avatar no centro.
  reactionAnchor(playerId, { y = 2, z = -0.18 } = {}) {
    const body = playerId === this.winnerAvatarId ? this.winnerAvatar : this.seats.get(playerId)?.body;
    if (!body || !body.visible) return null;
    body.updateWorldMatrix(true, false);
    return body.localToWorld(new THREE.Vector3(0, y, z));
  }

  setSeatGesture(playerId, kind) {
    const seat = this.seats.get(playerId);
    if (!seat) return false;
    seat.gesture = startGesture(COURT_GESTURES, seat.gesture, kind, this.elapsed);
    return true;
  }

  playStageEvent(event) {
    switch (event.type) {
      case 'action_declared':
        this.setSeatGesture(event.actorId, 'assert');
        this.foley?.play('declare');
        break;
      case 'block_declared':
      case 'action_blocked':
        this.setSeatGesture(event.actorId, 'block');
        this.foley?.play('block');
        break;
      case 'challenge_resolved':
        this.setSeatGesture(event.challengerId, 'challenge');
        this.setSeatGesture(event.challengedId, event.truthful ? 'prove' : 'defeat');
        this.foley?.play('challenge');
        break;
      case 'influence_lost':
        this.setSeatGesture(event.actorId, 'defeat');
        this.foley?.play('defeat');
        break;
      case 'exchange_resolved':
        this.setSeatGesture(event.actorId, 'assert');
        this.foley?.play('card');
        break;
      case 'game_finished':
        this.setSeatGesture(event.winnerId, 'victory');
        this.setSeatGesture(event.loserId, 'defeat');
        this.foley?.play('victory');
        break;
      default:
        break;
    }
  }

  syncStageEvents(view) {
    const events = view.stageEvents ?? [];
    if (!this.hasSyncedStageEvents) {
      events.forEach((event) => this.processedStageEvents.add(event.id));
      this.hasSyncedStageEvents = true;
      return;
    }
    for (const event of events) {
      if (this.processedStageEvents.has(event.id)) continue;
      this.processedStageEvents.add(event.id);
      this.playStageEvent(event);
    }
    if (this.processedStageEvents.size > 96) {
      const visibleIds = new Set(events.map((event) => event.id));
      for (const id of this.processedStageEvents) if (!visibleIds.has(id)) this.processedStageEvents.delete(id);
    }
  }

  /**
   * `spotlight` marca o arremesso do próprio jogador. Só ele ganha o PiP: a
   * janela é o retorno da ação de quem jogou, e não um corte imposto a toda a
   * mesa. Os demais clientes veem o objeto voar e mais nada.
   */
  throwReaction(sourceId, targetId, type, { spotlight = false } = {}) {
    const start = this.reactionAnchor(sourceId, { y: 1.78, z: -0.38 });
    const end = this.reactionAnchor(targetId, { y: 1.92, z: -0.18 });
    if (!start || !end || sourceId === targetId || !THROWABLE_TYPES.has(type)) return false;
    if (this.flyingReactions.length >= 8) {
      const oldest = this.flyingReactions.shift();
      if (oldest) disposeObject3D(oldest.group);
    }
    const group = createThrowable(type);
    const control = start.clone().lerp(end, 0.5).setY(4.15);
    group.position.copy(start);
    this.stage.add(group);
    if (spotlight) this.closeThrowCam();
    this.flyingReactions.push({
      group,
      start,
      control,
      end,
      spotlight,
      targetId,
      throwable: type,
      startedAt: this.elapsed,
      duration: this.stage.reducedMotion ? 0.45 : 0.9,
      spin: new THREE.Vector3(6.2, 8.1, 5.4),
    });
    this.foley?.play('throw');
    return true;
  }

  /**
   * Amarra o PiP de arremesso a um `<canvas>` da casca. `allowed` é consultado
   * a cada quadro do voo: uma decisão que suba no meio do arremesso fecha a
   * janela, porque prioridade sobre a interface não é prioridade sobre o jogo.
   */
  bindThrowCam({ element = null, allowed = () => true, onChange = () => {} } = {}) {
    this.throwCam = { element, allowed, onChange, open: false };
    this.stage.setInsetCamera({ fov: PROJECTILE_CAM.fov, viewportElement: element, mirror: element });
  }

  updateThrowCam(reaction, progress) {
    const cam = this.throwCam;
    if (!cam.element) return;
    if (cam.open && !cam.allowed()) {
      this.closeThrowCam();
      return;
    }
    const direction = bezierDirection(reaction.start, reaction.control, reaction.end, progress);
    this.stage.setInsetCamera(projectileCamPose({ position: reaction.group.position, direction }));
    // Uma vez aberta, a janela acompanha o objeto até o fim mesmo que ele
    // reentre no quadro principal — reabrir a cada cruzamento de borda daria
    // um pisca-pisca no lugar de um plano.
    if (cam.open) return;
    const ndc = reaction.group.position.clone().project(this.stage.camera);
    if (!isOutsideFrame(ndc) || !cam.allowed()) return;
    cam.open = true;
    this.stage.setInsetCameraEnabled(true);
    cam.onChange(
      projectileCamAnchor(ndc, {
        width: this.stage.canvas.clientWidth,
        height: this.stage.canvas.clientHeight,
      }),
    );
  }

  /**
   * O adereço chegou: quem levou reage. Sem isso o arremesso é um objeto
   * atravessando a sala e o alvo fica de mármore — o gesto é o que transforma
   * o voo em impacto.
   */
  landReaction(reaction) {
    if (!this.setSeatGesture(reaction.targetId, impactGesture(reaction.throwable))) return;
    this.foley?.play('impact');
  }

  closeThrowCam() {
    if (!this.throwCam.open) return;
    this.throwCam.open = false;
    this.stage.setInsetCameraEnabled(false);
    this.throwCam.onChange(null);
  }

  updateWinnerAvatar(view) {
    const winner = view.seats.find((seat) => seat.isWinner);
    if (!winner) {
      this.winnerAvatar?.removeFromParent();
      this.winnerAvatar = null;
      this.winnerAvatarId = null;
      return;
    }
    if (this.winnerAvatarId === winner.id) return;
    this.winnerAvatar?.removeFromParent();
    const seat = this.seats.get(winner.id);
    if (!seat) return;
    this.winnerAvatar = seat.body.clone(true);
    this.winnerAvatar.name = `winner-avatar-${winner.id}`;
    this.winnerAvatar.visible = true;
    this.winnerAvatar.position.set(0, 0.58, 0);
    this.winnerAvatar.scale.setScalar(0.35);
    this.winnerAvatar.rotation.set(0, 0, 0);
    this.stage.add(this.winnerAvatar);
    this.winnerAvatarId = winner.id;
  }

  setPublicRole(role) {
    if (role === this.publicRoleName) return;
    if (this.publicRole) disposeObject3D(this.publicRole);
    this.publicRole = role ? createRoleFigure(role) : null;
    this.publicRoleName = role;
    if (!this.publicRole) return;
    this.publicRole.position.set(-0.92, 1.26, -0.18);
    this.publicRole.rotation.y = 0.16;
    this.publicRole.scale.setScalar(0.84);
    this.stage.add(this.publicRole);
  }

  layoutCenterpiece() {
    const split = this.actionCard.visible && Boolean(this.publicRole);
    const cameraX = this.stage.camera.position.x;
    const cameraZ = this.stage.camera.position.z;
    const cameraRadius = Math.max(0.001, Math.hypot(cameraX, cameraZ));
    const screenRightX = cameraZ / cameraRadius;
    const screenRightZ = -cameraX / cameraRadius;
    const actionOffset = split ? 0.72 : 0;
    const roleOffset = split ? -0.92 : 0;
    this.actionTargetX = screenRightX * actionOffset;
    this.actionTargetZ = -0.15 + screenRightZ * actionOffset;
    this.publicRoleTargetX = screenRightX * roleOffset;
    this.publicRoleTargetZ = -0.15 + screenRightZ * roleOffset;
  }

  sync(view) {
    const hadView = Boolean(this.view);
    const influenceLoss = view.latestInfluenceLoss;
    const influenceLossKey = influenceLoss
      ? `${influenceLoss.player?.id ?? ''}:${influenceLoss.role ?? ''}:${influenceLoss.at}`
      : '';
    const newInfluenceLoss = Boolean(influenceLossKey && influenceLossKey !== this.latestInfluenceLossKey);
    if (influenceLossKey) this.latestInfluenceLossKey = influenceLossKey;
    const signature = view.seats.map((seat) => seat.id).join('|');
    const seatsChanged = signature !== this.seatSignature;
    if (seatsChanged) {
      this.rebuildSeats(view);
      this.seatSignature = signature;
    }
    if (!view.seats.some((seat) => seat.id === this.hoveredTargetSeatId && seat.isSelectableTarget)) {
      this.hoveredTargetSeatId = null;
    }
    for (const seat of view.seats) this.updateSeat(seat);
    this.updateExchange(view);
    this.updateDecision(view);
    this.updateWinnerAvatar(view);
    this.updateActionCard(view);
    this.view = view;
    this.syncStageEvents(view);
    const coinMovement = this.syncCoinMovements(view, { initial: !hadView });
    if (!this.currentPovSeatId || !view.seats.some((seat) => seat.id === this.currentPovSeatId)) {
      this.currentPovSeatId = view.seats.find((seat) => seat.isSelf)?.id ?? view.seats[0]?.id ?? null;
    }
    if (seatsChanged && this.cameraOverridden) {
      if (this.cameraName === 'pov') this.setPovSeat(this.currentPovSeatId, { immediate: true });
      if (this.cameraName === 'player') this.setPlayerCamera({ immediate: true });
      if (this.cameraName === 'inspect') this.focusSeat(this.currentFocusSeatId, { immediate: true });
    }
    this.victoryLight.intensity = view.beat === 'victory' ? 95 : 0;
    this.environment.setMood(view.beat);
    this.seal.material.color.setHex(
      ['claim', 'block-claim', 'influence-loss'].includes(view.beat) ? COLORS.danger : COLORS.gold,
    );
    this.seal.material.emissive.setHex(
      ['claim', 'block-claim', 'influence-loss'].includes(view.beat) ? COLORS.danger : COLORS.gold,
    );
    if (seatsChanged) this.autoCameraKey = '';
    if (!this.cameraOverridden) {
      if (hadView && newInfluenceLoss) this.holdInfluenceReveal();
      else if (coinMovement) this.holdCoinTransfer(coinMovement);
      if (!this.autoCameraHold) this.applyAutoCamera();
    }
  }

  holdInfluenceReveal() {
    const decision = influenceRevealCamera(this.view);
    if (!decision) return false;
    const seats = this.view.seats;
    const subject = seats.find((seat) => seat.id === decision.seatIds[0]);
    if (!subject) return false;
    this.stage.defineCameraAct(decision.act, this.playerCameraForSeat(subject, seats.length));
    this.cameraName = decision.act;
    this.autoCameraKey = cameraDecisionKey(decision);
    this.autoCameraHold = {
      decision,
      until: performance.now() + INFLUENCE_REVEAL_HOLD_MS,
    };
    this.stage.setCameraAct(decision.act);
    return true;
  }

  holdCoinTransfer(movement) {
    const subjects = [movement.toId, movement.fromId]
      .filter(Boolean)
      .map((id) => this.view.seats.find((seat) => seat.id === id))
      .filter(Boolean);
    if (subjects.length) {
      this.stage.defineCameraAct(
        'coin-transfer',
        coinTransferCameraForSeats(subjects, this.view.seats.length, this.seatRing),
      );
      this.cameraName = 'coin-transfer';
      this.stage.setCameraAct('coin-transfer');
    }
    const duration = coinTransferDuration(movement.amount, { reducedMotion: this.stage.reducedMotion });
    this.autoCameraHold = {
      decision: null,
      until: performance.now() + duration * 1000 + 120,
    };
  }

  interventionFocusPoints(decisionId = null) {
    if (!this.decisionGroup || this.decisionPresentation !== 'intervention') return [];
    this.decisionGroup.updateWorldMatrix(true, true);
    const points = this.interventionFocusCache;
    let pointCount = 0;
    for (const entry of this.decisionOptions) {
      if (decisionId && entry.id !== decisionId) continue;
      const point = points[pointCount] ?? new THREE.Vector3();
      point.set(entry.group.position.x, entry.baseY + 1.02, entry.group.position.z);
      this.decisionGroup.localToWorld(point);
      points[pointCount] = point;
      pointCount += 1;
    }
    if (this.actionCard.visible || this.actionPresenceTarget > 0) {
      this.actionCard.updateWorldMatrix(true, false);
      const actionPoint = points[pointCount] ?? new THREE.Vector3();
      this.actionCard.getWorldPosition(actionPoint);
      actionPoint.y = 2.35;
      points[pointCount] = actionPoint;
      pointCount += 1;
    }
    points.length = pointCount;
    return points;
  }

  frameInterventionCamera({ immediate = false, force = false } = {}) {
    const points = this.interventionFocusPoints(this.armedDecisionId);
    const pose = this.armedDecisionId ? confirmationCameraForElements(points) : interventionCameraForElements(points);
    if (!pose) return false;
    const key = `${this.armedDecisionId ?? 'all'}|${points
      .map((point) => `${point.x.toFixed(1)}:${point.y.toFixed(1)}:${point.z.toFixed(1)}`)
      .join('|')}`;
    if (!force && key === this.interventionFrameKey) return false;
    this.interventionFrameKey = key;
    if (this.cameraName === 'intervention') {
      const retargeted = immediate ? false : this.stage.retargetCameraAct('intervention', pose);
      if (!retargeted) {
        this.stage.defineCameraAct('intervention', pose);
        this.stage.setCameraAct('intervention', { immediate });
      }
    } else this.stage.defineCameraAct('intervention', pose);
    return true;
  }

  // Aplica a decisão do diretor: parametriza o ato pelos assentos envolvidos
  // e só corta quando a chave (ato + assentos) muda entre snapshots.
  applyAutoCamera({ immediate = false } = {}) {
    if (!this.view) return;
    const decision = directCamera(this.view);
    const key = cameraDecisionKey(decision);
    if (key === this.autoCameraKey) return;
    this.autoCameraKey = key;
    const seats = this.view.seats;
    const subjects = decision.seatIds.map((id) => seats.find((seat) => seat.id === id)).filter(Boolean);
    let act = decision.act;
    if (act === 'player') {
      const self = seats.find((seat) => seat.isSelf);
      if (self) this.stage.defineCameraAct('player', this.localCameraForSeat(self, seats.length));
      else act = 'table';
    } else if (act === 'intervention') {
      const pose = interventionCameraForElements(this.interventionFocusPoints());
      if (pose) this.stage.defineCameraAct('intervention', pose);
      else act = 'table';
    } else if (act === 'duel' && subjects.length) {
      this.stage.defineCameraAct('duel', duelCameraForSeats(subjects, seats.length, this.seatRing));
    } else if (act === 'claim' && subjects.length) {
      this.stage.defineCameraAct('claim', claimCameraForSeat(subjects[0], seats.length, this.seatRing));
    } else if (act === 'targeting-seat' && subjects.length) {
      this.stage.defineCameraAct('targeting-seat', this.playerCameraForSeat(subjects[0], seats.length));
    } else if (act === 'evidence' && subjects.length) {
      this.stage.defineCameraAct('evidence', this.playerCameraForSeat(subjects[0], seats.length));
    } else if (act === 'throne' && subjects.length) {
      this.stage.defineCameraAct('throne', throneCameraForSeat(subjects[0], seats.length));
    }
    this.cameraName = act;
    this.stage.setCameraAct(act, { immediate });
  }

  hasActionCard() {
    return this.actionCard.visible;
  }

  coinAnchor(playerId) {
    if (!playerId) return new THREE.Vector3(0, 1.5, 0);
    const seat = this.seats.get(playerId);
    if (!seat) return null;
    // As moedas em voo partem de um palmo acima da pilha, não de dentro dela.
    const [x, y, z] = this.seatRing.props.coins;
    const anchor = new THREE.Vector3(x, y + 0.18, z);
    seat.group.localToWorld(anchor);
    return anchor;
  }

  syncCoinMovements(view, { initial = false } = {}) {
    const movements = view.coinMovements ?? [];
    if (initial) {
      for (const movement of movements) this.processedCoinMovements.add(movement.id);
      return null;
    }
    let featuredMovement = null;
    for (const movement of movements) {
      if (this.processedCoinMovements.has(movement.id)) continue;
      this.processedCoinMovements.add(movement.id);
      if (this.playCoinMovement(movement)) featuredMovement = movement;
    }
    if (this.processedCoinMovements.size > 96) {
      const visibleIds = new Set(movements.map((movement) => movement.id));
      for (const id of this.processedCoinMovements) if (!visibleIds.has(id)) this.processedCoinMovements.delete(id);
    }
    return featuredMovement;
  }

  playCoinMovement(movement, { delay = 0 } = {}) {
    const from = this.coinAnchor(movement.fromId);
    const to = this.coinAnchor(movement.toId);
    const amount = Math.max(0, Math.min(7, Math.floor(Number(movement.amount) || 0)));
    if (!from || !to || !amount || from.distanceToSquared(to) < 0.01) return false;
    const group = new THREE.Group();
    group.name = `coin-transfer-${movement.reason}`;
    const coins = Array.from({ length: amount }, (_, index) => {
      const coin = createCourtCoin({ radius: 0.13, thickness: 0.038 });
      coin.position.copy(from);
      coin.rotation.set(0.18 + index * 0.07, index * 0.31, 0.42);
      group.add(coin);
      return coin;
    });
    this.stage.add(group);
    this.coinTransfers.push({
      group,
      coins,
      from,
      to,
      startedAt: this.elapsed + Math.max(0, Number(delay) || 0),
      reducedMotion: this.stage.reducedMotion,
    });
    return true;
  }

  setTargetSeatHover(seatId) {
    const next = this.view?.seats.some((seat) => seat.id === seatId && seat.isSelectableTarget) ? seatId : null;
    if (next === this.hoveredTargetSeatId) return Boolean(next);
    this.hoveredTargetSeatId = next;
    for (const seatView of this.view?.seats ?? []) this.updateSeatFocus(seatView);
    return Boolean(next);
  }

  setDecisionOptionHover(decisionId) {
    const next = this.decisionOptions.some((entry) => entry.enabled && entry.id === decisionId) ? decisionId : null;
    this.hoveredDecisionId = next;
    for (const entry of this.decisionOptions)
      entry.hover.visible = entry.id === next || entry.id === this.armedDecisionId;
    return Boolean(next);
  }

  setDecisionOptionArmed(decisionId) {
    const next = this.decisionOptions.some((entry) => entry.enabled && entry.id === decisionId) ? decisionId : null;
    if (next === this.armedDecisionId) return Boolean(next);
    this.armedDecisionId = next;
    this.interventionFrameKey = '';
    for (const entry of this.decisionOptions)
      entry.hover.visible = entry.id === this.hoveredDecisionId || entry.id === next;
    this.frameInterventionCamera({ force: true });
    return Boolean(next);
  }

  pickDecisionOption(pointer) {
    if (!this.decisionOptions.length) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), this.stage.camera);
    let closest = null;
    for (const entry of this.decisionOptions) {
      if (!entry.enabled) continue;
      const hit = raycaster.intersectObject(entry.group, true)[0];
      if (hit && (!closest || hit.distance < closest.distance)) closest = { id: entry.id, distance: hit.distance };
    }
    return closest?.id ?? null;
  }

  pickTargetSeat(pointer) {
    if (!this.view?.targeting) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(TARGET_PICK_LAYER);
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), this.stage.camera);
    let closest = null;
    for (const [id, seat] of this.seats) {
      const hit = raycaster.intersectObject(seat.targetHitbox, false)[0];
      if (hit && (!closest || hit.distance < closest.distance)) closest = { id, distance: hit.distance };
    }
    return this.view.seats.some((seat) => seat.id === closest?.id && seat.isSelectableTarget) ? closest.id : null;
  }

  setActionCardHover(hovered) {
    this.actionHoverFrame.visible = Boolean(hovered) && this.actionCard.visible;
  }

  setInfluenceCardHover(influenceId) {
    const next = this.selectableInfluences.some((entry) => entry.influenceId === influenceId) ? influenceId : null;
    this.hoveredInfluenceId = next;
    return Boolean(next);
  }

  pickInfluenceCard(pointer) {
    if (!this.selectableInfluences.length) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), this.stage.camera);
    let closest = null;
    for (const entry of this.selectableInfluences) {
      const hit = raycaster.intersectObject(entry.card, true)[0];
      if (hit && (!closest || hit.distance < closest.distance))
        closest = { id: entry.influenceId, distance: hit.distance };
    }
    return closest?.id ?? null;
  }

  setPrivateInfluenceHover(influenceId) {
    const next = this.focusableInfluences.some((entry) => entry.influenceId === influenceId) ? influenceId : null;
    this.hoveredPrivateInfluenceId = next;
    for (const entry of this.focusableInfluences) entry.frame.visible = entry.influenceId === next;
    return Boolean(next);
  }

  pickPrivateInfluence(pointer) {
    if (!this.focusableInfluences.length || this.view?.exchange) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), this.stage.camera);
    let closest = null;
    for (const entry of this.focusableInfluences) {
      const hit = raycaster.intersectObject(entry.card, true)[0];
      if (hit && (!closest || hit.distance < closest.distance))
        closest = { id: entry.influenceId, distance: hit.distance };
    }
    return closest?.id ?? null;
  }

  setPrivateCoinsHover(hovered) {
    this.privateCoinsHovered = Boolean(hovered);
    const selfView = this.view?.seats.find((seat) => seat.isSelf);
    const selfSeat = selfView ? this.seats.get(selfView.id) : null;
    if (selfSeat?.treasureLabel) selfSeat.treasureLabel.visible = this.privateCoinsHovered;
    return this.privateCoinsHovered;
  }

  pickPrivateCoins(pointer) {
    const selfView = this.view?.seats.find((seat) => seat.isSelf);
    const selfSeat = selfView ? this.seats.get(selfView.id) : null;
    if (!selfSeat?.coinGroup?.visible) return false;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), this.stage.camera);
    return raycaster.intersectObject(selfSeat.coinGroup, true).length > 0;
  }

  hasFocusedInfluenceCard() {
    return Boolean(
      !this.view?.exchange &&
      this.focusedInfluenceId &&
      this.focusableInfluences.some((entry) => entry.influenceId === this.focusedInfluenceId),
    );
  }

  focusPrivateInfluence(influenceId) {
    const entry = this.focusableInfluences.find((candidate) => candidate.influenceId === influenceId);
    if (!entry || this.view?.exchange) return false;
    const card = entry.card.getWorldPosition(new THREE.Vector3());
    const camera = this.stage.camera.position;
    const toCameraX = camera.x - card.x;
    const toCameraZ = camera.z - card.z;
    const length = Math.hypot(toCameraX, toCameraZ) || 1;
    const directionX = toCameraX / length;
    const directionZ = toCameraZ / length;
    const target = [card.x, card.y, card.z];
    this.stage.defineCameraAct('influence-card', {
      position: [card.x + directionX * 0.75, card.y + 1.5, card.z + directionZ * 0.75],
      target,
      fov: 39,
      portrait: {
        position: [card.x + directionX * 0.62, card.y + 1.82, card.z + directionZ * 0.62],
        target,
        fov: 47,
      },
    });
    this.focusedInfluenceId = influenceId;
    this.cameraOverridden = true;
    this.cameraName = 'influence-card';
    this.stage.setCameraAct('influence-card');
    return true;
  }

  setExchangeCardHover(cardId) {
    const next = this.exchangeCards.some((entry) => entry.id === cardId) ? cardId : null;
    this.hoveredExchangeId = next;
    return Boolean(next);
  }

  pickExchangeCard(pointer) {
    if (!this.exchangeCards.length) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), this.stage.camera);
    let closest = null;
    for (const entry of this.exchangeCards) {
      const hit = raycaster.intersectObject(entry.card, true)[0];
      if (hit && (!closest || hit.distance < closest.distance)) closest = { id: entry.id, distance: hit.distance };
    }
    return closest?.id ?? null;
  }

  // Cinemático de leitura: verdadeiro se o ponteiro (em NDC) tocou a carta de
  // ação pública sobre a mesa.
  pickActionCard(pointer) {
    if (!this.actionCard.visible) return false;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), this.stage.camera);
    return raycaster.intersectObject(this.actionCard, true).length > 0;
  }

  // Aproxima a câmera da carta de ação, vinda do ângulo atual — a carta gira
  // sozinha para encarar a câmera, então qualquer aproximação a deixa legível.
  focusActionCard() {
    if (!this.actionCard.visible) return false;
    const card = this.actionCard.position;
    const camera = this.stage.camera.position;
    const toCameraX = camera.x - card.x;
    const toCameraZ = camera.z - card.z;
    const length = Math.hypot(toCameraX, toCameraZ) || 1;
    this.actionCardFocusDirection = new THREE.Vector2(toCameraX / length, toCameraZ / length);
    this.actionCardFocusFrameKey = '';
    this.focusedInfluenceId = null;
    this.cameraOverridden = true;
    this.cameraName = 'card';
    this.refreshActionCardFocus({ start: true });
    return true;
  }

  refreshActionCardFocus({ start = false } = {}) {
    if (!this.actionCard.visible || !this.actionCardFocusDirection) return false;
    const card = this.actionCard.position;
    const direction = this.actionCardFocusDirection;
    const key = `${card.x.toFixed(2)}:${card.z.toFixed(2)}`;
    if (!start && key === this.actionCardFocusFrameKey) return false;
    this.actionCardFocusFrameKey = key;
    const target = [card.x, 2.35, card.z];
    const pose = {
      position: [card.x + direction.x * 2.9, 2.6, card.z + direction.y * 2.9],
      target,
      fov: 44,
      portrait: {
        position: [card.x + direction.x * 3.4, 2.65, card.z + direction.y * 3.4],
        target,
        fov: 52,
      },
    };
    const retargeted = !start && this.stage.retargetCameraAct('card', pose);
    if (!retargeted) {
      this.stage.defineCameraAct('card', pose);
      this.stage.setCameraAct('card');
    }
    return true;
  }

  // Instrumentação do laboratório: congela qualquer ato para capturas de
  // validação visual — dirigidos ("duel:0-3", "duel:2", "evidence:1",
  // "victory:4", "victory-reactions:4-1", "claim:2", "pov:2") ou fixos
  // ("table", "targeting", "player", "overhead", "portal").
  applyLabShot(spec) {
    const seats = this.view?.seats ?? [];
    const [act, indexPart] = String(spec ?? '').split(':');
    const subjects = (indexPart ?? '')
      .split('-')
      .map(Number)
      .filter((index) => Number.isInteger(index) && index >= 0 && index < seats.length)
      .map((index) => seats[index]);
    if (['victory', 'victory-reactions'].includes(act)) {
      const winner = subjects[0] ?? seats[0];
      if (!winner) return null;
      const victoryView = {
        ...this.view,
        beat: 'victory',
        winner: { id: winner.id, name: winner.name },
        seats: seats.map((seat) => ({ ...seat, isWinner: seat.id === winner.id })),
      };
      this.sync(victoryView);
      this.cameraOverridden = true;
      this.cameraName = 'throne';
      this.stage.defineCameraAct('throne', throneCameraForSeat(winner, seats.length));
      this.stage.setCameraAct('throne', { immediate: true });
      if (act === 'victory-reactions' && subjects[1]) {
        this.showEmojiReaction(winner.id, '👏');
        this.throwReaction(winner.id, subjects[1].id, 'rose');
        this.throwReaction(subjects[1].id, winner.id, 'tomato');
      }
      return act;
    }
    if (act === 'decision') {
      const confirmation = String(indexPart ?? '').endsWith('-confirm');
      const catalogKey = String(indexPart ?? '').replace('-confirm', '');
      const catalogs = {
        challenge: [
          ['response:challenge', 'Contestar', 'Exigir a prova', 'danger'],
          ['response:pass', 'Permitir', 'Aceitar a ação', 'gold'],
        ],
        block: [
          ['block:Capitão', 'Capitão', 'Declarar bloqueio', 'danger'],
          ['block:Embaixadora', 'Embaixadora', 'Declarar bloqueio', 'danger'],
          ['response:pass', 'Permitir', 'Não bloquear', 'gold'],
        ],
      };
      const catalog = catalogs[catalogKey];
      if (!catalog) return null;
      const decisionView = {
        ...this.view,
        decision: {
          key: `lab:${catalogKey}`,
          kind: catalogKey === 'block' ? 'block' : 'response',
          options: catalog.map(([id, label, kicker, tone]) => ({ id, label, kicker, tone, enabled: true })),
        },
      };
      const mockActor = seats[1] ?? seats[0];
      const mockTarget = seats[0];
      this.updateDecision(decisionView);
      this.updateActionCard({
        ...decisionView,
        beat: catalogKey === 'block' ? 'block-window' : 'claim',
        action: {
          id: catalogKey === 'block' ? 'steal' : 'tax',
          label: catalogKey === 'block' ? 'Roubar' : 'Imposto',
          claimedRole: catalogKey === 'block' ? 'Capitão' : 'Duque',
          actor: mockActor,
          target: catalogKey === 'block' ? mockTarget : null,
        },
        block: null,
      });
      this.cameraOverridden = true;
      this.cameraName = 'intervention';
      this.frameInterventionCamera({ immediate: true, force: true });
      if (confirmation) this.setDecisionOptionArmed(catalog[0][0]);
      return `decision-${catalogKey}${confirmation ? '-confirm' : ''}`;
    }
    if (act === 'coins' && seats.length >= 2) {
      const isSteal = !['gain', 'cost'].includes(indexPart);
      const movement =
        indexPart === 'gain'
          ? { fromId: null, toId: seats[0].id, amount: 3, reason: 'gain' }
          : indexPart === 'cost'
            ? { fromId: seats[0].id, toId: null, amount: 3, reason: 'cost' }
            : { fromId: seats[1].id, toId: seats[0].id, amount: 2, reason: 'steal' };
      this.cameraOverridden = true;
      this.cameraName = 'coin-transfer';
      this.stage.defineCameraAct(
        this.cameraName,
        coinTransferCameraForSeats(isSteal ? [seats[0], seats[1]] : [seats[0]], seats.length, this.seatRing),
      );
      this.stage.setCameraAct(this.cameraName, { immediate: true });
      return this.playCoinMovement(movement, { delay: 0.35 }) ? 'coins' : null;
    }
    if (act === 'player') return this.setPlayerCamera({ immediate: true }) ? 'player' : null;
    if (act === 'pov') return this.setPovSeat(subjects[0]?.id, { immediate: true }) ? 'pov' : null;
    if (['table', 'targeting', 'overhead', 'portal'].includes(act)) {
      this.cameraOverridden = true;
      this.cameraName = act;
      this.stage.setCameraAct(act, { immediate: true });
      return act;
    }
    if (!subjects.length) return null;
    if (act === 'duel') this.stage.defineCameraAct('duel', duelCameraForSeats(subjects, seats.length, this.seatRing));
    else if (act === 'claim')
      this.stage.defineCameraAct('claim', claimCameraForSeat(subjects[0], seats.length, this.seatRing));
    else if (act === 'targeting-seat')
      this.stage.defineCameraAct('targeting-seat', this.playerCameraForSeat(subjects[0], seats.length));
    else if (act === 'evidence')
      this.stage.defineCameraAct('evidence', this.playerCameraForSeat(subjects[0], seats.length));
    else if (act === 'throne') this.stage.defineCameraAct('throne', throneCameraForSeat(subjects[0], seats.length));
    else return null;
    this.cameraOverridden = true;
    this.cameraName = act;
    this.stage.setCameraAct(act, { immediate: true });
    return act;
  }

  setCamera(name) {
    this.focusedInfluenceId = null;
    if (name === 'pov') return this.setPovSeat(this.currentPovSeatId);
    if (name === 'player') return this.setPlayerCamera();
    if (name === 'auto') {
      this.cameraOverridden = false;
      this.autoCameraKey = '';
      if (!this.autoCameraHold) this.applyAutoCamera();
      return this.povSelection();
    }
    this.cameraOverridden = true;
    this.cameraName = name;
    this.stage.setCameraAct(name);
    return this.povSelection();
  }

  setDecisionClock({ deadline = 0, total = 0, visible = false, focused = false } = {}) {
    this.decisionClock = {
      deadline: Math.max(0, Number(deadline) || 0),
      total: Math.max(0, Number(total) || 0),
      visible: Boolean(visible),
      focused: Boolean(focused),
    };
  }

  runPerformanceBenchmark({ warmupMs, durationMs, label = 'coup-standard' } = {}) {
    return this.stage.runPerformanceBenchmark({
      label,
      warmupMs,
      durationMs,
      metadata: {
        game: 'coup',
        theme: this.theme,
        quality: this.quality.id,
        beat: this.view?.beat ?? null,
        camera: this.cameraName,
        povSeat: this.cameraName === 'pov' ? this.currentPovSeatId : null,
      },
    });
  }

  performanceBenchmarkState() {
    return this.stage.performanceBenchmarkState();
  }

  setQuality(quality) {
    this.quality = resolveTabletopQuality(quality);
    this.stage.setResolutionProfile(this.quality);
  }

  setTheme(theme) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    if (nextTheme === this.theme) return;
    this.theme = nextTheme;
    disposeObject3D(this.environment.room);
    this.environment = createCoupEnvironment(this.stage, { theme: nextTheme });
    this.environment.setMood(this.view?.beat ?? 'turn');
    this.stage.setVisualProfile(THEME_PROFILES[nextTheme]);
    this.victoryLight.color.setHex(nextTheme === 'light' ? 0xffe6ae : 0xffd78f);
  }

  updateDecisionBubble(elapsed, reducedMotion, ratio, remaining) {
    const bubble = this.decisionBubble.group;
    const selfView = this.decisionClock.focused ? this.view?.seats.find((seat) => seat.isSelf) : null;
    const selfSeat = selfView ? this.seats.get(selfView.id) : null;
    bubble.visible = Boolean(selfSeat) && this.decisionClock.visible && this.decisionClock.total > 0;
    if (!bubble.visible) return;
    bubble.position.copy(DECISION_BUBBLE_ANCHOR);
    selfSeat.group.localToWorld(bubble.position);
    if (!reducedMotion) bubble.position.y += Math.sin(elapsed * 1.6) * 0.03;
    applyDecisionClock(this.decisionBubble.hourglass, ratio, remaining);
  }

  update(elapsed, reducedMotion, delta) {
    this.elapsed = elapsed;
    this.environment.update(elapsed, reducedMotion);
    if (this.autoCameraHold && performance.now() >= this.autoCameraHold.until) {
      this.autoCameraHold = null;
      if (!this.cameraOverridden) {
        this.autoCameraKey = '';
        this.applyAutoCamera();
      }
    }
    this.seal.rotation.z = elapsed * 0.14;
    const clockRemaining = Math.max(0, this.decisionClock.deadline - Date.now());
    const clockRatio = this.decisionClock.total
      ? THREE.MathUtils.clamp(clockRemaining / this.decisionClock.total, 0, 1)
      : 0;
    this.hourglass.group.visible = this.decisionClock.visible && this.decisionClock.total > 0;
    if (this.hourglass.group.visible) applyDecisionClock(this.hourglass, clockRatio, clockRemaining);
    this.updateDecisionBubble(elapsed, reducedMotion, clockRatio, clockRemaining);
    if (this.decisionGroup) {
      const progress = reducedMotion ? 1 : THREE.MathUtils.clamp((elapsed - this.decisionAppearedAt) / 0.42, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      for (const entry of this.decisionOptions) {
        const hovered = entry.id === this.hoveredDecisionId;
        const armed = entry.id === this.armedDecisionId;
        if (entry.intervention) faceCameraYaw(entry.group, this.stage.camera, reducedMotion ? 1 : delta);
        entry.group.position.y =
          entry.baseY +
          (armed ? 0.11 : hovered ? 0.08 : 0) +
          (reducedMotion ? 0 : Math.sin(elapsed * 2.2 + entry.index) * 0.012);
        entry.group.scale.setScalar(eased * (armed ? 1.11 : hovered ? 1.08 : 1));
      }
    }
    for (const entry of this.selectableInfluences) {
      const hovered = entry.influenceId === this.hoveredInfluenceId;
      entry.material.opacity = hovered
        ? 0.95
        : reducedMotion
          ? 0.48
          : 0.42 + Math.sin(elapsed * 3.2 + entry.card.position.x) * 0.12;
      entry.card.scale.setScalar(hovered ? 1.07 : 1);
    }
    for (const entry of this.exchangeCards) {
      const hovered = entry.id === this.hoveredExchangeId;
      entry.material.opacity = hovered
        ? 0.95
        : entry.selected
          ? 0.82
          : reducedMotion
            ? 0.48
            : 0.42 + Math.sin(elapsed * 3.2 + entry.card.position.x) * 0.12;
      const targetY = (entry.selected ? 0.16 : 0) + (hovered ? 0.07 : 0);
      const exchangeEase = reducedMotion ? 1 : 1 - Math.exp(-Math.max(delta, 1 / 120) * 12);
      entry.card.position.y += (targetY - entry.card.position.y) * exchangeEase;
      entry.card.scale.setScalar(hovered ? 1.07 : entry.selected ? 1.035 : 1);
    }
    for (let index = this.influenceReveals.length - 1; index >= 0; index -= 1) {
      const reveal = this.influenceReveals[index];
      const progress = reducedMotion ? 1 : THREE.MathUtils.clamp((elapsed - reveal.startedAt) / reveal.duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      reveal.card.rotation.x = (1 - eased) * Math.PI * 0.96;
      reveal.card.position.y = reveal.baseY + Math.sin(progress * Math.PI) * 0.32;
      const scale = 1 + Math.sin(progress * Math.PI) * 0.08;
      reveal.card.scale.setScalar(scale);
      if (progress === 1) {
        reveal.card.rotation.x = 0;
        reveal.card.position.y = reveal.baseY;
        reveal.card.scale.setScalar(1);
        this.influenceReveals.splice(index, 1);
      }
    }
    for (let transferIndex = this.coinTransfers.length - 1; transferIndex >= 0; transferIndex -= 1) {
      const transfer = this.coinTransfers[transferIndex];
      let complete = true;
      transfer.coins.forEach((coin, coinIndex) => {
        const progress = coinTransferProgress(elapsed, transfer.startedAt, coinIndex, {
          reducedMotion: transfer.reducedMotion,
        });
        const point = coinTransferPoint(transfer.from, transfer.to, progress, {
          index: coinIndex,
          reducedMotion: transfer.reducedMotion,
        });
        coin.position.set(point.x, point.y, point.z);
        coin.rotation.x += reducedMotion ? 0 : delta * (5.2 + coinIndex * 0.3);
        coin.rotation.z += reducedMotion ? 0 : delta * (7.1 + coinIndex * 0.24);
        if (progress < 1) complete = false;
      });
      if (complete) {
        disposeObject3D(transfer.group);
        this.coinTransfers.splice(transferIndex, 1);
      }
    }
    this.layoutCenterpiece();
    const centerEase = reducedMotion ? 1 : 1 - Math.exp(-Math.max(delta, 1 / 120) * 7);
    this.actionPresence += (this.actionPresenceTarget - this.actionPresence) * centerEase;
    if (Math.abs(this.actionPresenceTarget - this.actionPresence) < 0.005)
      this.actionPresence = this.actionPresenceTarget;
    if (this.actionCard.visible || this.actionPresenceTarget > 0) {
      this.actionCard.visible = true;
      this.actionCard.position.x += (this.actionTargetX - this.actionCard.position.x) * centerEase;
      this.actionCard.position.z += (this.actionTargetZ - this.actionCard.position.z) * centerEase;
      this.actionCard.position.y =
        2.35 + (1 - this.actionPresence) * 0.58 + (reducedMotion ? 0 : Math.sin(elapsed * 1.7) * 0.055);
      const pulseProgress = THREE.MathUtils.clamp((elapsed - this.centerpiecePulseAt) / 0.52, 0, 1);
      const pulse = reducedMotion ? 1 : 1 + Math.sin(pulseProgress * Math.PI) * 0.09;
      this.actionCard.scale.setScalar(Math.max(0.001, this.actionPresence * pulse));
      this.actionCard.rotation.z = reducedMotion ? 0 : (1 - this.actionPresence) * -0.16;
      faceCameraYaw(this.actionCard, this.stage.camera, reducedMotion ? 1 : delta);
      if (this.cameraName === 'card') this.refreshActionCardFocus();
      const centerpieceMoving =
        Math.abs(this.actionCard.position.x - this.actionTargetX) > 0.002 ||
        Math.abs(this.actionCard.position.z - this.actionTargetZ) > 0.002 ||
        Math.abs(this.actionPresence - this.actionPresenceTarget) > 0.005;
      if (this.cameraName === 'intervention' && centerpieceMoving) this.frameInterventionCamera();
    }
    if (this.publicRole) {
      this.publicRole.position.x += (this.publicRoleTargetX - this.publicRole.position.x) * centerEase;
      this.publicRole.position.z += (this.publicRoleTargetZ - this.publicRole.position.z) * centerEase;
      this.publicRole.position.y =
        1.26 + (1 - this.actionPresence) * 0.34 + (reducedMotion ? 0 : Math.sin(elapsed * 1.45 + 0.8) * 0.035);
      this.publicRole.scale.setScalar(Math.max(0.001, 0.84 * this.actionPresence));
      faceCameraYaw(this.publicRole, this.stage.camera, reducedMotion ? 1 : delta, 0.14);
    }
    if (this.actionPresence === 0 && this.actionPresenceTarget === 0) {
      this.actionCard.visible = false;
      this.setPublicRole(null);
    }
    if (this.winnerAvatar) {
      const winnerScale = reducedMotion ? 1 : this.winnerAvatar.scale.x + (1 - this.winnerAvatar.scale.x) * centerEase;
      this.winnerAvatar.scale.setScalar(winnerScale);
      this.winnerAvatar.position.y = reducedMotion
        ? 0.7
        : this.winnerAvatar.position.y +
          (0.7 + Math.sin(elapsed * 1.35) * 0.025 - this.winnerAvatar.position.y) * centerEase;
      // O nobre foi modelado olhando para -Z; cards/efígies usam +Z.
      faceCameraYaw(this.winnerAvatar, this.stage.camera, reducedMotion ? 1 : delta, Math.PI);
    }
    for (let index = this.emojiReactions.length - 1; index >= 0; index -= 1) {
      const reaction = this.emojiReactions[index];
      const progress = THREE.MathUtils.clamp((elapsed - reaction.startedAt) / reaction.duration, 0, 1);
      reaction.sprite.position.y = reaction.origin.y + progress * 0.72;
      reaction.sprite.material.opacity = 1 - Math.max(0, (progress - 0.68) / 0.32);
      const scale = 1 + Math.sin(progress * Math.PI) * 0.16;
      reaction.sprite.scale.set(1.25 * scale, 1.25 * scale, 1);
      if (progress >= 1) {
        disposeObject3D(reaction.sprite);
        this.emojiReactions.splice(index, 1);
      }
    }
    for (let index = this.flyingReactions.length - 1; index >= 0; index -= 1) {
      const reaction = this.flyingReactions[index];
      const progress = THREE.MathUtils.clamp((elapsed - reaction.startedAt) / reaction.duration, 0, 1);
      const inverse = 1 - progress;
      reaction.group.position
        .copy(reaction.start)
        .multiplyScalar(inverse * inverse)
        .addScaledVector(reaction.control, 2 * inverse * progress)
        .addScaledVector(reaction.end, progress * progress);
      reaction.group.rotation.x = reaction.spin.x * progress;
      reaction.group.rotation.y = reaction.spin.y * progress;
      reaction.group.rotation.z = reaction.spin.z * progress;
      if (reaction.spotlight) this.updateThrowCam(reaction, progress);
      if (progress >= 1) {
        if (reaction.spotlight) this.closeThrowCam();
        this.landReaction(reaction);
        disposeObject3D(reaction.group);
        this.flyingReactions.splice(index, 1);
      }
    }
    for (const [id, seat] of this.seats) {
      const state = this.view?.seats.find((candidate) => candidate.id === id);
      if (!state) continue;
      seat.body.visible = !state.isWinner && !(this.cameraName === 'pov' && this.currentPovSeatId === id);
      const emphasis = state.isActor || state.isCurrent || state.isWinner;
      const bodyY = reducedMotion
        ? 0
        : Math.sin(elapsed * (emphasis ? 2.1 : 1.1) + seat.seed) * (emphasis ? 0.045 : 0.018);
      const rotationX = state.eliminated ? -0.2 : 0;
      const rotationZ = reducedMotion ? 0 : Math.sin(elapsed * 0.75 + seat.seed) * 0.012;
      // Pose de repouso primeiro; o gesto entra somando por cima dela.
      seat.body.position.y = bodyY;
      seat.body.rotation.x = rotationX;
      seat.body.rotation.z = rotationZ;
      seat.body.scale.setScalar(1);
      // A face das figuras que reagem acompanha o beat ativo; sem gesto, volta
      // ao neutro. Só troca a textura, então é barato chamar todo quadro.
      seat.setExpression?.(expressionForGesture(seat.gesture));
      if (!seat.gesture) continue;
      if (reducedMotion || gestureProgress(seat.gesture, elapsed) >= 1) {
        seat.gesture = null;
        continue;
      }
      applyGesturePose(seat.sockets, gesturePose(COURT_GESTURES, seat.gesture, elapsed));
    }
  }

  dispose() {
    this.closeThrowCam();
    for (const seat of this.seats.values()) seat.dispose?.();
    for (const reaction of this.emojiReactions) disposeObject3D(reaction.sprite);
    for (const reaction of this.flyingReactions) disposeObject3D(reaction.group);
    for (const transfer of this.coinTransfers) disposeObject3D(transfer.group);
    this.emojiReactions = [];
    this.flyingReactions = [];
    this.coinTransfers = [];
    this.processedCoinMovements.clear();
    this.selectableInfluences = [];
    this.focusableInfluences = [];
    this.exchangeCards = [];
    this.actionTexture?.dispose();
    this.actionCaptionTexture?.dispose();
    this.stage.dispose();
  }
}
