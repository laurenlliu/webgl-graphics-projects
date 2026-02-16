// index.js — Voxel World + wandering rat NPC
// Needs global Matrix4/Vector3 from ./lib/cuon-matrix-cse160.js
import Camera from "./Camera.js";

// ===================== SHADERS =====================
const VSHADER_SOURCE = `
  precision mediump float;

  attribute vec3 aPosition;
  attribute vec2 aUV;

  uniform mat4 u_ModelMatrix;
  uniform mat4 u_ViewMatrix;
  uniform mat4 u_ProjectionMatrix;

  varying vec2 vUV;

  void main() {
    gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * vec4(aPosition, 1.0);
    vUV = aUV;
  }
`;

const FSHADER_SOURCE = `
  precision mediump float;

  uniform vec4 u_BaseColor;
  uniform float u_TexWeight;      // 0 = base only, 1 = texture only

  uniform sampler2D u_Sampler0;
  uniform sampler2D u_Sampler1;
  uniform int u_WhichTex;         // 0 or 1

  varying vec2 vUV;

  void main() {
    vec4 texColor = (u_WhichTex == 0)
      ? texture2D(u_Sampler0, vUV)
      : texture2D(u_Sampler1, vUV);

    gl_FragColor = (1.0 - u_TexWeight) * u_BaseColor + u_TexWeight * texColor;
  }
`;

// ===================== WEBGL HELPERS =====================
function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || "Shader compile failed");
  }
  return s;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || "Program link failed");
  }
  return prog;
}

function resizeCanvasToDisplaySize(canvas) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}

// NPOT-safe texture loader (no mipmaps)
function loadTexture(gl, textureUnitIndex, url) {
  return new Promise((resolve, reject) => {
    const tex = gl.createTexture();
    const img = new Image();

    img.onload = () => {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

      gl.activeTexture(gl.TEXTURE0 + textureUnitIndex);
      gl.bindTexture(gl.TEXTURE_2D, tex);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      resolve(tex);
    };

    img.onerror = () => reject(new Error(`Failed to load texture: ${url}`));
    img.src = url;
  });
}

// ===================== CUBE GEOMETRY (pos+uv) =====================
function makeCubeInterleaved() {
  return new Float32Array([
    // Front
    0,0,1,  0,0,   1,0,1,  1,0,   1,1,1,  1,1,
    0,0,1,  0,0,   1,1,1,  1,1,   0,1,1,  0,1,
    // Back
    1,0,0,  0,0,   0,0,0,  1,0,   0,1,0,  1,1,
    1,0,0,  0,0,   0,1,0,  1,1,   1,1,0,  0,1,
    // Left
    0,0,0,  0,0,   0,0,1,  1,0,   0,1,1,  1,1,
    0,0,0,  0,0,   0,1,1,  1,1,   0,1,0,  0,1,
    // Right
    1,0,1,  0,0,   1,0,0,  1,0,   1,1,0,  1,1,
    1,0,1,  0,0,   1,1,0,  1,1,   1,1,1,  0,1,
    // Top
    0,1,1,  0,0,   1,1,1,  1,0,   1,1,0,  1,1,
    0,1,1,  0,0,   1,1,0,  1,1,   0,1,0,  0,1,
    // Bottom
    0,0,0,  0,0,   1,0,0,  1,0,   1,0,1,  1,1,
    0,0,0,  0,0,   1,0,1,  1,1,   0,0,1,  0,1,
  ]);
}
const CUBE_DATA = makeCubeInterleaved();
const STRIDE = 5 * 4;

// ===================== WORLD DATA =====================
const WORLD_SIZE = 32;
const MAX_H = 4;

let heightMap = makeHeightMap32();
function makeHeightMap32() {
  const m = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));

  // border walls
  for (let i = 0; i < WORLD_SIZE; i++) {
    m[0][i] = 3; m[WORLD_SIZE - 1][i] = 3;
    m[i][0] = 3; m[i][WORLD_SIZE - 1] = 3;
  }

  // corridors + varying heights
  for (let z = 4; z < 28; z++) m[z][8] = 2;
  for (let z = 4; z < 28; z++) m[z][16] = (z % 3 === 0) ? 3 : 1;
  for (let x = 6; x < 26; x++) m[12][x] = 2;
  for (let x = 6; x < 26; x++) m[20][x] = (x % 4 === 0) ? 4 : 1;

  // gates
  m[12][16] = 0;
  m[20][16] = 0;

  return m;
}

