// Sphere.js

export default class Sphere {
  constructor(latBands = 24, lonBands = 24) {
    this.latBands = latBands;
    this.lonBands = lonBands;

    const { data, count } = Sphere._build(latBands, lonBands);
    this.data = data;
    this.count = count;

    this.vbo = null;
  }

  static _build(latBands, lonBands) {
    const verts = [];

    function pushVertex(px, py, pz, u, v) {
      // for unit sphere centered at origin: normal = position
      const nx = px, ny = py, nz = pz;
      verts.push(px, py, pz, u, v, nx, ny, nz);
    }

    // triangles
    for (let lat = 0; lat < latBands; lat++) {
      const t0 = (lat / latBands) * Math.PI;
      const t1 = ((lat + 1) / latBands) * Math.PI;

      for (let lon = 0; lon < lonBands; lon++) {
        const p0 = (lon / lonBands) * (2 * Math.PI);
        const p1 = ((lon + 1) / lonBands) * (2 * Math.PI);

        // 4 points of quad on sphere
        const x00 = Math.sin(t0) * Math.cos(p0);
        const y00 = Math.cos(t0);
        const z00 = Math.sin(t0) * Math.sin(p0);

        const x01 = Math.sin(t0) * Math.cos(p1);
        const y01 = Math.cos(t0);
        const z01 = Math.sin(t0) * Math.sin(p1);

        const x10 = Math.sin(t1) * Math.cos(p0);
        const y10 = Math.cos(t1);
        const z10 = Math.sin(t1) * Math.sin(p0);

        const x11 = Math.sin(t1) * Math.cos(p1);
        const y11 = Math.cos(t1);
        const z11 = Math.sin(t1) * Math.sin(p1);

        const u0 = lon / lonBands;
        const u1 = (lon + 1) / lonBands;
        const v0 = lat / latBands;
        const v1 = (lat + 1) / latBands;

        // two triangles: (00,10,11) (00,11,01)
        pushVertex(x00, y00, z00, u0, v0);
        pushVertex(x10, y10, z10, u0, v1);
        pushVertex(x11, y11, z11, u1, v1);

        pushVertex(x00, y00, z00, u0, v0);
        pushVertex(x11, y11, z11, u1, v1);
        pushVertex(x01, y01, z01, u1, v0);
      }
    }

    const data = new Float32Array(verts);
    return { data, count: data.length / 8 };
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
