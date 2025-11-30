// rzeng-loader.ts
import { gunzipSync } from 'fflate'
import { Model } from "../model"
import { VMDKeyFrame, VMDLoader } from "../vmd-loader"
import { PmxLoader } from "../pmx-loader"
import { RZengBundle } from "./rzeng-converter"

export class RZengLoader {
  static async load(url: string): Promise<{
    model: Model
    animations: Map<string, VMDKeyFrame[]>
    metadata: RZengBundle['metadata']
  }> {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    return this.loadFromBuffer(buffer)
  }

  static async loadFromBuffer(buffer: ArrayBuffer): Promise<{
    model: Model
    animations: Map<string, VMDKeyFrame[]>
    metadata: RZengBundle['metadata']
  }> {
    // Декомпрессия с помощью fflate
    const compressedData = new Uint8Array(buffer)
    const decompressed = gunzipSync(compressedData)
    const jsonString = new TextDecoder().decode(decompressed)
    const bundleData = JSON.parse(jsonString)

    // Восстанавливаем бинарные данные
    const bundle: RZengBundle = { 
      ...bundleData,
      model: {
        ...bundleData.model,
        pmxData: this.base64ToArrayBuffer(bundleData.model.pmxData),
        textures: bundleData.model.textures.map((texture: any) => ({
          ...texture,
          data: this.base64ToArrayBuffer(texture.data)
        }))
      },
      animations: bundleData.animations.map((anim: any) => ({
        ...anim,
        vmdData: this.base64ToArrayBuffer(anim.vmdData)
      }))
    }

    // Создаем карту текстур
    const textureData = new Map<string, ArrayBuffer>()
    bundle.model.textures.forEach(texture => {
      textureData.set(texture.name, texture.data)
    })

    // Загружаем модель из PMX данных с текстурами
    const model = await PmxLoader.loadFromBufferWithTextures(bundle.model.pmxData, textureData)

    // Загружаем анимации
    const animations = new Map<string, VMDKeyFrame[]>()
    for (const anim of bundle.animations) {
      try {
        const frames = VMDLoader.loadFromBuffer(anim.vmdData)
        animations.set(anim.name, frames)
        console.log(`✓ Loaded animation: ${anim.name} with ${frames.length} frames`)
      } catch (error) {
        console.warn(`Failed to load animation ${anim.name}:`, error)
      }
    }

    return {
      model,
      animations,
      metadata: bundle.metadata
    }
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }
}