// Easing function: ease-in-out quadratic (более эффективная версия)
export function easeInOut(t: number): number {
  // Убираем Math.pow для лучшей производительности
  return t < 0.5 ? 2 * t * t : -0.5 * (2 * t - 2) * (2 * t - 2) + 1
}

export class Vec3 {
  x: number
  y: number
  z: number

  constructor(x?: number, y?: number, z?: number) {
    this.x = x || 0
    this.y = y || 0
    this.z = z || 0
  }
  static TransformCoordinates(vector: Vec3, transformation: Mat4): Vec3 {
    const x = vector.x, y = vector.y, z = vector.z;
    const m = transformation.values;

    // Transform the coordinates
    const rx = x * m[0] + y * m[4] + z * m[8] + m[12];
    const ry = x * m[1] + y * m[5] + z * m[9] + m[13];
    const rz = x * m[2] + y * m[6] + z * m[10] + m[14];
    const rw = x * m[3] + y * m[7] + z * m[11] + m[15] || 1.0;

    // Perspective division
    if (Math.abs(rw) > 1e-8) {
      const invW = 1.0 / rw;
      return new Vec3(rx * invW, ry * invW, rz * invW);
    }

    return new Vec3(rx, ry, rz);
  }
  // Оптимизированные методы без изменения API
  add(other: Vec3): this {
    this.x += other.x;
    this.y += other.y;
    this.z += other.z;
    return this;
  }

  subtract(other: Vec3): this {
    this.x -= other.x;
    this.y -= other.y;
    this.z -= other.z;
    return this;
  }

  length(): number {
    // Кэшируем значения для избежания повторных обращений
    const x = this.x, y = this.y, z = this.z;
    return Math.sqrt(x * x + y * y + z * z);
  }

  normalize(): this {
    // Используем локальные переменные для оптимизации
    const x = this.x, y = this.y, z = this.z;
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 1e-8) { // Защита от деления на ноль
      const invLen = 1 / len;
      this.x = x * invLen;
      this.y = y * invLen;
      this.z = z * invLen;
    } else {
      this.x = this.y = this.z = 0;
    }
    return this;
  }

  cross(other: Vec3): this {
    // Локальные переменные для оптимизации и избежания side effects
    const x = this.x, y = this.y, z = this.z;
    const ox = other.x, oy = other.y, oz = other.z;

    this.x = y * oz - z * oy;
    this.y = z * ox - x * oz;
    this.z = x * oy - y * ox;
    return this;
  }
  static cross(a: Vec3, b: Vec3, out?: Vec3): Vec3 {
    const result = out || new Vec3();
    result.x = a.y * b.z - a.z * b.y;
    result.y = a.z * b.x - a.x * b.z;
    result.z = a.x * b.y - a.y * b.x;
    return result;
  }
  dot(other: Vec3): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  scale(scalar: number): this {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }
}

export class Quat {
  x: number
  y: number
  z: number
  w: number

  constructor(x?: number, y?: number, z?: number, w?: number) {
    this.x = x || 0
    this.y = y || 0
    this.z = z || 0
    this.w = w || 0
  }

  add(other: Quat): Quat {
    return new Quat(this.x + other.x, this.y + other.y, this.z + other.z, this.w + other.w)
  }

