// Кэшированные значения для часто используемых констант
const MATH_PI = Math.PI;
const MATH_PI_HALF = MATH_PI * 0.5;
const MATH_PI_QUARTER = MATH_PI * 0.25;
const EPSILON = 1e-8;
const EPSILON_SQ = 1e-16;

// Предварительно вычисленные значения для оптимизации тригонометрических функций
const SIN_COS_CACHE = new Map<number, { sin: number; cos: number }>();

// Функция для получения синуса и косинуса с кэшированием
function getSinCos(angle: number): { sin: number; cos: number } {
  const key = Math.round(angle * 1000000); // Ключ для кэша
  let cached = SIN_COS_CACHE.get(key);
  if (!cached) {
    cached = {
      sin: Math.sin(angle),
      cos: Math.cos(angle)
    };
    // Ограничиваем размер кэша чтобы не съесть всю память
    if (SIN_COS_CACHE.size > 1000) {
      const firstKey = SIN_COS_CACHE.keys().next().value;
      if (firstKey)
        SIN_COS_CACHE.delete(firstKey);
    }
    SIN_COS_CACHE.set(key, cached);
  }
  return cached;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -0.5 * (2 * t - 2) * (2 * t - 2) + 1;
}

export class ObjectPool<T> {
  private pool: T[] = [];
  private creator: () => T;

  constructor(creator: () => T) {
    this.creator = creator;
  }

  acquire(): T {
    return this.pool.pop() || this.creator();
  }

  release(obj: T): void {
    this.pool.push(obj);
  }

  clear(): void {
    this.pool = [];
  }

  get size(): number {
    return this.pool.length;
  }
}

// Глобальные пулы для переиспользования объектов
export const VEC3_POOL = new ObjectPool<Vec3>(() => new Vec3());
export const QUAT_POOL = new ObjectPool<Quat>(() => new Quat());
export const MAT4_POOL = new ObjectPool<Mat4>(() => new Mat4());


export class Vec3 {
  x: number;
  y: number;
  z: number;

  constructor(x?: number, y?: number, z?: number) {
    this.x = x || 0;                
    this.y = y || 0;
    this.z = z || 0;
  }
  distanceTo(other: Vec3): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  // Оптимизированная версия с использованием пула
  static TransformCoordinates(vector: Vec3, transformation: Mat4): Vec3 {
    const x = vector.x, y = vector.y, z = vector.z;
    const m = transformation.values;
    const rx = x * m[0] + y * m[4] + z * m[8] + m[12];
    const ry = x * m[1] + y * m[5] + z * m[9] + m[13];
    const rz = x * m[2] + y * m[6] + z * m[10] + m[14];
    const rw = x * m[3] + y * m[7] + z * m[11] + m[15] || 1.0;
    if (Math.abs(rw) > EPSILON) {
      const invW = 1.0 / rw;
      return new Vec3(rx * invW, ry * invW, rz * invW);
    }

    return new Vec3(rx, ry, rz);
  }

  // Оптимизированные методы с инлайнингом вычислений
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
    const x = this.x, y = this.y, z = this.z;
    return Math.sqrt(x * x + y * y + z * z);
  }

  lengthSquared(): number {
    const x = this.x, y = this.y, z = this.z;
    return x * x + y * y + z * z;
  }

  normalize(): this {
    const x = this.x, y = this.y, z = this.z;
    const lenSq = x * x + y * y + z * z;

    if (lenSq > EPSILON_SQ) {
      const invLen = 1 / Math.sqrt(lenSq);
      this.x = x * invLen;
      this.y = y * invLen;
      this.z = z * invLen;
    } else {
      this.x = this.y = this.z = 0;
    }
    return this;
  }

  cross(other: Vec3): this {
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

  // Новый метод для быстрого сброса значений
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  // Метод для переиспользования объекта из пула
  free(): void {
    VEC3_POOL.release(this);
  }
}

export class Quat {
  x: number;
  y: number;
  z: number;
  w: number;

