// rzeng-converter.ts - Улучшенная версия с оптимизацией текстур
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
      size: number
      optimizedSize: number
      hash: string
      width?: number
      height?: number
      originalNames?: string[]
    }>
  }
  animations: Array<{
    name: string
    vmdData: ArrayBuffer
    frameCount: number
  }>
  metadata: {
    modelName: string
    author: string
    createdAt: string
    textureStats?: {
      originalTotalSize: number
      optimizedTotalSize: number
      compressionRatio: number
      duplicateCount: number
    }
    animationStats?: {
      totalFrames: number
      animationCount: number
    }
  }
}

export interface TextureOptimizationOptions {
  maxTextureSize?: number // Максимальный размер текстуры в пикселях (например, 2048)
  jpegQuality?: number // Качество для JPEG (0-1)
  pngCompression?: boolean // Включить сжатие PNG
  deduplicate?: boolean // Удалить дубликаты
  generateMipmaps?: boolean // Генерация мипмапов
}

export class RZengConverter {
  static defaultOptimizationOptions: TextureOptimizationOptions = {
    maxTextureSize: 1024,
    jpegQuality: 0.85,
    pngCompression: true,
    deduplicate: true,
    generateMipmaps: false
  }

  static async createBundle(
    pmxPath: string,
    animationPaths: string[] = [],
    metadata: Partial<RZengBundle['metadata']> = {},
    optimizationOptions: Partial<TextureOptimizationOptions> = {}
  ): Promise<ArrayBuffer> {
    console.log('🔄 Creating RZeng bundle...');

    const options = { ...this.defaultOptimizationOptions, ...optimizationOptions };
    const startTime = performance.now();

    // Загрузка PMX модели
    console.log('📥 Loading PMX model...');
    const pmxResponse = await fetch(pmxPath);
    const pmxData = await pmxResponse.arrayBuffer();

    const pathParts = pmxPath.split('/');
    pathParts.pop();
    const modelDir = pathParts.join('/') + '/';

    // Парсим PMX для получения информации о текстурах
    const tempLoader = new PmxLoader(pmxData);
    const tempModel = tempLoader.parse();
    const textures = tempModel.getTextures();

    // Загрузка текстур с оптимизацией
    console.log('🖼️ Loading and optimizing textures...');
    const texturePromises = textures.map(async (texture, index) => {
      try {
        const texturePath = modelDir + texture.path;
        console.log(`  [${index + 1}/${textures.length}] Loading: ${texture.path}`);

        const textureResponse = await fetch(texturePath);
        if (textureResponse.ok) {
          const data = await textureResponse.arrayBuffer();
          const mimeType = this.detectMimeType(texture.path);

          return {
            name: texture.path,
            data,
            mimeType,
            size: data.byteLength
          };
        } else {
          console.warn(`  ⚠️ Texture not found: ${texturePath}`);
          return null;
        }
      } catch (error) {
        console.warn(`  ❌ Failed to load texture: ${texture.path}`, error);
        return null;
      }
    });

    const loadedTextures = (await Promise.all(texturePromises)).filter(t => t !== null);
    console.log(`✅ Loaded ${loadedTextures.length}/${textures.length} textures`);

    // Оптимизация текстур
    const optimizedTextures = await this.optimizeTextures(loadedTextures, options);

    // Удаление дубликатов
    const deduplicatedTextures = options.deduplicate
      ? await this.deduplicateTextures(optimizedTextures)
      : optimizedTextures;

    // Загрузка анимаций
    console.log('🎬 Loading animations...');
    const animationPromises = animationPaths.map(async (animPath, index) => {
      try {
        console.log(`  [${index + 1}/${animationPaths.length}] Loading: ${animPath}`);
        const animResponse = await fetch(animPath);
        const vmdData = await animResponse.arrayBuffer();

        // Получаем количество кадров для статистики
        const frameCount = await this.getVMDFrameCount(vmdData);

        const name = animPath.split('/').pop() || `animation_${index}`;
        return {
          name,
          vmdData,
          frameCount
        };
      } catch (error) {
        console.warn(`  ❌ Failed to load animation: ${animPath}`, error);
        return null;
      }
    });

    const animations = (await Promise.all(animationPromises)).filter(a => a !== null);
    console.log(`✅ Loaded ${animations.length}/${animationPaths.length} animations`);

    // Расчет статистики
    const textureStats = {
      originalTotalSize: deduplicatedTextures.reduce((sum, t) => sum + t.size, 0),
      optimizedTotalSize: deduplicatedTextures.reduce((sum, t) => sum + t.optimizedSize, 0),
      compressionRatio: deduplicatedTextures.length > 0
        ? deduplicatedTextures.reduce((sum, t) => sum + (t.optimizedSize / t.size), 0) / deduplicatedTextures.length
        : 1,
      duplicateCount: loadedTextures.length - deduplicatedTextures.length
    };

    const animationStats = {
      totalFrames: animations.reduce((sum, a) => sum + (a?.frameCount || 0), 0),
      animationCount: animations.length
    };

    const bundle: RZengBundle = {
      version: "2.0",
      model: {
        pmxData,
        textures: deduplicatedTextures
      },
      animations,
      metadata: {
        modelName: metadata.modelName || 'Unknown',
        author: metadata.author || 'Unknown',
        createdAt: metadata.createdAt || new Date().toISOString(),
        textureStats,
        animationStats
      }
    }

    console.log('📦 Compressing bundle...');
    const compressedBundle = await this.compressBundleWithOptimizations(bundle);

    const endTime = performance.now();
    const totalSize = compressedBundle.byteLength;
    const originalSize = bundle.model.pmxData.byteLength +
      bundle.model.textures.reduce((sum, t) => sum + t.data.byteLength, 0) +
      bundle.animations.reduce((sum, a) => sum + a.vmdData.byteLength, 0);

    console.log(`🎉 Bundle created successfully!`);
    console.log(`📊 Statistics:`);
    console.log(`   Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Compression ratio: ${(originalSize / totalSize).toFixed(2)}x`);
    console.log(`   Textures: ${deduplicatedTextures.length} files`);
    console.log(`   Texture compression: ${(textureStats.compressionRatio * 100).toFixed(1)}% of original`);
    console.log(`   Duplicates removed: ${textureStats.duplicateCount}`);
    console.log(`   Animations: ${animations.length} files (${animationStats.totalFrames} frames)`);
    console.log(`   Time: ${(endTime - startTime).toFixed(0)}ms`);

    return compressedBundle;
  }