  clone(): Quat {
    return new Quat(this.x, this.y, this.z, this.w)
  }
  copyFromMat4(m: Float32Array): void {
    const m00 = m[0], m01 = m[4], m02 = m[8];
    const m10 = m[1], m11 = m[5], m12 = m[9];
    const m20 = m[2], m21 = m[6], m22 = m[10];

    const trace = m00 + m11 + m22;
    let x = 0, y = 0, z = 0, w = 1;

    if (trace > 0) {
      const s = Math.sqrt(trace + 1.0) * 2;
      w = 0.25 * s;
      x = (m21 - m12) / s;
      y = (m02 - m20) / s;
      z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
      w = (m21 - m12) / s;
      x = 0.25 * s;
      y = (m01 + m10) / s;
      z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
      w = (m02 - m20) / s;
      x = (m01 + m10) / s;
      y = 0.25 * s;
      z = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
      w = (m10 - m01) / s;
      x = (m02 + m20) / s;
      y = (m12 + m21) / s;
      z = 0.25 * s;
    }

    // Normalize the quaternion
    const len = Math.sqrt(x * x + y * y + z * z + w * w);
    if (len > 1e-8) {
      const invLen = 1 / len;
      this.x = x * invLen;
      this.y = y * invLen;
      this.z = z * invLen;
      this.w = w * invLen;
    } else {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.w = 1;
    }
  }
  toEulerAngles(): Vec3 {
    const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
    const qx2 = qx * qx, qy2 = qy * qy, qz2 = qz * qz, qw2 = qw * qw;
    const sinp = 2 * (qw * qy - qz * qx);

    let pitch: number;
    if (Math.abs(sinp) >= 1 - 1e-8) {
      pitch = Math.sign(sinp) * Math.PI / 2;
    } else {
      pitch = Math.asin(sinp);
    }

    let yaw: number, roll: number;

    if (Math.abs(Math.cos(pitch)) > 1e-8) {

      yaw = Math.atan2(
        2 * (qx * qy + qw * qz),
        qw2 - qx2 - qy2 + qz2
      );

      roll = Math.atan2(
        2 * (qy * qz + qw * qx),
        qw2 + qx2 - qy2 - qz2
      );
    } else {
      yaw = 0;
      roll = Math.atan2(
        -2 * (qx * qz - qw * qy),
        1 - 2 * (qy2 + qz2)
      );
    }

    return new Vec3(yaw, pitch, roll);
  }
  static RotationYawPitchRoll(yaw: number, pitch: number, roll: number): Quat {
    var result = new Quat()
    // Предварительно вычисляем синусы и косинусы половинных углов
    const halfYaw = yaw * 0.5;
    const halfPitch = pitch * 0.5;
    const halfRoll = roll * 0.5;

    const cy = Math.cos(halfYaw), sy = Math.sin(halfYaw);
    const cp = Math.cos(halfPitch), sp = Math.sin(halfPitch);
    const cr = Math.cos(halfRoll), sr = Math.sin(halfRoll);

    // Порядок вращений: Yaw (Y) -> Pitch (X) -> Roll (Z)
    // Это соответствует порядку YXZ

    // Вычисляем компоненты кватерниона
    result.x = sp * cy * cr - cp * sy * sr;
    result.y = cp * sy * cr + sp * cy * sr;
    result.z = cp * cy * sr - sp * sy * cr;
    result.w = cp * cy * cr + sp * sy * sr;

    // Нормализуем результат
    const x = result.x, y = result.y, z = result.z, w = result.w;
    const len = Math.sqrt(x * x + y * y + z * z + w * w);
    if (len > 1e-8) {
      const invLen = 1 / len;
      result.x = x * invLen;
      result.y = y * invLen;
      result.z = z * invLen;
      result.w = w * invLen;
    } else {
      result.x = 0;
      result.y = 0;
      result.z = 0;
      result.w = 1;
    }
    return result
  }
  static FromUnitVectorsToRef(
    vecFrom: Vec3,
    vecTo: Vec3,
    result: Quat,
    epsilon: number = 1e-6
  ): Quat {
    // Используем локальные переменные для оптимизации
    const fromX = vecFrom.x, fromY = vecFrom.y, fromZ = vecFrom.z;
    const toX = vecTo.x, toY = vecTo.y, toZ = vecTo.z;

    const dot = fromX * toX + fromY * toY + fromZ * toZ;

    // Проверяем, почти ли векторы идентичны
    if (dot > 1.0 - epsilon) {
      result.x = 0;
      result.y = 0;
      result.z = 0;
      result.w = 1;
      return result;
    }

    // Проверяем, почти ли векторы противоположны
    if (dot < -1.0 + epsilon) {
      // Находим перпендикулярную ось
      let axisX = fromY;
      let axisY = -fromX;
      let axisZ = 0;

      // Проверяем, не слишком ли маленькая ось
      const lenSq = axisX * axisX + axisY * axisY;
      if (lenSq < epsilon) {
        axisX = 0;
        axisY = fromZ;
        axisZ = -fromY;
      }

      // Нормализуем ось
      const len = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
      if (len > epsilon) {
        const invLen = 1 / len;
        result.x = axisX * invLen;
        result.y = axisY * invLen;
        result.z = axisZ * invLen;
        result.w = 0;
      } else {
        // Резервный вариант
        result.x = 1;
        result.y = 0;
        result.z = 0;
        result.w = 0;
      }
      return result;
    }

    // Общий случай
    const crossX = fromY * toZ - fromZ * toY;
    const crossY = fromZ * toX - fromX * toZ;
    const crossZ = fromX * toY - fromY * toX;

    const w = Math.sqrt((1 + dot) * 2);
    const invW = 1 / w;

    result.x = crossX * invW;
    result.y = crossY * invW;
    result.z = crossZ * invW;
    result.w = w * 0.5;

    // Нормализуем результат
    const x = result.x, y = result.y, z = result.z, w_val = result.w;
    const len = Math.sqrt(x * x + y * y + z * z + w_val * w_val);
    if (len > epsilon) {
      const invLen = 1 / len;
      result.x = x * invLen;
      result.y = y * invLen;
      result.z = z * invLen;
      result.w = w_val * invLen;
    } else {
      result.x = 0;
      result.y = 0;
      result.z = 0;
      result.w = 1;
    }

    return result;
  }
  static identity(): Quat {
    return new Quat(0, 0, 0, 1);
  }
  multiply(other: Quat): this {
    // Используем локальные переменные для оптимизации
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    const bx = other.x, by = other.y, bz = other.z, bw = other.w;

    this.x = aw * bx + ax * bw + ay * bz - az * by;
    this.y = aw * by - ax * bz + ay * bw + az * bx;
    this.z = aw * bz + ax * by - ay * bx + az * bw;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }

