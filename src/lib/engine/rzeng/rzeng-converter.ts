// rzeng-converter.ts
import { gzipSync, gunzipSync } from 'fflate';
import { Model } from "../model"
import { VMDKeyFrame } from "../vmd-loader"
import { PmxLoader } from "../pmx-loader"
import { VMDLoader } from "../vmd-loader"

export interface RZengBundle {
  version: string
  model: {
    pmxData: ArrayBuffer
    textures: Array<{
      name: string
      data: ArrayBuffer
      mimeType: string
    }>
  }
  animations: Array<{
    name: string
    vmdData: ArrayBuffer
  }>
  metadata: {
    modelName: string
    author: string
    createdAt: string
  }
}

export class RZengConverter {
  static async createBundle(
    pmxPath: string,
    animationPaths: string[] = [],
    metadata: Partial<RZengBundle['metadata']> = {}
  ): Promise<ArrayBuffer> {
    const pmxResponse = await fetch(pmxPath)
    const pmxData = await pmxResponse.arrayBuffer()

    const pathParts = pmxPath.split('/')
    pathParts.pop()
    const modelDir = pathParts.join('/') + '/'

    const tempLoader = new PmxLoader(pmxData)
    const tempModel = tempLoader.parse()
    const textures = tempModel.getTextures()

    const textureData = []

    for (const texture of textures) {
      try {
        const texturePath = modelDir + texture.path
        const textureResponse = await fetch(texturePath)
        if (textureResponse.ok) {
          const data = await textureResponse.arrayBuffer()
          const mimeType = this.detectMimeType(texture.path)
          textureData.push({
            name: texture.path,
            data,
            mimeType
          })
        } else {
          console.warn(`Texture not found: ${texturePath}`)
        }
      } catch (error) {
        console.warn(`Failed to load texture: ${texture.path}`, error)
      }
    }

    const animations = []
    for (const animPath of animationPaths) {
      try {
        const animResponse = await fetch(animPath)
        const vmdData = await animResponse.arrayBuffer()
        const name = animPath.split('/').pop() || 'animation'
        animations.push({ name, vmdData })
      } catch (error) {
        console.warn(`Failed to load animation: ${animPath}`, error)
      }
    }

    const bundle: RZengBundle = {
      version: "1.0",
      model: {
        pmxData,
        textures: textureData
      },
      animations,
      metadata: {
        modelName: metadata.modelName || 'Unknown',
        author: metadata.author || 'Unknown',
        createdAt: metadata.createdAt || new Date().toISOString()
      }
    }

    return this.compressBundleWithFflate(bundle)
  }

  static async createBundleFromFolder(
    pmxUrl: string,
    vmdUrls: string[],
    textureMap: Map<string, ArrayBuffer>,
    metadata: Partial<RZengBundle['metadata']> = {}
  ): Promise<ArrayBuffer> {
    const pmxResponse = await fetch(pmxUrl)
    const pmxData = await pmxResponse.arrayBuffer()

    const tempLoader = new PmxLoader(pmxData)
    const tempModel = tempLoader.parse()
    const textures = tempModel.getTextures()

    console.log('Available texture paths in PMX:', textures.map(t => t.path))
    console.log('Available texture files in folder:', Array.from(textureMap.keys()))

    const textureData = []

    for (const texture of textures) {
      try {
        const texturePath = texture.path
        let textureBuffer = this.findTextureInMap(texturePath, textureMap)

        if (textureBuffer) {
          const mimeType = this.detectMimeType(texturePath)
          textureData.push({
            name: texturePath,
            data: textureBuffer,
            mimeType
          })
          console.log(`✓ Found texture: ${texturePath}`)
        } else {
          console.warn(`✗ Texture not found: ${texturePath}`)
          const placeholderBuffer = this.createPlaceholderTexture()
          textureData.push({
            name: texturePath,
            data: placeholderBuffer,
            mimeType: 'image/png'
          })
          console.log(`  → Created placeholder texture`)
        }
      } catch (error) {
        console.warn(`Failed to process texture: ${texture.path}`, error)
      }
    }

    const animations = []
    for (const vmdUrl of vmdUrls) {
      try {
        const animResponse = await fetch(vmdUrl)
        const vmdData = await animResponse.arrayBuffer()
        const name = vmdUrl.split('/').pop() || 'animation'
        animations.push({ name, vmdData })
      } catch (error) {
        console.warn(`Failed to load animation: ${vmdUrl}`, error)
      }
    }

    const bundle: RZengBundle = {
      version: "1.0",
      model: {
        pmxData,
        textures: textureData
      },
      animations,
      metadata: {
        modelName: metadata.modelName || 'Unknown',
        author: metadata.author || 'Unknown',
        createdAt: metadata.createdAt || new Date().toISOString()
      }
    }

    return this.compressBundleWithFflate(bundle)
  }