  private static async deduplicateTextures(
    textures: Array<{
      name: string
      data: ArrayBuffer
      mimeType: string
      size: number
      optimizedSize: number
      hash: string
    }>
  ): Promise<Array<{
    name: string
    data: ArrayBuffer
    mimeType: string
    size: number
    optimizedSize: number
    hash: string
    originalNames: string[]
  }>> {
    console.log('🔍 Searching for duplicate textures...');

    const textureMap = new Map<string, {
      name: string
      data: ArrayBuffer
      mimeType: string
      size: number
      optimizedSize: number
      hash: string
      originalNames: string[]
    }>();

    for (const texture of textures) {
      const existing = textureMap.get(texture.hash);

      if (existing) {
        // Нашли дубликат
        existing.originalNames.push(texture.name);
        console.log(`    🔄 Duplicate found: ${texture.name} → ${existing.name}`);
      } else {
        // Новая уникальная текстура
        textureMap.set(texture.hash, {
          ...texture,
          originalNames: [texture.name]
        });
      }
    }

    const uniqueTextures = Array.from(textureMap.values());
    console.log(`✅ Removed ${textures.length - uniqueTextures.length} duplicate textures`);

    return uniqueTextures;
  }

  private static async getTextureInfo(data: ArrayBuffer, mimeType: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([data], { type: mimeType });
        const img = new Image();

        img.onload = () => {
          resolve({
            width: img.width,
            height: img.height
          });
        };

        img.onerror = () => {
          resolve({ width: 0, height: 0 });
        };

        img.src = URL.createObjectURL(blob);
      } catch {
        resolve({ width: 0, height: 0 });
      }
    });
  }




  private static async generateTextureHash(data: ArrayBuffer): Promise<string> {
    // Простой быстрый хеш для сравнения текстур
    const bytes = new Uint8Array(data);
    let hash = 0;

    // Используем только первые 4KB для скорости
    const sampleSize = Math.min(bytes.length, 4096);

    for (let i = 0; i < sampleSize; i++) {
      hash = ((hash << 5) - hash) + bytes[i];
      hash |= 0; // Преобразование в 32-битное целое
    }

    // Добавляем общий размер для уникальности
    hash = ((hash << 5) - hash) + bytes.length;
    hash |= 0;

    return hash.toString(16);
  }

  private static async getVMDFrameCount(vmdData: ArrayBuffer): Promise<number> {
    try {
      // Простая проверка структуры VMD файла
      const dataView = new DataView(vmdData);
      // Смещение для количества кадров костей (предполагаемый формат)
      if (vmdData.byteLength > 50) {
        const boneFrameCount = dataView.getUint32(46, true);
        return boneFrameCount;
      }
    } catch {
      // В случае ошибки возвращаем приблизительное значение
    }
    return 0;
  }

  private static async compressBundleWithOptimizations(bundle: RZengBundle): Promise<ArrayBuffer> {
    console.log('  🔄 Compressing bundle with optimizations...');

    // Сжимаем разные части отдельно для лучшей эффективности
    const compressedParts = {
      pmxData: this.arrayBufferToBase64(
        gzipSync(new Uint8Array(bundle.model.pmxData), { level: 9 }).buffer as ArrayBuffer
      ),
      textures: await Promise.all(bundle.model.textures.map(async (texture, index) => {
        console.log(`    [${index + 1}/${bundle.model.textures.length}] Compressing texture: ${texture.name}`);
        return {
          name: texture.name,
          data: this.arrayBufferToBase64(
            gzipSync(new Uint8Array(texture.data), { level: 9 }).buffer as ArrayBuffer
          ),
          mimeType: texture.mimeType,
          size: texture.size,
          optimizedSize: texture.optimizedSize,
          hash: texture.hash,
          width: texture.width,
          height: texture.height,
          originalNames: (texture as any).originalNames || [texture.name]
        };
      })),
      animations: bundle.animations.map((anim, index) => {
        console.log(`    [${index + 1}/${bundle.animations.length}] Compressing animation: ${anim.name}`);
        return {
          name: anim.name,
          vmdData: this.arrayBufferToBase64(
            gzipSync(new Uint8Array(anim.vmdData), { level: 9 }).buffer as ArrayBuffer
          ),
          frameCount: anim.frameCount
        };
      })
    };

    // Создаем структуру без бинарных данных
    const serializableBundle = {
      version: bundle.version,
      compressedParts,
      metadata: bundle.metadata
    };

    // Сжимаем всю структуру целиком
    const jsonString = JSON.stringify(serializableBundle);
    const textEncoder = new TextEncoder();
    const jsonData = textEncoder.encode(jsonString);

    console.log('  ✅ Compression complete');
    return gzipSync(jsonData, { level: 9 }).buffer as ArrayBuffer;
  }

  // Вспомогательные методы для создания бандлов из папок и файлов
  static async createBundleFromFolder(
    pmxUrl: string,
    vmdUrls: string[],
    textureMap: Map<string, ArrayBuffer>,
    metadata: Partial<RZengBundle['metadata']> = {},
    optimizationOptions: Partial<TextureOptimizationOptions> = {}
  ): Promise<ArrayBuffer> {
    console.log('🔄 Creating bundle from folder...');

    const options = { ...this.defaultOptimizationOptions, ...optimizationOptions };

    // Загрузка PMX модели
    const pmxResponse = await fetch(pmxUrl);
    const pmxData = await pmxResponse.arrayBuffer();

    const tempLoader = new PmxLoader(pmxData);
    const tempModel = tempLoader.parse();
    const textures = tempModel.getTextures();

    console.log(`📊 Model has ${textures.length} texture references`);
    console.log(`📊 Folder has ${textureMap.size} texture files`);

    // Загрузка и оптимизация текстур
    const loadedTextures = [];
    for (const texture of textures) {
      try {
        const texturePath = texture.path;
        let textureBuffer = this.findTextureInMap(texturePath, textureMap);

        if (textureBuffer) {
          const mimeType = this.detectMimeType(texturePath);
          loadedTextures.push({
            name: texturePath,
            data: textureBuffer,
            mimeType,
            size: textureBuffer.byteLength
          });
          console.log(`✅ Found texture: ${texturePath}`);
        } else {
          console.warn(`⚠️ Texture not found: ${texturePath}`);
          // Создаем placeholder
          const placeholderBuffer = await this.createPlaceholderTexture();
          loadedTextures.push({
            name: texturePath,
            data: placeholderBuffer,
            mimeType: 'image/png',
            size: placeholderBuffer.byteLength
          });
        }
      } catch (error) {
        console.warn(`❌ Failed to process texture: ${texture.path}`, error);
      }
    }

    // Оптимизация и удаление дубликатов
    const optimizedTextures = await this.optimizeTextures(loadedTextures, options);
    const deduplicatedTextures = options.deduplicate
      ? await this.deduplicateTextures(optimizedTextures)
      : optimizedTextures;

    // Загрузка анимаций
    const animations = [];
    for (const vmdUrl of vmdUrls) {
      try {
        const animResponse = await fetch(vmdUrl);
        const vmdData = await animResponse.arrayBuffer();
        const frameCount = await this.getVMDFrameCount(vmdData);
        const name = vmdUrl.split('/').pop() || 'animation';
        animations.push({ name, vmdData, frameCount });
      } catch (error) {
        console.warn(`Failed to load animation: ${vmdUrl}`, error);
      }
    }

    // Статистика
    const textureStats = {
      originalTotalSize: deduplicatedTextures.reduce((sum, t) => sum + t.size, 0),
      optimizedTotalSize: deduplicatedTextures.reduce((sum, t) => sum + t.optimizedSize, 0),
      compressionRatio: deduplicatedTextures.length > 0
        ? deduplicatedTextures.reduce((sum, t) => sum + (t.optimizedSize / t.size), 0) / deduplicatedTextures.length
        : 1,
      duplicateCount: loadedTextures.length - deduplicatedTextures.length
    };

    const bundle: RZengBundle = {
      version: "2.0",
      model: {
        pmxData,
        textures: deduplicatedTextures
      },
      animations,
      metadata: {
        modelName: metadata.modelName || 'Unknown',
        author: metadata.author || 'Unknown',
        createdAt: metadata.createdAt || new Date().toISOString(),
        textureStats
      }
    }

    return this.compressBundleWithOptimizations(bundle);
  }

  // Метод для создания прогрессивного бандла с колбэком прогресса
  static async createBundleWithProgress(
    pmxPath: string,
    animationPaths: string[] = [],
    metadata: Partial<RZengBundle['metadata']> = {},
    optimizationOptions: Partial<TextureOptimizationOptions> = {},
    onProgress?: (stage: string, progress: number, details?: any) => void
  ): Promise<ArrayBuffer> {
    const totalStages = 5;
    let currentStage = 0;

    const updateProgress = (stage: string, stageProgress: number, details?: any) => {
      const overallProgress = (currentStage / totalStages) + (stageProgress / totalStages);
      if (onProgress) {
        onProgress(stage, Math.min(99, Math.floor(overallProgress * 100)), details);
      }
    };

    // Этап 1: Загрузка PMX
    updateProgress('Loading PMX model', 0.1);
    const pmxResponse = await fetch(pmxPath);
    const pmxData = await pmxResponse.arrayBuffer();
    currentStage++;
    updateProgress('PMX loaded', 1.0, { size: pmxData.byteLength });

    // Этап 2: Анализ текстур
    updateProgress('Analyzing textures', 0);
    const tempLoader = new PmxLoader(pmxData);
    const tempModel = tempLoader.parse();
    const textures = tempModel.getTextures();
    currentStage++;
    updateProgress('Textures analyzed', 1.0, { count: textures.length });

    // Этап 3: Загрузка текстур
    const pathParts = pmxPath.split('/');
    pathParts.pop();
    const modelDir = pathParts.join('/') + '/';

    const loadedTextures = [];
    for (let i = 0; i < textures.length; i++) {
      updateProgress('Loading textures', i / textures.length, { current: i + 1, total: textures.length });
      try {
        const texturePath = modelDir + textures[i].path;
        const textureResponse = await fetch(texturePath);
        if (textureResponse.ok) {
          const data = await textureResponse.arrayBuffer();
          loadedTextures.push({
            name: textures[i].path,
            data,
            mimeType: this.detectMimeType(textures[i].path),
            size: data.byteLength
          });
        }
      } catch (error) {
        console.warn(`Failed to load texture: ${textures[i].path}`, error);
      }
    }
    currentStage++;
    updateProgress('Textures loaded', 1.0, { loaded: loadedTextures.length, total: textures.length });

    // Этап 4: Оптимизация текстур
    const options = { ...this.defaultOptimizationOptions, ...optimizationOptions };
    let optimizedTextures = [];

    for (let i = 0; i < loadedTextures.length; i++) {
      updateProgress('Optimizing textures', i / loadedTextures.length, { current: i + 1, total: loadedTextures.length });
      try {
        const texture = loadedTextures[i];
        const hash = await this.generateTextureHash(texture.data);
        const optimizedBuffer = await this.compressImage(texture.data, texture.mimeType, options);

        optimizedTextures.push({
          ...texture,
          data: optimizedBuffer,
          optimizedSize: optimizedBuffer.byteLength,
          hash
        });
      } catch (error) {
        console.warn(`Failed to optimize texture: ${loadedTextures[i].name}`, error);
        optimizedTextures.push({
          ...loadedTextures[i],
          optimizedSize: loadedTextures[i].size,
          hash: ''
        });
      }
    }

    if (options.deduplicate) {
      updateProgress('Removing duplicates', 0.5);
      optimizedTextures = await this.deduplicateTextures(optimizedTextures);
    }

    currentStage++;
    updateProgress('Textures optimized', 1.0, {
      originalSize: loadedTextures.reduce((s, t) => s + t.size, 0),
      optimizedSize: optimizedTextures.reduce((s, t) => s + t.optimizedSize, 0)
    });

    // Этап 5: Загрузка и компрессия анимаций
    const animations = [];
    for (let i = 0; i < animationPaths.length; i++) {
      updateProgress('Loading animations', i / animationPaths.length, { current: i + 1, total: animationPaths.length });
      try {
        const animResponse = await fetch(animationPaths[i]);
        const vmdData = await animResponse.arrayBuffer();
        const frameCount = await this.getVMDFrameCount(vmdData);
        const name = animationPaths[i].split('/').pop() || `animation_${i}`;
        animations.push({ name, vmdData, frameCount });
      } catch (error) {
        console.warn(`Failed to load animation: ${animationPaths[i]}`, error);
      }
    }
    currentStage++;
    updateProgress('Animations loaded', 1.0, { count: animations.length });

    // Создание бандла
    updateProgress('Creating bundle', 0);
    const bundle: RZengBundle = {
      version: "2.0",
      model: {
        pmxData,
        textures: optimizedTextures
      },
      animations,
      metadata: {
        modelName: metadata.modelName || 'Unknown',
        author: metadata.author || 'Unknown',
        createdAt: metadata.createdAt || new Date().toISOString(),
        textureStats: {
          originalTotalSize: loadedTextures.reduce((s, t) => s + t.size, 0),
          optimizedTotalSize: optimizedTextures.reduce((s, t) => s + t.optimizedSize, 0),
          compressionRatio: optimizedTextures.reduce((s, t) => s + (t.optimizedSize / t.size), 0) / optimizedTextures.length,
          duplicateCount: loadedTextures.length - optimizedTextures.length
        }
      }
    };

    // Финальная компрессия
    updateProgress('Final compression', 0.5);
    const result = await this.compressBundleWithOptimizations(bundle);

    updateProgress('Complete', 1.0, {
      finalSize: result.byteLength,
      compressionRatio: (pmxData.byteLength +
        loadedTextures.reduce((s, t) => s + t.size, 0) +
        animations.reduce((s, a) => s + a.vmdData.byteLength, 0)) / result.byteLength
    });

    return result;
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
  // В методе optimizeTextures в rzeng-converter.ts
  private static async optimizeTextures(
    textures: Array<{ name: string; data: ArrayBuffer; mimeType: string; size: number }>,
    options: TextureOptimizationOptions
  ): Promise<Array<{
    name: string
    data: ArrayBuffer
    mimeType: string
    size: number
    optimizedSize: number
    hash: string
    width?: number
    height?: number
    hasAlpha?: boolean // Добавляем информацию о наличии альфа-канала
  }>> {
    const optimizedTextures = [];

    for (let i = 0; i < textures.length; i++) {
      const texture = textures[i];
      console.log(`  🛠️ Optimizing texture [${i + 1}/${textures.length}]: ${texture.name}`);

      try {
        // Проверяем, является ли текстура текстурой волос
        const isHairTexture = texture.name.toLowerCase().includes("hair") ||
          texture.name.toLowerCase().includes("髮") ||
          texture.name.toLowerCase().includes("髪");

        // Проверяем наличие альфа-канала
        const hasAlpha = await this.checkTextureHasAlpha(texture.data, texture.mimeType);

        // Генерируем хеш
        const hash = await this.generateTextureHash(texture.data);

        // Получаем информацию о текстуре
        const textureInfo = await this.getTextureInfo(texture.data, texture.mimeType);

        // Проверяем, нужно ли уменьшать размер
        const shouldResize = options.maxTextureSize &&
          (textureInfo.width > options.maxTextureSize || textureInfo.height > options.maxTextureSize);

        let optimizedBuffer: ArrayBuffer;
        let optimizedMimeType = texture.mimeType;
        let width = textureInfo.width;
        let height = textureInfo.height;

        // Для текстур волос и текстур с альфа-каналом используем PNG вместо JPEG
        if (hasAlpha || isHairTexture) {
          console.log(`    ℹ️ Texture has alpha channel or is hair texture, using PNG format`);
          optimizedMimeType = 'image/png';
        }

        if (shouldResize) {
          // Уменьшаем размер текстуры
          optimizedBuffer = await this.resizeImage(
            texture.data,
            texture.mimeType,
            options.maxTextureSize!,
            hasAlpha || isHairTexture // Сохраняем альфа-канал для текстур волос
          );

          // Если текстура с альфа-каналом, используем PNG
          if (hasAlpha || isHairTexture) {
            optimizedMimeType = 'image/png';
          }
        } else {
          // Оптимизируем без изменения размеров
          optimizedBuffer = await this.compressImage(
            texture.data,
            texture.mimeType,
            options,
            hasAlpha || isHairTexture // Сохраняем альфа-канал
          );
        }

        // Проверяем, действительно ли оптимизация уменьшила размер
        if (optimizedBuffer.byteLength >= texture.data.byteLength) {
          console.log(`    ⚠️ Optimization didn't reduce size, using original`);
          optimizedBuffer = texture.data;
        }

        optimizedTextures.push({
          name: texture.name,
          data: optimizedBuffer,
          mimeType: optimizedMimeType,
          size: texture.size,
          optimizedSize: optimizedBuffer.byteLength,
          hash,
          width,
          height,
          hasAlpha
        });

        console.log(`    ✅ Optimized: ${texture.size} → ${optimizedBuffer.byteLength} bytes (${(optimizedBuffer.byteLength / texture.size * 100).toFixed(1)}%)`);

      } catch (error) {
        console.warn(`    ❌ Failed to optimize texture ${texture.name}:`, error);
        // В случае ошибки используем оригинал
        const hash = await this.generateTextureHash(texture.data);
        const hasAlpha = await this.checkTextureHasAlpha(texture.data, texture.mimeType);
        optimizedTextures.push({
          ...texture,
          optimizedSize: texture.size,
          hash,
          hasAlpha
        });
      }
    }

    return optimizedTextures;
  }
  // Обновите сигнатуру метода compressImage:
  private static async compressImage(
    data: ArrayBuffer,
    mimeType: string,
    options: TextureOptimizationOptions,
    preserveAlpha: boolean = false  // Добавьте этот параметр
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([data], { type: mimeType });
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Если нужно сохранять альфа-канал, не заливаем фон
          if (!preserveAlpha) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          ctx.drawImage(img, 0, 0);

          // Выбираем формат в зависимости от наличия альфа-канала
          let format: string;
          let quality: number;

          if (preserveAlpha) {
            format = 'image/png';
            quality = 1.0;
          } else {
            // Если исходный формат уже JPEG, оставляем его
            if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
              format = 'image/jpeg';
              quality = options.jpegQuality || 0.85;
            } else {
              // Конвертируем в JPEG для лучшего сжатия
              format = 'image/jpeg';
              quality = options.jpegQuality || 0.85;
            }
          }

          canvas.toBlob((blob) => {
            if (blob) {
              blob.arrayBuffer().then(resolve).catch(reject);
            } else {
              reject(new Error('Failed to create blob'));
            }
          }, format, quality);
        };

        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      } catch (error) {
        reject(error);
      }
    });
  }
  // Добавьте метод для проверки альфа-канала
  private static async checkTextureHasAlpha(data: ArrayBuffer, mimeType: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const blob = new Blob([data], { type: mimeType });
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        img.onload = () => {
          if (!ctx) {
            resolve(false);
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // Проверяем наличие непрозрачных пикселей
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const data = imageData.data;

          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 255) {
              resolve(true); // Нашли прозрачный пиксель
              return;
            }
          }

          resolve(false);
        };

        img.onerror = () => resolve(false);
        img.src = URL.createObjectURL(blob);
      } catch {
        resolve(false);
      }
    });
  }

  // Обновите метод resizeImage для сохранения альфа-канала
  private static async resizeImage(
    data: ArrayBuffer,
    mimeType: string,
    maxSize: number,
    preserveAlpha: boolean = false
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([data], { type: mimeType });
        const img = new Image();

        img.onload = () => {
          // Вычисляем новые размеры
          let width = img.width;
          let height = img.height;

          if (width > maxSize || height > maxSize) {
            const ratio = Math.min(maxSize / width, maxSize / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }

          // Создаем canvas для ресайза
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Рисуем сглаженное изображение
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Заполняем белым фоном если нет альфа-канала
          if (!preserveAlpha) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Выбираем формат в зависимости от наличия альфа-канала
          const format = preserveAlpha ? 'image/png' : 'image/jpeg';
          const quality = preserveAlpha ? 1.0 : 0.85;

          canvas.toBlob((blob) => {
            if (blob) {
              blob.arrayBuffer().then(resolve).catch(reject);
            } else {
              reject(new Error('Failed to create blob'));
            }
          }, format, quality);
        };

        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      } catch (error) {
        reject(error);
      }
    });
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

  private static async createPlaceholderTexture(): Promise<ArrayBuffer> {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // Пурпурный фон
    ctx.fillStyle = '#ff00ff'
    ctx.fillRect(0, 0, size, size)

    // Шахматный узор
    ctx.fillStyle = '#000000'
    for (let y = 0; y < size; y += 16) {
      for (let x = (y / 16) % 2 ? 0 : 16; x < size; x += 32) {
        ctx.fillRect(x, y, 16, 16)
      }
    }

    // Текст "Missing"
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 10px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('MISSING', size / 2, size / 2)

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