  conjugate(): Quat {
    return new Quat(-this.x, -this.y, -this.z, this.w)
  }

  length(): number {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  normalize(): this {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    const len = Math.sqrt(x * x + y * y + z * z + w * w);
    if (len > 1e-8) {
      const invLen = 1 / len;
      this.x = x * invLen;
      this.y = y * invLen;
      this.z = z * invLen;
      this.w = w * invLen;
    } else {
      this.x = this.y = this.z = 0;
      this.w = 1;
    }
    return this;
  }

  rotateVec(v: Vec3): Vec3 {
    // Оптимизированная версия с локальными переменными
    const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
    const vx = v.x, vy = v.y, vz = v.z;

    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);

    // result = v + q.w * t + cross(q.xyz, t)
    return new Vec3(
      vx + qw * tx + (qy * tz - qz * ty),
      vy + qw * ty + (qz * tx - qx * tz),
      vz + qw * tz + (qx * ty - qy * tx)
    );
  }

  rotate(v: Vec3): Vec3 {
    // Используем локальные переменные для оптимизации
    const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
    const vx = v.x, vy = v.y, vz = v.z;

    // u = (qx, qy, qz)
    const ux = qx, uy = qy, uz = qz;

    // uv = cross(u, v)
    const uvx = uy * vz - uz * vy;
    const uvy = uz * vx - ux * vz;
    const uvz = ux * vy - uy * vx;

    // uuv = cross(u, uv)
    const uuvx = uy * uvz - uz * uvy;
    const uuvy = uz * uvx - ux * uvz;
    const uuvz = ux * uvy - uy * uvx;

    return new Vec3(
      vx + 2 * qw * uvx + 2 * uuvx,
      vy + 2 * qw * uvy + 2 * uuvy,
      vz + 2 * qw * uvz + 2 * uuvz
    );
  }