/* ===================== TERRAIN MAP =====================

const groundMap = Array.from({ length: WORLD_SIZE }, () =>
  Array.from({ length: WORLD_SIZE }, () =>
    Math.random() < 0.15 ? 1 : 0   // small bumps
  )
);*/

// ===================== GENTLE TERRAIN MAP (GROUND) =====================
// 0 = normal ground, 1 = slightly raised (gentle bumps)
const groundMap = makeGroundMap32();

function makeGroundMap32() {
  const m = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));

  // place a few tiny bumps (2x2)
  const bumps = 10; // lower = flatter (try 6–12)
  for (let i = 0; i < bumps; i++) {
    const x0 = 2 + Math.floor(Math.random() * (WORLD_SIZE - 4));
    const z0 = 2 + Math.floor(Math.random() * (WORLD_SIZE - 4));

    for (let dz = 0; dz < 2; dz++) {
      for (let dx = 0; dx < 2; dx++) {
        m[z0 + dz][x0 + dx] = 1;
      }
    }
  }

  // keep borders flat
  for (let i = 0; i < WORLD_SIZE; i++) {
    m[0][i] = 0; m[1][i] = 0;
    m[WORLD_SIZE - 1][i] = 0; m[WORLD_SIZE - 2][i] = 0;
    m[i][0] = 0; m[i][1] = 0;
    m[i][WORLD_SIZE - 1] = 0; m[i][WORLD_SIZE - 2] = 0;
  }

  // keep spawn area flat-ish (near eye start 16,2.2,30)
  for (let z = 26; z < 32; z++) {
    for (let x = 13; x < 19; x++) {
      if (z >= 0 && z < WORLD_SIZE && x >= 0 && x < WORLD_SIZE) m[z][x] = 0;
    }
  }

  return m;
}



// ===================== GL / LOCATIONS =====================
let gl, canvas, program;
let aPosition, aUV;
let uModel, uView, uProj, uBaseColor, uTexWeight, uWhichTex, uSampler0, uSampler1;

let camera;

// textures
let tex0 = null; // grass
let tex1 = null; // wall

function bindTexturesForDraw() {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, tex1);
}

// ===================== BATCHED BUFFERS =====================
let vboWalls = null;
let wallVertexCount = 0;

let vboGround = null;
let groundVertexCount = 0;

let skyVBO = null;
let skyVertexCount = 0;

// For drawing dynamic objects (rat) with model matrices
let unitCubeVBO = null;
let unitCubeCount = 0;

function bindInterleavedVBO(buffer) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(aPosition);

  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, STRIDE, 3 * 4);
  gl.enableVertexAttribArray(aUV);
}

function pushCube(batch, modelMatrix) {
  const e = modelMatrix.elements;
  for (let i = 0; i < CUBE_DATA.length; i += 5) {
    const x = CUBE_DATA[i + 0];
    const y = CUBE_DATA[i + 1];
    const z = CUBE_DATA[i + 2];
    const u = CUBE_DATA[i + 3];
    const v = CUBE_DATA[i + 4];

    const tx = e[0]*x + e[4]*y + e[8]*z  + e[12];
    const ty = e[1]*x + e[5]*y + e[9]*z  + e[13];
    const tz = e[2]*x + e[6]*y + e[10]*z + e[14];

    batch.push(tx, ty, tz, u, v);
  }
}

function rebuildWallsBatch() {
  const verts = [];
  const M = new Matrix4();

  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const h = heightMap[z][x];
      for (let y = 0; y < h; y++) {
        M.setIdentity();
        M.translate(x, y, z);
        pushCube(verts, M);
      }
    }
  }

  const data = new Float32Array(verts);
  wallVertexCount = data.length / 5;

  if (!vboWalls) vboWalls = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vboWalls);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}

/*function buildGroundBatch() {
  const verts = [];
  const M = new Matrix4();

  // flat cube scaled to cover world
  M.setIdentity();
  M.translate(0, -1, 0);
  M.scale(WORLD_SIZE, 1, WORLD_SIZE);
  pushCube(verts, M);

  const data = new Float32Array(verts);
  groundVertexCount = data.length / 5;

  vboGround = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vboGround);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}*/
