import * as THREE from 'three';

export const COLORS = {
  ink: 0x080706,
  wood: 0x24130d,
  woodLight: 0x4b2c1d,
  velvet: 0x401617,
  velvetDark: 0x19090a,
  gold: 0xd9b56b,
  ivory: 0xeee6d6,
  bronze: 0x765329,
  danger: 0xb63a3c,
};

export function standardMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.08, ...options });
}

export function mesh(geometry, material, { position, rotation, scale, cast = true, receive = true } = {}) {
  const value = new THREE.Mesh(geometry, material);
  if (position) value.position.set(...position);
  if (rotation) value.rotation.set(...rotation);
  if (scale) value.scale.set(...scale);
  value.castShadow = cast;
  value.receiveShadow = receive;
  return value;
}
