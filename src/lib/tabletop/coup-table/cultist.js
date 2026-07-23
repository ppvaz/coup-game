// Cultista: acervo trazido do Sem Perdão (reus.ts) e adaptado à corte. Só a
// geometria atravessa — nada de crachá, juiz, animação própria ou texto de
// marca do outro jogo. O contrato de rig é o mesmo do nobre ({ group, body,
// focus, robe, sockets }): a mesa não sabe qual figura sentou, e a pose de
// repouso e os gestos da corte animam os dois pelo encaixe `body`.

import * as THREE from 'three';
import { COLORS, mesh, standardMaterial } from './primitives.js';
import { createCourtChair } from './figures.js';
import { CULTIST_EXPRESSIONS } from './cultist-expressions.js';

const INK = '#17161a';
const CORTE_FONT = "700 __PX__ 'Cinzel', 'Trajan Pro', Georgia, serif";
const cracheFont = (px) => CORTE_FONT.replace('__PX__', `${px}px`);

const CREME = '#f2efe9';
const ALTURA_ROSTO = 1.5;

// Encaixe do boneco do Sem Perdão no envelope sentado da corte: base na altura
// do assento e cabeça na mesma faixa do nobre. Aplicado num grupo interno para
// que a pose de repouso da mesa continue mexendo só em `body`.
const FIT = 0.88;
const LIFT = 0.55;

const ESCALA_CAPUZ = {
  classic: [1.08, 1.18, 0.98],
  spire: [1.01, 1.34, 0.95],
  shrouded: [1.15, 1.1, 0.99],
};

let tecidoCache = null;
/** Textura de tecido (compartilhada): dobras verticais + fibra, em cinza claro. */
function texTecido() {
  if (tecidoCache) return tecidoCache;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cfcfcf';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 14; i += 1) {
    const cx = (i / 14) * 128 + Math.random() * 6;
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 3 + Math.random() * 6;
    ctx.beginPath();
    ctx.moveTo(cx, -4);
    for (let yy = 0; yy <= 132; yy += 16) ctx.lineTo(cx + Math.sin(yy * 0.08 + i) * 5, yy);
    ctx.stroke();
  }
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(Math.floor(Math.random() * 128), Math.floor(Math.random() * 128), 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  tecidoCache = texture;
  return texture;
}

/** Meia abertura frontal do capuz por latitude: silhueta em ogiva, não recorte. */
function meiaAberturaOgiva(v, estilo) {
  const pontos = [
    [0, 0.015],
    [0.14, 0.025],
    [0.24, 0.13],
    [0.36, 0.48],
    [0.49, 0.67],
    [0.66, 0.61],
    [0.82, 0.36],
    [0.94, 0.04],
    [1, 0.015],
  ];
  let valor = pontos[pontos.length - 1][1];
  for (let i = 1; i < pontos.length; i += 1) {
    const anterior = pontos[i - 1];
    const atual = pontos[i];
    if (v <= atual[0]) {
      const k = THREE.MathUtils.smoothstep(v, anterior[0], atual[0]);
      valor = THREE.MathUtils.lerp(anterior[1], atual[1], k);
      break;
    }
  }
  if (estilo === 'spire') return valor * 0.9;
  if (estilo === 'shrouded') return valor * 1.24;
  return valor;
}

/** Casca esférica com recorte frontal variável, com UVs para o tecido. */
function criarCascaCapuz(estilo) {
  const raio = 0.42;
  const colunas = 24;
  const linhas = 18;
  const posicoes = [];
  const uvs = [];
  const indices = [];
  for (let y = 0; y <= linhas; y += 1) {
    const v = y / linhas;
    const theta = v * Math.PI;
    const abertura = meiaAberturaOgiva(v, estilo);
    const arcoTecido = Math.PI * 2 - abertura * 2;
    for (let x = 0; x <= colunas; x += 1) {
      const u = x / colunas;
      const phi = abertura + arcoTecido * u;
      const senTheta = Math.sin(theta);
      posicoes.push(raio * senTheta * Math.sin(phi), raio * Math.cos(theta), raio * senTheta * Math.cos(phi));
      uvs.push(u, 1 - v);
    }
  }
  for (let y = 0; y < linhas; y += 1) {
    for (let x = 0; x < colunas; x += 1) {
      const a = y * (colunas + 1) + x;
      const b = a + colunas + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posicoes, 3));
  geometria.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometria.setIndex(indices);
  geometria.computeVertexNormals();
  return geometria;
}