function buildGroundBatch() {
  const verts = [];
  const M = new Matrix4();

  // Build ground tiles as cubes, with small height variation from groundMap
  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const h = groundMap[z][x]; // 0 or 1 (gentle)

      // base ground layer at y = -1
      M.setIdentity();
      M.translate(x, -1, z);
      pushCube(verts, M);

      // optional raised layer at y = 0 if h == 1
      if (h > 0) {
        M.setIdentity();
        M.translate(x, 0, z);
        pushCube(verts, M);
      }
    }
  }

  const data = new Float32Array(verts);
  groundVertexCount = data.length / 5;

  vboGround = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vboGround);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}


function buildSkyBox() {
  const verts = [];
  const M = new Matrix4();

  M.setIdentity();
  M.translate(WORLD_SIZE / 2, 10, WORLD_SIZE / 2);
  M.scale(120, 120, 120);
  pushCube(verts, M);

  const data = new Float32Array(verts);
  skyVertexCount = data.length / 5;

  skyVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyVBO);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}

function initUnitCubeVBO() {
  unitCubeCount = CUBE_DATA.length / 5;
  unitCubeVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, unitCubeVBO);
  gl.bufferData(gl.ARRAY_BUFFER, CUBE_DATA, gl.STATIC_DRAW);
}

// ===================== DRAW HELPERS =====================
function drawBatch(buffer, count, whichTex, texWeight, baseColorRGBA) {
  bindInterleavedVBO(buffer);

  const I = new Matrix4();
  I.setIdentity();
  gl.uniformMatrix4fv(uModel, false, I.elements);

  gl.uniform1i(uWhichTex, whichTex);
  gl.uniform1f(uTexWeight, texWeight);
  gl.uniform4fv(uBaseColor, baseColorRGBA);

  gl.drawArrays(gl.TRIANGLES, 0, count);
}

function drawUnitCubeModel(M, baseColorRGBA) {
  bindInterleavedVBO(unitCubeVBO);
  gl.uniformMatrix4fv(uModel, false, M.elements);
  gl.uniform1f(uTexWeight, 0.0);     // base color only
  gl.uniform4fv(uBaseColor, baseColorRGBA);
  gl.uniform1i(uWhichTex, 0);
  gl.drawArrays(gl.TRIANGLES, 0, unitCubeCount);
}

// ===================== INPUT =====================
const keys = new Set();

function setupKeyboardMovement() {
  window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
}

// Mouse look: left click to lock
function setupMouseLook() {
  canvas.addEventListener("mousedown", (e) => {
    // LEFT click works on MacBook trackpads
    if (e.button === 0) {
      e.preventDefault();
      canvas.requestPointerLock();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;

    const sens = 0.12;
    camera.yaw(e.movementX * sens);
    camera.pitch(-e.movementY * sens); // look up/down
  });
}


// Add/delete blocks with keyboard: r add, f delete
function setupKeyboardEdit() {
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key !== "r" && key !== "f") return;

    const cell = cellInFrontOfCamera(1.6);
    if (!cell) return;

    const { x, z } = cell;
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) return;

    if (key === "r") heightMap[z][x] = Math.min(MAX_H, heightMap[z][x] + 1);
    if (key === "f") heightMap[z][x] = Math.max(0, heightMap[z][x] - 1);

    rebuildWallsBatch();
  });
}

function cellInFrontOfCamera(dist = 1.0) {
  const ex = camera.eye.elements[0];
  const ez = camera.eye.elements[2];
  const ax = camera.at.elements[0];
  const az = camera.at.elements[2];

  let fx = ax - ex;
  let fz = az - ez;
  const len = Math.hypot(fx, fz);
  if (len < 1e-6) return null;

  fx /= len; fz /= len;

  const tx = ex + fx * dist;
  const tz = ez + fz * dist;

  return { x: Math.floor(tx), z: Math.floor(tz) };
}

// ===================== RATS (wandering NPCs) =====================
const RAT_COL = {
  RAT:   [0.75, 0.75, 0.75, 1.0],
  DARK:  [0.55, 0.55, 0.55, 1.0],
  PINK:  [0.90, 0.70, 0.78, 1.0],
  BLACK: [0.08, 0.08, 0.10, 1.0],
};

