import { RZengConverter } from "./rzeng-converter"

// folder-to-rzeng.ts
export class FolderToRZeng {
  static async convert(
    modelFolder: string,
    outputName: string = 'model'
  ): Promise<void> {
    // Находим PMX файл в папке
    const pmxFile = await this.findPmxFile(modelFolder)
    if (!pmxFile) {
      throw new Error('No PMX file found in the folder')
    }
    
    // Находим VMD файлы анимаций
    const vmdFiles = await this.findVmdFiles(modelFolder)
    
    // Извлекаем метаданные из имени папки
    const folderName = modelFolder.split('/').filter(Boolean).pop() || 'model'
    const metadata = {
      modelName: folderName,
      author: 'Converted from folder',
      createdAt: new Date().toISOString()
    }
    
    // Создаем бандл
    const bundleBuffer = await RZengConverter.createBundle(
      pmxFile,
      vmdFiles,
      metadata
    )
    
    // Сохраняем файл
    this.downloadFile(bundleBuffer, `${outputName}.rzeng`)
  }
  
  private static async findPmxFile(folderPath: string): Promise<string | null> {
    try {
      // В реальном приложении здесь был бы запрос к серверу для получения списка файлов
      // Для демонстрации предполагаем, что знаем структуру
      const response = await fetch(`${folderPath}/?list=files`)
      const files = await response.json()
      
      const pmxFile = files.find((file: string) => file.toLowerCase().endsWith('.pmx'))
      return pmxFile ? `${folderPath}/${pmxFile}` : null
    } catch {
      // Fallback: пробуем стандартные имена
      const possibleNames = ['绮良良.pmx', 'character.pmx', 'file.pmx']
      for (const name of possibleNames) {
        try {
          const testPath = `${folderPath}/${name}`
          const response = await fetch(testPath, { method: 'HEAD' })
          if (response.ok) return testPath
        } catch {
          continue
        }
      }
      return null
    }
  }
  
  private static async findVmdFiles(folderPath: string): Promise<string[]> {
    try {
      const response = await fetch(`${folderPath}/?list=files`)
      const files = await response.json()
      
      return files
        .filter((file: string) => file.toLowerCase().endsWith('.vmd'))
        .map((file: string) => `${folderPath}/${file}`)
    } catch {
      return []
    }
  }
  
  private static downloadFile(buffer: ArrayBuffer, filename: string): void {
    const blob = new Blob([buffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}