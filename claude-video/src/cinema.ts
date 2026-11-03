import * as THREE from 'three';

interface CamKey {
  t: number;
  az: number;
  el: number;
  dist: number;
  ty: number;
  fov: number;
}

/**
 * Camera choreography for the 40-second sky-island film.
 *
 * 0–12s   push in from the cloud sea toward the island
 * 12–26s  orbit to the left, dropping low to show the waterfalls and keel
 * 26–40s  crane up and pull back; the whale and distant islands are revealed
 */
const KEYS: CamKey[] = [
  { t: 0, az: 0.58, el: 0.33, dist: 650, ty: -30, fov: 30 },
  { t: 12, az: 0.34, el: 0.24, dist: 410, ty: -45, fov: 30 },
  { t: 26, az: -0.82, el: 0.16, dist: 335, ty: -56, fov: 30 },
  { t: 40, az: 0.24, el: 0.3, dist: 560, ty: -34, fov: 32 },
];

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function createCinemaCamera() {
  const target = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function paramsAt(t: number) {
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const k = smooth(clamp01((t - a.t) / (b.t - a.t)));
    const az = lerp(a.az, b.az, k) + Math.sin(t * 0.23) * 0.006;
    const el = lerp(a.el, b.el, k) + Math.sin(t * 0.17 + 1.1) * 0.004;
    return {
      az,
      el,
      dist: lerp(a.dist, b.dist, k),
      ty: lerp(a.ty, b.ty, k),
      fov: lerp(a.fov, b.fov, k),
    };
  }

  return {
    duration: 40,
    apply(camera: THREE.PerspectiveCamera, t: number) {
      const p = paramsAt(t);
      target.set(0, p.ty, 0);
      dir.set(
        Math.sin(p.az) * Math.cos(p.el),
        Math.sin(p.el),
        Math.cos(p.az) * Math.cos(p.el),
      );
      camera.position.copy(target).addScaledVector(dir, p.dist);
      camera.lookAt(target);
      if (Math.abs(camera.fov - p.fov) > 1e-4) {
        camera.fov = p.fov;
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();
    },
  };
}