const RATS_COUNT = 15;     // <-- change this number (try 8–20)
const rats = [];

// ===================== CATCH THE RATS GAME =====================
let ratsCaught = 0;
let ratsTotal = 0;
let winShown = false;

// how close you need to be to catch a rat (world units)
const CATCH_RADIUS = 1.2;

// ===================== CENTER SCREEN HUD (catch feedback) =====================
let centerHudTimer = 0;

function showCenterMessage(text, duration = 0.8) {
  const hud = document.getElementById("centerHud");
  if (!hud) return;

  hud.textContent = text;
  hud.style.opacity = "1";
  centerHudTimer = duration;
}

function updateCenterHud(dt) {
  if (centerHudTimer <= 0) return;

  centerHudTimer -= dt;
  if (centerHudTimer <= 0) {
    const hud = document.getElementById("centerHud");
    if (hud) hud.style.opacity = "0";
  }
}

function isBlockedCell(x, z) {
  if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) return true;

  // walls are blocked
  if (heightMap[z][x] > 0) return true;

  // terrain bumps are blocked (prevents rats walking into raised ground cubes)
  if (typeof groundMap !== "undefined" && groundMap[z][x] > 0) return true;

  return false;
}


function randFloat(a, b) { return a + Math.random() * (b - a); }

function spawnRats(count) {
  rats.length = 0;

  // Try random open spots; ensure they don't spawn stacked on each other
  const minSep = 2.0; // world units
  let attempts = 0;

  while (rats.length < count && attempts < 5000) {
    attempts++;

    const x = randFloat(2, WORLD_SIZE - 2);
    const z = randFloat(2, WORLD_SIZE - 2);

    const cx = Math.floor(x);
    const cz = Math.floor(z);

    if (isBlockedCell(cx, cz)) continue;

    if (groundMap[cz][cx] > 0) continue;

    let ok = true;
    for (const r of rats) {
      const dx = r.x - x;
      const dz = r.z - z;
      if (dx*dx + dz*dz < minSep*minSep) { ok = false; break; }
    }
    if (!ok) continue;

    rats.push({
      x, z,
      yaw: randFloat(0, 360),
      speed: randFloat(0.6, 1.4),      // slight variation between rats
      turnCooldown: randFloat(0.2, 1.6),
      phase: randFloat(0, Math.PI * 2) // walk animation phase offset
    });
  }

  console.log(`Spawned ${rats.length}/${count} rats`);

  // reset game progress each time we spawn
  ratsTotal = rats.length;
  ratsCaught = 0;
  winShown = false;

  // update HUD immediately
  updatePerfHUD();
}

function updateOneRat(r, dt) {
  r.turnCooldown -= dt;

  // occasionally pick a new direction
  if (r.turnCooldown <= 0) {
    r.yaw += (Math.random() * 90 - 45); // -45..+45
    r.turnCooldown = 0.8 + Math.random() * 1.3;
  }

  const rad = (r.yaw * Math.PI) / 180;
  const fx = Math.cos(rad);
  const fz = Math.sin(rad);

  const nx = r.x + fx * r.speed * dt;
  const nz = r.z + fz * r.speed * dt;

  const cellX = Math.floor(nx);
  const cellZ = Math.floor(nz);

  if (isBlockedCell(cellX, cellZ)) {
    // bounce away
    r.yaw += 120 + Math.random() * 120;
    r.turnCooldown = 0.35;
    return;
  }

  r.x = nx;
  r.z = nz;
}

function updateRats(dt) {
  for (const r of rats) updateOneRat(r, dt);
}

function drawRats(timeSec) {
  for (let i = 0; i < rats.length; i++) {
    // little time offsets so they don't all walk in sync
    drawOneRat(rats[i], timeSec + rats[i].phase, i);
  }
}

function catchRatsIfClose() {
  const px = camera.eye.elements[0];
  const pz = camera.eye.elements[2];

  // iterate backwards so we can remove safely
  for (let i = rats.length - 1; i >= 0; i--) {
    const r = rats[i];
    const dx = r.x - px;
    const dz = r.z - pz;

    if (dx * dx + dz * dz <= CATCH_RADIUS * CATCH_RADIUS) {
      rats.splice(i, 1);
      ratsCaught++;

      // corner HUD update + center pop
      updatePerfHUD();
      showCenterMessage(`🐀 ${ratsCaught} / ${ratsTotal}`, 0.8);
    }
  }

  // win condition
  if (!winShown && ratsCaught >= ratsTotal && ratsTotal > 0) {
    winShown = true;
    updatePerfHUD();
    showCenterMessage("YOU WIN!", 999); // stays
  }
}

