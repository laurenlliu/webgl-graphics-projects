// OBJModel.js

export default class OBJModel {
  constructor(objText) {
    const parsed = OBJModel.parse(objText);
    this.data = parsed.data;
    this.count = parsed.count;

    this.vbo = null;
  }

  static parse(text) {
    const positions = [[0,0,0]];
    const uvs       = [[0,0]];
    const normals   = [[0,0,1]];

    const out = [];

    const lines = text.split("\n");
    for (let raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;

      const parts = line.split(/\s+/);
      const tag = parts[0];

      if (tag === "v") {
        positions.push([+parts[1], +parts[2], +parts[3]]);
      } else if (tag === "vt") {
        uvs.push([+parts[1], +parts[2]]);
      } else if (tag === "vn") {
        normals.push([+parts[1], +parts[2], +parts[3]]);
      } else if (tag === "f") {
        const face = parts.slice(1).map(tok => {
          const [vi, ti, ni] = tok.split("/").map(s => (s ? parseInt(s,10) : 0));
          return { vi: vi || 0, ti: ti || 0, ni: ni || 0 };
        });

        for (let i = 1; i + 1 < face.length; i++) {
          OBJModel._pushVertex(out, positions, uvs, normals, face[0]);
          OBJModel._pushVertex(out, positions, uvs, normals, face[i]);
          OBJModel._pushVertex(out, positions, uvs, normals, face[i+1]);
        }
      }
    }

    const data = new Float32Array(out);
    return { data, count: data.length / 8 };
  }

  static _pushVertex(out, P, T, N, idx) {
    const p = P[idx.vi] || [0,0,0];
    const t = T[idx.ti] || [0,0];
    const n = N[idx.ni] || [0,0,1];
    out.push(p[0], p[1], p[2], t[0], t[1], n[0], n[1], n[2]);
  }

  upload(gl) {
    if (this.vbo) return;
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.STATIC_DRAW);
  }

  bind(gl, aPosition, aUV, aNormal) {
    const stride = 8 * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aPosition);

    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(aUV);

    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, stride, 5 * 4);
    gl.enableVertexAttribArray(aNormal);
  }

  draw(gl) {
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
  }
}
