// components/ModelConverter.tsx
import { RZengConverter } from '@/lib/engine/rzeng/rzeng-converter';
import React, { useState, useRef } from 'react';

interface ModelConverterProps {
    onModelConverted?: (file: File) => void;
}

interface FolderStructure {
    [key: string]: File | FolderStructure;
}

export const ModelConverter: React.FC<ModelConverterProps> = ({ onModelConverted }) => {
    const [isConverting, setIsConverting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const [selectedFolder, setSelectedFolder] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleTransformClick = () => {
        fileInputRef.current?.click();
    };

    const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        // Получаем имя папки из первого файла
        const firstFile = files[0];
        const folderName = getFolderName(firstFile);
        setSelectedFolder(folderName);

        setIsConverting(true);
        setProgress(0);
        setStatus('Scanning folder...');

        try {
            // Обрабатываем файлы из папки
            const fileArray = Array.from(files);
            setProgress(20);
            setStatus(`Found ${fileArray.length} files, analyzing...`);

            // Создаем структуру папки
            const folderStructure = createFolderStructure(fileArray);

            setProgress(40);
            setStatus('Processing model files...');

            // Конвертируем папку в .rzeng
            const rzengBuffer = await convertFolderToRZeng(folderStructure, folderName);

            setProgress(80);
            setStatus('Finalizing conversion...');

            // Создаем файл для скачивания
            const rzengFile = new File([rzengBuffer], `${folderName}.rzeng`, {
                type: 'application/octet-stream'
            });

            // Вызываем callback если нужно
            if (onModelConverted) {
                onModelConverted(rzengFile);
            }

            // Автоматическое скачивание
            downloadFile(rzengBuffer, `${folderName}.rzeng`);

            setProgress(100);
            setStatus('Conversion completed!');

        } catch (error) {
            console.error('Conversion failed:', error);
            setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsConverting(false);
            // Сбрасываем input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <div className="model-converter">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFolderSelect}
                // @ts-ignore - webkitdirectory не входит в стандартный тип
                webkitdirectory="true"
                multiple
                style={{ display: 'none' }}
            />

            <div className="folder-selector">
                <button
                    onClick={handleTransformClick}
                    disabled={isConverting}
                    className="transform-button"
                >
                    {isConverting ? 'Converting...' : 'Transform to RZeng'}
                </button>
            </div>

            {isConverting && (
                <div className="conversion-progress">
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="status">{status}</div>
                </div>
            )}
        </div>
    );
};

// Вспомогательные функции
function getFolderName(file: File): string {
    // webkitRelativePath содержит путь относительно выбранной папки
    const path = (file as any).webkitRelativePath;
    if (path && path.includes('/')) {
        return path.split('/')[0];
    }
    return 'model_folder';
}

function createFolderStructure(files: File[]): FolderStructure {
    const structure: FolderStructure = {};

    files.forEach(file => {
        const path = (file as any).webkitRelativePath || file.name;
        const parts = path.split('/');

        let currentLevel = structure;

        // Создаем вложенную структуру
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            if (i === parts.length - 1) {
                // Это файл
                currentLevel[part] = file;
            } else {
                // Это папка
                if (!currentLevel[part] || typeof currentLevel[part] === 'string') {
                    currentLevel[part] = {};
                }
                currentLevel = currentLevel[part] as FolderStructure;
            }
        }
    });

    return structure;
}

// components/ModelConverter.tsx - обновленная функция convertFolderToRZeng

async function convertFolderToRZeng(
  folderStructure: FolderStructure, 
  folderName: string
): Promise<ArrayBuffer> {
  // Находим PMX файл
  const pmxFile = findPmxFile(folderStructure);
  if (!pmxFile) {
    throw new Error('No PMX file found in the folder');
  }

  // Находим VMD файлы
  const vmdFiles = findVmdFiles(folderStructure);
  
  // Находим ВСЕ текстуры с полными путями
  const textureFiles = findAllTexturesWithPaths(folderStructure);

  console.log(`Converting: PMX=${pmxFile.name}, VMD=${vmdFiles.length}, Textures=${textureFiles.length}`);

  // Создаем временные URL для файлов
  const pmxUrl = URL.createObjectURL(pmxFile);
  
  const vmdUrls = await Promise.all(
    vmdFiles.map(async (vmdFile) => {
      const url = URL.createObjectURL(vmdFile.file);
      return { name: vmdFile.file.name, url };
    })
  );

  // Создаем карту текстур с полными путями
  const textureMap = new Map<string, ArrayBuffer>();
  for (const texture of textureFiles) {
    try {
      const arrayBuffer = await texture.file.arrayBuffer();
      // Сохраняем полный путь для лучшего поиска
      textureMap.set(texture.fullPath, arrayBuffer);
      // Также сохраняем под разными вариантами пути
      textureMap.set(texture.file.name, arrayBuffer);
      textureMap.set(texture.relativePath, arrayBuffer);
      
      console.log(`Mapped texture: ${texture.fullPath} (as ${texture.file.name})`);
    } catch (error) {
      console.warn(`Failed to load texture: ${texture.fullPath}`, error);
    }
  }

  try {
    // Используем конвертер для создания .rzeng
    const bundleBuffer = await RZengConverter.createBundleFromFolder(
      pmxUrl,
      vmdUrls.map(v => v.url),
      textureMap,
      {
        modelName: folderName,
        author: 'Converted from folder',
        createdAt: new Date().toISOString(),
        
      },
      
    );

    return bundleBuffer;
  } finally {
    // Очищаем временные URL
    URL.revokeObjectURL(pmxUrl);
    vmdUrls.forEach(v => URL.revokeObjectURL(v.url));
  }
}

