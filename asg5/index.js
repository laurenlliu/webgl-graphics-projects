// index.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

RectAreaLightUniformsLib.init();

// ─── RENDERER ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// ─── SCENE & CAMERA ──────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 20, 55);

// ─── ORBIT CONTROLS ──────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 5;
controls.maxDistance = 250;
controls.target.set(0, 5, 0);

// WASD fly
const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup',   e => keys[e.code] = false);

// ─── PROCEDURAL TEXTURES ─────────────────────────────────────────────────────
function makeCanvasTex(fn, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  return new THREE.CanvasTexture(c);
}

// Stone
const stoneTex = makeCanvasTex((ctx, w, h) => {
  ctx.fillStyle = '#6e7080';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = Math.random() * 4 + 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    const v = 40 + Math.random() * 60 | 0;
    ctx.fillStyle = `rgba(${v},${v},${v+10},0.55)`;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(30,30,40,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(0, i*(h/8)); ctx.lineTo(w, i*(h/8)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i*(w/8), 0); ctx.lineTo(i*(w/8), h); ctx.stroke();
  }
});
stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;

// Grass
const grassTex = makeCanvasTex((ctx, w, h) => {
  ctx.fillStyle = '#4a9e4a';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    ctx.strokeStyle = `hsl(${105 + Math.random()*30}, 65%, ${30 + Math.random()*20}%)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.random() * 4 - 2, y - Math.random() * 8);
    ctx.stroke();
  }
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(4, 4);

// Wood
const woodTex = makeCanvasTex((ctx, w, h) => {
  for (let y = 0; y < h; y++) {
    const v = Math.sin(y * 0.25) * 18;
    ctx.fillStyle = `rgb(${130 + v | 0},${75 + v | 0},${35 + v | 0})`;
    ctx.fillRect(0, y, w, 1);
  }
  for (let i = 0; i < 15; i++) {
    ctx.fillStyle = 'rgba(60,30,5,0.25)';
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 2 + 1, Math.random() * 35 + 8);
  }
});

// Brick
const brickTex = makeCanvasTex((ctx, w, h) => {
  ctx.fillStyle = '#7a2a1a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c8b89a';
  for (let row = 0; row < 8; row++) {
    const bh = h / 8;
    const offset = row % 2 === 0 ? 0 : w / 8;
    for (let col = 0; col < 9; col++) {
      ctx.fillRect(offset + col * (w / 4) + 2, row * bh + 2, w / 4 - 4, bh - 4);
    }
  }
});
brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
brickTex.repeat.set(2, 2);

// Metal
const metalTex = makeCanvasTex((ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#a0b0ba'); g.addColorStop(0.5, '#dde5ea'); g.addColorStop(1, '#7888a0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 25; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, Math.random() * h); ctx.lineTo(w, Math.random() * h); ctx.stroke();
  }
});

// Lava
const lavaTex = makeCanvasTex((ctx, w, h) => {
  ctx.fillStyle = '#1a0000'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) {
    const g = ctx.createLinearGradient(Math.random()*w, Math.random()*h, Math.random()*w, Math.random()*h);
    g.addColorStop(0, 'rgba(255,80,0,0.0)');
    g.addColorStop(0.5, 'rgba(255,180,0,0.9)');
    g.addColorStop(1, 'rgba(255,80,0,0.0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.moveTo(Math.random()*w, Math.random()*h);
    ctx.bezierCurveTo(Math.random()*w,Math.random()*h,Math.random()*w,Math.random()*h,Math.random()*w,Math.random()*h);
    ctx.stroke();
  }
  const rad = ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w*0.6);
  rad.addColorStop(0,'rgba(255,120,0,0.5)');
  rad.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = rad; ctx.fillRect(0,0,w,h);
});

// Cloud
const cloudTex = makeCanvasTex((ctx, w, h) => {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);
  for (let i = 0; i < 30; i++) {
    const r = ctx.createRadialGradient(Math.random()*w,Math.random()*h,0,Math.random()*w,Math.random()*h,30+Math.random()*30);
    r.addColorStop(0,'rgba(255,255,255,1)');
    r.addColorStop(1,'rgba(230,240,255,0.0)');
    ctx.fillStyle = r; ctx.fillRect(0,0,w,h);
  }
});

// Dirt
const dirtTex = makeCanvasTex((ctx, w, h) => {
  ctx.fillStyle = '#5a4030'; ctx.fillRect(0,0,w,h);
  for (let i = 0; i < 600; i++) {
    const x=Math.random()*w, y=Math.random()*h;
    const v = 60+Math.random()*40|0;
    ctx.fillStyle = `rgba(${v+20},${v},${v-10},0.5)`;
    ctx.beginPath(); ctx.arc(x,y,Math.random()*3+1,0,Math.PI*2); ctx.fill();
  }
});
dirtTex.wrapS = dirtTex.wrapT = THREE.RepeatWrapping;
dirtTex.repeat.set(20, 20);

// ─── SKYBOX ───────────────────────────────────────────────────────────────────
const skyGeo = new THREE.SphereGeometry(900, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    sunColor:  { value: new THREE.Color(0xffd080) },
    sunDir:    { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
    dayFactor: { value: 1.0 }
  },
  vertexShader: `
    varying vec3 vWorldPos;
    void main() {
      vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`,
  fragmentShader: `
    uniform vec3 sunColor, sunDir;
    uniform float dayFactor;
    varying vec3 vWorldPos;
    void main() {
      vec3 dir = normalize(vWorldPos);
      float h = dir.y * 0.5 + 0.5;
      vec3 daySkyTop    = vec3(0.18, 0.48, 0.90);
      vec3 daySkyBottom = vec3(0.68, 0.88, 1.00);
      vec3 daySky = mix(daySkyBottom, daySkyTop, h);
      vec3 nightSky = mix(vec3(0.01,0.01,0.08), vec3(0.0,0.0,0.03), h);
      vec3 sky = mix(nightSky, daySky, dayFactor);
      float horizon = exp(-abs(dir.y) * 4.0);
      sky += vec3(0.9,0.5,0.2) * horizon * dayFactor * 0.4;
      float sun = pow(max(dot(dir, sunDir), 0.0), 200.0);
      float sunGlow = pow(max(dot(dir, sunDir), 0.0), 12.0);
      sky += sunColor * sun * dayFactor;
      sky += sunColor * sunGlow * 0.15 * dayFactor;
      float starSeed = fract(sin(dot(dir*600.0, vec3(12.9898,78.233,45.543)))*43758.5);
      float star = step(0.997, starSeed) * (1.0 - dayFactor);
      sky += vec3(star);
      vec3 moonDir = -sunDir;
      float moon = pow(max(dot(dir, moonDir),0.0), 600.0);
      sky += vec3(0.9,0.9,1.0) * moon * (1.0-dayFactor);
      gl_FragColor = vec4(sky, 1.0);
    }`
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// ─── LIGHTS ──────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x445566, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff0cc, 2.2);
sunLight.position.set(60, 90, 40);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 300;
sunLight.shadow.camera.left = -80;
sunLight.shadow.camera.right = 80;
sunLight.shadow.camera.top = 80;
sunLight.shadow.camera.bottom = -80;
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0x88aaff, 0x553311, 0.6);
scene.add(hemiLight);

const crystalPointLight = new THREE.PointLight(0x00ffcc, 4, 25);
crystalPointLight.position.set(0, 8, 0);
crystalPointLight.castShadow = true;
scene.add(crystalPointLight);

const spotLight = new THREE.SpotLight(0xff8800, 10, 70, Math.PI / 10, 0.5);
spotLight.position.set(-25, 35, -10);
spotLight.target.position.set(0, 0, 0);
spotLight.castShadow = true;
scene.add(spotLight);
scene.add(spotLight.target);

const rectLight = new THREE.RectAreaLight(0x6644ff, 8, 8, 10);
rectLight.position.set(18, 5, -15);
rectLight.lookAt(0, 5, 0);
scene.add(rectLight);

// ─── MATERIALS ───────────────────────────────────────────────────────────────
const stoneMat   = new THREE.MeshStandardMaterial({ map: stoneTex,  roughness: 0.92, metalness: 0.05 });
const grassMat   = new THREE.MeshStandardMaterial({ map: grassTex,  roughness: 1.00, metalness: 0.00 });
const woodMat    = new THREE.MeshStandardMaterial({ map: woodTex,   roughness: 0.85, metalness: 0.00 });
const brickMat   = new THREE.MeshStandardMaterial({ map: brickTex,  roughness: 0.88, metalness: 0.00 });
const metalMat   = new THREE.MeshStandardMaterial({ map: metalTex,  roughness: 0.25, metalness: 0.85 });
const lavaMat    = new THREE.MeshStandardMaterial({ map: lavaTex,   roughness: 0.6,  metalness: 0.0,
                     emissive: new THREE.Color(0xff4400), emissiveIntensity: 1.2 });
const crystalMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, roughness: 0.0, metalness: 0.1,
                     transparent: true, opacity: 0.72,
                     emissive: new THREE.Color(0x00ffcc), emissiveIntensity: 0.5 });
const glowMat    = new THREE.MeshStandardMaterial({ color: 0xff7700,
                     emissive: new THREE.Color(0xff5500), emissiveIntensity: 1.0 });
const cloudMat   = new THREE.MeshStandardMaterial({
                     color: 0xffffff, roughness: 1.0,
                     transparent: true, opacity: 0.90,
                     emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.15 });
const goldMat    = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.25, metalness: 0.95 });
const purpleMat  = new THREE.MeshStandardMaterial({ color: 0x7722ff, roughness: 0.4, metalness: 0.4,
                     emissive: new THREE.Color(0x330088), emissiveIntensity: 0.5 });
const dirtMat    = new THREE.MeshStandardMaterial({ map: dirtTex,  roughness: 1.0, metalness: 0.0 });

// ─── HELPER ──────────────────────────────────────────────────────────────────
function addMesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

// ─── MAIN ISLAND ─────────────────────────────────────────────────────────────
addMesh(new THREE.CylinderGeometry(18, 13, 4, 32), grassMat, 0, 0, 0);
addMesh(new THREE.SphereGeometry(14, 32, 16, 0, Math.PI*2, 0, Math.PI/2), stoneMat, 0, -2, 0);

// ─── RUINS ON ISLAND ─────────────────────────────────────────────────────────
const pillarAngles = [0, Math.PI/2, Math.PI, Math.PI*3/2];
pillarAngles.forEach(angle => {
  const px = Math.cos(angle) * 10;
  const pz = Math.sin(angle) * 10;
  addMesh(new THREE.CylinderGeometry(0.7, 0.95, 9, 12), stoneMat, px, 4.5, pz);
  addMesh(new THREE.BoxGeometry(2.2, 0.7, 2.2), stoneMat, px, 9.2, pz);
});

addMesh(new THREE.BoxGeometry(5, 1.4, 5), stoneMat, 0, 2.7, 0);
const crystal = addMesh(new THREE.OctahedronGeometry(1.6, 0), crystalMat, 0, 5.2, 0);

addMesh(new THREE.BoxGeometry(0.85, 5, 5.5), brickMat,  8,  4.5, -5,  0, 0.1, 0);
addMesh(new THREE.BoxGeometry(0.85, 3,   4), brickMat,  8,  3.5,  2);
addMesh(new THREE.BoxGeometry(0.85, 6, 4.5), brickMat, -9,  5,    4,  0,-0.15,0);

addMesh(new THREE.BoxGeometry(1, 5.5, 1), stoneMat, -5,  4.75, -11);
addMesh(new THREE.BoxGeometry(1, 5.5, 1), stoneMat, -2,  4.75, -11);
addMesh(new THREE.BoxGeometry(4.2, 0.9, 1), stoneMat, -3.5, 7.7, -11);

addMesh(new THREE.SphereGeometry(1.5, 16, 16), stoneMat, -12, 2.5,  4);
addMesh(new THREE.SphereGeometry(1.0, 16, 16), stoneMat, -14, 2.0,  5.5);
addMesh(new THREE.SphereGeometry(0.65,16, 16), stoneMat, -11, 1.8,  6.3);

addMesh(new THREE.BoxGeometry(2,  1.2, 1.2), woodMat,   5,  2.6, 6);
addMesh(new THREE.BoxGeometry(2,  0.6, 1.2), woodMat,   5,  3.5, 5.7, 0.28, 0, 0);
addMesh(new THREE.BoxGeometry(2.1,0.12,1.3), metalMat,  5,  2.1, 6);
addMesh(new THREE.BoxGeometry(2.1,0.12,1.3), metalMat,  5,  3.1, 6);

const torchLights = [];
[[10,0,10],[-10,0,10],[10,0,-10]].forEach(([tx,_,tz]) => {
  addMesh(new THREE.CylinderGeometry(0.12, 0.17, 3.2, 8), woodMat,  tx, 3.6, tz);
  addMesh(new THREE.SphereGeometry(0.28, 8, 8), glowMat,            tx, 5.4, tz);
  const pl = new THREE.PointLight(0xff7700, 2.0, 12);
  pl.position.set(tx, 5.4, tz);
  scene.add(pl);
  torchLights.push(pl);
});

addMesh(new THREE.CylinderGeometry(3, 3.2, 5, 10), stoneMat, -6,  4.5, -7);
addMesh(new THREE.ConeGeometry(3.4, 4, 10), brickMat,          -6,  9.0, -7);
addMesh(new THREE.TorusGeometry(3.6, 0.45, 14, 48), purpleMat, 18, 5, -15, Math.PI/2, 0, 0);

// ─── PHOENIX BEAMS (shooting up from the 4 pillar tops) ──────────────────────
const beamMat = new THREE.MeshStandardMaterial({
  color: 0x00ccff,
  emissive: new THREE.Color(0x00aaff), emissiveIntensity: 1.2,
  transparent: true, opacity: 0.45, side: THREE.DoubleSide
});
const beams = [];
pillarAngles.forEach(angle => {
  const px = Math.cos(angle) * 10;
  const pz = Math.sin(angle) * 10;
  const b = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.4, 18, 10, 1, true),
    beamMat.clone()
  );
  b.position.set(px, 18, pz); // start at pillar top, shoot upward
  scene.add(b);
  beams.push({ mesh: b, phase: Math.random() * Math.PI * 2 });
});

// ─── FLOATING ROCKS ──────────────────────────────────────────────────────────
const floatingRocks = [];
for (let i = 0; i < 10; i++) {
  const angle = (i / 10) * Math.PI * 2;
  const r   = 22 + Math.random() * 10;
  const px  = Math.cos(angle) * r;
  const pz  = Math.sin(angle) * r;
  const py  = -3 + Math.random() * 14;
  const s   = 0.8 + Math.random() * 1.8;
  const rock = addMesh(
    new THREE.DodecahedronGeometry(s, 0), stoneMat,
    px, py, pz,
    Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI
  );
  floatingRocks.push({ mesh: rock, baseY: py, speed: 0.3 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2 });
}

// ─── LAVA PLANET – orbits the main island ────────────────────────────────────
const lavaCore = addMesh(new THREE.SphereGeometry(4, 32, 32), lavaMat, 28, 4, 0);
const lavaLight = new THREE.PointLight(0xff4400, 4, 35);
scene.add(lavaLight);
const lavaOrbitRadius = 28;
const lavaOrbitSpeed  = 0.3;
const lavaOrbitHeight = 18;

// ─── ISLAND 2 ─────────────────────────────────────────────────────────────────
addMesh(new THREE.CylinderGeometry(7, 5.5, 2.5, 24), grassMat, -35, 5, 10);
addMesh(new THREE.SphereGeometry(5.5, 24, 12, 0, Math.PI*2, 0, Math.PI/2), stoneMat, -35, 4, 10);
addMesh(new THREE.BoxGeometry(5, 7, 5), brickMat,    -35, 9.5, 10);
addMesh(new THREE.ConeGeometry(3.8, 3.5, 4), stoneMat, -35, 14.25, 10, 0, Math.PI/4, 0);
addMesh(new THREE.SphereGeometry(1.0, 16, 16), goldMat, -35, 16, 10);
addMesh(new THREE.BoxGeometry(3, 0.4, 1), stoneMat, -35, 6.2, 14.5);
addMesh(new THREE.BoxGeometry(3, 0.4, 1), stoneMat, -35, 6.6, 13.5);
addMesh(new THREE.BoxGeometry(3, 0.4, 1), stoneMat, -35, 7.0, 12.5);

// ─── ISLAND 3 ─────────────────────────────────────────────────────────────────
addMesh(new THREE.CylinderGeometry(6, 4.5, 2, 20), grassMat, 32, -2, 22);
addMesh(new THREE.SphereGeometry(4.5, 20, 10, 0, Math.PI*2, 0, Math.PI/2), stoneMat, 32, -3, 22);
addMesh(new THREE.CylinderGeometry(0.3, 0.9, 10, 6), stoneMat, 32,  4, 22);
addMesh(new THREE.ConeGeometry(0.9, 2.5, 6), goldMat, 32, 10, 22);
for (let i = 0; i < 6; i++) {
  const a = (i/6)*Math.PI*2;
  addMesh(new THREE.CylinderGeometry(0.35,0.45,2.5,8), stoneMat,
    32 + Math.cos(a)*3.5, -0.25, 22 + Math.sin(a)*3.5);
}

// ─── CLOUDS ──────────────────────────────────────────────────────────────────
[[10,38,-20],[-30,42,8],[18,40,32],[-12,35,42],[0,45,-40]].forEach(([cx,cy,cz]) => {
  for (let j = 0; j < 4; j++) {
    addMesh(
      new THREE.SphereGeometry(3.5 + Math.random() * 2, 12, 12),
      cloudMat,
      cx + j * 5 - 4, cy + Math.random() * 2, cz + Math.random() * 3,
      0, 0, 0, 1, 0.42, 1
    );
  }
});

// ─── FIREFLIES ───────────────────────────────────────────────────────────────
const fireflies = [];
const fireflyMat = new THREE.MeshStandardMaterial({
  color: 0xffff44, emissive: new THREE.Color(0xffff00), emissiveIntensity: 1.5
});
for (let i = 0; i < 18; i++) {
  const ff = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), fireflyMat);
  ff.position.set(Math.random() * 36 - 18, Math.random() * 14 + 2, Math.random() * 36 - 18);
  scene.add(ff);
  fireflies.push({ mesh: ff, phase: Math.random() * Math.PI * 2, speed: 0.25 + Math.random() * 0.45 });
}

// ─── GLTF MODELS ─────────────────────────────────────────────────────────────
const animMixers = [];
let phoenixModel = null;
let ufoModel = null;
const loader = new GLTFLoader();

loader.load(
  './Phoenix.glb',
  (gltf) => {
    const model = gltf.scene || gltf.scenes[0];
    model.scale.set(0.01, 0.01, 0.01);
    model.position.set(0, 16, 0);
    model.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    scene.add(model);
    phoenixModel = model;
    if (gltf.animations && gltf.animations.length) {
      const mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(gltf.animations[0]).play();
      animMixers.push(mixer);
    }
    updateProgress(60);
  },
  null,
  (err) => { console.warn('Phoenix.glb failed to load', err); updateProgress(60); }
);

loader.load(
  './UFO.glb',
  (gltf) => {
    const model = gltf.scene || gltf.scenes[0];
    model.scale.set(4, 4, 4);
    model.position.set(30, 30, 0);
    model.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    scene.add(model);
    ufoModel = model;
    if (gltf.animations && gltf.animations.length) {
      const mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(gltf.animations[0]).play();
      animMixers.push(mixer);
    }
    updateProgress(100);
    hideLoading();
  },
  null,
  (err) => { console.warn('UFO.glb failed to load', err); updateProgress(100); hideLoading(); }
);

// ─── LOADING HELPERS ─────────────────────────────────────────────────────────
function updateProgress(v) {
  document.getElementById('progbar').style.width = v + '%';
}
function hideLoading() {
  const el = document.getElementById('loading');
  el.classList.add('hidden');
  setTimeout(() => el.remove(), 900);
}
updateProgress(30);

// ─── RESIZE ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ─── ANIMATION LOOP ──────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t  = clock.getElapsedTime();

  // WASD movement
  const moveSpeed = 14 * dt;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
  if (keys['KeyW']) camera.position.addScaledVector(dir,  moveSpeed);
  if (keys['KeyS']) camera.position.addScaledVector(dir, -moveSpeed);
  if (keys['KeyA']) camera.position.addScaledVector(right,-moveSpeed);
  if (keys['KeyD']) camera.position.addScaledVector(right, moveSpeed);
  if (keys['KeyE']) camera.position.y += moveSpeed;
  if (keys['KeyQ']) camera.position.y -= moveSpeed;

  const lo = window.lightOverrides;

  // Phoenix hovers above the main island
  if (phoenixModel) {
    phoenixModel.position.x = 0;
    phoenixModel.position.z = 0;
    phoenixModel.position.y = 16 + Math.sin(t * 0.8) * 2;
  }

  // Torch brightness
  torchLights.forEach(pl => { pl.intensity = lo.torchPower; });

  // Beam color
  beams.forEach(b => {
    b.mesh.material.color.set(lo.beamColor);
    b.mesh.material.emissive.set(lo.beamColor);
    b.mesh.material.opacity = 0.3 + Math.sin(t * 2 + b.phase) * 0.15;
  });

  // UFO orbits
  if (ufoModel) {
    const uAngle = t * 0.55;
    ufoModel.position.x = Math.cos(uAngle) * 35;
    ufoModel.position.z = Math.sin(uAngle) * 35;
    ufoModel.position.y = 28 + Math.sin(t * 0.4) * 4;
    ufoModel.rotation.y += 0.5 * dt;
  }

  // GLTF animation mixers
  animMixers.forEach(m => m.update(dt));

  // Day/night cycle
  const dayTime = t * (Math.PI / 15);
  const dayF = lo.timeMode === 'auto'
    ? (Math.sin(dayTime) + 1) / 2
    : lo.forcedDayF;

  skyMat.uniforms.dayFactor.value = dayF;
  skyMat.uniforms.sunDir.value.set(Math.cos(dayTime) * 0.9, Math.sin(dayTime), 0.3).normalize();
  sunLight.intensity = dayF * lo.sunMax;
  sunLight.position.set(Math.cos(dayTime) * 90, Math.sin(dayTime) * 90, 40);
  sunLight.color.setHSL(0.1, 0.3 + dayF * 0.4, 0.5 + dayF * 0.4);
  ambientLight.intensity  = lo.ambientBase * (0.2 + dayF * 1.0);
  hemiLight.intensity     = 0.08 + dayF * 0.55;
  crystalPointLight.intensity = lo.crystalPower + Math.sin(t * 2.5) * 1.0;
  spotLight.intensity = lo.spotPower;

  // Crystal spin + bob
  crystal.rotation.y += 0.7 * dt;
  crystal.rotation.x += 0.35 * dt;
  crystal.position.y  = 5.2 + Math.sin(t * 1.3) * 0.45;

  // Lava planet orbit
  const lavaAngle = t * lavaOrbitSpeed;
  lavaCore.position.x = Math.cos(lavaAngle) * lavaOrbitRadius;
  lavaCore.position.z = Math.sin(lavaAngle) * lavaOrbitRadius;
  lavaCore.position.y = lavaOrbitHeight + Math.sin(t * 0.7) * 2;
  lavaCore.rotation.y += 0.5 * dt;
  lavaCore.material.emissiveIntensity = 0.9 + Math.sin(t * 1.5) * 0.5;
  lavaLight.position.copy(lavaCore.position);
  lavaLight.intensity = 3.0 + Math.sin(t * 1.2) * 1.5;

  // Floating rocks bob
  floatingRocks.forEach(r => {
    r.mesh.position.y = r.baseY + Math.sin(t * r.speed + r.phase) * 1.8;
    r.mesh.rotation.y += 0.25 * dt;
  });

  // Fireflies drift
  fireflies.forEach(f => {
    f.mesh.position.x += Math.cos(t * f.speed + f.phase) * 0.06;
    f.mesh.position.y += Math.sin(t * f.speed * 1.2 + f.phase) * 0.04;
    f.mesh.position.z += Math.sin(t * f.speed * 0.9 + f.phase + 1) * 0.06;
    if (Math.abs(f.mesh.position.x) > 22) f.mesh.position.x *= 0.93;
    if (f.mesh.position.y < 2 || f.mesh.position.y > 18) f.mesh.position.y = 8;
    if (Math.abs(f.mesh.position.z) > 22) f.mesh.position.z *= 0.93;
    f.mesh.material.emissiveIntensity = 0.6 + Math.sin(t * 4 + f.phase) * 0.6;
  });

  // Spotlight sweep
  spotLight.target.position.x = Math.sin(t * 0.4) * 18;
  spotLight.target.updateMatrixWorld();

  controls.update();
  renderer.render(scene, camera);
}

animate();
