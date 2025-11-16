"use client"
import { useState, useEffect } from "react";
import { useMPLCompiler } from "./ui/hooks/useMLPCompiler";
import CodeViewer from './ui/CodeViewer';
import { FilesetResolver, HolisticLandmarker } from "@mediapipe/tasks-vision"
//import { FiX, FiZap } from 'react-icons/fi';
import { Solver, VmdBoneFrame, VmdWriter } from '../lib/solver/mediapipe_solver';

import { modelMLCAi } from '@/lib/ai/MLC_AI';
import { useTranslation } from '@/i18n/LocaleProvider';
import Collapse from "./ui/Collapse";
import { Button } from "./ui/Button";
import { useMessage } from "./ui/hooks/useMessage";

export type jsonState = {
  prompt?: string,
  answer: string
}

export function MainClientPage() {
  const tr = useTranslation()
  const message = useMessage();                  
  const mplCompiler = useMPLCompiler()
  const [jsonState, setJsonState] = useState<jsonState[]>()
  const [processedFiles, setProcessedFiles] = useState<Set<string>>(new Set())
  const [holisticLandmarker, setHolisticLandmarker] = useState<HolisticLandmarker | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  useEffect(()=>{
    const test = new modelMLCAi()
    test.init()
  },[])
  // Инициализация MediaPipe Holistic
  useEffect(() => {
    let isMounted = true

    const initializeMediaPipe = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        )
        const landmarker = await HolisticLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "/mediapipe/holistic_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "IMAGE"
        })
        if (isMounted) {
          setHolisticLandmarker(landmarker)
        }
      } catch (error) {
        console.error("Failed to initialize MediaPipe:", error)
        message.error(tr("guide.error.mediaPipeInit"))
      }
    }

    initializeMediaPipe()

    return () => {
      isMounted = false
    }
  }, [tr("guide.error.mediaPipeInit")])


  // Обработка изображения
  const processImage = async (file: File) => {
    if (!holisticLandmarker) {
      message.warning(tr("guide.error.mediaPipeNotReady"))
      return
    }

    setIsProcessing(true)
    try {
      const imageBitmap = await createImageBitmap(file)
      const results = await holisticLandmarker.detect(imageBitmap)

      if (results.poseWorldLandmarks.length > 0) {
        const solver = new Solver()
        const boneStates = solver.solve(results)

        if (boneStates && mplCompiler) {
          const vpdBlob = solver.exportToVpdBlob("pose_from_image", boneStates)
          const vpdArrayBuffer = await vpdBlob.arrayBuffer()
          setJsonState(prev => [...(prev || []), {
            prompt: `Image pose: ${file.name}`,
            answer: JSON.stringify(mplCompiler.reverse_compile("vpd", new Uint8Array(vpdArrayBuffer)))
          }])

          message.success(`${file.name} processed successfully`)
        }
      } else {
        message.warning(`No pose detected in ${file.name}`)
      }
    } catch (error) {
      console.error(`Error processing image ${file.name}:`, error)
      message.error(`${tr("guide.error.processError")}: ${file.name}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Обработка видео
  const processVideo = async (file: File) => {
    if (!holisticLandmarker) {
      message.warning(tr("guide.error.mediaPipeNotReady"))
      return
    }

    setIsProcessing(true)
    const video = document.createElement('video')
    video.src = URL.createObjectURL(file)

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = reject
      })

      await holisticLandmarker.setOptions({ runningMode: "VIDEO" })

      const fps = 30
      const totalFrames = Math.floor(video.duration * fps)
      const framesToProcess = Math.min(totalFrames, 300)
      const skipInterval = Math.max(1, Math.floor(totalFrames / framesToProcess))

      const animationFrames = []

      for (let i = 0; i < framesToProcess; i += skipInterval) {
        const time = i / fps
        video.currentTime = time

        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve()
        })

        const timestamp = time * 1000
        const results = holisticLandmarker.detectForVideo(video, timestamp)

        if (results.poseWorldLandmarks.length > 0) {
          const solver = new Solver()
          const boneStates = solver.solve(results)

          if (boneStates) {
            animationFrames.push({
              frame: i,
              boneStates: boneStates
            })
          }
        }
      }

      if (animationFrames.length > 0) {

        const boneFrames: VmdBoneFrame[] = animationFrames.flatMap(animationFrame =>
          animationFrame.boneStates.map(boneState => ({
            boneName: boneState.name,
            frame: animationFrame.frame,
            rotation: boneState.rotation,
            // Добавляем стандартные интерполяционные кривые для корректной работы
            interpolation: new Uint8Array([
              0, 0, 64, 64, 64, 64, 127, 127,  // Перемещение X
              0, 0, 64, 64, 64, 64, 127, 127,  // Перемещение Y
              0, 0, 64, 64, 64, 64, 127, 127,  // Перемещение Z
              20, 20, 107, 107, 20, 20, 107, 107,  // Вращение X (более плавное)
              20, 20, 107, 107, 20, 20, 107, 107,  // Вращение Y
              20, 20, 107, 107, 20, 20, 107, 107,  // Вращение Z
              20, 20, 107, 107, 20, 20, 107, 107,  // Вращение W
              0, 0, 64, 64, 64, 64, 127, 127   // Физика/морфы (не используется)
            ])
          })))
          
        const fileData = await VmdWriter.ConvertToVmdBlob({
          modelName: "Test",
          boneFrames: boneFrames
        }).arrayBuffer()
        console.log(fileData)
        setJsonState(prev => [...(prev || []), {
          prompt: `Video animation: ${file.name} (${animationFrames.length} frames)`,
          answer: JSON.stringify(mplCompiler!.reverse_compile("vmd", new Uint8Array(fileData)))
        }])

        message.success(`${file.name} processed successfully (${animationFrames.length} frames)`)
      } else {
        message.warning(`No pose detected in ${file.name}`)
      }
    } catch (error) {
      console.error(`Error processing video ${file.name}:`, error)
      message.error(`${tr("guide.error.processError")}: ${file.name}`)
    } finally {
      setIsProcessing(false)
      holisticLandmarker?.setOptions({ runningMode: "IMAGE" })
      URL.revokeObjectURL(video.src)
    }
  }

  // Унифицированная обработка файлов
  const processFile = async (file: File) => {
    if (processedFiles.has(file.name)) {
      message.info(`${file.name} already processed`)
      return
    }

    setProcessedFiles(prev => new Set([...prev, file.name]))

    if (file.name.endsWith('.vpd') || file.name.endsWith(".vmd")) {
      if (!mplCompiler) {
        message.warning(tr("guide.error.compilerNotReady"))
        return
      }
      try {
        const result = mplCompiler.reverse_compile(
          file.name.endsWith(".vmd") ? "vmd" : "vpd",
          new Uint8Array(await file.arrayBuffer())
        )
        setJsonState(prev => [...(prev || []), {
          prompt: undefined,
          answer: JSON.stringify(result)
        }])
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error)
        message.error(`${tr("guide.error.processError")}: ${file.name}`)
      }
    } else if (file.type.startsWith('image/')) {
      await processImage(file)
    } else if (file.type.startsWith('video/')) {
      await processVideo(file)
    } else {
      message.warning(`Unsupported file type: ${file.name}`)
    }
  }

  // Обработчик drag-and-drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      await processFile(file)
    }
  }

  // Обработчик клика
  const handleClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.vpd,.vmd,image/*,video/*'
    input.multiple = true
    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement
      if (target.files) {
        const files = Array.from(target.files)
        for (const file of files) {
          await processFile(file)
        }
      }
    }
    input.click()
  }

  return (
    <div className="flex flex-col items-center py-4 justify-center">
      {/* Информационная панель */}
      <div className="w-full max-w-4xl mb-6">
        <Collapse
          defaultActiveKey={['1']}
          items={[
            {
              key: '1',
              label: tr("guide.title"),
              children: (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-bold text-lg mb-2">{tr("guide.howToUse1")}</h3>
                    <p>{tr("guide.howToUse2")}</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold">{tr("guide.guide_instruction1.instruction1")}</h4>
                    <ol className="list-decimal list-inside space-y-1 ml-4">
                      <li>{tr("guide.guide_instruction1.instruction2")}</li>
                      <li>{tr("guide.guide_instruction1.instruction3")}</li>
                      <li>{tr("guide.guide_instruction1.instruction4")}</li>
                      <li>{tr("guide.guide_instruction1.instruction5")}</li>
                    </ol>
                  </div>,

                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">{tr("guide.newFeatureTitle")}</h4>
                    <p>{tr("guide.newFeatureText")}</p>
                    <ul className="list-disc list-inside ml-4 mt-2">
                      <li>• {tr("guide.supportedFormats.images")}</li>
                      <li>• {tr("guide.supportedFormats.videos")}</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">{tr("guide.howToUse2")}</h4>
                    <ul className="space-y-1">
                      <li>• <strong>GitHub Issues:</strong> <a href="https://github.com/GOH23/pose2mpl/issues" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{tr("guide.createIssue")}</a></li>
                      <li>• <strong>Email:</strong> <a href="mailto:goh10117@gmail.com" className="text-blue-600 hover:underline">goh10117@gmail.com</a></li>
                      <li>• <strong>Telegram:</strong> <a href="https://t.me/goh222" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">@goh222</a></li>
                      <li>• <strong>GitHub:</strong> <a href="https://github.com/GOH23/pose2mpl" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{tr("guide.openSourceText")}</a></li>
                    </ul>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">{tr("guide.howToUse4")}</h4>
                    <ul className="space-y-1">
                      <li>{tr("guide.guide_instruction2.instruction1")}</li>
                      <li>{tr("guide.guide_instruction2.instruction2")}</li>
                      <li>{tr("guide.guide_instruction2.instruction3")}</li>
                      <li>{tr("guide.guide_instruction2.instruction4")}</li>
                    </ul>
                  </div>
                </div>
              )
            }
          ]}
        />
      </div>

      {/* Индикатор обработки */}
      {isProcessing && (
        <div className="w-full max-w-4xl mb-4">
          <div className="bg-blue-100 p-4 rounded-lg text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2">{tr("guide.processing")}</p>
          </div>
        </div>
      )}

      {/* Зона загрузки файлов */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
        onDrop={handleDrop}
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault()
        }}
        onClick={handleClick}
      >
        <div className="text-4xl mb-4">📁</div>
        <p className="text-lg font-medium mb-2">{tr("guide.clickAndSelect")}</p>
        <p className="text-gray-500">
          {tr("guide.allowedExtentionText")}
        </p>
        <p className="text-sm text-gray-400 mt-2">
          {tr("guide.supportedFormats.images")} • {tr("guide.supportedFormats.videos")} • VPD • VMD
        </p>
      </div>

      {/* Кнопки управления */}
      <div className='mt-4 flex gap-2'>
        <Button
          onClick={() => {
            const result = jsonState?.map(el => {
              return JSON.stringify({
                messages: [
                  { role: "system", content: "Generate MMD Pose Language (MPL) script from description." },
                  { role: "user", content: `Description: ${el.prompt}` },
                  { role: "assistant", content: JSON.parse(el.answer) }
                ]
              })
            })
            const blob = new Blob([result?.join('\n') || ''], { type: 'application/jsonl' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'dataset.jsonl'
            a.click()
          }}
          disabled={!jsonState || jsonState.length === 0}
        >
          {tr("guide.downloadTitle")}
        </Button>
        <Button
          onClick={() => {
            setJsonState([])
            setProcessedFiles(new Set())
          }}
          disabled={!jsonState || jsonState.length === 0}
        >
          {tr("guide.clearAllTitle")}
        </Button>
      </div>

      {/* Список обработанных файлов */}
      <div className='flex flex-wrap justify-center gap-2 mt-4 w-full'>
        {jsonState?.map((el, index) => {
          return (
            <div className='border-2 border-gray-300 rounded-lg p-2 w-full relative max-w-[400px]' key={index}>
              <div className='my-2 flex gap-x-2 justify-end'>
                <button
                  type="button"
                  onClick={() => {

                  }}
                  className="px-3 py-2 bg-gradient-to-r from-purple-500 to-blue-500 
                     text-white rounded-lg font-medium text-sm
                     hover:from-purple-600 hover:to-blue-600
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 transform hover:scale-105 active:scale-95
                     focus:outline-none focus:ring-2 focus:ring-purple-300
                     flex items-center gap-1"

                >

                  <span>AI</span>

                </button>

                <button
                  type='button'
                  className='cursor-pointer px-3 py-2 flex items-center justify-center bg-red-500 text-white rounded-md'
                  onClick={() => {
                    setJsonState(jsonState?.filter((item, i) => i !== index))
                  }}
                >
                  X
                </button>
              </div>
              <input
                className='w-full mb-2 border border-gray-300 rounded-md p-2'
                placeholder='Prompt'
                type="text"
                value={el.prompt}
                onChange={(e) => {
                  setJsonState(jsonState?.map((item, i) => {
                    if (i === index) {
                      return { ...item, prompt: e.target.value }
                    }
                    return item
                  }))
                }}
              />
              <CodeViewer readOnly value={JSON.parse(el.answer)} />
            </div>
          )
        })}
      </div>

    </div>
  );
}