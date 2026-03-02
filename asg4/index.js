// index.js - uses asg3 world and asg2 rat animal

import Camera from "./Camera.js";
import Sphere from "./Sphere.js";
import OBJModel from "./OBJModel.js";

// ===================== SHADERS =====================
const VSHADER_SOURCE = `
  precision mediump float;

  attribute vec3 aPosition;
  attribute vec2 aUV;
  attribute vec3 aNormal;

  uniform mat4 u_ModelMatrix;
  uniform mat4 u_ViewMatrix;
  uniform mat4 u_ProjectionMatrix;
  uniform mat4 u_NormalMatrix;   // inverse-transpose(model)

  varying vec2 vUV;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPos4 = u_ModelMatrix * vec4(aPosition, 1.0);
    vWorldPos = worldPos4.xyz;

    // transform normal to world
    vWorldNormal = normalize((u_NormalMatrix * vec4(aNormal, 0.0)).xyz);

    gl_Position = u_ProjectionMatrix * u_ViewMatrix * worldPos4;
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

  // Lighting uniforms
  uniform int u_LightingOn;       // 1 = point light enabled, 0 = disabled
  uniform int u_NormalViz;        // 1 = show normals as color
  uniform vec3 u_LightPos;        // world
  uniform vec3 u_LightColor;      // rgb 0..1
  uniform vec3 u_CameraPos;       // world

  // Spotlight (2nd light)
  uniform int u_SpotOn;
  uniform vec3 u_SpotPos;         // world
  uniform vec3 u_SpotDir;         // normalized world direction
  uniform float u_SpotInner;      // cos(innerAngle)
  uniform float u_SpotOuter;      // cos(outerAngle)

  varying vec2 vUV;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  vec3 baseAlbedo() {
    vec4 texColor = (u_WhichTex == 0)
      ? texture2D(u_Sampler0, vUV)
      : texture2D(u_Sampler1, vUV);
    vec4 c = (1.0 - u_TexWeight) * u_BaseColor + u_TexWeight * texColor;
    return c.rgb;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);

    // Normal visualization
    if (u_NormalViz == 1) {
      gl_FragColor = vec4(N * 0.5 + 0.5, 1.0);
      return;
    }

    vec3 albedo = baseAlbedo();

    // If BOTH lights are off → show plain albedo
    if (u_LightingOn == 0 && u_SpotOn == 0) {
      gl_FragColor = vec4(albedo, 1.0);
      return;
    }

    float ka = 0.35;
    float kd = 1.00;
    float ks = 0.65;

    vec3 color = ka * albedo;
    vec3 V = normalize(u_CameraPos - vWorldPos);

    // ===== Point light (only if enabled) =====
    if (u_LightingOn == 1) {
      vec3 L = normalize(u_LightPos - vWorldPos);
      vec3 R = reflect(-L, N);

      float diff = max(dot(N, L), 0.0);

      float spec = 0.0;
      if (diff > 0.0) {
        spec = pow(max(dot(R, V), 0.0), 32.0);
      }

      vec3 diffuse  = kd * diff * albedo * u_LightColor;
      vec3 specular = ks * spec * u_LightColor;

      color += diffuse + specular;
    }

    // ===== Spotlight (only if enabled) =====
    if (u_SpotOn == 1) {
      vec3 Ls = normalize(u_SpotPos - vWorldPos);

      float theta = dot(normalize(-Ls), normalize(u_SpotDir));
      float eps = max(u_SpotInner - u_SpotOuter, 0.0001);
      float intensity = clamp((theta - u_SpotOuter) / eps, 0.0, 1.0);

      float diffS = max(dot(N, Ls), 0.0);
      vec3 Rs = reflect(-Ls, N);

      float specS = 0.0;
      if (diffS > 0.0) {
        specS = pow(max(dot(Rs, V), 0.0), 32.0);
      }

      vec3 diffuseS  = kd * diffS * albedo * u_LightColor;
      vec3 specularS = ks * specS * u_LightColor;

      color += intensity * (diffuseS + specularS);
    }

    gl_FragColor = vec4(color, 1.0);
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

// ===================== CUBE GEOMETRY =====================
// Each face has constant normal. (36 verts)
function makeCubeInterleavedPUN() {
  // vertex format: x y z  u v  nx ny nz
  const out = [];

  function pushTri(a, b, c, n) {
    out.push(...a, ...n, ...b, ...n, ...c, ...n);
  }
  function V(x,y,z,u,v){ return [x,y,z,u,v]; }
  function N(nx,ny,nz){ return [nx,ny,nz]; }

  // Front (z=1)  n=(0,0,1)
  {
    const n = N(0,0,1);
    const v0 = V(0,0,1, 0,0), v1 = V(1,0,1, 1,0), v2 = V(1,1,1, 1,1), v3 = V(0,1,1, 0,1);
    pushTri(v0,v1,v2,n); pushTri(v0,v2,v3,n);
  }
  // Back (z=0) n=(0,0,-1)
  {
    const n = N(0,0,-1);
    const v0 = V(1,0,0, 0,0), v1 = V(0,0,0, 1,0), v2 = V(0,1,0, 1,1), v3 = V(1,1,0, 0,1);
    pushTri(v0,v1,v2,n); pushTri(v0,v2,v3,n);
  }
  // Left (x=0) n=(-1,0,0)
  {
    const n = N(-1,0,0);
    const v0 = V(0,0,0, 0,0), v1 = V(0,0,1, 1,0), v2 = V(0,1,1, 1,1), v3 = V(0,1,0, 0,1);
    pushTri(v0,v1,v2,n); pushTri(v0,v2,v3,n);
  }
  // Right (x=1) n=(1,0,0)
  {
    const n = N(1,0,0);
    const v0 = V(1,0,1, 0,0), v1 = V(1,0,0, 1,0), v2 = V(1,1,0, 1,1), v3 = V(1,1,1, 0,1);
    pushTri(v0,v1,v2,n); pushTri(v0,v2,v3,n);
  }
  // Top (y=1) n=(0,1,0)
  {
    const n = N(0,1,0);
    const v0 = V(0,1,1, 0,0), v1 = V(1,1,1, 1,0), v2 = V(1,1,0, 1,1), v3 = V(0,1,0, 0,1);
    pushTri(v0,v1,v2,n); pushTri(v0,v2,v3,n);
  }
  // Bottom (y=0) n=(0,-1,0)
  {
    const n = N(0,-1,0);
    const v0 = V(0,0,0, 0,0), v1 = V(1,0,0, 1,0), v2 = V(1,0,1, 1,1), v3 = V(0,0,1, 0,1);
    pushTri(v0,v1,v2,n); pushTri(v0,v2,v3,n);
  }

  // Convert: interleave is [x y z u v nx ny nz]
  const data = [];
  for (let i = 0; i < out.length; i += 8) {
    // NOTE: out already is x y z u v nx ny nz
    data.push(out[i+0], out[i+1], out[i+2], out[i+3], out[i+4], out[i+5], out[i+6], out[i+7]);
  }
  return new Float32Array(data);
}

const CUBE_DATA = makeCubeInterleavedPUN();
const STRIDE = 8 * 4;

// ===================== WORLD DATA =====================
const WORLD_SIZE = 32;
const MAX_H = 4;

let heightMap = makeHeightMap32();
function makeHeightMap32() {
  const m = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
  for (let i = 0; i < WORLD_SIZE; i++) {
    m[0][i] = 3; m[WORLD_SIZE - 1][i] = 3;
    m[i][0] = 3; m[i][WORLD_SIZE - 1] = 3;
  }
  for (let z = 4; z < 28; z++) m[z][8] = 2;
  for (let z = 4; z < 28; z++) m[z][16] = (z % 3 === 0) ? 3 : 1;
  for (let x = 6; x < 26; x++) m[12][x] = 2;
  for (let x = 6; x < 26; x++) m[20][x] = (x % 4 === 0) ? 4 : 1;
  m[12][16] = 0;
  m[20][16] = 0;
  return m;
}

// gentle bumps
const groundMap = makeGroundMap32();
function makeGroundMap32() {
  const m = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
  const bumps = 10;
  for (let i = 0; i < bumps; i++) {
    const x0 = 2 + Math.floor(Math.random() * (WORLD_SIZE - 4));
    const z0 = 2 + Math.floor(Math.random() * (WORLD_SIZE - 4));
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) m[z0 + dz][x0 + dx] = 1;
  }
  for (let i = 0; i < WORLD_SIZE; i++) {
    m[0][i] = 0; m[1][i] = 0;
    m[WORLD_SIZE - 1][i] = 0; m[WORLD_SIZE - 2][i] = 0;
    m[i][0] = 0; m[i][1] = 0;
    m[i][WORLD_SIZE - 1] = 0; m[i][WORLD_SIZE - 2] = 0;
  }
  for (let z = 26; z < 32; z++) for (let x = 13; x < 19; x++) m[z][x] = 0;
  return m;
}

// ===================== GL / LOCATIONS =====================
let gl, canvas, program;
let aPosition, aUV, aNormal;

let uModel, uView, uProj, uNormalMatrix;
let uBaseColor, uTexWeight, uWhichTex, uSampler0, uSampler1;

// lighting uniforms
let uLightingOn, uNormalViz, uLightPos, uLightColor, uCameraPos;
let uSpotOn, uSpotPos, uSpotDir, uSpotInner, uSpotOuter;

let camera;

// textures
let tex0 = null;
let tex1 = null;

// ===================== SPHERES + OBJ =====================
let sphereMesh = null;

let objModel = null;
let objLoaded = false;

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

let unitCubeVBO = null;
let unitCubeCount = 0;

function bindInterleavedVBO(buffer) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(aPosition);

  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, STRIDE, 3 * 4);
  gl.enableVertexAttribArray(aUV);

  gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, STRIDE, 5 * 4);
  gl.enableVertexAttribArray(aNormal);
}

// normalMatrix = inverse-transpose(modelMatrix) :contentReference[oaicite:1]{index=1}
function computeNormalMatrix(modelMatrix) {
  const n = new Matrix4();
  n.setInverseOf(modelMatrix);
  n.transpose();
  return n;
}

// Push a cube into a batch, baking world position AND world normal
function pushCube(batch, modelMatrix) {
  const e = modelMatrix.elements;
  const NM = computeNormalMatrix(modelMatrix).elements;

  for (let i = 0; i < CUBE_DATA.length; i += 8) {
    const x = CUBE_DATA[i + 0];
    const y = CUBE_DATA[i + 1];
    const z = CUBE_DATA[i + 2];
    const u = CUBE_DATA[i + 3];
    const v = CUBE_DATA[i + 4];
    const nx = CUBE_DATA[i + 5];
    const ny = CUBE_DATA[i + 6];
    const nz = CUBE_DATA[i + 7];

    // world position
    const tx = e[0]*x + e[4]*y + e[8]*z  + e[12];
    const ty = e[1]*x + e[5]*y + e[9]*z  + e[13];
    const tz = e[2]*x + e[6]*y + e[10]*z + e[14];

    // world normal (w=0)
    const tnx = NM[0]*nx + NM[4]*ny + NM[8]*nz;
    const tny = NM[1]*nx + NM[5]*ny + NM[9]*nz;
    const tnz = NM[2]*nx + NM[6]*ny + NM[10]*nz;

    batch.push(tx, ty, tz, u, v, tnx, tny, tnz);
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
  wallVertexCount = data.length / 8;

  if (!vboWalls) vboWalls = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vboWalls);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}

function buildGroundBatch() {
  const verts = [];
  const M = new Matrix4();

  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const h = groundMap[z][x];

      M.setIdentity();
      M.translate(x, -1, z);
      pushCube(verts, M);

      if (h > 0) {
        M.setIdentity();
        M.translate(x, 0, z);
        pushCube(verts, M);
      }
    }
  }

  const data = new Float32Array(verts);
  groundVertexCount = data.length / 8;

  vboGround = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vboGround);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}

function initUnitCubeVBO() {
  unitCubeCount = CUBE_DATA.length / 8;
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

  const NI = new Matrix4();
  NI.setIdentity();
  gl.uniformMatrix4fv(uNormalMatrix, false, NI.elements);

  gl.uniform1i(uWhichTex, whichTex);
  gl.uniform1f(uTexWeight, texWeight);
  gl.uniform4fv(uBaseColor, baseColorRGBA);

  gl.drawArrays(gl.TRIANGLES, 0, count);
}

function drawUnitCubeModel(M, baseColorRGBA) {
  bindInterleavedVBO(unitCubeVBO);

  gl.uniformMatrix4fv(uModel, false, M.elements);
  const NM = computeNormalMatrix(M);
  gl.uniformMatrix4fv(uNormalMatrix, false, NM.elements);

  gl.uniform1f(uTexWeight, 0.0);
  gl.uniform4fv(uBaseColor, baseColorRGBA);
  gl.uniform1i(uWhichTex, 0);

  gl.drawArrays(gl.TRIANGLES, 0, unitCubeCount);
}

function drawSphere(M, baseColorRGBA) {
  // sphere uses its own VBO, but same shader + same attribs
  sphereMesh.bind(gl, aPosition, aUV, aNormal);

  gl.uniformMatrix4fv(uModel, false, M.elements);
  const NM = computeNormalMatrix(M);
  gl.uniformMatrix4fv(uNormalMatrix, false, NM.elements);

  gl.uniform1f(uTexWeight, 0.0);        // solid color sphere (no texture)
  gl.uniform4fv(uBaseColor, baseColorRGBA);
  gl.uniform1i(uWhichTex, 0);

  sphereMesh.draw(gl);
}

function drawOBJ(M, baseColorRGBA) {
  if (!objLoaded || !objModel) return;

  objModel.bind(gl, aPosition, aUV, aNormal);

  gl.uniformMatrix4fv(uModel, false, M.elements);
  const NM = computeNormalMatrix(M);
  gl.uniformMatrix4fv(uNormalMatrix, false, NM.elements);

  gl.uniform1f(uTexWeight, 0.0);        // solid color OBJ (no texture)
  gl.uniform4fv(uBaseColor, baseColorRGBA);
  gl.uniform1i(uWhichTex, 0);

  objModel.draw(gl);
}

// ===================== INPUT =====================
const keys = new Set();

function setupKeyboardMovement() {
  window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
}

function setupMouseLook() {
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      e.preventDefault();
      canvas.requestPointerLock();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    const sens = 0.12;
    camera.yaw(e.movementX * sens);
    camera.pitch(-e.movementY * sens);
  });
}

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

// ===================== RATS =====================
const RAT_COL = {
  RAT:   [0.75, 0.75, 0.75, 1.0],
  DARK:  [0.55, 0.55, 0.55, 1.0],
  PINK:  [0.90, 0.70, 0.78, 1.0],
  BLACK: [0.08, 0.08, 0.10, 1.0],
};

const RATS_COUNT = 15;
const rats = [];

let ratsCaught = 0;
let ratsTotal = 0;
let winShown = false;
const CATCH_RADIUS = 1.2;

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
  if (heightMap[z][x] > 0) return true;
  if (groundMap[z][x] > 0) return true;
  return false;
}

function randFloat(a, b) { return a + Math.random() * (b - a); }

function spawnRats(count) {
  rats.length = 0;
  const minSep = 2.0;
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
      speed: randFloat(0.6, 1.4),
      turnCooldown: randFloat(0.2, 1.6),
      phase: randFloat(0, Math.PI * 2)
    });
  }

  ratsTotal = rats.length;
  ratsCaught = 0;
  winShown = false;
  updatePerfHUD();
}

function updateOneRat(r, dt) {
  r.turnCooldown -= dt;
  if (r.turnCooldown <= 0) {
    r.yaw += (Math.random() * 90 - 45);
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

function catchRatsIfClose() {
  const px = camera.eye.elements[0];
  const pz = camera.eye.elements[2];

  for (let i = rats.length - 1; i >= 0; i--) {
    const r = rats[i];
    const dx = r.x - px;
    const dz = r.z - pz;

    if (dx * dx + dz * dz <= CATCH_RADIUS * CATCH_RADIUS) {
      rats.splice(i, 1);
      ratsCaught++;
      updatePerfHUD();
      showCenterMessage(`🐀 ${ratsCaught} / ${ratsTotal}`, 0.8);
    }
  }

  if (!winShown && ratsCaught >= ratsTotal && ratsTotal > 0) {
    winShown = true;
    updatePerfHUD();
    showCenterMessage("YOU WIN!", 999);
  }
}

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

function drawOneRat(r, timeSec, idx) {
  const size = 0.75 + 0.25 * Math.sin(idx * 17.3);

  const base = new Matrix4();
  base.setIdentity();
  base.translate(r.x, 0.0, r.z);
  base.rotate(-r.yaw + 180, 0, 1, 0);
  base.scale(0.9 * size, 0.9 * size, 0.9 * size);

  const s = Math.sin(timeSec * 6.0);
  const thighA = 12 + 18 * s;
  const calfA  = -18 + 35 * Math.max(0, -s);
  const footA  = 6 + 12 * Math.sin(timeSec * 6.0 + Math.PI / 4);
  const headYaw = 8 * Math.sin(timeSec * 2.0);
  const tailSwing = 35 * Math.sin(timeSec * 7.0 + 0.7);

  const M = new Matrix4();
  function part(worldMat, color) { drawUnitCubeModel(worldMat, color); }

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

function drawRats(timeSec) {
  for (let i = 0; i < rats.length; i++) {
    drawOneRat(rats[i], timeSec + rats[i].phase, i);
  }
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

// ===================== LIGHTING STATE + UI =====================
let lightPos = new Vector3([20, 8, 20]);
let lightColor = new Vector3([1, 1, 1]);

let lightingOn = 1;
let normalViz = 0;

let spotOn = 0;
let spinLight = 0;

function setupLightingUI() {
  const lx = document.getElementById("lightX");
  const ly = document.getElementById("lightY");
  const lz = document.getElementById("lightZ");

  const lr = document.getElementById("lightR");
  const lg = document.getElementById("lightG");
  const lb = document.getElementById("lightB");

  const btnLighting = document.getElementById("toggleLighting");
  const btnNormals = document.getElementById("toggleNormals");
  const btnSpot = document.getElementById("toggleSpot");
  const btnSpin = document.getElementById("toggleSpin");

  function syncFromSliders() {
    lightPos.elements[0] = parseFloat(lx.value);
    lightPos.elements[1] = parseFloat(ly.value);
    lightPos.elements[2] = parseFloat(lz.value);

    lightColor.elements[0] = parseFloat(lr.value);
    lightColor.elements[1] = parseFloat(lg.value);
    lightColor.elements[2] = parseFloat(lb.value);
  }

  [lx,ly,lz,lr,lg,lb].forEach(el => el.addEventListener("input", syncFromSliders));
  syncFromSliders();

  btnLighting.addEventListener("click", () => {
    lightingOn = lightingOn ? 0 : 1;
    btnLighting.textContent = `Lighting: ${lightingOn ? "ON" : "OFF"}`;
  });

  btnNormals.addEventListener("click", () => {
    normalViz = normalViz ? 0 : 1;
    btnNormals.textContent = `Normals: ${normalViz ? "ON" : "OFF"}`;
  });

  btnSpot.addEventListener("click", () => {
    spotOn = spotOn ? 0 : 1;
    btnSpot.textContent = `Spotlight: ${spotOn ? "ON" : "OFF"}`;
  });

  btnSpin.addEventListener("click", () => {
    spinLight = spinLight ? 0 : 1;
    btnSpin.textContent = `Spin Light: ${spinLight ? "ON" : "OFF"}`;
  });
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

  // camera movement
  const moveSpeed = 0.18;
  const turnSpeed = 3.0;

  if (keys.has("w")) camera.moveForward(moveSpeed);
  if (keys.has("s")) camera.moveBackwards(moveSpeed);
  if (keys.has("a")) camera.moveLeft(moveSpeed);
  if (keys.has("d")) camera.moveRight(moveSpeed);
  if (keys.has("q")) camera.panLeft(turnSpeed);
  if (keys.has("e")) camera.panRight(turnSpeed);

  // animate light if enabled (circle around world center)
  if (spinLight) {
    const t = now * 0.001;
    const cx = WORLD_SIZE * 0.5;
    const cz = WORLD_SIZE * 0.5;
    lightPos.elements[0] = cx + Math.cos(t) * 18;
    lightPos.elements[2] = cz + Math.sin(t) * 18;
  }

  // update rats + catch
  updateRats(dt);
  catchRatsIfClose();
  updateCenterHud(dt);

  bindTexturesForDraw();

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.uniformMatrix4fv(uView, false, camera.viewMatrix.elements);
  gl.uniformMatrix4fv(uProj, false, camera.projectionMatrix.elements);

  // ===== set lighting uniforms every frame =====
  gl.uniform1i(uLightingOn, lightingOn);
  gl.uniform1i(uNormalViz, normalViz);

  gl.uniform3fv(uLightPos, lightPos.elements);
  gl.uniform3fv(uLightColor, lightColor.elements);
  gl.uniform3fv(uCameraPos, camera.eye.elements);

  // Spotlight: attach to camera like flashlight
  // spot position = camera eye, direction = normalize(at-eye)
  const fx = camera.at.elements[0] - camera.eye.elements[0];
  const fy = camera.at.elements[1] - camera.eye.elements[1];
  const fz = camera.at.elements[2] - camera.eye.elements[2];
  const fwd = new Vector3([fx, fy, fz]).normalize();

  gl.uniform1i(uSpotOn, spotOn);
  gl.uniform3fv(uSpotPos, camera.eye.elements);
  gl.uniform3fv(uSpotDir, fwd.elements);

  // angles (degrees): inner 12°, outer 18°
  const inner = Math.cos((12 * Math.PI) / 180);
  const outer = Math.cos((18 * Math.PI) / 180);
  gl.uniform1f(uSpotInner, inner);
  gl.uniform1f(uSpotOuter, outer);

  // ===== draw world =====
  drawBatch(vboGround, groundVertexCount, 0, 1.0, [1, 1, 1, 1]);
  drawBatch(vboWalls, wallVertexCount, 1, 1.0, [1, 1, 1, 1]);

  // rats (lit too, because they’re cubes with normals)
  drawRats(now / 1000);

  // ===== spheres (required) =====
{
  // Sphere 1
  const S1 = new Matrix4();
  S1.setIdentity();
  S1.translate(10, 1.5, 10);
  S1.scale(1.5, 1.5, 1.5);
  drawSphere(S1, [0.95, 0.2, 0.2, 1.0]); // red

  // Sphere 2
  const S2 = new Matrix4();
  S2.setIdentity();
  S2.translate(18, 1.5, 14);
  S2.scale(1.2, 1.2, 1.2);
  drawSphere(S2, [0.2, 0.6, 1.0, 1.0]);  // blue
}

// ===== OBJ model (required) =====
{
  const OM = new Matrix4();
  OM.setIdentity();
  OM.translate(14, 0.0, 20);
  OM.scale(1.0, 1.0, 1.0);

  // spin slowly so lighting is obvious
  OM.rotate((now * 0.02) % 360, 0, 1, 0);

  drawOBJ(OM, [0.85, 0.85, 0.85, 1.0]);
}


  // draw marker cube UNLIT so it's always visible
const prevLighting = lightingOn;
const prevNormalViz = normalViz;

gl.uniform1i(uLightingOn, 0);
gl.uniform1i(uNormalViz, 0);

const lightCube = new Matrix4();
lightCube.setIdentity();
lightCube.translate(lightPos.elements[0], lightPos.elements[1], lightPos.elements[2]);
lightCube.scale(0.45, 0.45, 0.45); // slightly bigger helps too
drawUnitCubeModel(lightCube, [1.0, 1.0, 0.2, 1.0]); // bright yellow marker

gl.uniform1i(uLightingOn, prevLighting);
gl.uniform1i(uNormalViz, prevNormalViz);

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

  // attrib locations
  aPosition = gl.getAttribLocation(program, "aPosition");
  aUV = gl.getAttribLocation(program, "aUV");
  aNormal = gl.getAttribLocation(program, "aNormal");
  if (aPosition < 0) throw new Error("aPosition not found");
  if (aUV < 0) throw new Error("aUV not found");
  if (aNormal < 0) throw new Error("aNormal not found");

  // uniform locations
  uModel = gl.getUniformLocation(program, "u_ModelMatrix");
  uView = gl.getUniformLocation(program, "u_ViewMatrix");
  uProj = gl.getUniformLocation(program, "u_ProjectionMatrix");
  uNormalMatrix = gl.getUniformLocation(program, "u_NormalMatrix");

  uBaseColor = gl.getUniformLocation(program, "u_BaseColor");
  uTexWeight = gl.getUniformLocation(program, "u_TexWeight");
  uWhichTex = gl.getUniformLocation(program, "u_WhichTex");
  uSampler0 = gl.getUniformLocation(program, "u_Sampler0");
  uSampler1 = gl.getUniformLocation(program, "u_Sampler1");

  uLightingOn = gl.getUniformLocation(program, "u_LightingOn");
  uNormalViz = gl.getUniformLocation(program, "u_NormalViz");
  uLightPos = gl.getUniformLocation(program, "u_LightPos");
  uLightColor = gl.getUniformLocation(program, "u_LightColor");
  uCameraPos = gl.getUniformLocation(program, "u_CameraPos");

  uSpotOn = gl.getUniformLocation(program, "u_SpotOn");
  uSpotPos = gl.getUniformLocation(program, "u_SpotPos");
  uSpotDir = gl.getUniformLocation(program, "u_SpotDir");
  uSpotInner = gl.getUniformLocation(program, "u_SpotInner");
  uSpotOuter = gl.getUniformLocation(program, "u_SpotOuter");

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.1, 0.1, 0.1, 1);

  resizeCanvasToDisplaySize(canvas);
  gl.viewport(0, 0, canvas.width, canvas.height);

  camera = new Camera(canvas);

  canvas.focus();
  canvas.addEventListener("click", () => canvas.focus());

  tex0 = await loadTexture(gl, 0, "./img/grass.png");
  tex1 = await loadTexture(gl, 1, "./img/wall.png");

  gl.uniform1i(uSampler0, 0);
  gl.uniform1i(uSampler1, 1);

  // ---- Sphere mesh ----
sphereMesh = new Sphere(28, 28);
sphereMesh.upload(gl);

// ---- OBJ model ----
try {
  const resp = await fetch("./obj/model.obj");
  const text = await resp.text();
  objModel = new OBJModel(text);
  objModel.upload(gl);
  objLoaded = true;
  console.log("OBJ loaded OK");
} catch (e) {
  console.warn("OBJ failed to load. Make sure ./obj/model.obj exists.", e);
  objLoaded = false;
}

  initUnitCubeVBO();
  buildGroundBatch();
  rebuildWallsBatch();

  spawnRats(RATS_COUNT);
  updatePerfHUD();

  setupKeyboardMovement();
  setupMouseLook();
  setupKeyboardEdit();

  setupLightingUI();

  requestAnimationFrame(tick);
}

main().catch((err) => {
  console.error(err);
  alert(err.message || String(err));
});
