import * as THREE from 'three';
import { Engine, sunDirection } from './core/engine';
import { IslandTerrain } from './world/terrain';
import { buildIsland } from './world/island';
import { createSky, createLighting } from './world/sky';
import { createCloudSea, createCloudBanks } from './world/clouds';
import { createTrees } from './world/trees';
import { createRuins } from './world/ruins';
import { createWater } from './world/water';
import { createDistantWorld } from './world/distant';
import { createDebris, createCrystals } from './world/debris';
import { createWhale } from './world/whale';
import { createRain } from './world/rain';
import { createCinemaCamera } from './cinema';
import { clamp, damp, mulberry32 } from './core/math';
(window as any).__sunDir = sunDirection;

const engine = new Engine();
// query flags are read first: the world builders below consult them
const qs = new URLSearchParams(location.search);

// ---------------------------------------------------------------- world
const terrain = new IslandTerrain();
const island = buildIsland(terrain);
if (!qs.has('noisland')) engine.scene.add(island.mesh);

const sky = createSky(engine.renderer);
engine.scene.add(sky.mesh);

const lighting = createLighting(engine.scene, sky.envMap);

const trees = createTrees(terrain);
if (!qs.has('notrees')) engine.scene.add(trees.mesh);

const ruins = createRuins(terrain);
if (!qs.has('noruins')) engine.scene.add(ruins.group);

const water = createWater(terrain);
if (!qs.has('nowater')) engine.scene.add(water.group);

const distant = createDistantWorld();
if (!qs.has('nodistant')) engine.scene.add(distant.group);

const debris = createDebris(terrain);
if (!qs.has('nodebris')) engine.scene.add(debris.group);

const crystals = createCrystals(terrain, island.mesh);
if (!qs.has('nocrystals')) engine.scene.add(crystals.group);

const whale = createWhale();
if (!qs.has('nowhale')) engine.scene.add(whale.group);

const cloudSea = createCloudSea();
if (!qs.has('noclouds')) engine.scene.add(cloudSea.mesh);
const cloudBanks = createCloudBanks();
if (!qs.has('nobanks')) engine.scene.add(cloudBanks.mesh);

const rain = createRain();
if (!qs.has('norain')) engine.scene.add(rain.mesh);

// lightning schedule: sparse double-flicker strikes far off in the storm.
// Seeded so screenshot comparisons hit the same flash timing.
const strikes: number[] = [];
{
  const rand = mulberry32(20261021);
  let t = 6 + rand() * 5;
  while (t < 3600) {
    strikes.push(t);
    t += 9 + rand() * 9;
  }
}
function lightning(t: number) {
  let f = 0;
  for (const s of strikes) {
    const d = t - s;
    if (d > 0.8) continue;
    if (d < -0.1) break;
    if (d >= 0) {
      f += Math.exp(-((d / 0.055) ** 2)) * 0.9;
      f += Math.exp(-(((d - 0.22) / 0.07) ** 2)) * 0.55;
    }
  }
  return Math.min(f, 1.2);
}

// ---------------------------------------------------------------- camera rig
const rig = {
  target: new THREE.Vector3(0, -45, 0),
  azimuth: 0.34,
  elevation: 0.24,
  distance: 410,
  // damped current values
  cAz: 0.34,
  cEl: 0.24,
  cDist: 410,
  cTarget: new THREE.Vector3(0, -45, 0),
};

// optional URL overrides, handy for look-dev screenshots
if (qs.has('az')) rig.azimuth = rig.cAz = parseFloat(qs.get('az')!);
if (qs.has('el')) rig.elevation = rig.cEl = parseFloat(qs.get('el')!);
if (qs.has('dist')) rig.distance = rig.cDist = parseFloat(qs.get('dist')!);
if (qs.has('ty')) rig.target.y = rig.cTarget.y = parseFloat(qs.get('ty')!);
if (qs.has('fov')) { engine.camera.fov = parseFloat(qs.get('fov')!); engine.camera.updateProjectionMatrix(); }

const limits = {
  az: [-1.15, 1.15],
  el: [0.015, 0.34],
  dist: [300, 620],
};

