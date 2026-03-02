// Camera.js

export default class Camera {
  constructor(canvas) {
    this.fov = 60;

    // start position (center-ish, above ground)
    this.eye = new Vector3([16, 2.2, 30]);
    this.at  = new Vector3([16, 2.2, 29]);
    this.up  = new Vector3([0, 1, 0]);

    this.viewMatrix = new Matrix4();
    this.projectionMatrix = new Matrix4();

    // compute initial yaw from eye->at
    const fx = this.at.elements[0] - this.eye.elements[0];
    const fz = this.at.elements[2] - this.eye.elements[2];
    this.yawDeg = (Math.atan2(fz, fx) * 180) / Math.PI;

    this.pitchDeg = 0;
    this.pitchLimit = 89;

    this._recalcAt();
    this._updateView();
    this._updateProjection(canvas);
  }

  onResize(canvas) {
    this._updateProjection(canvas);
  }

  _updateView() {
    this.viewMatrix.setLookAt(
      this.eye.elements[0], this.eye.elements[1], this.eye.elements[2],
      this.at.elements[0],  this.at.elements[1],  this.at.elements[2],
      this.up.elements[0],  this.up.elements[1],  this.up.elements[2]
    );
  }

  _updateProjection(canvas) {
    const aspect = canvas.width / canvas.height;
    this.projectionMatrix.setPerspective(this.fov, aspect, 0.1, 1000);
  }

  _recalcAt() {
    const yawRad = (this.yawDeg * Math.PI) / 180;
    const pitchRad = (this.pitchDeg * Math.PI) / 180;

    const fx = Math.cos(pitchRad) * Math.cos(yawRad);
    const fy = Math.sin(pitchRad);
    const fz = Math.cos(pitchRad) * Math.sin(yawRad);

    this.at.set(this.eye);
    this.at.add(new Vector3([fx, fy, fz]));
  }

  _moveForwardVec() {
    const yawRad = (this.yawDeg * Math.PI) / 180;
    const fx = Math.cos(yawRad);
    const fz = Math.sin(yawRad);
    return new Vector3([fx, 0, fz]).normalize();
  }

  moveForward(speed) {
    const f = this._moveForwardVec().mul(speed);
    this.eye.add(f);
    this._recalcAt();
    this._updateView();
  }

  moveBackwards(speed) {
    const f = this._moveForwardVec().mul(speed);
    this.eye.sub(f);
    this._recalcAt();
    this._updateView();
  }

  moveLeft(speed) {
    const f = this._moveForwardVec();
    const s = Vector3.cross(this.up, f).normalize().mul(speed);
    this.eye.add(s);
    this._recalcAt();
    this._updateView();
  }

  moveRight(speed) {
    const f = this._moveForwardVec();
    const s = Vector3.cross(f, this.up).normalize().mul(speed);
    this.eye.add(s);
    this._recalcAt();
    this._updateView();
  }

  panLeft(deg)  { this.yaw(-deg); }
  panRight(deg) { this.yaw(deg); }

  yaw(deltaDeg) {
    this.yawDeg += deltaDeg;
    this._recalcAt();
    this._updateView();
  }

  pitch(deltaDeg) {
    this.pitchDeg = Math.max(
      -this.pitchLimit,
      Math.min(this.pitchLimit, this.pitchDeg + deltaDeg)
    );
    this._recalcAt();
    this._updateView();
  }
}