/**
 * Находит все текстуры с полной информацией о путях
 */
function findAllTexturesWithPaths(structure: FolderStructure): Array<{
  file: File;
  fullPath: string;
  relativePath: string;
}> {
  const textureExtensions = ['.png', '.jpg', '.jpeg', '.bmp', '.tga', '.gif'];
  const textures: Array<{ file: File; fullPath: string; relativePath: string }> = [];
  
  const findTexturesRecursive = (currentStructure: FolderStructure, currentPath: string = '') => {
    for (const key in currentStructure) {
      const item = currentStructure[key];
      
      if (item instanceof File) {
        const extension = '.' + item.name.toLowerCase().split('.').pop()!;
        if (textureExtensions.includes(extension)) {
          const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
          const relativePath = (item as any).webkitRelativePath || item.name;
          
          textures.push({
            file: item,
            fullPath,
            relativePath
          });
        }
      } else if (typeof item === 'object') {
        const newPath = currentPath ? `${currentPath}/${key}` : key;
        findTexturesRecursive(item, newPath);
      }
    }
  };
  
  findTexturesRecursive(structure);
  return textures;
}

/**
 * Находит VMD файлы с путями
 */
function findVmdFiles(structure: FolderStructure): Array<{ file: File; path: string }> {
  const vmdFiles: Array<{ file: File; path: string }> = [];
  
  const findVmdRecursive = (currentStructure: FolderStructure, currentPath: string = '') => {
    for (const key in currentStructure) {
      const item = currentStructure[key];
      
      if (item instanceof File) {
        if (item.name.toLowerCase().endsWith('.vmd')) {
          const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
          vmdFiles.push({ file: item, path: fullPath });
        }
      } else if (typeof item === 'object') {
        const newPath = currentPath ? `${currentPath}/${key}` : key;
        findVmdRecursive(item, newPath);
      }
    }
  };
  
  findVmdRecursive(structure);
  return vmdFiles;
}

function findPmxFile(structure: FolderStructure): File | null {
    return findFileByExtension(structure, '.pmx');
}




function findFileByExtension(structure: FolderStructure, extension: string): File | null {
    for (const key in structure) {
        const item = structure[key];

        if (item instanceof File) {
            if (item.name.toLowerCase().endsWith(extension)) {
                return item;
            }
        } else if (typeof item === 'object') {
            const found = findFileByExtension(item, extension);
            if (found) return found;
        }
    }

    return null;
}

function findFilesByExtension(structure: FolderStructure, extension: string): File[] {
    const files: File[] = [];

    for (const key in structure) {
        const item = structure[key];

        if (item instanceof File) {
            if (item.name.toLowerCase().endsWith(extension)) {
                files.push(item);
            }
        } else if (typeof item === 'object') {
            files.push(...findFilesByExtension(item, extension));
        }
    }

    return files;
}

function downloadFile(buffer: ArrayBuffer, filename: string): void {
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

// Стили
const styles = `
.model-converter {
  margin: 20px 0;
}

.folder-selector {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.transform-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  min-width: 250px;
}

.transform-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.transform-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.selected-folder {
  background: rgba(255, 255, 255, 0.1);
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  color: #e0e0e0;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.conversion-progress {
  margin-top: 15px;
  background: rgba(255, 255, 255, 0.1);
  padding: 15px;
  border-radius: 8px;
  backdrop-filter: blur(10px);
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.status {
  font-size: 14px;
  color: #e0e0e0;
  text-align: center;
}
`;

// Добавляем стили в документ
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}