// Same rat model as before, but parameterized per-rat
function drawOneRat(r, timeSec, idx) {
  // Slight size variation per rat (optional)
  const size = 0.75 + 0.25 * Math.sin(idx * 17.3);

  // base transform for placing rat in world
  const base = new Matrix4();
  base.setIdentity();
  base.translate(r.x, 0.0, r.z);
  base.rotate(-r.yaw + 180, 0, 1, 0);
  base.scale(0.9 * size, 0.9 * size, 0.9 * size);

  // simple walk cycle angles
  const s = Math.sin(timeSec * 6.0);
  const thighA = 12 + 18 * s;
  const calfA  = -18 + 35 * Math.max(0, -s);
  const footA  = 6 + 12 * Math.sin(timeSec * 6.0 + Math.PI / 4);
  const headYaw = 8 * Math.sin(timeSec * 2.0);
  const tailSwing = 35 * Math.sin(timeSec * 7.0 + 0.7);

  // helper to draw a cube part
  const M = new Matrix4();
  function part(worldMat, color) {
    drawUnitCubeModel(worldMat, color);
  }

  // BODY
  const bodyLen = 0.85, bodyH = 0.42, bodyW = 0.45;
  const bodyX = -0.05, bodyY = 0.10;

  M.set(base);
  M.translate(bodyX, bodyY, 0);
  M.scale(bodyLen, bodyH, bodyW);
  part(M, RAT_COL.RAT);

  // HEAD
  const headLen = 0.28, headH = 0.28, headW = 0.28;
  const headX = bodyX + bodyLen * 0.5 + headLen * 0.45;

  const headFrame = new Matrix4();
  headFrame.set(base);
  headFrame.translate(headX, bodyY + 0.03, 0);
  headFrame.rotate(headYaw, 0, 1, 0);

  M.set(headFrame);
  M.scale(headLen, headH, headW);
  part(M, RAT_COL.RAT);

  // SNOUT
  M.set(headFrame);
  M.translate(headLen * 0.55 + 0.07, 0.01, 0);
  M.scale(0.10, 0.07, 0.10);
  part(M, RAT_COL.PINK);

  // WHISKERS
  const whiskerLen = 0.14, whiskerThk = 0.008, whiskerZ = 0.16;
  for (const side of [1, -1]) {
    M.set(headFrame);
    M.translate(headLen * 0.62, 0.035, side * whiskerZ);
    M.rotate(side * 35, 0, 1, 0);
    M.scale(whiskerLen, whiskerThk, whiskerThk);
    part(M, RAT_COL.BLACK);

    M.set(headFrame);
    M.translate(headLen * 0.62, -0.005, side * whiskerZ);
    M.rotate(side * 45, 0, 1, 0);
    M.scale(whiskerLen * 0.9, whiskerThk, whiskerThk);
    part(M, RAT_COL.BLACK);
  }

  // EYES
  for (const side of [1, -1]) {
    M.set(headFrame);
    M.translate(headLen * 0.5 + 0.001, 0.08, side * 0.07);
    M.scale(0.03, 0.03, 0.03);
    part(M, RAT_COL.BLACK);
  }

  // EARS
  for (const side of [1, -1]) {
    M.set(headFrame);
    M.translate(-0.08, 0.18, side * 0.09);
    M.scale(0.07, 0.09, 0.05);
    part(M, RAT_COL.PINK);
  }

  // LEGS
  const legAttachY = bodyY - bodyH * 0.5;
  const shoulderX = bodyX + bodyLen * 0.28;
  const hipX = bodyX - bodyLen * 0.10;
  const legZ = bodyW * 0.40;

  // ✅ FIX: pass base matrix into drawLegChain so hip.set(...) works
  drawLegChain(part, base, shoulderX, legAttachY,  legZ,  thighA, calfA,  footA, RAT_COL.DARK);
  drawLegChain(part, base, shoulderX, legAttachY, -legZ, -thighA*0.9, calfA*0.7, -footA*0.6, RAT_COL.DARK);
  drawLegChain(part, base, hipX,      legAttachY,  legZ, -thighA*0.8, calfA*0.65,  footA*0.5, RAT_COL.DARK);
  drawLegChain(part, base, hipX,      legAttachY, -legZ,  thighA*0.8, calfA*0.65, -footA*0.5, RAT_COL.DARK);

  // TAIL
  const tailLen1 = 0.35, tailLen2 = 0.28, tailLen3 = 0.22, tailThk = 0.03;
  const tailBaseX = bodyX - bodyLen * 0.5 - 0.01;

  const tailBase = new Matrix4();
  tailBase.set(base);
  tailBase.translate(tailBaseX, bodyY - bodyH * 0.10, 0);
  tailBase.rotate(tailSwing, 0, 1, 0);

  M.set(tailBase);
  M.translate(-tailLen1 * 0.5, 0, 0);
  M.scale(tailLen1, tailThk, tailThk);
  part(M, RAT_COL.PINK);

  const t1End = new Matrix4(tailBase);
  t1End.translate(-tailLen1, 0, 0);
  t1End.rotate(15, 0, 0, 1);

  M.set(t1End);
  M.translate(-tailLen2 * 0.5, 0, 0);
  M.scale(tailLen2, tailThk * 0.9, tailThk * 0.9);
  part(M, RAT_COL.PINK);

  const t2End = new Matrix4(t1End);
  t2End.translate(-tailLen2, 0, 0);
  t2End.rotate(20, 0, 0, 1);

  M.set(t2End);
  M.translate(-tailLen3 * 0.5, 0, 0);
  M.scale(tailLen3, tailThk * 0.8, tailThk * 0.8);
  part(M, RAT_COL.PINK);
}

