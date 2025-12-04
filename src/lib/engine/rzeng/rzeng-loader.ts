// rzeng-loader.ts - Обновленная версия для работы с улучшенной архивацией
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
    stats: {
      loadTime: number
      textureLoadTime: number
      animationLoadTime: number
    }
  }> {
    const startTime = performance.now();
    console.log('📥 Loading RZeng bundle...');

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    return this.loadFromBuffer(buffer);
  }

  static async loadFromBuffer(buffer: ArrayBuffer): Promise<{
    model: Model
    animations: Map<string, VMDKeyFrame[]>
    metadata: RZengBundle['metadata']
    stats: {
      loadTime: number
      textureLoadTime: number
      animationLoadTime: number
    }
  }> {
    const startTime = performance.now();

    // Декомпрессия основного бандла
    console.log('🔓 Decompressing bundle...');
    const compressedData = new Uint8Array(buffer);
    const decompressed = gunzipSync(compressedData);
    const jsonString = new TextDecoder().decode(decompressed);
    const bundleData = JSON.parse(jsonString);

    // Проверяем версию формата
    if (!bundleData.version) {
      throw new Error('Invalid RZeng bundle format: missing version');
    }

    console.log(`📦 Bundle version: ${bundleData.version}`);

    let bundle: RZengBundle;
    const textureLoadStartTime = performance.now();

    if (bundleData.version === "2.0" && bundleData.compressedParts) {
      // Новый формат с раздельным сжатием
      console.log('🔓 Decompressing individual parts...');

      // Декомпрессия PMX данных
      const pmxData = gunzipSync(this.base64ToUint8Array(bundleData.compressedParts.pmxData)).buffer;

      // Декомпрессия текстур
      console.log(`🖼️ Decompressing ${bundleData.compressedParts.textures.length} textures...`);
      const textures = await Promise.all(
        bundleData.compressedParts.textures.map(async (texture: any, index: number) => {
          console.log(`  [${index + 1}/${bundleData.compressedParts.textures.length}] ${texture.name}`);
          const textureData = gunzipSync(this.base64ToUint8Array(texture.data)).buffer;

          return {
            name: texture.name,
            data: textureData,
            mimeType: texture.mimeType,
            size: texture.size,
            optimizedSize: texture.optimizedSize,
            hash: texture.hash,
            width: texture.width,
            height: texture.height,
            originalNames: texture.originalNames || [texture.name]
          };
        })
      );

      // Декомпрессия анимаций
      console.log(`🎬 Decompressing ${bundleData.compressedParts.animations.length} animations...`);
      const animations = bundleData.compressedParts.animations.map((anim: any, index: number) => {
        console.log(`  [${index + 1}/${bundleData.compressedParts.animations.length}] ${anim.name}`);
        const vmdData = gunzipSync(this.base64ToUint8Array(anim.vmdData)).buffer;

        return {
          name: anim.name,
          vmdData,
          frameCount: anim.frameCount
        };
      });

      bundle = {
        version: bundleData.version,
        model: {
          pmxData: pmxData as any,
          textures
        },
        animations,
        metadata: bundleData.metadata
      };
    } else {
      // Старый формат (v1.0)
      console.log('⚠️ Loading legacy format (v1.0)...');
      bundle = {
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
      };
    }

    const textureLoadTime = performance.now() - textureLoadStartTime;

    // Создаем карту текстур
    const textureData = new Map<string, ArrayBuffer>();
    const textureNameMapping = new Map<string, string>();

    bundle.model.textures.forEach(texture => {
      // Сохраняем все имена для каждой текстуры
      const names = texture.originalNames || [texture.name];
      names.forEach(name => {
        textureData.set(name, texture.data);
      });

      // Сохраняем основное имя для отладки
      textureNameMapping.set(texture.name, names.join(', '));
    });

    console.log(`✅ Textures loaded: ${bundle.model.textures.length} unique, ${textureData.size} references`);

    // Загружаем модель из PMX данных с текстурами
    console.log('🤖 Loading model from PMX...');
    const model = await PmxLoader.loadFromBufferWithTextures(bundle.model.pmxData, textureData);

    // Загружаем анимации
    console.log('🎬 Loading animations...');
    const animationLoadStartTime = performance.now();
    const animations = new Map<string, VMDKeyFrame[]>();

    for (const anim of bundle.animations) {
      try {
        const frames = VMDLoader.loadFromBuffer(anim.vmdData);
        animations.set(anim.name, frames);
        console.log(`✅ Loaded animation: ${anim.name} (${frames.length} frames)`);
      } catch (error) {
        console.warn(`❌ Failed to load animation ${anim.name}:`, error);
      }
    }

    const animationLoadTime = performance.now() - animationLoadStartTime;
    const totalLoadTime = performance.now() - startTime;

    // Вывод статистики
    if (bundle.metadata.textureStats) {
      console.log('📊 Texture Statistics:');
      console.log(`   Original size: ${(bundle.metadata.textureStats.originalTotalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Optimized size: ${(bundle.metadata.textureStats.optimizedTotalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Compression ratio: ${(bundle.metadata.textureStats.compressionRatio * 100).toFixed(1)}%`);
      console.log(`   Duplicates removed: ${bundle.metadata.textureStats.duplicateCount}`);
    }

    if (bundle.metadata.animationStats) {
      console.log('📊 Animation Statistics:');
      console.log(`   Total animations: ${bundle.metadata.animationStats.animationCount}`);
      console.log(`   Total frames: ${bundle.metadata.animationStats.totalFrames}`);
    }

    console.log(`⏱️ Load times:`);
    console.log(`   Textures: ${textureLoadTime.toFixed(0)}ms`);
    console.log(`   Animations: ${animationLoadTime.toFixed(0)}ms`);
    console.log(`   Total: ${totalLoadTime.toFixed(0)}ms`);
    console.log(`🎉 Bundle loaded successfully!`);

    return {
      model,
      animations,
      metadata: bundle.metadata,
      stats: {
        loadTime: totalLoadTime,
        textureLoadTime,
        animationLoadTime
      }
    };
  }

  // Метод для проверки содержимого бандла без полной загрузки
  static async inspectBundle(buffer: ArrayBuffer): Promise<{
    version: string
    metadata: RZengBundle['metadata']
    textureCount: number
    animationCount: number
    pmxSize: number
    totalSize: number
  }> {
    try {
      const compressedData = new Uint8Array(buffer);
      const decompressed = gunzipSync(compressedData);
      const jsonString = new TextDecoder().decode(decompressed);
      const bundleData = JSON.parse(jsonString);

      let textureCount = 0;
      let animationCount = 0;
      let pmxSize = 0;

      if (bundleData.version === "2.0" && bundleData.compressedParts) {
        textureCount = bundleData.compressedParts.textures.length;
        animationCount = bundleData.compressedParts.animations.length;

        // Оцениваем размер PMX (примерно)
        pmxSize = Math.ceil(bundleData.compressedParts.pmxData.length * 3 / 4);
      } else {
        textureCount = bundleData.model?.textures?.length || 0;
        animationCount = bundleData.animations?.length || 0;
        pmxSize = Math.ceil(bundleData.model?.pmxData?.length * 3 / 4) || 0;
      }

      return {
        version: bundleData.version || "1.0",
        metadata: bundleData.metadata || {},
        textureCount,
        animationCount,
        pmxSize,
        totalSize: buffer.byteLength
      };
    } catch (error: any) {
      throw new Error('Failed to inspect bundle: ' + error.message);
    }
  }

  private static base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    return this.base64ToUint8Array(base64).buffer as ArrayBuffer;
  }
}