  static fromTo(from: Vec3, to: Vec3): Quat {
    const dot = from.dot(to);
    if (dot > 0.999999) return new Quat(0, 0, 0, 1);
    if (dot < -0.999999) {
      // 180 degrees - используем более стабильную ось
      let axis = from.cross(new Vec3(1, 0, 0));
      if (axis.length() < 0.001) axis = from.cross(new Vec3(0, 1, 0));
      axis.normalize();
      return new Quat(axis.x, axis.y, axis.z, 0);
    }

    // Используем локальные переменные для оптимизации
    const axis = from.cross(to);
    const w = Math.sqrt((1 + dot) * 2);
    const invW = 1 / w;

    const q = new Quat(axis.x * invW, axis.y * invW, axis.z * invW, w * 0.5);
    return q.normalize();
  }

  toArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }

  static slerp(a: Quat, b: Quat, t: number): Quat {
    let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;

    // Take shorter path
    if (cos < 0) {
      cos = -cos;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }

    // Fast linear interpolation when quaternions are close
    if (cos > 0.9995) {
      const x = a.x + t * (bx - a.x);
      const y = a.y + t * (by - a.y);
      const z = a.z + t * (bz - a.z);
      const w = a.w + t * (bw - a.w);
      const invLen = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
      return new Quat(x * invLen, y * invLen, z * invLen, w * invLen);
    }

    // Standard SLERP
    const theta0 = Math.acos(cos);
    const sinTheta0 = Math.sin(theta0);
    const theta = theta0 * t;
    const sinTheta = Math.sin(theta);
    const s0 = Math.sin(theta0 - theta) / sinTheta0;
    const s1 = sinTheta / sinTheta0;

    return new Quat(
      s0 * a.x + s1 * bx,
      s0 * a.y + s1 * by,
      s0 * a.z + s1 * bz,
      s0 * a.w + s1 * bw
    );
  }

  static fromEuler(rotX: number, rotY: number, rotZ: number): Quat {
    // Предварительно вычисляем синусы и косинусы
    const halfX = rotX * 0.5;
    const halfY = rotY * 0.5;
    const halfZ = rotZ * 0.5;

    const cx = Math.cos(halfX), sx = Math.sin(halfX);
    const cy = Math.cos(halfY), sy = Math.sin(halfY);
    const cz = Math.cos(halfZ), sz = Math.sin(halfZ);

    // ZXY order (left-handed)
    const w = cy * cx * cz + sy * sx * sz;
    const x = cy * sx * cz + sy * cx * sz;
    const y = sy * cx * cz - cy * sx * sz;
    const z = cy * cx * sz - sy * sx * cz;

    const q = new Quat(x, y, z, w);
    return q.normalize();
  }

  toEuler(): Vec3 {
    const qx = this.x, qy = this.y, qz = this.z, qw = this.w;

    // Используем более стабильные вычисления
    const sinr_cosp = 2 * (qw * qx + qy * qz);
    const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
    const rotX = Math.atan2(sinr_cosp, cosr_cosp);

    const sinp = 2 * (qw * qy - qz * qx);
    const rotY = Math.abs(sinp) >= 1
      ? (sinp >= 0 ? Math.PI / 2 : -Math.PI / 2)
      : Math.asin(sinp);

    const siny_cosp = 2 * (qw * qz + qx * qy);
    const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
    const rotZ = Math.atan2(siny_cosp, cosy_cosp);

    return new Vec3(rotX, rotY, rotZ);
  }
}

export class Mat4 {
  values: Float32Array