/** Aro acolchoado que acompanha as duas bordas do recorte em ogiva. */
function criarAroCapuz(estilo, material) {
  const raio = 0.42;
  const pontos = [];
  const pontoBorda = (v, lado) => {
    const theta = v * Math.PI;
    const phi = meiaAberturaOgiva(v, estilo) * lado;
    const senTheta = Math.sin(theta);
    return new THREE.Vector3(
      raio * senTheta * Math.sin(phi),
      raio * Math.cos(theta),
      raio * senTheta * Math.cos(phi) + 0.008,
    );
  };
  const amostras = 20;
  for (let i = 0; i <= amostras; i += 1) pontos.push(pontoBorda(THREE.MathUtils.lerp(0.105, 0.945, i / amostras), -1));
  for (let i = amostras; i >= 0; i -= 1) pontos.push(pontoBorda(THREE.MathUtils.lerp(0.105, 0.945, i / amostras), 1));
  const curva = new THREE.CatmullRomCurve3(pontos, true, 'centripetal');
  const aro = new THREE.Mesh(new THREE.TubeGeometry(curva, 52, 0.027, 7, true), material);
  aro.castShadow = true;
  return aro;
}

function texNearest(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** Carinha luminosa 64x48: olhos + boca por expressão e um sigilo por variante. */
function drawRosto(exp, cor, variante) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = cor;
  const olhos = (draw) => {
    draw(16);
    draw(48);
  };
  switch (exp) {
    case 'riso':
      olhos((cx) => {
        ctx.fillRect(cx - 6, 12, 4, 4);
        ctx.fillRect(cx - 2, 8, 4, 4);
        ctx.fillRect(cx + 2, 12, 4, 4);
      });
      ctx.fillRect(20, 30, 24, 8);
      ctx.fillRect(24, 38, 16, 4);
      break;
    case 'choque':
      olhos((cx) => ctx.fillRect(cx - 6, 4, 12, 16));
      ctx.fillRect(26, 30, 12, 14);
      break;
    case 'desprezo':
      olhos((cx) => ctx.fillRect(cx - 7, 10, 14, 4));
      ctx.fillRect(22, 38, 20, 4);
      ctx.fillRect(20, 36, 4, 4);
      ctx.fillRect(40, 36, 4, 4);
      break;
    case 'sono':
      olhos((cx) => ctx.fillRect(cx - 6, 16, 12, 3));
      ctx.fillRect(28, 34, 8, 6);
      break;
    default:
      olhos((cx) => ctx.fillRect(cx - 5, 8, 10, 10));
      ctx.fillRect(24, 34, 16, 4);
  }
  // Um sigilo pequeno distingue a variante de rosto sem atrapalhar as
  // expressões usadas durante a partida.
  if (variante === 'ember') {
    ctx.fillRect(30, 1, 4, 6);
    ctx.fillRect(27, 4, 10, 3);
  } else if (variante === 'grin' && exp !== 'riso') {
    ctx.fillRect(18, 29, 28, 4);
    ctx.fillRect(22, 33, 20, 4);
  } else if (variante === 'weeping') {
    ctx.fillRect(13, 20, 4, 9);
    ctx.fillRect(47, 20, 4, 13);
  }
  return texNearest(canvas);
}

