"use client"

import { Engine } from "@/lib/engine/engine"
import { useRef, useState, useCallback, useEffect } from "react"
import { ModelConverter } from "../ui/conv"
import { Vec3 } from "@/lib/engine/math"

export function ViewPage() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const engineRef = useRef<Engine | null>(null)
    const [modelLoaded, setModelLoaded] = useState(false)
    const [engineError, setEngineError] = useState<string | null>(null)
    const [showMenu, setShowMenu] = useState(true)
    const [showStats, setShowStats] = useState(true)
    const [currentStats, setCurrentStats] = useState<any>(null)
    const [animationPlaying, setAnimationPlaying] = useState(false)

    // Новые состояния
    const [showAdvancedControls, setShowAdvancedControls] = useState(false)
    const [wireframeMode, setWireframeMode] = useState(false)
    const [bloomEnabled, setBloomEnabled] = useState(true)
    const [cameraPreset, setCameraPreset] = useState("default")
    const [modelInfo, setModelInfo] = useState<any>(null)

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

                await engine.loadModel("Kirara (2).rzeng")

                // Получаем информацию о модели
                const info = engine.getModelInfo()
                setModelInfo(info)

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

    // Новые обработчики
    const handleToggleWireframe = () => {
        setWireframeMode(!wireframeMode)
        if (engineRef.current) {
            engineRef.current.toggleWireframe(!wireframeMode)
        }
    }

    const handleToggleBloom = () => {
        setBloomEnabled(!bloomEnabled)
        if (engineRef.current) {
            engineRef.current.toggleBloom(!bloomEnabled)
        }
    }

    const handleScreenshot = () => {
        if (engineRef.current) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
            engineRef.current.takeScreenshot(`screenshot-${timestamp}.png`)
        }
    }

    const handleResetCamera = () => {
        if (engineRef.current) {
            engineRef.current.resetCamera()
            setCameraPreset("default")
        }
    }

    const handleCameraPreset = (preset: string) => {
        if (!engineRef.current) return

        setCameraPreset(preset)
        const camera = engineRef.current.getCamera()

        switch (preset) {
            case "front":
                camera.alpha = 0
                camera.beta = Math.PI / 2
                camera.radius = 20
                break
            case "side":
                camera.alpha = Math.PI / 2
                camera.beta = Math.PI / 2
                camera.radius = 20
                break
            case "top":
                camera.alpha = 0
                camera.beta = 0.1
                camera.radius = 15
                break
            case "close":
                camera.radius = 8
                break
            case "far":
                camera.radius = 40
                break
            default:
                return
        }
        camera.markDirty()
    }

    const handleCenterModel = () => {
        if (engineRef.current) {
            // Центрируем камеру на модель
            engineRef.current.setCameraPosition(new Vec3(0, 12.5, 0), 26.6)
        }
    }

    // Экспорт
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

    return (
        <>
            <div className="mt-20"></div>
            <div className="relative w-full h-full">
                <canvas ref={canvasRef} className="w-full h-full block" />

                {/* Меню управления */}
                {showMenu && (
                    <div className="absolute top-4 z-40 left-4 bg-white bg-opacity-90 rounded-lg shadow-lg p-4 min-w-64 max-w-96 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg">Управление</h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowAdvancedControls(!showAdvancedControls)}
                                    className="text-sm px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                                >
                                    {showAdvancedControls ? 'Скрыть' : 'Расшир.'}
                                </button>
                                <button
                                    onClick={() => setShowMenu(false)}
                                    className="text-gray-500 hover:text-gray-700"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Информация о модели */}
                        {modelInfo && (
                            <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
                                <h4 className="font-semibold mb-2 text-blue-800">Модель:</h4>
                                <div className="text-sm space-y-1 text-blue-700">
                                    <div>Вершин: <span className="font-mono">{modelInfo.vertexCount.toLocaleString()}</span></div>
                                    <div>Костей: <span className="font-mono">{modelInfo.boneCount}</span></div>
                                    <div>Материалов: <span className="font-mono">{modelInfo.materialCount}</span></div>
                                    <div>Текстур: <span className="font-mono">{modelInfo.textureCount}</span></div>
                                </div>
                            </div>
                        )}

                        {/* Статистика */}
                        {showStats && currentStats && (
                            <div className="mb-4 p-3 bg-gray-100 rounded">
                                <h4 className="font-semibold mb-2">Статистика:</h4>
                                <div className="text-sm space-y-1">
                                    <div>FPS: <span className="font-mono">{currentStats.fps}</span></div>
                                    <div>Frame Time: <span className="font-mono">{currentStats.frameTime}ms</span></div>
                                    <div>GPU Memory: <span className="font-mono">{currentStats.gpuMemory}MB</span></div>
                                    <div>Draw Calls: <span className="font-mono">{currentStats.drawCalls}</span></div>
                                </div>
                            </div>
                        )}

                        {/* Основные кнопки управления */}
                        <div className="space-y-3">
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
                                    {animationPlaying ? '⏹ Стоп анимация' : '▶ Старт анимация'}
                                </button>
                            </div>

                            {/* Снимок экрана */}
                            <button
                                onClick={handleScreenshot}
                                className="w-full px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600"
                            >
                                📸 Сделать снимок
                            </button>

                            {/* Расширенные контролы */}
                            {showAdvancedControls && (
                                <>
                                    <div className="border-t pt-3">
                                        <h4 className="font-semibold mb-2 text-sm">Визуальные эффекты:</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={handleToggleWireframe}
                                                className={`px-3 py-2 rounded text-sm ${wireframeMode
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-200 hover:bg-gray-300'
                                                    }`}
                                            >
                                                {wireframeMode ? '✅ Wireframe' : '📐 Wireframe'}
                                            </button>
                                            <button
                                                onClick={handleToggleBloom}
                                                className={`px-3 py-2 rounded text-sm ${bloomEnabled
                                                    ? 'bg-yellow-500 text-white'
                                                    : 'bg-gray-200 hover:bg-gray-300'
                                                    }`}
                                            >
                                                {bloomEnabled ? '✨ Bloom ON' : '💡 Bloom OFF'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="border-t pt-3">
                                        <h4 className="font-semibold mb-2 text-sm">Камера:</h4>
                                        <div className="grid grid-cols-3 gap-2 mb-2">
                                            <button
                                                onClick={() => handleCameraPreset("front")}
                                                className={`px-2 py-1 text-xs rounded ${cameraPreset === "front" ? 'bg-blue-100 border border-blue-300' : 'bg-gray-100 hover:bg-gray-200'}`}
                                            >
                                                🎯 Фронт
                                            </button>
                                            <button
                                                onClick={() => handleCameraPreset("side")}
                                                className={`px-2 py-1 text-xs rounded ${cameraPreset === "side" ? 'bg-blue-100 border border-blue-300' : 'bg-gray-100 hover:bg-gray-200'}`}
                                            >
                                                ↔ Бок
                                            </button>
                                            <button
                                                onClick={() => handleCameraPreset("top")}
                                                className={`px-2 py-1 text-xs rounded ${cameraPreset === "top" ? 'bg-blue-100 border border-blue-300' : 'bg-gray-100 hover:bg-gray-200'}`}
                                            >
                                                📐 Сверху
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={handleResetCamera}
                                                className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                                            >
                                                🔄 Сброс камеры
                                            </button>
                                            <button
                                                onClick={handleCenterModel}
                                                className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                                            >
                                                🎯 Центровать
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="border-t pt-3">
                                <h4 className="font-semibold mb-2 text-sm">Экспорт:</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={handleExportFBX}
                                        disabled={!modelLoaded}
                                        className={`px-3 py-2 rounded text-sm ${!modelLoaded ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-500 hover:bg-purple-600 text-white'
                                            }`}
                                    >
                                        📁 FBX
                                    </button>
                                    <button
                                        onClick={handleExportGLTF}
                                        disabled={!modelLoaded}
                                        className={`px-3 py-2 rounded text-sm ${!modelLoaded ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-500 hover:bg-purple-600 text-white'
                                            }`}
                                    >
                                        📁 GLTF
                                    </button>
                                    <button
                                        onClick={handleExportBlender}
                                        disabled={!modelLoaded}
                                        className={`px-3 py-2 rounded text-sm ${!modelLoaded ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                                            }`}
                                    >
                                        🎨 Blender
                                    </button>
                                    <button
                                        onClick={handleExportUnity}
                                        disabled={!modelLoaded}
                                        className={`px-3 py-2 rounded text-sm ${!modelLoaded ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                                            }`}
                                    >
                                        🎮 Unity
                                    </button>
                                </div>
                            </div>

                            <div className="border-t pt-3">
                                <h4 className="font-semibold mb-2 text-sm">Отладка:</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => console.log(engineRef.current)}
                                        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                                    >
                                        🔧 Debug Engine
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
                        ☰ Меню
                    </button>
                )}

                {/* Панель быстрых пресетов камеры */}
                <div className="absolute top-4 right-4 flex flex-col gap-2">
                    <div className="bg-white bg-opacity-90 rounded-lg shadow-lg p-2">
                        <div className="text-xs font-semibold mb-1 text-center">Камера:</div>
                        <div className="grid grid-cols-2 gap-1">
                            <button
                                onClick={() => handleCameraPreset("close")}
                                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                            >
                                🔍 Ближе
                            </button>
                            <button
                                onClick={() => handleCameraPreset("far")}
                                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                            >
                                📏 Дальше
                            </button>
                        </div>
                    </div>

                    {/* Быстрый доступ к эффектам */}
                    <div className="bg-white bg-opacity-90 rounded-lg shadow-lg p-2">
                        <div className="text-xs font-semibold mb-1 text-center">Эффекты:</div>
                        <div className="flex gap-1">
                            <button
                                onClick={handleToggleBloom}
                                className={`flex-1 px-2 py-1 text-xs rounded ${bloomEnabled ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100'}`}
                            >
                                {bloomEnabled ? '✨' : '💡'}
                            </button>
                            <button
                                onClick={handleToggleWireframe}
                                className={`flex-1 px-2 py-1 text-xs rounded ${wireframeMode ? 'bg-blue-100 text-blue-800' : 'bg-gray-100'}`}
                            >
                                {wireframeMode ? '✅' : '📐'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Индикатор загрузки */}
                {!modelLoaded && !engineError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-3"></div>
                            <div className="text-gray-600 font-medium">Загрузка модели...</div>
                            {modelInfo && (
                                <div className="text-xs text-gray-500 mt-2">
                                    Загружено: {modelInfo.vertexCount.toLocaleString()} вершин
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Ошибка */}
                {engineError && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-red-500 text-center bg-white p-6 rounded-lg shadow-lg max-w-md">
                            <div className="font-bold mb-2 text-lg">❌ Ошибка загрузки</div>
                            <div className="mb-4">{engineError}</div>
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
                    <div className="absolute bottom-4 right-4 bg-green-500 text-white px-3 py-2 rounded-full text-sm animate-pulse flex items-center gap-2">
                        <span className="animate-pulse">▶</span>
                        Анимация воспроизводится
                    </div>
                )}

                {/* Индикатор режимов */}
                <div className="absolute bottom-4 left-4 flex gap-2">
                    {wireframeMode && (
                        <div className="bg-blue-500 text-white px-2 py-1 rounded text-xs">
                            Wireframe
                        </div>
                    )}
                    {!bloomEnabled && (
                        <div className="bg-yellow-500 text-white px-2 py-1 rounded text-xs">
                            Bloom OFF
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}