  constructor(values?: Float32Array) {
    if (values) {
      this.values = values;
    } else {
      this.values = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]);
    }
  }
  static FromValues(values: Float32Array | number[]): Mat4 {
    if (values.length !== 16) {
      throw new Error('Mat4.FromValues requires exactly 16 values');
    }

    const array = values instanceof Float32Array
      ? new Float32Array(values)
      : new Float32Array(values.map(v => Number(v)));

    return new Mat4(array);
  }
  // Add to Mat4 class
  decompose(translation: Vec3, rotation: Quat, scale: Vec3): void {
    const m = this.values;

    // Extract translation (last column)
    translation.x = m[12];
    translation.y = m[13];
    translation.z = m[14];

    // Extract scale from basis vectors
    // Column 0 (x-axis)
    const sx = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
    // Column 1 (y-axis) 
    const sy = Math.sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6]);
    // Column 2 (z-axis)
    const sz = Math.sqrt(m[8] * m[8] + m[9] * m[9] + m[10] * m[10]);

    scale.x = sx;
    scale.y = sy;
    scale.z = sz;

    // Handle negative scale (determinant sign)
    const det =
      m[0] * (m[5] * m[10] - m[6] * m[9]) -
      m[1] * (m[4] * m[10] - m[6] * m[8]) +
      m[2] * (m[4] * m[9] - m[5] * m[8]);

    const sign = Math.sign(det) || 1;
    if (sign < 0) {
      scale.x = -scale.x;
    }

    // Early exit if scale is zero (degenerate matrix)
    const epsilon = 1e-8;
    if (Math.abs(sx) < epsilon || Math.abs(sy) < epsilon || Math.abs(sz) < epsilon) {
      rotation.x = 0;
      rotation.y = 0;
      rotation.z = 0;
      rotation.w = 1;
      return;
    }

    // Create normalized rotation matrix
    const invSx = 1 / sx;
    const invSy = 1 / sy;
    const invSz = 1 / sz;

    const rotMat = new Float32Array(16);

    // Column 0
    rotMat[0] = m[0] * invSx;
    rotMat[1] = m[1] * invSx;
    rotMat[2] = m[2] * invSx;

    // Column 1
    rotMat[4] = m[4] * invSy;
    rotMat[5] = m[5] * invSy;
    rotMat[6] = m[6] * invSy;

    // Column 2
    rotMat[8] = m[8] * invSz;
    rotMat[9] = m[9] * invSz;
    rotMat[10] = m[10] * invSz;

    // Column 3 (identity)
    rotMat[3] = 0;
    rotMat[7] = 0;
    rotMat[11] = 0;
    rotMat[12] = 0;
    rotMat[13] = 0;
    rotMat[14] = 0;
    rotMat[15] = 1;

    // Convert rotation matrix to quaternion
    rotation.copyFromMat4(rotMat);
  }

  // Add helper method to Quat class for conversion from matrix

  invert(): this {
    const m = this.values;
    const out = this.values; // In-place operation

    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (Math.abs(det) < 1e-10) {
      console.warn("Matrix is not invertible (determinant near zero)");
      return this.setIdentity();
    }

    const invDet = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * invDet;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * invDet;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * invDet;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * invDet;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * invDet;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * invDet;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * invDet;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * invDet;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;

    return this;
  }

  static FromUnitVectorsToRef(from: Vec3, to: Vec3, result: Mat4): void {
    const dot = from.dot(to);

    if (dot > 0.999999) {
      // Almost identical vectors - identity matrix
      result.setIdentity();
      return;
    }

    if (dot < -0.999999) {
      // Opposite direction - 180 degree rotation
      let axis = from.clone().cross(new Vec3(1, 0, 0));
      if (axis.length() < 0.001) {
        axis = from.clone().cross(new Vec3(0, 1, 0));
      }
      axis.normalize();

      const angle = Math.PI;
      const s = Math.sin(angle * 0.5);
      const qw = Math.cos(angle * 0.5);
      const quat = new Quat(axis.x * s, axis.y * s, axis.z * s, qw).normalize();
      Mat4.FromQuaternionToRef(quat, result);
      return;
    }

    // Normal case - create rotation matrix
    const cross = from.clone().cross(to);
    const cosTheta = dot;
    const sinTheta = cross.length();

    if (sinTheta < 1e-8) {
      result.setIdentity();
      return;
    }

    const invSin = 1.0 / sinTheta;
    const vx = cross.x * invSin;
    const vy = cross.y * invSin;
    const vz = cross.z * invSin;

    const c = cosTheta;
    const s = sinTheta;
    const t = 1 - c;

    const values = result.values;
    values[0] = t * vx * vx + c;
    values[1] = t * vx * vy + vz * s;
    values[2] = t * vx * vz - vy * s;
    values[3] = 0;

    values[4] = t * vx * vy - vz * s;
    values[5] = t * vy * vy + c;
    values[6] = t * vy * vz + vx * s;
    values[7] = 0;

    values[8] = t * vx * vz + vy * s;
    values[9] = t * vy * vz - vx * s;
    values[10] = t * vz * vz + c;
    values[11] = 0;

    values[12] = 0;
    values[13] = 0;
    values[14] = 0;
    values[15] = 1;
  }
  static FromQuaternionToRef(quat: Quat, result: Mat4): void {
    const x = quat.x, y = quat.y, z = quat.z, w = quat.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    const values = result.values;
    values[0] = 1 - (yy + zz);
    values[1] = xy + wz;
    values[2] = xz - wy;
    values[3] = 0;

    values[4] = xy - wz;
    values[5] = 1 - (xx + zz);
    values[6] = yz + wx;
    values[7] = 0;

    values[8] = xz + wy;
    values[9] = yz - wx;
    values[10] = 1 - (xx + yy);
    values[11] = 0;

    values[12] = 0;
    values[13] = 0;
    values[14] = 0;
    values[15] = 1;
  }
  static identity(): Mat4 {
    return new Mat4(new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]));
  }
  static multiplyArrays(
    a: Float32Array,
    aOffset: number,
    b: Float32Array,
    bOffset: number,
    out: Float32Array,
    outOffset: number
  ): void {
    // Колонка 0
    const b0_0 = b[bOffset + 0]
    const b0_1 = b[bOffset + 1]
    const b0_2 = b[bOffset + 2]
    const b0_3 = b[bOffset + 3]
    out[outOffset + 0] =
      a[aOffset + 0] * b0_0 + a[aOffset + 4] * b0_1 + a[aOffset + 8] * b0_2 + a[aOffset + 12] * b0_3
    out[outOffset + 1] =
      a[aOffset + 1] * b0_0 + a[aOffset + 5] * b0_1 + a[aOffset + 9] * b0_2 + a[aOffset + 13] * b0_3
    out[outOffset + 2] =
      a[aOffset + 2] * b0_0 + a[aOffset + 6] * b0_1 + a[aOffset + 10] * b0_2 + a[aOffset + 14] * b0_3
    out[outOffset + 3] =
      a[aOffset + 3] * b0_0 + a[aOffset + 7] * b0_1 + a[aOffset + 11] * b0_2 + a[aOffset + 15] * b0_3

    // Колонка 1
    const b1_0 = b[bOffset + 4]
    const b1_1 = b[bOffset + 5]
    const b1_2 = b[bOffset + 6]
    const b1_3 = b[bOffset + 7]
    out[outOffset + 4] =
      a[aOffset + 0] * b1_0 + a[aOffset + 4] * b1_1 + a[aOffset + 8] * b1_2 + a[aOffset + 12] * b1_3
    out[outOffset + 5] =
      a[aOffset + 1] * b1_0 + a[aOffset + 5] * b1_1 + a[aOffset + 9] * b1_2 + a[aOffset + 13] * b1_3
    out[outOffset + 6] =
      a[aOffset + 2] * b1_0 + a[aOffset + 6] * b1_1 + a[aOffset + 10] * b1_2 + a[aOffset + 14] * b1_3
    out[outOffset + 7] =
      a[aOffset + 3] * b1_0 + a[aOffset + 7] * b1_1 + a[aOffset + 11] * b1_2 + a[aOffset + 15] * b1_3

    // Колонка 2
    const b2_0 = b[bOffset + 8]
    const b2_1 = b[bOffset + 9]
    const b2_2 = b[bOffset + 10]
    const b2_3 = b[bOffset + 11]
    out[outOffset + 8] =
      a[aOffset + 0] * b2_0 + a[aOffset + 4] * b2_1 + a[aOffset + 8] * b2_2 + a[aOffset + 12] * b2_3
    out[outOffset + 9] =
      a[aOffset + 1] * b2_0 + a[aOffset + 5] * b2_1 + a[aOffset + 9] * b2_2 + a[aOffset + 13] * b2_3
    out[outOffset + 10] =
      a[aOffset + 2] * b2_0 + a[aOffset + 6] * b2_1 + a[aOffset + 10] * b2_2 + a[aOffset + 14] * b2_3
    out[outOffset + 11] =
      a[aOffset + 3] * b2_0 + a[aOffset + 7] * b2_1 + a[aOffset + 11] * b2_2 + a[aOffset + 15] * b2_3

    // Колонка 3
    const b3_0 = b[bOffset + 12]
    const b3_1 = b[bOffset + 13]
    const b3_2 = b[bOffset + 14]
    const b3_3 = b[bOffset + 15]
    out[outOffset + 12] =
      a[aOffset + 0] * b3_0 + a[aOffset + 4] * b3_1 + a[aOffset + 8] * b3_2 + a[aOffset + 12] * b3_3
    out[outOffset + 13] =
      a[aOffset + 1] * b3_0 + a[aOffset + 5] * b3_1 + a[aOffset + 9] * b3_2 + a[aOffset + 13] * b3_3
    out[outOffset + 14] =
      a[aOffset + 2] * b3_0 + a[aOffset + 6] * b3_1 + a[aOffset + 10] * b3_2 + a[aOffset + 14] * b3_3
    out[outOffset + 15] =
      a[aOffset + 3] * b3_0 + a[aOffset + 7] * b3_1 + a[aOffset + 11] * b3_2 + a[aOffset + 15] * b3_3
  }
  static perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1.0 / Math.tan(fov * 0.5); // Оптимизация: fov/2 -> fov*0.5
    const range = far - near;
    const rangeInv = 1.0 / range;

    return new Mat4(new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * rangeInv, 1,
      0, 0, -2 * near * far * rangeInv, 0,
    ]));
  }

  static lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    // Используем локальные переменные для оптимизации
    const forward = target.clone().subtract(eye).normalize();
    const right = up.clone().cross(forward).normalize();
    const upVec = forward.clone().cross(right).normalize();

    const eyeDotRight = -right.dot(eye);
    const eyeDotUp = -upVec.dot(eye);
    const eyeDotForward = -forward.dot(eye);

    return new Mat4(new Float32Array([
      right.x, upVec.x, forward.x, 0,
      right.y, upVec.y, forward.y, 0,
      right.z, upVec.z, forward.z, 0,
      eyeDotRight, eyeDotUp, eyeDotForward, 1,
    ]));
  }

  multiply(other: Mat4): Mat4 {
    // Используем локальные переменные для оптимизации
    const a = this.values;
    const b = other.values;
    const out = new Float32Array(16);

    // Ручное развертывание цикла для оптимизации
    // Column 0
    out[0] = a[0] * b[0] + a[4] * b[1] + a[8] * b[2] + a[12] * b[3];
    out[1] = a[1] * b[0] + a[5] * b[1] + a[9] * b[2] + a[13] * b[3];
    out[2] = a[2] * b[0] + a[6] * b[1] + a[10] * b[2] + a[14] * b[3];
    out[3] = a[3] * b[0] + a[7] * b[1] + a[11] * b[2] + a[15] * b[3];

    // Column 1
    out[4] = a[0] * b[4] + a[4] * b[5] + a[8] * b[6] + a[12] * b[7];
    out[5] = a[1] * b[4] + a[5] * b[5] + a[9] * b[6] + a[13] * b[7];
    out[6] = a[2] * b[4] + a[6] * b[5] + a[10] * b[6] + a[14] * b[7];
    out[7] = a[3] * b[4] + a[7] * b[5] + a[11] * b[6] + a[15] * b[7];

    // Column 2
    out[8] = a[0] * b[8] + a[4] * b[9] + a[8] * b[10] + a[12] * b[11];
    out[9] = a[1] * b[8] + a[5] * b[9] + a[9] * b[10] + a[13] * b[11];
    out[10] = a[2] * b[8] + a[6] * b[9] + a[10] * b[10] + a[14] * b[11];
    out[11] = a[3] * b[8] + a[7] * b[9] + a[11] * b[10] + a[15] * b[11];

    // Column 3
    out[12] = a[0] * b[12] + a[4] * b[13] + a[8] * b[14] + a[12] * b[15];
    out[13] = a[1] * b[12] + a[5] * b[13] + a[9] * b[14] + a[13] * b[15];
    out[14] = a[2] * b[12] + a[6] * b[13] + a[10] * b[14] + a[14] * b[15];
    out[15] = a[3] * b[12] + a[7] * b[13] + a[11] * b[14] + a[15] * b[15];

    return new Mat4(out);
  }

  clone(): Mat4 {
    return new Mat4(this.values.slice());
  }

  static fromQuat(x: number, y: number, z: number, w: number): Mat4 {
    // Локальные переменные для оптимизации
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    return new Mat4(new Float32Array([
      1 - (yy + zz), xy + wz, xz - wy, 0,
      xy - wz, 1 - (xx + zz), yz + wx, 0,
      xz + wy, yz - wx, 1 - (xx + yy), 0,
      0, 0, 0, 1
    ]));
  }

  static fromPositionRotation(position: Vec3, rotation: Quat): Mat4 {
    const mat = Mat4.fromQuat(rotation.x, rotation.y, rotation.z, rotation.w);
    const values = mat.values;
    values[12] = position.x;
    values[13] = position.y;
    values[14] = position.z;
    return mat;
  }

  getPosition(): Vec3 {
    return new Vec3(this.values[12], this.values[13], this.values[14]);
  }

  toQuat(): Quat {
    return Mat4.toQuatFromArray(this.values, 0);
  }

  static toQuatFromArray(m: Float32Array, offset: number): Quat {
    const m00 = m[offset + 0], m01 = m[offset + 4], m02 = m[offset + 8];
    const m10 = m[offset + 1], m11 = m[offset + 5], m12 = m[offset + 9];
    const m20 = m[offset + 2], m21 = m[offset + 6], m22 = m[offset + 10];

    const trace = m00 + m11 + m22;
    let x = 0, y = 0, z = 0, w = 1;

    if (trace > 0) {
      const s = Math.sqrt(trace + 1.0) * 2;
      w = 0.25 * s;
      x = (m21 - m12) / s;
      y = (m02 - m20) / s;
      z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
      w = (m21 - m12) / s;
      x = 0.25 * s;
      y = (m01 + m10) / s;
      z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
      w = (m02 - m20) / s;
      x = (m01 + m10) / s;
      y = 0.25 * s;
      z = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
      w = (m10 - m01) / s;
      x = (m02 + m20) / s;
      y = (m12 + m21) / s;
      z = 0.25 * s;
    }

    const len = Math.sqrt(x * x + y * y + z * z + w * w);
    if (len > 1e-8) {
      const invLen = 1 / len;
      return new Quat(x * invLen, y * invLen, z * invLen, w * invLen);
    }
    return new Quat(0, 0, 0, 1);
  }

  setIdentity(): this {
    const v = this.values;
    v[0] = 1; v[1] = 0; v[2] = 0; v[3] = 0;
    v[4] = 0; v[5] = 1; v[6] = 0; v[7] = 0;
    v[8] = 0; v[9] = 0; v[10] = 1; v[11] = 0;
    v[12] = 0; v[13] = 0; v[14] = 0; v[15] = 1;
    return this;
  }

  translateInPlace(tx: number, ty: number, tz: number): this {
    this.values[12] += tx;
    this.values[13] += ty;
    this.values[14] += tz;
    return this;
  }

  inverse(): Mat4 {
    const m = this.values;
    const out = new Float32Array(16);

    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (Math.abs(det) < 1e-10) {
      console.warn("Matrix is not invertible (determinant near zero)");
      return Mat4.identity();
    }

    const invDet = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * invDet;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * invDet;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * invDet;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * invDet;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * invDet;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * invDet;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * invDet;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * invDet;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;

    return new Mat4(out);
  }
}