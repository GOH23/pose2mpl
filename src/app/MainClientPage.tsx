"use client"
import { useState, useEffect, useRef, SetStateAction } from "react";
import { useMPLCompiler } from "./ui/hooks/useMLPCompiler";
import CodeViewer from './ui/CodeViewer';
import { FilesetResolver, HolisticLandmarker } from "@mediapipe/tasks-vision"

import { Solver, VmdBoneFrame, VmdWriter } from '../lib/solver/mediapipe_solver';

import { modelMLCAi } from '@/lib/ai/MLC_AI';
import { useTranslation } from '@/i18n/LocaleProvider';

import { Button } from "./ui/Button";
import BlockMpl from "./ui/BlockMpl";

export type jsonState = {
  prompt?: string,
  answer: string
}

export function MainClientPage() {
  const ai_model = useRef<modelMLCAi>(null)
  const [isProcessingAll, setIsProcessingAll] = useState(false)
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const tr = useTranslation()

  const mplCompiler = useMPLCompiler()
  const [jsonState, setJsonState] = useState<jsonState[]>()
  const [processedFiles, setProcessedFiles] = useState<Set<string>>(new Set())
  const [holisticLandmarker, setHolisticLandmarker] = useState<HolisticLandmarker | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  useEffect(() => {
    ai_model.current = new modelMLCAi();
    ai_model.current.init().then(() => {
      console.log("Init engine")
    })
  }, [])
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

        }
      } else {
      }
    } catch (error) {
      console.error(`Error processing image ${file.name}:`, error)

    } finally {
      setIsProcessing(false)
    }
  }

  // Обработка видео
  const processVideo = async (file: File) => {
    if (!holisticLandmarker) {

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

            interpolation: new Uint8Array([
              0, 0, 64, 64, 64, 64, 127, 127,
              0, 0, 64, 64, 64, 64, 127, 127,
              0, 0, 64, 64, 64, 64, 127, 127,
              20, 20, 107, 107, 20, 20, 107, 107,
              20, 20, 107, 107, 20, 20, 107, 107,
              20, 20, 107, 107, 20, 20, 107, 107,
              20, 20, 107, 107, 20, 20, 107, 107,
              0, 0, 64, 64, 64, 64, 127, 127
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

      } else {

      }
    } catch (error) {
      console.error(`Error processing video ${file.name}:`, error)

    } finally {
      setIsProcessing(false)
      holisticLandmarker?.setOptions({ runningMode: "IMAGE" })
      URL.revokeObjectURL(video.src)
    }
  }

  // Унифицированная обработка файлов
  const processFile = async (file: File) => {
    if (processedFiles.has(file.name)) {

      return
    }

    setProcessedFiles(prev => new Set([...prev, file.name]))

    if (file.name.endsWith('.vpd') || file.name.endsWith(".vmd")) {
      if (!mplCompiler) {

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

      }
    } else if (file.type.startsWith('image/')) {
      await processImage(file)
    } else if (file.type.startsWith('video/')) {
      await processVideo(file)
    } else {

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
    <div className="flex flex-col mt-[100px] items-center py-4 justify-center">
      

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

        <button
          onClick={async () => {
            if (!jsonState?.length || !ai_model.current) {
              alert('Нет элементов для обработки или AI модель не инициализирована');
              return;
            }

            // Проверка размера данных перед обработкой
            const oversizedItems = jsonState.filter(item => item.answer.length > 50000);
            if (oversizedItems.length > 0) {
              alert(`Найдено ${oversizedItems.length} элементов с слишком большими данными. Попробуйте удалить их.`);
              return;
            }

            setIsProcessingAll(true);
            const results = { processed: 0, failed: 0 };

            // Последовательная обработка с задержкой
            for (let index = 0; index < jsonState.length; index++) {
              const item = jsonState[index];
              if (!item.answer?.trim()) continue;

              setLoadingStates(prev => ({ ...prev, [index]: true }));

              try {
                // Задержка 500мс между запросами для стабильности
                if (index > 0) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                }

                let response = '';
                await ai_model.current.message(item.answer, (chunk) => {
                  response += chunk;
                });

                const processedContent = response.split("</think>")[1] || '';

                // Обновляем сразу после каждого элемента
                setJsonState(prev => {
                  if (!prev) return [];
                  const updated = [...prev];
                  if (updated[index]) {
                    updated[index] = { ...updated[index], prompt: processedContent };
                  }
                  return updated;
                });

                results.processed++;
              } catch (error) {
                console.error(`Ошибка для элемента ${index}:`, error);
                results.failed++;
              } finally {
                setLoadingStates(prev => {
                  const newState = { ...prev };
                  delete newState[index];
                  return newState;
                });
              }
            }

            // Итоговое сообщение
            if (results.failed > 0) {
              alert(`Обработано: ${results.processed}, ошибок: ${results.failed}`);
            } else if (results.processed > 0) {

            }

            setIsProcessingAll(false);
          }}
          disabled={!jsonState?.length || isProcessingAll}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 
               text-white rounded-lg font-medium 
               hover:from-purple-700 hover:to-blue-700
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-all duration-200 transform hover:scale-105
               focus:outline-none focus:ring-2 focus:ring-purple-300
               flex items-center gap-2"
        >
          {isProcessingAll ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Обработка {Object.keys(loadingStates).length}/{jsonState?.length || 0}...
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              AI для всех
            </>
          )}
        </button>

      </div>


      <div className='flex flex-wrap justify-center gap-2 mt-4 w-full'>
        {jsonState?.map((item, index) => {
          // Безопасный парсинг JSON с обработкой ошибок
          let parsedAnswer;
          try {
            parsedAnswer = JSON.parse(item.answer);
          } catch {
            parsedAnswer = { error: 'Невалидный JSON' };
          }

          const isLoading = loadingStates[index];

          return (
           <BlockMpl mplCompiler={mplCompiler!} key={index} isLoading={isLoading} ai_model={ai_model.current!} parsedAnswer={parsedAnswer} item={item} index={index} setJsonState={setJsonState} setLoadingStates={setLoadingStates} />
          )
        })}
      </div>


    </div>
  );
}