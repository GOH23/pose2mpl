import { Quat, Vec3 } from "./math"

export interface BoneFrame {
  boneName: string
  frame: number
  position: Vec3
  rotation: Quat
}

export interface VMDKeyFrame {
  time: number // in seconds
  boneFrames: BoneFrame[]
}

export class VMDLoader {
  private view: DataView
  private offset = 0
  private decoder: TextDecoder

  private constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
    try {
      this.decoder = new TextDecoder("shift-jis")
    } catch {
      this.decoder = new TextDecoder("utf-8")
    }
  }

  static async load(url: string): Promise<VMDKeyFrame[]> {
    const loader = new VMDLoader(await fetch(url).then((r) => r.arrayBuffer()))
    return loader.parse()
  }

  static loadFromBuffer(buffer: ArrayBuffer): VMDKeyFrame[] {
    const loader = new VMDLoader(buffer)
    return loader.parse()
  }

  private parse(): VMDKeyFrame[] {
    const header = this.getString(30)
    if (!header.startsWith("Vocaloid Motion Data")) {
      throw new Error("Invalid VMD file header")
    }

    this.skip(20) // Skip model name

    const boneFrameCount = this.getUint32()
    const allBoneFrames: Array<{ time: number; boneFrame: BoneFrame }> = []

    for (let i = 0; i < boneFrameCount; i++) {
      const boneFrame = this.readBoneFrame()
      const FRAME_RATE = 30.0
      const time = boneFrame.frame / FRAME_RATE
      allBoneFrames.push({ time, boneFrame })
    }

    // Читаем также кадры морфинга и камеры (если есть)
    // Это важно для пропуска правильного количества байт
    const morphFrameCount = this.getUint32()
    this.skip(23 * morphFrameCount) // Skip morph frames

    const cameraFrameCount = this.getUint32()
    this.skip(61 * cameraFrameCount) // Skip camera frames

    // Сортируем и группируем по времени
    allBoneFrames.sort((a, b) => a.time - b.time)

    const keyFrames: VMDKeyFrame[] = []
    let currentTime = -1.0
    let currentBoneFrames: BoneFrame[] = []

    for (const { time, boneFrame } of allBoneFrames) {
      if (Math.abs(time - currentTime) > 0.001) {
        if (currentBoneFrames.length > 0) {
          keyFrames.push({
            time: currentTime,
            boneFrames: currentBoneFrames,
          })
        }
        currentTime = time
        currentBoneFrames = [boneFrame]
      } else {
        currentBoneFrames.push(boneFrame)
      }
    }

    if (currentBoneFrames.length > 0) {
      keyFrames.push({
        time: currentTime,
        boneFrames: currentBoneFrames,
      })
    }

    return keyFrames
  }

  private readBoneFrame(): BoneFrame {
    // Read bone name (15 bytes)
    const nameBuffer = new Uint8Array(this.view.buffer, this.offset, 15)
    this.offset += 15

    let nameLength = 15
    for (let i = 0; i < 15; i++) {
      if (nameBuffer[i] === 0) {
        nameLength = i
        break
      }
    }

    let boneName: string
    try {
      const nameSlice = nameBuffer.slice(0, nameLength)
      boneName = this.decoder.decode(nameSlice)
    } catch {
      boneName = String.fromCharCode(...nameBuffer.slice(0, nameLength))
    }

    // Read frame number
    const frame = this.getUint32()

    // Read position (12 bytes: 3 x f32, little endian) - ИСПРАВЛЕНО!
    const posX = this.getFloat32()
    const posY = this.getFloat32()
    const posZ = this.getFloat32()
    const position = new Vec3(posX, posY, posZ)
    // Read rotation quaternion (16 bytes: 4 x f32, little endian)
    const rotX = this.getFloat32()
    const rotY = this.getFloat32()
    const rotZ = this.getFloat32()
    const rotW = this.getFloat32()
    const rotation = new Quat(rotX, rotY, rotZ, rotW)

    // Skip interpolation parameters (64 bytes)
    this.skip(64)

    return {
      boneName,
      frame,
      position, // Добавляем позицию
      rotation,
    }
  }

  private getUint32(): number {
    if (this.offset + 4 > this.view.buffer.byteLength) {
      throw new RangeError(`Offset ${this.offset} + 4 exceeds buffer bounds ${this.view.buffer.byteLength}`)
    }
    const v = this.view.getUint32(this.offset, true)
    this.offset += 4
    return v
  }

  private getFloat32(): number {
    if (this.offset + 4 > this.view.buffer.byteLength) {
      throw new RangeError(`Offset ${this.offset} + 4 exceeds buffer bounds ${this.view.buffer.byteLength}`)
    }
    const v = this.view.getFloat32(this.offset, true)
    this.offset += 4
    return v
  }

  private getString(len: number): string {
    const bytes = new Uint8Array(this.view.buffer, this.offset, len)
    this.offset += len
    return String.fromCharCode(...bytes)
  }

  private skip(bytes: number): void {
    if (this.offset + bytes > this.view.buffer.byteLength) {
      throw new RangeError(`Offset ${this.offset} + ${bytes} exceeds buffer bounds ${this.view.buffer.byteLength}`)
    }
    this.offset += bytes
  }
}