/** Credencial do conselheiro: nome próprio sob a divisa "CONSELHEIRO". */
function drawCracha(nome) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  const gradiente = ctx.createLinearGradient(0, 0, 128, 80);
  gradiente.addColorStop(0, '#1a140d');
  gradiente.addColorStop(0.52, '#2f2415');
  gradiente.addColorStop(1, '#14100a');
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, 128, 80);
  // Ruído derivado do nome: cada conselheiro tem seu grão, estável entre renders.
  let semente = 2166136261;
  for (const ch of nome) semente = Math.imul(semente ^ ch.charCodeAt(0), 16777619);
  for (let i = 0; i < 80; i += 1) {
    semente = Math.imul(semente ^ (semente >>> 13), 1274126177);
    ctx.fillStyle = i % 3 === 0 ? 'rgba(217,181,107,.14)' : 'rgba(0,0,0,.2)';
    ctx.fillRect(Math.abs(semente) % 128, Math.abs(semente >>> 8) % 80, 1 + (i % 2), 1);
  }
  ctx.strokeStyle = '#b18442';
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, 122, 74);
  ctx.fillStyle = '#b18442';
  ctx.fillRect(7, 7, 114, 21);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = cracheFont(12);
  ctx.fillText('CONSELHEIRO', 64, 18);
  const nomeCurto = (nome || '').trim().toLocaleUpperCase('pt-BR').slice(0, 16) || 'SEM NOME';
  let linhas = [nomeCurto];
  if (nomeCurto.length > 9) {
    const meio = Math.floor(nomeCurto.length / 2);
    const espacos = [...nomeCurto.matchAll(/\s/g)].map((m) => m.index ?? meio);
    const corte = espacos.length
      ? espacos.reduce((melhor, atual) => (Math.abs(atual - meio) < Math.abs(melhor - meio) ? atual : melhor))
      : meio;
    linhas = [nomeCurto.slice(0, corte).trim(), nomeCurto.slice(corte).trim()].filter(Boolean);
  }
  ctx.fillStyle = '#f2efe9';
  ctx.font = cracheFont(linhas.length === 1 ? 22 : 16);
  if (linhas.length === 1) {
    ctx.fillText(linhas[0], 64, 49, 108);
  } else {
    ctx.fillText(linhas[0], 64, 43, 108);
    ctx.fillText(linhas[1], 64, 58, 108);
  }
  ctx.font = cracheFont(9);
  ctx.fillText('LA CORTE', 64, 68);
  return texNearest(canvas);
}

/**
 * Cultista sentado à mesa. Recebe cores já resolvidas (hex) e enums de forma —
 * a barreira entre dado e malha vive em character.js.
 */
