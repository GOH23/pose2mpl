import { Engine } from "@/lib/engine"
import { WasmMPLCompiler } from "mmd-mpl";
import { useCallback, useEffect, useRef, useState } from "react"

interface ViewerMplProps {
    mplCompiler: WasmMPLCompiler,
    isAnimating?: boolean;
    mpl_code: string
}

export function ViewerMpl({ isAnimating = true, mplCompiler, mpl_code }: ViewerMplProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const engineRef = useRef<Engine | null>(null)
    const [modelLoaded, setModelLoaded] = useState(false)
    const [engineError, setEngineError] = useState<string | null>(null)
    const isMountedRef = useRef(false)
    const isInitializingRef = useRef(false)

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
                await engine.loadModel("/models/Kirara/绮良良.pmx")

                // Run render loop only if still mounted and animating
                if (isMountedRef.current && isAnimating) {
                    engine.runRenderLoop(() => { })
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
    }, [isAnimating]) // Зависимость от isAnimating

    useEffect(() => {
        isMountedRef.current = true
        void initEngine()

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

    // Handle animation start/stop
    useEffect(() => {
        const engine = engineRef.current
        if (!engine) return

        let isCancelled = false
        let animationUrl: string | null = null

        const loadAndPlayAnimation = async () => {
            try {
                // Compile MPL bytecode
                console.log(mpl_code)
                const bytes = mplCompiler.compile(JSON.parse(mpl_code))
                console.log(bytes.length)
                const fileBlob = new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" })
                animationUrl = URL.createObjectURL(fileBlob)

                // Load animation data
                await engine.loadAnimation(animationUrl)
                engine.playAnimation()
            } catch (error) {
                console.error("Failed to load animation:", error)
            } finally {
                // Clean up blob URL immediately after loading
                if (animationUrl) {
                    URL.revokeObjectURL(animationUrl)
                    animationUrl = null
                }
            }
        }

        if (isAnimating) {
            // Start animation
            void loadAndPlayAnimation()
        } else {
            // Stop animation and clean up
            engine.stopAnimation()
        }

        return () => {
            // Cleanup on dependency change or unmount
            isCancelled = true
            engine.stopAnimation()
            if (animationUrl) {
                URL.revokeObjectURL(animationUrl)
            }
        }
    }, [isAnimating, mplCompiler, mpl_code]) // Все зависимости явно указаны

    return (
        <div className="relative w-full h-full">
            <canvas ref={canvasRef} className="w-full h-full block" />

            {!modelLoaded && !engineError && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            )}

            {engineError && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-red-500 text-center bg-white p-4 rounded-lg shadow-lg">
                        Ошибка загрузки: {engineError}
                    </div>
                </div>
            )}
        </div>
    )
}