  constructor(x?: number, y?: number, z?: number, w?: number) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.w = w || 0;
  }

  // Оптимизированные методы с использованием пула
  static identity(): Quat {
    return new Quat(0, 0, 0, 1);
  }
  toEulerAngles(): Vec3 {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    const sinX = 2 * (y * z - w * x);
    const clampedSinX = Math.max(-1, Math.min(1, sinX));
    const rotX = Math.asin(clampedSinX);

    let rotY: number;
    let rotZ: number;
    if (Math.abs(clampedSinX) > 0.999) {
      rotZ = 0;
      rotY = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + y * y));
    } else {
      rotY = Math.atan2(-(2 * x * z + 2 * w * y), 1 - 2 * (x * x + y * y));
      rotZ = Math.atan2(2 * x * y + 2 * w * z, 1 - 2 * (x * x + z * z));
    }

    const result = VEC3_POOL.acquire();
    result.set(rotX, rotY, rotZ);
    return result;
  }
  multiply(other: Quat): this {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    const bx = other.x, by = other.y, bz = other.z, bw = other.w;

    this.x = aw * bx + ax * bw + ay * bz - az * by;
    this.y = aw * by - ax * bz + ay * bw + az * bx;
    this.z = aw * bz + ax * by - ay * bx + az * bw;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }

  conjugate(): Quat {
    return new Quat(-this.x, -this.y, -this.z, this.w);
  }

  length(): number {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  lengthSquared(): number {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    return x * x + y * y + z * z + w * w;
  }

  normalize(): this {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    const lenSq = x * x + y * y + z * z + w * w;

    if (lenSq > EPSILON_SQ) {
      const invLen = 1 / Math.sqrt(lenSq);
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

  // Оптимизированная версия rotateVec
  rotateVec(v: Vec3): Vec3 {
    const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
    const vx = v.x, vy = v.y, vz = v.z;

    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);

    return new Vec3(
      vx + qw * tx + (qy * tz - qz * ty),
      vy + qw * ty + (qz * tx - qx * tz),
      vz + qw * tz + (qx * ty - qy * tx)
    );
  }

  // Ультра-оптимизированный SLERP
  static slerp(a: Quat, b: Quat, t: number): Quat {
    let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;

    if (cos < 0) {
      cos = -cos;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }

    // Быстрая линейная интерполяция когда кватернионы близки
    if (cos > 0.9995) {
      const x = a.x + t * (bx - a.x);
      const y = a.y + t * (by - a.y);
      const z = a.z + t * (bz - a.z);
      const w = a.w + t * (bw - a.w);
      const invLen = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
      return new Quat(x * invLen, y * invLen, z * invLen, w * invLen);
    }

    // Стандартный SLERP с оптимизацией
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
  // Оптимизированное создание из углов Эйлера
  static fromEuler(rotX: number, rotY: number, rotZ: number): Quat {
    const halfX = rotX * 0.5;
    const halfY = rotY * 0.5;
    const halfZ = rotZ * 0.5;

    const scx = getSinCos(halfX);
    const scy = getSinCos(halfY);
    const scz = getSinCos(halfZ);

    const sx = scx.sin, cx = scx.cos;
    const sy = scy.sin, cy = scy.cos;
    const sz = scz.sin, cz = scz.cos;

    // ZXY order (left-handed)
    const w = cy * cx * cz + sy * sx * sz;
    const x = cy * sx * cz + sy * cx * sz;
    const y = sy * cx * cz - cy * sx * sz;
    const z = cy * cx * sz - sy * sx * cz;

    const q = new Quat(x, y, z, w);
    return q.normalize();
  }

  toArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }

  // Метод для переиспользования объекта из пула
  free(): void {
    QUAT_POOL.release(this);
  }

  // Новый метод для быстрого сброса значений
  set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
}

export class Mat4 {
  values: Float32Array;

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
  static fromPositionRotation(position: Vec3, rotation: Quat): Mat4 {
    const x = rotation.x, y = rotation.y, z = rotation.z, w = rotation.w;

    // Предварительные вычисления для оптимизации
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    return new Mat4(new Float32Array([
      1 - (yy + zz), xy + wz, xz - wy, 0,
      xy - wz, 1 - (xx + zz), yz + wx, 0,
      xz + wy, yz - wx, 1 - (xx + yy), 0,
      position.x, position.y, position.z, 1
    ]));
  }

  // Альтернативная версия с использованием пула для переиспользования памяти
  static fromPositionRotationToRef(position: Vec3, rotation: Quat, result: Mat4): void {
    const x = rotation.x, y = rotation.y, z = rotation.z, w = rotation.w;
    const values = result.values;

    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

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

    values[12] = position.x;
    values[13] = position.y;
    values[14] = position.z;
    values[15] = 1;
  }
  clone(): Mat4 {
    return new Mat4(new Float32Array(this.values));
  }
  translate(tx: number, ty: number, tz: number): this {
    const v = this.values;

    // Умножаем текущую матрицу на матрицу переноса
    // Матрица переноса:
    // [1, 0, 0, 0]
    // [0, 1, 0, 0]
    // [0, 0, 1, 0]
    // [tx, ty, tz, 1]

    v[12] = v[0] * tx + v[4] * ty + v[8] * tz + v[12];
    v[13] = v[1] * tx + v[5] * ty + v[9] * tz + v[13];
    v[14] = v[2] * tx + v[6] * ty + v[10] * tz + v[14];
    v[15] = v[3] * tx + v[7] * ty + v[11] * tz + v[15];

    return this;
  }
  // Версия с дополнительным масштабированием (если понадобится)
  static fromPositionRotationScale(position: Vec3, rotation: Quat, scale: Vec3): Mat4 {
    const x = rotation.x, y = rotation.y, z = rotation.z, w = rotation.w;
    const sx = scale.x, sy = scale.y, sz = scale.z;

    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    return new Mat4(new Float32Array([
      (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
      (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
      (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
      position.x, position.y, position.z, 1
    ]));
  }

  // ... остальные существующие методы Mat4 ...

  // Оптимизированная версия decompose с использованием локальных переменных
  decompose(translation: Vec3, rotation: Quat, scale: Vec3): void {
    const m = this.values;

    // Extract translation
    translation.x = m[12];
    translation.y = m[13];
    translation.z = m[14];

    // Extract scale from basis vectors with optimized length calculations
    const sx = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
    const sy = Math.sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6]);
    const sz = Math.sqrt(m[8] * m[8] + m[9] * m[9] + m[10] * m[10]);

    scale.x = sx;
    scale.y = sy;
    scale.z = sz;

    // Handle negative scale (determinant sign)
    const det = m[0] * (m[5] * m[10] - m[6] * m[9])
      - m[1] * (m[4] * m[10] - m[6] * m[8])
      + m[2] * (m[4] * m[9] - m[5] * m[8]);

    const sign = Math.sign(det) || 1;
    if (sign < 0) {
      scale.x = -scale.x;
    }

    // Early exit for degenerate matrix
    if (Math.abs(sx) < EPSILON || Math.abs(sy) < EPSILON || Math.abs(sz) < EPSILON) {
      rotation.x = 0;
      rotation.y = 0;
      rotation.z = 0;
      rotation.w = 1;
      return;
    }

    // Extract rotation from normalized matrix
    const invSx = 1 / sx;
    const invSy = 1 / sy;
    const invSz = 1 / sz;

    // Используем локальный массив вместо создания нового Mat4
    const r00 = m[0] * invSx, r01 = m[1] * invSx, r02 = m[2] * invSx;
    const r10 = m[4] * invSy, r11 = m[5] * invSy, r12 = m[6] * invSy;
    const r20 = m[8] * invSz, r21 = m[9] * invSz, r22 = m[10] * invSz;

    // Convert 3x3 rotation matrix to quaternion
    const trace = r00 + r11 + r22;
    let x, y, z, w;

    if (trace > 0) {
      const s = Math.sqrt(trace + 1.0) * 2;
      w = 0.25 * s;
      x = (r21 - r12) / s;
      y = (r02 - r20) / s;
      z = (r10 - r01) / s;
    } else if (r00 > r11 && r00 > r22) {
      const s = Math.sqrt(1.0 + r00 - r11 - r22) * 2;
      w = (r21 - r12) / s;
      x = 0.25 * s;
      y = (r01 + r10) / s;
      z = (r02 + r20) / s;
    } else if (r11 > r22) {
      const s = Math.sqrt(1.0 + r11 - r00 - r22) * 2;
      w = (r02 - r20) / s;
      x = (r01 + r10) / s;
      y = 0.25 * s;
      z = (r12 + r21) / s;
    } else {
      const s = Math.sqrt(1.0 + r22 - r00 - r11) * 2;
      w = (r10 - r01) / s;
      x = (r02 + r20) / s;
      y = (r12 + r21) / s;
      z = 0.25 * s;
    }

    // Нормализация кватерниона
    const lenSq = x * x + y * y + z * z + w * w;
    if (lenSq > EPSILON_SQ) {
      const invLen = 1 / Math.sqrt(lenSq);
      rotation.x = x * invLen;
      rotation.y = y * invLen;
      rotation.z = z * invLen;
      rotation.w = w * invLen;
    } else {
      rotation.x = 0;
      rotation.y = 0;
      rotation.z = 0;
      rotation.w = 1;
    }
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
  getPosition(): Vec3 {
    return new Vec3(this.values[12], this.values[13], this.values[14]);
  }
  // Оптимизированные статические методы
  static identity(): Mat4 {
    return new Mat4(new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]));
  }

  // Ультра-оптимизированное умножение матриц
  static multiplyArrays(
    a: Float32Array,
    aOffset: number,
    b: Float32Array,
    bOffset: number,
    out: Float32Array,
    outOffset: number
  ): void {
    const a00 = a[aOffset], a01 = a[aOffset + 1], a02 = a[aOffset + 2], a03 = a[aOffset + 3];
    const a10 = a[aOffset + 4], a11 = a[aOffset + 5], a12 = a[aOffset + 6], a13 = a[aOffset + 7];
    const a20 = a[aOffset + 8], a21 = a[aOffset + 9], a22 = a[aOffset + 10], a23 = a[aOffset + 11];
    const a30 = a[aOffset + 12], a31 = a[aOffset + 13], a32 = a[aOffset + 14], a33 = a[aOffset + 15];

    let b0 = b[bOffset], b1 = b[bOffset + 1], b2 = b[bOffset + 2], b3 = b[bOffset + 3];
    out[outOffset] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[outOffset + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[outOffset + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[outOffset + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;

    b0 = b[bOffset + 4]; b1 = b[bOffset + 5]; b2 = b[bOffset + 6]; b3 = b[bOffset + 7];
    out[outOffset + 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[outOffset + 5] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[outOffset + 6] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[outOffset + 7] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;

    b0 = b[bOffset + 8]; b1 = b[bOffset + 9]; b2 = b[bOffset + 10]; b3 = b[bOffset + 11];
    out[outOffset + 8] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[outOffset + 9] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[outOffset + 10] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[outOffset + 11] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;

    b0 = b[bOffset + 12]; b1 = b[bOffset + 13]; b2 = b[bOffset + 14]; b3 = b[bOffset + 15];
    out[outOffset + 12] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[outOffset + 13] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[outOffset + 14] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[outOffset + 15] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }

  // Оптимизированное создание матрицы перспективы
  static perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1.0 / Math.tan(fov * 0.5);
    const rangeInv = 1.0 / (far - near);

    return new Mat4(new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * rangeInv, 1,
      0, 0, -2 * near * far * rangeInv, 0,
    ]));
  }

  // Оптимизированный lookAt
  static lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    const forwardX = target.x - eye.x;
    const forwardY = target.y - eye.y;
    const forwardZ = target.z - eye.z;

    // Нормализация forward
    const forwardLen = Math.sqrt(forwardX * forwardX + forwardY * forwardY + forwardZ * forwardZ);
    const invForwardLen = forwardLen > EPSILON ? 1.0 / forwardLen : 0;
    const fX = forwardX * invForwardLen;
    const fY = forwardY * invForwardLen;
    const fZ = forwardZ * invForwardLen;

    // Right = up x forward
    const rightX = up.y * fZ - up.z * fY;
    const rightY = up.z * fX - up.x * fZ;
    const rightZ = up.x * fY - up.y * fX;

    // Нормализация right
    const rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
    const invRightLen = rightLen > EPSILON ? 1.0 / rightLen : 0;
    const rX = rightX * invRightLen;
    const rY = rightY * invRightLen;
    const rZ = rightZ * invRightLen;

    // Up = forward x right
    const uX = fY * rZ - fZ * rY;
    const uY = fZ * rX - fX * rZ;
    const uZ = fX * rY - fY * rX;

    return new Mat4(new Float32Array([
      rX, uX, fX, 0,
      rY, uY, fY, 0,
      rZ, uZ, fZ, 0,
      -(rX * eye.x + rY * eye.y + rZ * eye.z),
      -(uX * eye.x + uY * eye.y + uZ * eye.z),
      -(fX * eye.x + fY * eye.y + fZ * eye.z),
      1,
    ]));
  }

  // Оптимизированное умножение
  multiply(other: Mat4): Mat4 {
    const a = this.values;
    const b = other.values;
    const out = new Float32Array(16);

    // Используем локальные переменные для лучшей производительности
    let b0, b1, b2, b3;

    // Column 0
    b0 = b[0]; b1 = b[1]; b2 = b[2]; b3 = b[3];
    out[0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;

    // Column 1
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[5] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[6] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[7] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;

    // Column 2
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[9] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[10] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[11] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;

    // Column 3
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[13] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[14] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[15] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;

    return new Mat4(out);
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
    if (len > EPSILON) {
      const invLen = 1 / len;
      return new Quat(x * invLen, y * invLen, z * invLen, w * invLen);
    }
    return new Quat(0, 0, 0, 1);
  }
  // Оптимизированное создание из кватерниона
  static fromQuat(x: number, y: number, z: number, w: number): Mat4 {
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
  static FromValues(values: Float32Array | number[]): Mat4 {
    if (values.length !== 16) {
      throw new Error('Mat4.FromValues requires exactly 16 values');
    }

    const array = values instanceof Float32Array
      ? new Float32Array(values)
      : new Float32Array(values.map(v => Number(v)));

    return new Mat4(array);
  }
  // Метод для переиспользования объекта из пула
  free(): void {
    MAT4_POOL.release(this);
  }

  // Новый метод для быстрого сброса значений
  set(values: Float32Array): this {
    this.values.set(values);
    return this;
  }
}

// Экспортируем функцию для очистки кэшей (можно вызывать периодически)
export function clearMathCaches(): void {
  SIN_COS_CACHE.clear();
}