function applyCamera() {
  const az = rig.cAz;
  const el = rig.cEl;
  const d = rig.cDist;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  engine.camera.position.copy(rig.cTarget).addScaledVector(dir, d);
  engine.camera.lookAt(rig.cTarget);
  engine.camera.updateMatrixWorld();
  let dbg = document.getElementById('dbg');
  if (qs.has('debug') && !dbg) {
    dbg = document.createElement('div');
    dbg.id = 'dbg';
    dbg.style.cssText = 'position:fixed;left:12px;top:12px;z-index:99;font:12px monospace;color:#fff;background:rgba(0,0,0,.6);padding:6px;white-space:pre';
    document.body.appendChild(dbg);
  }
  if (dbg && qs.has('debug')) {
    const cp = engine.camera.position;
    island.geometry.computeBoundingBox();
    const bb = island.geometry.boundingBox!;
    dbg.textContent =
      `cam ${cp.x.toFixed(0)},${cp.y.toFixed(0)},${cp.z.toFixed(0)}\n` +
      `bbox y ${bb.min.y.toFixed(1)}..${bb.max.y.toFixed(1)}  x ${bb.min.x.toFixed(0)}..${bb.max.x.toFixed(0)}\n` +
      `sun ${(window as any).__sunDir?.toArray().map((n: number) => n.toFixed(3)).join(',')}\n` +
      `dbgmark ${sky.material.fragmentShader.includes('DEBUG')}`;
  }
}

let dragging = false;
let lastX = 0;
let lastY = 0;
const canvas = engine.renderer.domElement;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  rig.azimuth = clamp(rig.azimuth - dx * 0.0034, limits.az[0], limits.az[1]);
  rig.elevation = clamp(rig.elevation + dy * 0.0022, limits.el[0], limits.el[1]);
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    rig.distance = clamp(rig.distance * (1 + e.deltaY * 0.0009), limits.dist[0], limits.dist[1]);
  },
  { passive: false },
);
canvas.addEventListener('dblclick', () => {
  rig.azimuth = 0.34;
  rig.elevation = 0.24;
  rig.distance = 410;
});

function updateWorld(t: number) {
  sky.material.uniforms.uTime.value = t;
  cloudSea.uniforms.uTime.value = t;
  cloudBanks.uniforms.uTime.value = t;
  water.updater(t);
  debris.updater(t);
  rain.updater(t);
  whale.updater(t);

  const flash = qs.has('noflash') ? 0 : lightning(t);
  sky.material.uniforms.uFlash.value = flash;
  cloudSea.uniforms.uFlash.value = flash;
  cloudBanks.uniforms.uFlash.value = flash;
  lighting.hemi.intensity = 1.5 + flash * 1.7;
  lighting.fill.intensity = 1.35 + flash * 0.5;
  lighting.sun.intensity = 2.0 + flash * 1.0;
  ruins.runeMat.emissiveIntensity = 1.35 + Math.sin(t * 1.6) * 0.25;
}

engine.updaters.push((t, dt) => {
  rig.cAz = damp(rig.cAz, rig.azimuth, 6, dt);
  rig.cEl = damp(rig.cEl, rig.elevation, 6, dt);
  rig.cDist = damp(rig.cDist, rig.distance, 6, dt);
  applyCamera();
  updateWorld(t);
});

// ---------------------------------------------------------------- cinematic mode
// `?cine=1` freezes the interactive loop and exposes window.__cine.renderAt(t)
// so a headless browser can render exactly one deterministic frame at a time.
if (qs.has('cine')) {
  document.getElementById('hint')?.remove();
  document.getElementById('stats')?.remove();
  document.getElementById('veil')?.remove();
  const cinema = createCinemaCamera();
  engine.renderer.setPixelRatio(1);
  (window as any).__cine = {
    duration: cinema.duration,
    renderAt(sec: number) {
      const t = Math.max(0, Math.min(cinema.duration, sec));
      cinema.apply(engine.camera, t);
      updateWorld(t);
      engine.composer.render(0);
    },
  };
  (window as any).__cineReady = true;
} else {
  applyCamera();
  engine.start();

  // fade the loading veil once the first frames are on screen. The headless
  // screenshot harness can't run CSS transitions, so it drops the veil outright.
  if (qs.has('noveil')) {
    document.getElementById('veil')?.remove();
  } else {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.getElementById('veil')?.classList.add('done');
      }),
    );
  }
}

// expose for the screenshot harness / debugging
(window as any).__world = { engine, rig, terrain, island, sky, lighting };