  static async createBundleFromFiles(
    pmxUrl: string,
    vmdUrls: string[],
    textureMap: Map<string, ArrayBuffer>,
    metadata: Partial<RZengBundle['metadata']> = {}
  ): Promise<ArrayBuffer> {
    const pmxResponse = await fetch(pmxUrl)
    const pmxData = await pmxResponse.arrayBuffer()

    const tempLoader = new PmxLoader(pmxData)
    const tempModel = tempLoader.parse()
    const textures = tempModel.getTextures()

    const textureData = []

    for (const texture of textures) {
      try {
        const textureFileName = texture.path.split('/').pop() || texture.path

        if (textureMap.has(textureFileName)) {
          const data = textureMap.get(textureFileName)!
          const mimeType = this.detectMimeType(textureFileName)
          textureData.push({
            name: texture.path,
            data,
            mimeType
          })
        } else {
          console.warn(`Texture not found in selection: ${textureFileName}`)
        }
      } catch (error) {
        console.warn(`Failed to process texture: ${texture.path}`, error)
      }
    }

    const animations = []
    for (const vmdUrl of vmdUrls) {
      try {
        const animResponse = await fetch(vmdUrl)
        const vmdData = await animResponse.arrayBuffer()
        const name = vmdUrl.split('/').pop() || 'animation'
        animations.push({ name, vmdData })
      } catch (error) {
        console.warn(`Failed to load animation: ${vmdUrl}`, error)
      }
    }

    const bundle: RZengBundle = {
      version: "1.0",
      model: {
        pmxData,
        textures: textureData
      },
      animations,
      metadata: {
        modelName: metadata.modelName || 'Unknown',
        author: metadata.author || 'Unknown',
        createdAt: metadata.createdAt || new Date().toISOString()
      }
    }

    return this.compressBundleWithFflate(bundle)
  }

  // Новый метод сжатия с fflate
  private static compressBundleWithFflate(bundle: RZengBundle): ArrayBuffer {
    // Сериализуем bundle в JSON
    const serializableBundle = {
      ...bundle,
      model: {
        ...bundle.model,
        pmxData: this.arrayBufferToBase64(bundle.model.pmxData),
        textures: bundle.model.textures.map(texture => ({
          ...texture,
          data: this.arrayBufferToBase64(texture.data)
        }))
      },
      animations: bundle.animations.map(anim => ({
        ...anim,
        vmdData: this.arrayBufferToBase64(anim.vmdData)
      }))
    }

    const jsonString = JSON.stringify(serializableBundle)
    
    // Сжимаем с помощью fflate с максимальным уровнем сжатия
    const textEncoder = new TextEncoder()
    const jsonData = textEncoder.encode(jsonString)
    const compressed = gzipSync(jsonData, { level: 9 })
    
    return compressed.buffer.slice() as ArrayBuffer
  }

  // Вспомогательные методы остаются без изменений
  private static detectMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop()
    switch (ext) {
      case 'png': return 'image/png'
      case 'jpg':
      case 'jpeg': return 'image/jpeg'
      case 'bmp': return 'image/bmp'
      case 'tga': return 'image/tga'
      case 'gif': return 'image/gif'
      default: return 'application/octet-stream'
    }
  }

  private static findTextureInMap(
    texturePath: string,
    textureMap: Map<string, ArrayBuffer>
  ): ArrayBuffer | null {
    if (textureMap.has(texturePath)) {
      return textureMap.get(texturePath)!
    }

    const normalizedPath = this.normalizePath(texturePath)
    if (textureMap.has(normalizedPath)) {
      return textureMap.get(normalizedPath)!
    }

    const fileName = texturePath.split(/[\\/]/).pop()!
    if (textureMap.has(fileName)) {
      return textureMap.get(fileName)!
    }

    for (const [mapPath, buffer] of textureMap.entries()) {
      const mapFileName = mapPath.split(/[\\/]/).pop()!
      if (mapFileName === fileName) {
        return buffer
      }
    }

    for (const [mapPath, buffer] of textureMap.entries()) {
      const normalizedMapPath = this.normalizePath(mapPath)
      if (normalizedMapPath.includes(fileName) ||
        texturePath.includes(mapPath.split(/[\\/]/).pop()!)) {
        return buffer
      }
    }

    return null
  }

  private static normalizePath(path: string): string {
    return path.replace(/\\/g, '/')
  }

  private static createPlaceholderTexture(): ArrayBuffer {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#ff00ff'
    ctx.fillRect(0, 0, size, size)

    ctx.fillStyle = '#000000'
    for (let y = 0; y < size; y += 16) {
      for (let x = (y / 16) % 2 ? 0 : 16; x < size; x += 32) {
        ctx.fillRect(x, y, 16, 16)
      }
    }

    return new Promise<ArrayBuffer>((resolve) => {
      canvas.toBlob((blob) => {
        blob!.arrayBuffer().then(resolve)
      }, 'image/png')
    }) as any
  }

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }
}