// ✅ FIXED signature + hip matrix scope
function drawLegChain(drawPartFn, baseMat, baseX, baseY, baseZ, thighAngle, calfAngle, footAngle, color) {
  const thighLen = 0.075, calfLen = 0.070;
  const footScale = [0.12, 0.04, 0.14];

  const hip = new Matrix4();
  hip.set(baseMat);
  hip.translate(baseX, baseY, baseZ);

  const thighFrame = new Matrix4(hip);
  thighFrame.rotate(thighAngle, 0, 0, 1);

  let M = new Matrix4(thighFrame);
  M.translate(0, -thighLen * 0.5, 0);
  M.scale(0.10, thighLen, 0.10);
  drawPartFn(M, color);

  const knee = new Matrix4(thighFrame);
  knee.translate(0, -thighLen, 0);

  const calfFrame = new Matrix4(knee);
  calfFrame.rotate(calfAngle, 0, 0, 1);

  M = new Matrix4(calfFrame);
  M.translate(0, -calfLen * 0.5, 0);
  M.scale(0.095, calfLen, 0.095);
  drawPartFn(M, color);

  const ankle = new Matrix4(calfFrame);
  ankle.translate(0, -calfLen, 0);

  const footFrame = new Matrix4(ankle);
  footFrame.rotate(footAngle, 0, 0, 1);

  M = new Matrix4(footFrame);
  M.translate(0.06, -0.02, 0);
  M.scale(footScale[0], footScale[1], footScale[2]);
  drawPartFn(M, color);
}

// ===================== FPS HUD =====================
let frameCount = 0;
let fps = 0;
let lastFpsStamp = performance.now();

function updatePerfHUD() {
  const perf = document.getElementById("perf");
  if (!perf) return;

  const winText = (winShown && ratsTotal > 0) ? " — YOU WIN!" : "";
  perf.textContent = `fps=${fps.toFixed(1)} | rats ${ratsCaught}/${ratsTotal}${winText}`;
}

// ===================== RENDER LOOP =====================
let lastTime = performance.now();