export function createCultist({
  robe = 0x8f201b,
  accent = 0xd8ccb2,
  hood = 'classic',
  face = 'void',
  relic = 'none',
  name = '',
} = {}) {
  const group = new THREE.Group();
  group.add(createCourtChair(robe));

  const corTunica = new THREE.Color(robe);
  const corAcento = new THREE.Color(accent);
  const tecido = texTecido();
  const emissivoTunica = corTunica.clone().multiplyScalar(0.12);
  const matTunica = standardMaterial(robe, { map: tecido, roughness: 0.95, emissive: emissivoTunica });
  const matCorda = standardMaterial(accent, { metalness: 0.35, roughness: 0.5 });

  const body = new THREE.Group();
  body.name = 'cultist-body';
  const figura = new THREE.Group();
  figura.scale.setScalar(FIT);
  figura.position.y = LIFT;
  // O Reu olha para +Z; o cortesão da corte olha para -Z. Girar a figura meia
  // volta alinha o rosto com a mesa sem mexer no resto da cena.
  figura.rotation.y = Math.PI;
  body.add(figura);

  const perfil = [
    [0.02, 0.0],
    [0.85, 0.02],
    [0.82, 0.28],
    [0.76, 0.58],
    [0.68, 0.86],
    [0.58, 1.1],
    [0.46, 1.3],
    [0.34, 1.42],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const tunica = mesh(new THREE.LatheGeometry(perfil, 20), matTunica, { receive: false });
  figura.add(tunica);

  const corda = mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 20), matCorda, {
    position: [0, 0.66, 0],
    rotation: [Math.PI / 2, 0, 0],
    cast: false,
  });
  const pingente = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 8), matCorda, {
    position: [0.18, 0.5, 0.62],
    cast: false,
  });
  figura.add(corda, pingente);

  const perfilCowl = [
    [0.67, 0.0],
    [0.62, 0.12],
    [0.54, 0.24],
    [0.44, 0.34],
    [0.36, 0.4],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const cowl = mesh(new THREE.LatheGeometry(perfilCowl, 20), matTunica, { position: [0, 1.13, 0], receive: false });
  if (hood === 'shrouded') cowl.scale.set(1.12, 1.0, 1.02);
  if (hood === 'spire') cowl.scale.set(0.96, 1.04, 0.96);
  figura.add(cowl);

  const capuzGrp = new THREE.Group();
  const formaCapuz = new THREE.Group();
  const materialCapuz = standardMaterial(robe, {
    map: tecido,
    roughness: 0.95,
    emissive: emissivoTunica,
    side: THREE.DoubleSide,
  });
  formaCapuz.add(new THREE.Mesh(criarCascaCapuz(hood), materialCapuz));
  const corAro = corTunica.clone().lerp(corAcento, 0.16).multiplyScalar(1.08);
  const matAro = standardMaterial(corAro.getHex(), {
    map: tecido,
    roughness: 0.9,
    emissive: corAro.clone().multiplyScalar(0.08),
  });
  formaCapuz.add(criarAroCapuz(hood, matAro));
  formaCapuz.scale.set(...ESCALA_CAPUZ[hood]);
  formaCapuz.traverse((objeto) => {
    if (objeto.isMesh) objeto.castShadow = true;
  });

  const vazio = mesh(new THREE.SphereGeometry(0.37, 12, 10), new THREE.MeshBasicMaterial({ color: 0x0a090c }), {
    position: [0, 0, -0.015],
    cast: false,
    receive: false,
  });
  vazio.scale.set(1.04, hood === 'spire' ? 1.24 : 1.12, 0.94);
  capuzGrp.add(formaCapuz, vazio);

  const corRosto = face === 'ember' ? '#ff784f' : accent === 0x43d9d4 ? '#73fff7' : CREME;
  const rostoTex = {};
  const texturas = [];
  for (const exp of CULTIST_EXPRESSIONS) {
    rostoTex[exp] = drawRosto(exp, corRosto, face);
    texturas.push(rostoTex[exp]);
  }
  const rostoMat = new THREE.MeshBasicMaterial({ map: rostoTex.neutro, transparent: true, depthWrite: false });
  const rosto = mesh(new THREE.PlaneGeometry(0.44, 0.33), rostoMat, {
    position: [0, hood === 'spire' ? 0.09 : 0.07, hood === 'shrouded' ? 0.35 : 0.326],
    cast: false,
    receive: false,
  });
  capuzGrp.add(rosto);
  capuzGrp.position.y = ALTURA_ROSTO + 0.13;
  capuzGrp.rotation.x = 0.12;
  figura.add(capuzGrp);

  // Luvas em pose de repouso na beira da mesa — geometria fixa, sem a animação
  // de mãos do Sem Perdão.
  const matLuva = standardMaterial(0xe9e5db, { roughness: 0.85 });
  for (const lado of [-1, 1]) {
    const mao = new THREE.Group();
    const palma = mesh(new THREE.SphereGeometry(0.14, 12, 9), matLuva, { scale: [0.9, 0.65, 1.1] });
    const polegar = mesh(new THREE.SphereGeometry(0.06, 8, 6), matLuva, {
      position: [0.12 * lado, 0.03, 0.06],
      cast: false,
    });
    const punho = mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 12), matTunica, {
      position: [-0.02 * lado, 0.02, -0.15],
      rotation: [Math.PI / 2, 0, 0],
      cast: false,
    });
    mao.add(palma, polegar, punho);
    mao.position.set(0.52 * lado, 0.28, 0.88);
    figura.add(mao);
  }

  if (relic !== 'none') {
    const matAcessorio = standardMaterial(accent, {
      metalness: 0.3,
      roughness: 0.5,
      emissive: corAcento.clone().multiplyScalar(0.05),
    });
    if (relic === 'chain') {
      for (let i = 0; i < 7; i += 1) {
        const elo = mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 10), matAcessorio, {
          position: [-0.3 + i * 0.1, 0.88 - Math.abs(3 - i) * 0.018, 0.69],
          rotation: [0, i % 2 === 0 ? 0 : Math.PI / 2, i % 2 === 0 ? 0.2 : -0.2],
          cast: false,
        });
        figura.add(elo);
      }
    } else if (relic === 'candle') {
      figura.add(
        mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.23, 10), standardMaterial(0xd9cfb8, { roughness: 0.7 }), {
          position: [-0.43, 1.38, 0.39],
        }),
      );
      const chama = mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8d3b }), {
        position: [-0.43, 1.53, 0.39],
        cast: false,
        receive: false,
      });
      chama.scale.set(0.7, 1.4, 0.7);
      figura.add(chama);
    } else if (relic === 'relic') {
      const relicario = mesh(new THREE.OctahedronGeometry(0.09, 0), matAcessorio, {
        position: [-0.27, 0.78, 0.69],
        rotation: [0, 0, 0.24],
      });
      relicario.scale.set(0.8, 1.2, 0.35);
      figura.add(relicario);
    }
  }

  // Crachá do conselheiro pendurado no peito, com cordão em V. Vira para a mesa
  // junto com a figura (o giro de meia-volta leva o +Z para o lado do tampo).
  const crachaTex = drawCracha(name);
  texturas.push(crachaTex);
  const crachaGrp = new THREE.Group();
  const matMetal = standardMaterial(corAcento.clone().lerp(new THREE.Color(0x392b1c), 0.34).getHex(), {
    metalness: 0.3,
    roughness: 0.6,
    emissive: corAcento.clone().multiplyScalar(0.035),
  });
  crachaGrp.add(mesh(new THREE.BoxGeometry(0.6, 0.39, 0.038), matMetal, { cast: false }));
  crachaGrp.add(
    mesh(new THREE.PlaneGeometry(0.56, 0.35), new THREE.MeshBasicMaterial({ map: crachaTex }), {
      position: [0, 0, 0.021],
      cast: false,
      receive: false,
    }),
  );
  for (const lado of [-1, 1]) {
    crachaGrp.add(
      mesh(new THREE.TorusGeometry(0.034, 0.009, 6, 12), matCorda, {
        position: [0.19 * lado, 0.16, 0.031],
        cast: false,
      }),
    );
  }
  crachaGrp.position.set(0.1, 1.0, 0.735);
  crachaGrp.rotation.set(-0.17, 0, -0.065);
  const cordao = (pontos) =>
    new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pontos), 8, 0.012, 5, false), matCorda);
  figura.add(
    crachaGrp,
    cordao([
      new THREE.Vector3(-0.21, 1.42, 0.38),
      new THREE.Vector3(-0.16, 1.27, 0.55),
      new THREE.Vector3(-0.09, 1.17, 0.71),
    ]),
    cordao([
      new THREE.Vector3(0.21, 1.42, 0.38),
      new THREE.Vector3(0.25, 1.28, 0.54),
      new THREE.Vector3(0.29, 1.17, 0.71),
    ]),
  );

  group.add(body);

  const focus = mesh(
    new THREE.RingGeometry(0.82, 1.02, 28),
    new THREE.MeshBasicMaterial({
      color: COLORS.gold,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    { position: [0, 0.035, 0], rotation: [-Math.PI / 2, 0, 0], cast: false, receive: false },
  );
  focus.visible = false;
  group.add(focus);

  const rig = {
    group,
    body,
    focus,
    robe: matTunica,
    sockets: Object.freeze({ body }),
    expression: 'neutro',
    // A face reage aos beats: a cena chama setExpression a partir do gesto ativo
    // (expressionForGesture). Trocar o mapa da textura basta — sem reconstruir a
    // malha nem tocar o resto do rig.
    setExpression(exp) {
      const tex = rostoTex[exp] ?? rostoTex.neutro;
      if (rostoMat.map === tex) return;
      rostoMat.map = tex;
      rostoMat.needsUpdate = true;
      rig.expression = tex === rostoTex.neutro ? 'neutro' : exp;
    },
    // As texturas de rosto/crachá não vão presas a materiais vivos da cena, então
    // o descarte de malha não as alcança: a figura limpa o que pintou.
    dispose() {
      for (const tex of texturas) tex.dispose();
    },
  };
  return rig;
}
