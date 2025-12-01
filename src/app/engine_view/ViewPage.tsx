"use client"

import { Engine } from "@/lib/engine/engine"
import { useRef, useState, useCallback, useEffect } from "react"
import { ModelConverter } from "../ui/conv"

export function ViewPage() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const engineRef = useRef<Engine | null>(null)
    const [modelLoaded, setModelLoaded] = useState(false)
    const [engineError, setEngineError] = useState<string | null>(null)
    const [showMenu, setShowMenu] = useState(true)
    const [showStats, setShowStats] = useState(false)
    const [currentStats, setCurrentStats] = useState<any>(null)
    const [animationPlaying, setAnimationPlaying] = useState(false)
    const isMountedRef = useRef(false)
    const isInitializingRef = useRef(false)

    // Статистика обновляется в реальном времени
    const updateStats = useCallback(() => {
        if (engineRef.current && showStats) {
            const stats = engineRef.current.getStats()
            setCurrentStats(stats)
        }
    }, [showStats])

    const initEngine = useCallback(async () => {
        if (isInitializingRef.current || engineRef.current) return

        isInitializingRef.current = true

        if (canvasRef.current && isMountedRef.current) {
            try {
                const engine = new Engine(canvasRef.current, {
                    ambient: 0.96,
                    rimLightIntensity: 0.2,
                    bloomIntensity: 0.06,
                })
                engineRef.current = engine
                await engine.init()

                await engine.loadModel("models/Kirara.rzeng")
                //await engine.loadModel("/塞尔凯特/塞尔凯特.pmx")
                // Run render loop only if still mounted and animating
                if (isMountedRef.current) {
                    engine.runRenderLoop(() => {
                        updateStats()
                    })
                    setTimeout(() => {
                        if (isMountedRef.current) {
                            setModelLoaded(true)
                        }
                    }, 200)
                }

            } catch (error) {
                if (isMountedRef.current) {
                    setEngineError(error instanceof Error ? error.message : "Unknown error")
                }
            } finally {
                isInitializingRef.current = false
            }
        }
    }, [updateStats])

    useEffect(() => {
        isMountedRef.current = true
        initEngine()

        return () => {
            isMountedRef.current = false

            if (engineRef.current) {
                // Stop render loop explicitly
                engineRef.current.stopRenderLoop?.()
                engineRef.current.dispose()
                engineRef.current = null
            }
        }
    }, [initEngine])

    // Обработчики действий
    const handlePlayAnimation = async () => {
        if (engineRef.current) {
            await engineRef.current.loadAnimation("/Way Back Home Motion.vmd")
            engineRef.current.playAnimation()
            setAnimationPlaying(true)
        }
    }

    const handleStopAnimation = () => {
        if (engineRef.current) {
            engineRef.current.stopAnimation()
            setAnimationPlaying(false)
        }
    }

    const handleExportFBX = async () => {
        if (engineRef.current) {
            try {
                await engineRef.current.exportToFBX("my_animation.fbx")
            } catch (error) {
                console.error("Export failed:", error)
            }
        }
    }

    const handleExportGLTF = async () => {
        if (engineRef.current) {
            try {
                await engineRef.current.exportToGLTF("my_animation.gltf")
            } catch (error) {
                console.error("Export failed:", error)
            }
        }
    }

    const handleExportBlender = async () => {
        if (engineRef.current) {
            try {
                await engineRef.current.exportToBlender("my_animation_blender.json")
            } catch (error) {
                console.error("Export failed:", error)
            }
        }
    }

    const handleExportUnity = async () => {
        if (engineRef.current) {
            try {
                await engineRef.current.exportToUnity("my_animation_unity.json")
            } catch (error) {
                console.error("Export failed:", error)
            }
        }
    }

    const handleToggleBloom = () => {
        // Здесь можно добавить логику для переключения bloom
        console.log("Toggle bloom - нужно реализовать в Engine")
    }

    const handleToggleWireframe = () => {
        // Здесь можно добавить логику для wireframe режима
        console.log("Toggle wireframe - нужно реализовать в Engine")
    }

    return (
        <>
            <div className="mt-20"></div>
            <div className="relative w-full h-full">
                <canvas ref={canvasRef} className="w-full h-full block" />

                {/* Меню управления */}
                {showMenu && (
                    <div className="absolute top-4 z-40 left-4 bg-white bg-opacity-90 rounded-lg shadow-lg p-4 min-w-64">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg">Управление</h3>
                            <button
                                onClick={() => setShowMenu(false)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Статистика */}
                        {showStats && currentStats && (
                            <div className="mb-4 p-3 bg-gray-100 rounded">
                                <h4 className="font-semibold mb-2">Статистика:</h4>
                                <div className="text-sm space-y-1">
                                    <div>FPS: <span className="font-mono">{currentStats.fps}</span></div>
                                    <div>Frame Time: <span className="font-mono">{currentStats.frameTime}ms</span></div>
                                    <div>GPU Memory: <span className="font-mono">{currentStats.gpuMemory}MB</span></div>
                                </div>
                            </div>
                        )}

                        {/* Кнопки управления */}
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setShowStats(!showStats)}
                                    className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                                >
                                    {showStats ? 'Скрыть stats' : 'Показать stats'}
                                </button>

                                <button
                                    onClick={animationPlaying ? handleStopAnimation : handlePlayAnimation}
                                    disabled={!modelLoaded}
                                    className={`px-3 py-2 rounded text-sm ${!modelLoaded
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : animationPlaying
                                            ? 'bg-red-500 hover:bg-red-600 text-white'
                                            : 'bg-green-500 hover:bg-green-600 text-white'
                                        }`}
                                >
                                    {animationPlaying ? 'Стоп анимация' : 'Старт анимация'}
                                </button>
                            </div>

                            <div className="border-t pt-2">
                                <h4 className="font-semibold mb-2 text-sm">Экспорт:</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={handleExportFBX}
                                        disabled={!modelLoaded}
                                        className={`px-3 py-2 rounded text-sm ${!modelLoaded ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-500 hover:bg-purple-600 text-white'
                                            }`}
                                    >
                                        FBX
                                    </button>
                                    <button
                                        onClick={handleExportGLTF}
                                        disabled={!modelLoaded}
                                        className={`px-3 py-2 rounded text-sm ${!modelLoaded ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-500 hover:bg-purple-600 text-white'
                                            }`}
                                    >
                                        GLTF
                                    </button>
                                    <button
                                        onClick={handleExportBlender}
                                        disabled={!modelLoaded}
                                        className={`px-3 py-2 rounded text-sm ${!modelLoaded ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                                            }`}
                                    >
                                        Blender
                                    </button>
                                    <button
                                        onClick={handleExportUnity}
                                        disabled={!modelLoaded}
                                        className={`px-3 py-2 rounded text-sm ${!modelLoaded ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                                            }`}
                                    >
                                        Unity
                                    </button>
                                </div>
                            </div>

                            <div className="border-t pt-2">
                                <h4 className="font-semibold mb-2 text-sm">Тесты:</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={handleToggleBloom}
                                        className="px-3 py-2 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
                                    >
                                        Bloom
                                    </button>
                                    <button
                                        onClick={handleToggleWireframe}
                                        className="px-3 py-2 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                                    >
                                        Wireframe
                                    </button>
                                    <button
                                        onClick={() => console.log(engineRef.current)}
                                        className="px-3 py-2 bg-gray-700 text-white rounded text-sm hover:bg-gray-800 col-span-2"
                                    >
                                        Debug Engine
                                    </button>
                                    <ModelConverter />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Кнопка показа меню когда скрыто */}
                {!showMenu && (
                    <button
                        onClick={() => setShowMenu(true)}
                        className="absolute top-4 left-4 bg-white bg-opacity-90 rounded-lg shadow-lg p-3 hover:bg-opacity-100"
                    >
                        ☰
                    </button>
                )}

                {/* Индикатор загрузки */}
                {!modelLoaded && !engineError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                            <div className="text-gray-600">Загрузка модели...</div>
                        </div>
                    </div>
                )}

                {/* Ошибка */}
                {engineError && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-red-500 text-center bg-white p-4 rounded-lg shadow-lg">
                            <div className="font-bold mb-2">Ошибка загрузки</div>
                            <div>{engineError}</div>
                            <button
                                onClick={initEngine}
                                className="mt-3 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                                Попробовать снова
                            </button>
                        </div>
                    </div>
                )}

                {/* Индикатор анимации */}
                {animationPlaying && (
                    <div className="absolute bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm animate-pulse">
                        ▶ Анимация воспроизводится
                    </div>
                )}
            </div>
        </>
    )
}