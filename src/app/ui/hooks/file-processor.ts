import { RZengConverter } from "@/lib/engine/rzeng/rzeng-converter";

// utils/file-processor.ts
interface ModelFiles {
  pmxFile: File | null;
  vmdFiles: File[];
  textureFiles: File[];
  modelName: string;
}

export async function processSelectedFiles(files: FileList): Promise<ModelFiles> {
  const fileArray = Array.from(files);
  
  // Находим PMX файл
  const pmxFile = fileArray.find(file => 
    file.name.toLowerCase().endsWith('.pmx')
  ) || null;

  if (!pmxFile) {
    throw new Error('No PMX file found. Please select a .pmx file.');
  }

  // Извлекаем имя модели из названия PMX файла
  const modelName = pmxFile.name.replace(/\.pmx$/i, '');

  // Находим VMD файлы (анимации)
  const vmdFiles = fileArray.filter(file =>
    file.name.toLowerCase().endsWith('.vmd')
  );

  // Находим текстуры
  const textureFiles = fileArray.filter(file =>
    /\.(png|jpg|jpeg|bmp|tga|gif)$/i.test(file.name)
  );

  console.log(`Found: PMX=${pmxFile.name}, VMD=${vmdFiles.length}, Textures=${textureFiles.length}`);

  return {
    pmxFile,
    vmdFiles,
    textureFiles,
    modelName
  };
}

export async function createRZengFromFiles(modelData: ModelFiles): Promise<ArrayBuffer> {
  const { pmxFile, vmdFiles, textureFiles, modelName } = modelData;

  // Создаем временные URL для файлов
  const pmxUrl = URL.createObjectURL(pmxFile!);
  
  const vmdUrls = await Promise.all(
    vmdFiles.map(async (vmdFile) => {
      const url = URL.createObjectURL(vmdFile);
      return { name: vmdFile.name, url };
    })
  );

  // Создаем карту текстур
  const textureMap = new Map<string, ArrayBuffer>();
  for (const textureFile of textureFiles) {
    const arrayBuffer = await textureFile.arrayBuffer();
    textureMap.set(textureFile.name, arrayBuffer);
  }

  try {
    // Используем существующий конвертер с модификациями для работы с файлами
    const bundleBuffer = await RZengConverter.createBundleFromFolder(
      pmxUrl,
      vmdUrls.map(v => v.url),
      textureMap,
      {
        modelName,
        author: 'Converted from files',
        createdAt: new Date().toISOString()
      }
    );

    return bundleBuffer;
  } finally {
    // Очищаем временные URL
    URL.revokeObjectURL(pmxUrl);
    vmdUrls.forEach(v => URL.revokeObjectURL(v.url));
  }
}

export function downloadFile(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}