function tick() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  const resized = resizeCanvasToDisplaySize(canvas);
  if (resized) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    camera.onResize(canvas);
  }

  // movement
  const moveSpeed = 0.18;
  const turnSpeed = 3.0;

  if (keys.has("w")) camera.moveForward(moveSpeed);
  if (keys.has("s")) camera.moveBackwards(moveSpeed);
  if (keys.has("a")) camera.moveLeft(moveSpeed);
  if (keys.has("d")) camera.moveRight(moveSpeed);
  if (keys.has("q")) camera.panLeft(turnSpeed);
  if (keys.has("e")) camera.panRight(turnSpeed);

  // update rat NPC
  updateRats(dt);

  // catch the rats
  catchRatsIfClose();

  // fade center message
  updateCenterHud(dt);

  bindTexturesForDraw();

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.uniformMatrix4fv(uView, false, camera.viewMatrix.elements);
  gl.uniformMatrix4fv(uProj, false, camera.projectionMatrix.elements);

  // sky (always centered on camera so you never see outside)
gl.disable(gl.DEPTH_TEST);
gl.depthMask(false);        // don't write depth
gl.disable(gl.CULL_FACE);   // make sure inside faces show

const skyM = new Matrix4();
const ex = camera.eye.elements[0];
const ey = camera.eye.elements[1];
const ez = camera.eye.elements[2];

// Our cube vertices are in [0..1], so place a huge cube around the camera
skyM.setIdentity();
skyM.translate(ex - 400, ey - 400, ez - 400);
skyM.scale(800, 800, 800);

drawUnitCubeModel(skyM, [0.35, 0.55, 0.95, 1.0]); // blue sky

gl.depthMask(true);
gl.enable(gl.DEPTH_TEST);


  // ground + walls textured
  drawBatch(vboGround, groundVertexCount, 0, 1.0, [1, 1, 1, 1]); // grass
  drawBatch(vboWalls, wallVertexCount, 1, 1.0, [1, 1, 1, 1]);    // wall

  // draw rat NPC (solid colors)
  drawRats(now / 1000);

  // fps
  frameCount++;
  if (now - lastFpsStamp >= 500) {
    fps = (frameCount * 1000) / (now - lastFpsStamp);
    frameCount = 0;
    lastFpsStamp = now;
    updatePerfHUD();
  }

  requestAnimationFrame(tick);
}

// ===================== MAIN =====================
async function main() {
  canvas = document.getElementById("webgl");
  gl = canvas.getContext("webgl", { antialias: true });
  if (!gl) throw new Error("WebGL not supported");

  program = createProgram(gl, VSHADER_SOURCE, FSHADER_SOURCE);
  gl.useProgram(program);

  // attrib/uniform locations
  aPosition = gl.getAttribLocation(program, "aPosition");
  aUV = gl.getAttribLocation(program, "aUV");
  if (aPosition < 0) throw new Error("aPosition not found");
  if (aUV < 0) throw new Error("aUV not found");

  uModel = gl.getUniformLocation(program, "u_ModelMatrix");
  uView = gl.getUniformLocation(program, "u_ViewMatrix");
  uProj = gl.getUniformLocation(program, "u_ProjectionMatrix");
  uBaseColor = gl.getUniformLocation(program, "u_BaseColor");
  uTexWeight = gl.getUniformLocation(program, "u_TexWeight");
  uWhichTex = gl.getUniformLocation(program, "u_WhichTex");
  uSampler0 = gl.getUniformLocation(program, "u_Sampler0");
  uSampler1 = gl.getUniformLocation(program, "u_Sampler1");

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.1, 0.1, 0.1, 1);

  resizeCanvasToDisplaySize(canvas);
  gl.viewport(0, 0, canvas.width, canvas.height);

  camera = new Camera(canvas);

  // focus so keyboard works
  canvas.focus();
  canvas.addEventListener("click", () => canvas.focus());

  // load textures + set samplers
  tex0 = await loadTexture(gl, 0, "./img/grass.png");
  tex1 = await loadTexture(gl, 1, "./img/wall.png");

  gl.uniform1i(uSampler0, 0);
  gl.uniform1i(uSampler1, 1);

  // init dynamic cube VBO for rat
  initUnitCubeVBO();

  // build world once
  buildGroundBatch();
  rebuildWallsBatch();
  buildSkyBox();

  spawnRats(RATS_COUNT);
  updatePerfHUD();

  // input
  setupKeyboardMovement();
  setupMouseLook();
  setupKeyboardEdit();

  requestAnimationFrame(tick);
}

main().catch((err) => {
  console.error(err);
  alert(err.message || String(err));
});
