// engine-optimized.ts
//v0.2.11 - Optimized Render Engine
import { Camera } from "./camera"
import { Quat, Vec3 } from "./math"
import { Material, Model, Texture } from "./model"
import { PmxLoader } from "./pmx-loader"
import { Physics } from "./physics"
import { VMDKeyFrame, VMDLoader } from "./vmd-loader"
import { AnimationExporter, downloadBlob, ExportOptions } from "./animation-exporter"
import outlineShaderCode from "./shaders/outlineShaderCode.wgsl"
import shaderCode from "./shaders/shaderCode.wgsl"
import bloomExtractShaderCode from './shaders/bloomExtractShaderCode.wgsl'
import computeShaderCode from "./shaders/computeShaderCode.wgsl"
import depthOnlyShaderCode from "./shaders/depthOnlyShader.wgsl"
import bloomBlurShaderCode from "./shaders/bloomBlurShaderCode.wgsl"
import bloomComposeShaderCode from "./shaders/bloomComposeShaderCode.wgsl"
import { RZengLoader } from "./rzeng/rzeng-loader"

export type EngineOptions = {
    ambient?: number
    bloomIntensity?: number
    rimLightIntensity?: number
    cameraDistance?: number
    cameraTarget?: Vec3
}

export interface EngineStats {
    fps: number
    frameTime: number // ms
    gpuMemory: number // MB (estimated total GPU memory)
    drawCalls: number
}

interface DrawCall {
    count: number
    firstIndex: number
    bindGroup: GPUBindGroup
    isTransparent: boolean
}

interface Batch {
    bindGroup: GPUBindGroup
    startIndex: number
    count: number
    pipeline: GPURenderPipeline
}

type BoneKeyFrame = {
    boneName: string
    time: number
    rotation: Quat
}

export class Engine {
    // Canvas and WebGPU context
    private canvas: HTMLCanvasElement
    private device!: GPUDevice
    private context!: GPUCanvasContext
    private presentationFormat!: GPUTextureFormat

    // Camera
    private camera!: Camera
    private cameraUniformBuffer!: GPUBuffer
    private cameraMatrixData = new Float32Array(36)
    private cameraDistance: number = 26.6
    private cameraTarget: Vec3 = new Vec3(0, 12.5, 0)

    // Lighting
    private lightUniformBuffer!: GPUBuffer
    private lightData = new Float32Array(64)
    private lightCount = 0
    private ambient: number = 1.0

    // Geometry buffers
    private vertexBuffer!: GPUBuffer
    private indexBuffer?: GPUBuffer
    private jointsBuffer!: GPUBuffer
    private weightsBuffer!: GPUBuffer

    // Skinning
    private skinMatrixBuffer?: GPUBuffer
    private worldMatrixBuffer?: GPUBuffer
    private inverseBindMatrixBuffer?: GPUBuffer
    private boneCountBuffer?: GPUBuffer
    private skinMatrixComputePipeline?: GPUComputePipeline
    private skinMatrixComputeBindGroup?: GPUBindGroup
    private readonly COMPUTE_WORKGROUP_SIZE = 64

    // Pipelines
    private modelPipeline!: GPURenderPipeline
    private eyePipeline!: GPURenderPipeline
    private hairPipelineOverEyes!: GPURenderPipeline
    private hairPipelineOverNonEyes!: GPURenderPipeline
    private hairDepthPipeline!: GPURenderPipeline
    private outlinePipeline!: GPURenderPipeline
    private hairOutlinePipeline!: GPURenderPipeline
    private mainBindGroupLayout!: GPUBindGroupLayout
    private outlineBindGroupLayout!: GPUBindGroupLayout

    // Rendering targets
    private multisampleTexture!: GPUTexture
    private depthTexture!: GPUTexture
    private readonly sampleCount = 4
    private renderPassDescriptor!: GPURenderPassDescriptor

    // Stencil configuration
    private readonly STENCIL_EYE_VALUE = 1

    // Bloom post-processing
    private sceneRenderTexture!: GPUTexture
    private sceneRenderTextureView!: GPUTextureView
    private bloomExtractTexture!: GPUTexture
    private bloomBlurTexture1!: GPUTexture
    private bloomBlurTexture2!: GPUTexture
    private bloomExtractPipeline!: GPURenderPipeline
    private bloomBlurPipeline!: GPURenderPipeline
    private bloomComposePipeline!: GPURenderPipeline
    private fullscreenQuadBuffer!: GPUBuffer
    private blurDirectionBuffer!: GPUBuffer
    private bloomIntensityBuffer!: GPUBuffer
    private bloomThresholdBuffer!: GPUBuffer
    private linearSampler!: GPUSampler
    private bloomExtractBindGroup?: GPUBindGroup
    private bloomBlurHBindGroup?: GPUBindGroup
    private bloomBlurVBindGroup?: GPUBindGroup
    private bloomComposeBindGroup?: GPUBindGroup
    private readonly BLOOM_DOWNSCALE_FACTOR = 2
    private bloomThreshold: number = 0.3
    private bloomIntensity: number = 0.12

    // Rim lighting
    private rimLightIntensity: number = 0.45

    // Model and resources
    private currentModel: Model | null = null
    private modelDir: string = ""
    private physics: Physics | null = null
    private materialSampler!: GPUSampler
    private textureCache = new Map<string, GPUTexture>()
    private textureData: Map<string, ArrayBuffer> = new Map()

    // Optimized draw lists
    private opaqueBatches: Batch[] = []
    private eyeBatches: Batch[] = []
    private hairBatchesOverEyes: Batch[] = []
    private hairBatchesOverNonEyes: Batch[] = []
    private transparentDraws: DrawCall[] = [] // No batching for transparency
    private outlineBatches: Batch[] = []

    // Performance monitoring
    private resizeObserver: ResizeObserver | null = null
    private lastFpsUpdate = performance.now()
    private framesSinceLastUpdate = 0
    private frameTimeSamples: number[] = []
    private frameTimeSum: number = 0
    private drawCallCount: number = 0
    private lastFrameTime = performance.now()
    private stats: EngineStats = {
        fps: 0,
        frameTime: 0,
        gpuMemory: 0,
        drawCalls: 0
    }

    // Animation
    private animationFrameId: number | null = null
    private renderLoopCallback: (() => void) | null = null
    private animationFrames: VMDKeyFrame[] = []
    private animationTimeouts: number[] = []
    private gpuMemoryMB: number = 0

    // Optimization caches
    private boneMatrixCache = new WeakMap<Model, Float32Array>()
    private materialUniformCache = new Map<string, GPUBuffer>()

    constructor(canvas: HTMLCanvasElement, options?: EngineOptions) {
        this.canvas = canvas
        if (options) {
            this.ambient = options.ambient ?? 1.0
            this.bloomIntensity = options.bloomIntensity ?? 0.12
            this.rimLightIntensity = options.rimLightIntensity ?? 0.45
            this.cameraDistance = options.cameraDistance ?? 26.6
            this.cameraTarget = options.cameraTarget ?? new Vec3(0, 12.5, 0)
        }
    }

    public async init() {
        const adapter = await navigator.gpu?.requestAdapter()
        const device = await adapter?.requestDevice()
        if (!device) {
            throw new Error("WebGPU is not supported in this browser.")
        }
        this.device = device

        const context = this.canvas.getContext("webgpu")
        if (!context) {
            throw new Error("Failed to get WebGPU context.")
        }
        this.context = context

        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat()

        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: "premultiplied",
        })

        this.setupCamera()
        this.setupLighting()
        this.createPipelines()
        this.createFullscreenQuad()
        this.createBloomPipelines()
        this.setupResize()
    }

    private createPipelines() {
        this.materialSampler = this.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "repeat",
            addressModeV: "repeat",
        })

        const shaderModule = this.device.createShaderModule({
            label: "model shaders",
            code: `${shaderCode}`,
        })

        // Create explicit bind group layout for all pipelines using the main shader
        this.mainBindGroupLayout = this.device.createBindGroupLayout({
            label: "main material bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            ],
        })

        const mainPipelineLayout = this.device.createPipelineLayout({
            label: "main pipeline layout",
            bindGroupLayouts: [this.mainBindGroupLayout],
        })

        // Model pipeline
        this.modelPipeline = this.device.createRenderPipeline({
            label: "model pipeline",
            layout: mainPipelineLayout,
            vertex: {
                module: shaderModule,
                buffers: [
                    {
                        arrayStride: 8 * 4,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x3" },
                            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
                            { shaderLocation: 2, offset: 6 * 4, format: "float32x2" },
                        ],
                    },
                    {
                        arrayStride: 4 * 2,
                        attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" }],
                    },
                    {
                        arrayStride: 4,
                        attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" }],
                    },
                ],
            },
            fragment: {
                module: shaderModule,
                targets: [
                    {
                        format: this.presentationFormat,
                        blend: {
                            color: {
                                srcFactor: "src-alpha",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
            primitive: { cullMode: "none" },
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: true,
                depthCompare: "less-equal",
            },
            multisample: { count: this.sampleCount },
        })

        // Outline pipelines
        this.outlineBindGroupLayout = this.device.createBindGroupLayout({
            label: "outline bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
                { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
            ],
        })

        const outlinePipelineLayout = this.device.createPipelineLayout({
            label: "outline pipeline layout",
            bindGroupLayouts: [this.outlineBindGroupLayout],
        })

        const outlineShaderModule = this.device.createShaderModule({
            label: "outline shaders",
            code: `${outlineShaderCode}`,
        })

        this.outlinePipeline = this.device.createRenderPipeline({
            label: "outline pipeline",
            layout: outlinePipelineLayout,
            vertex: {
                module: outlineShaderModule,
                buffers: [
                    {
                        arrayStride: 8 * 4,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x3" },
                            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
                        ],
                    },
                    {
                        arrayStride: 4 * 2,
                        attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" }],
                    },
                    {
                        arrayStride: 4,
                        attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" }],
                    },
                ],
            },
            fragment: {
                module: outlineShaderModule,
                targets: [
                    {
                        format: this.presentationFormat,
                        blend: {
                            color: {
                                srcFactor: "src-alpha",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
            primitive: { cullMode: "back" },
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: true,
                depthCompare: "less-equal",
            },
            multisample: { count: this.sampleCount },
        })

        // Hair outline pipeline
        this.hairOutlinePipeline = this.device.createRenderPipeline({
            label: "hair outline pipeline",
            layout: outlinePipelineLayout,
            vertex: {
                module: outlineShaderModule,
                buffers: [
                    {
                        arrayStride: 8 * 4,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x3" },
                            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
                        ],
                    },
                    {
                        arrayStride: 4 * 2,
                        attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" }],
                    },
                    {
                        arrayStride: 4,
                        attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" }],
                    },
                ],
            },
            fragment: {
                module: outlineShaderModule,
                targets: [
                    {
                        format: this.presentationFormat,
                        blend: {
                            color: {
                                srcFactor: "src-alpha",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
            primitive: { cullMode: "back" },
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: false,
                depthCompare: "less-equal",
                depthBias: -0.0001,
                depthBiasSlopeScale: 0.0,
                depthBiasClamp: 0.0,
            },
            multisample: { count: this.sampleCount },
        })

        // Eye overlay pipeline
        this.eyePipeline = this.device.createRenderPipeline({
            label: "eye overlay pipeline",
            layout: mainPipelineLayout,
            vertex: {
                module: shaderModule,
                buffers: [
                    {
                        arrayStride: 8 * 4,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x3" },
                            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
                            { shaderLocation: 2, offset: 6 * 4, format: "float32x2" },
                        ],
                    },
                    {
                        arrayStride: 4 * 2,
                        attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" }],
                    },
                    {
                        arrayStride: 4,
                        attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" }],
                    },
                ],
            },
            fragment: {
                module: shaderModule,
                targets: [
                    {
                        format: this.presentationFormat,
                        blend: {
                            color: {
                                srcFactor: "src-alpha",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
            primitive: { cullMode: "front" },
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: true,
                depthCompare: "less-equal",
                depthBias: -0.00005,
                depthBiasSlopeScale: 0.0,
                depthBiasClamp: 0.0,
                stencilFront: {
                    compare: "always",
                    failOp: "keep",
                    depthFailOp: "keep",
                    passOp: "replace",
                },
                stencilBack: {
                    compare: "always",
                    failOp: "keep",
                    depthFailOp: "keep",
                    passOp: "replace",
                },
            },
            multisample: { count: this.sampleCount },
        })

        // Depth-only shader for hair pre-pass
        const depthOnlyShaderModule = this.device.createShaderModule({
            label: "depth only shader",
            code: `${depthOnlyShaderCode}`,
        })

        // Hair depth pre-pass pipeline
        this.hairDepthPipeline = this.device.createRenderPipeline({
            label: "hair depth pre-pass",
            layout: mainPipelineLayout,
            vertex: {
                module: depthOnlyShaderModule,
                buffers: [
                    {
                        arrayStride: 8 * 4,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x3" },
                            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
                        ],
                    },
                    {
                        arrayStride: 4 * 2,
                        attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" }],
                    },
                    {
                        arrayStride: 4,
                        attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" }],
                    },
                ],
            },
            fragment: {
                module: depthOnlyShaderModule,
                entryPoint: "fs",
                targets: [{ format: this.presentationFormat, writeMask: 0 }],
            },
            primitive: { cullMode: "front" },
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: true,
                depthCompare: "less-equal",
                depthBias: 0.0,
                depthBiasSlopeScale: 0.0,
                depthBiasClamp: 0.0,
            },
            multisample: { count: this.sampleCount },
        })

        // Hair pipeline for rendering over eyes
        this.hairPipelineOverEyes = this.device.createRenderPipeline({
            label: "hair pipeline (over eyes)",
            layout: mainPipelineLayout,
            vertex: {
                module: shaderModule,
                buffers: [
                    {
                        arrayStride: 8 * 4,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x3" },
                            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
                            { shaderLocation: 2, offset: 6 * 4, format: "float32x2" },
                        ],
                    },
                    {
                        arrayStride: 4 * 2,
                        attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" }],
                    },
                    {
                        arrayStride: 4,
                        attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" }],
                    },
                ],
            },
            fragment: {
                module: shaderModule,
                targets: [
                    {
                        format: this.presentationFormat,
                        blend: {
                            color: {
                                srcFactor: "src-alpha",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
            primitive: { cullMode: "front" },
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: false,
                depthCompare: "less-equal",
                stencilFront: {
                    compare: "equal",
                    failOp: "keep",
                    depthFailOp: "keep",
                    passOp: "keep",
                },
                stencilBack: {
                    compare: "equal",
                    failOp: "keep",
                    depthFailOp: "keep",
                    passOp: "keep",
                },
            },
            multisample: { count: this.sampleCount },
        })

        // Hair pipeline for rendering over non-eyes
        this.hairPipelineOverNonEyes = this.device.createRenderPipeline({
            label: "hair pipeline (over non-eyes)",
            layout: mainPipelineLayout,
            vertex: {
                module: shaderModule,
                buffers: [
                    {
                        arrayStride: 8 * 4,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x3" },
                            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
                            { shaderLocation: 2, offset: 6 * 4, format: "float32x2" },
                        ],
                    },
                    {
                        arrayStride: 4 * 2,
                        attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" }],
                    },
                    {
                        arrayStride: 4,
                        attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" }],
                    },
                ],
            },
            fragment: {
                module: shaderModule,
                targets: [
                    {
                        format: this.presentationFormat,
                        blend: {
                            color: {
                                srcFactor: "src-alpha",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
            primitive: { cullMode: "front" },
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: false,
                depthCompare: "less-equal",
                stencilFront: {
                    compare: "not-equal",
                    failOp: "keep",
                    depthFailOp: "keep",
                    passOp: "keep",
                },
                stencilBack: {
                    compare: "not-equal",
                    failOp: "keep",
                    depthFailOp: "keep",
                    passOp: "keep",
                },
            },
            multisample: { count: this.sampleCount },
        })
    }

    private createSkinMatrixComputePipeline() {
        const computeShader = this.device.createShaderModule({
            label: "skin matrix compute",
            code: `${computeShaderCode}`,
        })

        this.skinMatrixComputePipeline = this.device.createComputePipeline({
            label: "skin matrix compute pipeline",
            layout: "auto",
            compute: {
                module: computeShader,
            },
        })
    }

    private createFullscreenQuad() {
        const quadVertices = new Float32Array([
            -1.0, -1.0, 0.0, 0.0,
            1.0, -1.0, 1.0, 0.0,
            -1.0, 1.0, 0.0, 1.0,
            -1.0, 1.0, 0.0, 1.0,
            1.0, -1.0, 1.0, 0.0,
            1.0, 1.0, 1.0, 1.0,
        ])

        this.fullscreenQuadBuffer = this.device.createBuffer({
            label: "fullscreen quad",
            size: quadVertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        })
        this.device.queue.writeBuffer(this.fullscreenQuadBuffer, 0, quadVertices)
    }

    private createBloomPipelines() {
        const bloomExtractShader = this.device.createShaderModule({
            label: "bloom extract",
            code: `${bloomExtractShaderCode}`,
        })

        const bloomBlurShader = this.device.createShaderModule({
            label: "bloom blur",
            code: `${bloomBlurShaderCode}`,
        })

        const bloomComposeShader = this.device.createShaderModule({
            label: "bloom compose",
            code: `${bloomComposeShaderCode}`,
        })

        this.blurDirectionBuffer = this.device.createBuffer({
            label: "blur direction",
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })

        this.bloomIntensityBuffer = this.device.createBuffer({
            label: "bloom intensity",
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })

        this.bloomThresholdBuffer = this.device.createBuffer({
            label: "bloom threshold",
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })

        const intensityData = new Float32Array(8)
        intensityData[0] = this.bloomIntensity
        this.device.queue.writeBuffer(this.bloomIntensityBuffer, 0, intensityData)

        const thresholdData = new Float32Array(8)
        thresholdData[0] = this.bloomThreshold
        this.device.queue.writeBuffer(this.bloomThresholdBuffer, 0, thresholdData)

        this.linearSampler = this.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
        })

        this.bloomExtractPipeline = this.device.createRenderPipeline({
            label: "bloom extract",
            layout: "auto",
            vertex: {
                module: bloomExtractShader,
                entryPoint: "vs",
            },
            fragment: {
                module: bloomExtractShader,
                entryPoint: "fs",
                targets: [{ format: this.presentationFormat }],
            },
            primitive: { topology: "triangle-list" },
        })

        this.bloomBlurPipeline = this.device.createRenderPipeline({
            label: "bloom blur",
            layout: "auto",
            vertex: {
                module: bloomBlurShader,
                entryPoint: "vs",
            },
            fragment: {
                module: bloomBlurShader,
                entryPoint: "fs",
                targets: [{ format: this.presentationFormat }],
            },
            primitive: { topology: "triangle-list" },
        })

        this.bloomComposePipeline = this.device.createRenderPipeline({
            label: "bloom compose",
            layout: "auto",
            vertex: {
                module: bloomComposeShader,
                entryPoint: "vs",
            },
            fragment: {
                module: bloomComposeShader,
                entryPoint: "fs",
                targets: [{ format: this.presentationFormat }],
            },
            primitive: { topology: "triangle-list" },
        })
    }

    private setupResize() {
        this.resizeObserver = new ResizeObserver(() => this.handleResize())
        this.resizeObserver.observe(this.canvas)
        this.handleResize()
    }

    private setupCamera() {
        this.cameraUniformBuffer = this.device.createBuffer({
            label: "camera uniforms",
            size: 40 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })

        this.camera = new Camera(Math.PI, Math.PI / 2.5, this.cameraDistance, this.cameraTarget)
        this.camera.aspect = this.canvas.width / this.canvas.height
        this.camera.attachControl(this.canvas)
    }

    private setupLighting() {
        this.lightUniformBuffer = this.device.createBuffer({
            label: "light uniforms",
            size: 64 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })

        this.lightCount = 0
        this.setAmbient(this.ambient)
        this.addLight(new Vec3(-0.5, -0.8, 0.5).normalize(), new Vec3(1.0, 0.95, 0.9), 0.02)
        this.addLight(new Vec3(0.7, -0.5, 0.3).normalize(), new Vec3(0.8, 0.85, 1.0), 0.015)
        this.addLight(new Vec3(0.3, -0.5, -1.0).normalize(), new Vec3(0.9, 0.9, 1.0), 0.01)
        this.device.queue.writeBuffer(this.lightUniformBuffer, 0, this.lightData)
    }

    private addLight(direction: Vec3, color: Vec3, intensity: number = 1.0): boolean {
        if (this.lightCount >= 4) return false

        const normalized = direction.normalize()
        const baseIndex = 4 + this.lightCount * 8
        this.lightData[baseIndex] = normalized.x
        this.lightData[baseIndex + 1] = normalized.y
        this.lightData[baseIndex + 2] = normalized.z
        this.lightData[baseIndex + 3] = 0
        this.lightData[baseIndex + 4] = color.x
        this.lightData[baseIndex + 5] = color.y
        this.lightData[baseIndex + 6] = color.z
        this.lightData[baseIndex + 7] = intensity

        this.lightCount++
        this.lightData[1] = this.lightCount
        return true
    }

    private setAmbient(intensity: number) {
        this.lightData[0] = intensity
    }

    // OPTIMIZED RENDER LOOP
    public render() {
        if (!this.multisampleTexture || !this.camera || !this.device || !this.currentModel) {
            return
        }

        const startTime = performance.now()
        const deltaTime = this.calculateDeltaTime(startTime)

        // Single command encoder for entire frame
        const encoder = this.device.createCommandEncoder({ label: "frame_encoder" })

        this.updateCameraUniforms()
        this.updateRenderTarget()
        this.updateModelPose(deltaTime, encoder)

        // Main render pass
        this.executeMainRenderPass(encoder)

        // Bloom post-processing
        this.applyBloom(encoder)

        // Submit all commands at once
        this.device.queue.submit([encoder.finish()])

        this.updateStats(performance.now() - startTime)
    }

    private calculateDeltaTime(currentTime: number): number {
        const deltaTime = this.lastFrameTime > 0 ? (currentTime - this.lastFrameTime) / 1000 : 0.016
        this.lastFrameTime = currentTime
        return deltaTime
    }

    private executeMainRenderPass(encoder: GPUCommandEncoder) {
        const pass = encoder.beginRenderPass(this.renderPassDescriptor)

        // Set buffers once
        pass.setVertexBuffer(0, this.vertexBuffer)
        pass.setVertexBuffer(1, this.jointsBuffer)
        pass.setVertexBuffer(2, this.weightsBuffer)
        pass.setIndexBuffer(this.indexBuffer!, "uint32")

        this.drawCallCount = 0

        // Pass 1: Opaque objects with batch rendering
        this.renderBatchGroup(pass, this.opaqueBatches)

        // Pass 2: Eyes
        pass.setPipeline(this.eyePipeline)
        pass.setStencilReference(this.STENCIL_EYE_VALUE)
        this.renderBatchGroup(pass, this.eyeBatches)

        // Pass 3: Hair rendering with optimization
        this.renderHairOptimized(pass)

        // Pass 4: Transparent objects (no batching for correct blending)
        pass.setPipeline(this.modelPipeline)
        for (const draw of this.transparentDraws) {
            if (draw.count > 0) {
                pass.setBindGroup(0, draw.bindGroup)
                pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
                this.drawCallCount++
            }
        }

        // Pass 5: Outlines with batch rendering
        this.renderBatchGroup(pass, this.outlineBatches)

        pass.end()
    }

    private renderBatchGroup(pass: GPURenderPassEncoder, batches: Batch[]) {
        if (batches.length === 0) return

        let currentPipeline: GPURenderPipeline | null = null
        let currentBindGroup: GPUBindGroup | null = null
        let batchStart = 0
        let batchCount = 0

        for (const batch of batches) {
            if (batch.pipeline !== currentPipeline) {
                // Submit current batch
                if (batchCount > 0 && currentBindGroup) {
                    pass.setBindGroup(0, currentBindGroup)
                    pass.drawIndexed(batchCount, 1, batchStart, 0, 0)
                    this.drawCallCount++
                }

                // Switch pipeline
                pass.setPipeline(batch.pipeline)
                currentPipeline = batch.pipeline
                currentBindGroup = batch.bindGroup
                batchStart = batch.startIndex
                batchCount = batch.count
            } else if (batch.bindGroup !== currentBindGroup) {
                // Submit current batch and start new one
                if (batchCount > 0 && currentBindGroup) {
                    pass.setBindGroup(0, currentBindGroup)
                    pass.drawIndexed(batchCount, 1, batchStart, 0, 0)
                    this.drawCallCount++
                }

                currentBindGroup = batch.bindGroup
                batchStart = batch.startIndex
                batchCount = batch.count
            } else {
                // Continue current batch
                batchCount += batch.count
            }
        }

        // Submit final batch
        if (batchCount > 0 && currentBindGroup) {
            pass.setBindGroup(0, currentBindGroup)
            pass.drawIndexed(batchCount, 1, batchStart, 0, 0)
            this.drawCallCount++
        }
    }

    private renderHairOptimized(pass: GPURenderPassEncoder) {
        // Hair depth pre-pass
        pass.setPipeline(this.hairDepthPipeline)
        const allHairBatches = [...this.hairBatchesOverEyes, ...this.hairBatchesOverNonEyes]
        this.renderBatchGroup(pass, allHairBatches)

        // Hair over eyes
        pass.setPipeline(this.hairPipelineOverEyes)
        pass.setStencilReference(this.STENCIL_EYE_VALUE)
        this.renderBatchGroup(pass, this.hairBatchesOverEyes)

        // Hair over non-eyes
        pass.setPipeline(this.hairPipelineOverNonEyes)
        pass.setStencilReference(this.STENCIL_EYE_VALUE)
        this.renderBatchGroup(pass, this.hairBatchesOverNonEyes)

        // Hair outlines
        pass.setPipeline(this.hairOutlinePipeline)
        const hairOutlineBatches = this.outlineBatches.filter(batch =>
            batch.pipeline === this.hairOutlinePipeline
        )
        this.renderBatchGroup(pass, hairOutlineBatches)
    }

    private updateCameraUniforms() {
        const viewMatrix = this.camera.getViewMatrix()
        const projectionMatrix = this.camera.getProjectionMatrix()
        const cameraPos = this.camera.getPosition()

        this.cameraMatrixData.set(viewMatrix.values, 0)
        this.cameraMatrixData.set(projectionMatrix.values, 16)
        this.cameraMatrixData[32] = cameraPos.x
        this.cameraMatrixData[33] = cameraPos.y
        this.cameraMatrixData[34] = cameraPos.z

        this.device.queue.writeBuffer(this.cameraUniformBuffer, 0, this.cameraMatrixData)
    }

    private updateRenderTarget() {
        const colorAttachment = (this.renderPassDescriptor.colorAttachments as GPURenderPassColorAttachment[])[0]
        if (this.sampleCount > 1) {
            colorAttachment.resolveTarget = this.sceneRenderTextureView
        } else {
            colorAttachment.view = this.sceneRenderTextureView
        }
    }

    private updateModelPose(deltaTime: number, encoder: GPUCommandEncoder) {
        this.currentModel!.evaluatePose()

        // Use cached matrices if available
        let worldMats = this.boneMatrixCache.get(this.currentModel!)
        if (!worldMats) {
            worldMats = this.currentModel!.getBoneWorldMatrices()
            this.boneMatrixCache.set(this.currentModel!, worldMats)
        }

        if (this.physics) {
            this.physics.step(deltaTime, worldMats, this.currentModel!.getBoneInverseBindMatrices())
        }

        this.device.queue.writeBuffer(
            this.worldMatrixBuffer!,
            0,
            worldMats.buffer,
            worldMats.byteOffset,
            worldMats.byteLength
        )

        this.computeSkinMatrices(encoder)
    }

    private computeSkinMatrices(encoder: GPUCommandEncoder) {
        const boneCount = this.currentModel!.getSkeleton().bones.length
        const workgroupCount = Math.ceil(boneCount / this.COMPUTE_WORKGROUP_SIZE)

        const pass = encoder.beginComputePass()
        pass.setPipeline(this.skinMatrixComputePipeline!)
        pass.setBindGroup(0, this.skinMatrixComputeBindGroup!)
        pass.dispatchWorkgroups(workgroupCount)
        pass.end()
    }

    private applyBloom(encoder: GPUCommandEncoder) {
        if (!this.sceneRenderTexture || !this.bloomExtractTexture) {
            return
        }

        // Update bloom parameters
        const thresholdData = new Float32Array(8)
        thresholdData[0] = this.bloomThreshold
        this.device.queue.writeBuffer(this.bloomThresholdBuffer, 0, thresholdData)

        const intensityData = new Float32Array(8)
        intensityData[0] = this.bloomIntensity
        this.device.queue.writeBuffer(this.bloomIntensityBuffer, 0, intensityData)

        // Extract bright areas
        const extractPass = encoder.beginRenderPass({
            label: "bloom extract",
            colorAttachments: [{
                view: this.bloomExtractTexture.createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: "clear",
                storeOp: "store",
            }],
        })
        extractPass.setPipeline(this.bloomExtractPipeline)
        extractPass.setBindGroup(0, this.bloomExtractBindGroup!)
        extractPass.draw(6, 1, 0, 0)
        extractPass.end()

        // Horizontal blur
        const hBlurData = new Float32Array(4)
        hBlurData[0] = 1.0
        hBlurData[1] = 0.0
        this.device.queue.writeBuffer(this.blurDirectionBuffer, 0, hBlurData)

        const blurHPass = encoder.beginRenderPass({
            label: "bloom blur horizontal",
            colorAttachments: [{
                view: this.bloomBlurTexture1.createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: "clear",
                storeOp: "store",
            }],
        })
        blurHPass.setPipeline(this.bloomBlurPipeline)
        blurHPass.setBindGroup(0, this.bloomBlurHBindGroup!)
        blurHPass.draw(6, 1, 0, 0)
        blurHPass.end()

        // Vertical blur
        const vBlurData = new Float32Array(4)
        vBlurData[0] = 0.0
        vBlurData[1] = 1.0
        this.device.queue.writeBuffer(this.blurDirectionBuffer, 0, vBlurData)

        const blurVPass = encoder.beginRenderPass({
            label: "bloom blur vertical",
            colorAttachments: [{
                view: this.bloomBlurTexture2.createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: "clear",
                storeOp: "store",
            }],
        })
        blurVPass.setPipeline(this.bloomBlurPipeline)
        blurVPass.setBindGroup(0, this.bloomBlurVBindGroup!)
        blurVPass.draw(6, 1, 0, 0)
        blurVPass.end()

        // Compose to canvas
        const composePass = encoder.beginRenderPass({
            label: "bloom compose",
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: "clear",
                storeOp: "store",
            }],
        })
        composePass.setPipeline(this.bloomComposePipeline)
        composePass.setBindGroup(0, this.bloomComposeBindGroup!)
        composePass.draw(6, 1, 0, 0)
        composePass.end()
    }

    private updateStats(frameTime: number) {
        // Circular buffer for frame times
        const maxSamples = 60
        this.frameTimeSamples.push(frameTime)
        this.frameTimeSum += frameTime

        if (this.frameTimeSamples.length > maxSamples) {
            const removed = this.frameTimeSamples.shift()!
            this.frameTimeSum -= removed
        }

        const avgFrameTime = this.frameTimeSum / this.frameTimeSamples.length
        this.stats.frameTime = Math.round(avgFrameTime * 100) / 100

        // FPS calculation
        const now = performance.now()
        this.framesSinceLastUpdate++
        const elapsed = now - this.lastFpsUpdate

        if (elapsed >= 1000) {
            this.stats.fps = Math.round((this.framesSinceLastUpdate / elapsed) * 1000)
            this.framesSinceLastUpdate = 0
            this.lastFpsUpdate = now
        }

        this.stats.gpuMemory = this.gpuMemoryMB
        this.stats.drawCalls = this.drawCallCount
    }

    // OPTIMIZED MATERIAL SETUP
    private async setupMaterials(model: Model) {
        const materials = model.getMaterials();
        if (materials.length === 0) {
            throw new Error("Model has no materials");
        }

        const textures = model.getTextures();

        // Clear previous batches
        this.clearBatches();

        // Pre-load all textures in parallel with better error handling
        const [loadedTextures, loadedToonTextures] = await Promise.all([
            this.loadTexturesBatch(textures),
            this.loadToonTexturesBatch(materials)
        ]);

        console.log(`Loaded ${loadedTextures.size} diffuse textures, ${loadedToonTextures.size} toon textures`);

        let currentIndexOffset = 0;

        // Create material bind groups and batches
        for (const mat of materials) {
            const indexCount = mat.vertexCount;
            if (indexCount === 0) continue;

            // DEBUG: Log eye materials
            if (mat.isEye) {
                console.log(`Processing eye material: ${mat.name}, diffuseIndex: ${mat.diffuseTextureIndex}, toonIndex: ${mat.toonTextureIndex}`);
            }

            const diffuseTexture = loadedTextures.get(mat.diffuseTextureIndex);
            const toonTexture = loadedToonTextures.get(mat.toonTextureIndex);

            // IMPROVED: Create fallback textures for missing ones
            const finalDiffuseTexture = await this.ensureTexture(diffuseTexture!, mat.diffuseTextureIndex, textures, "diffuse");
            const finalToonTexture = await this.ensureToonTexture(toonTexture!, mat.toonTextureIndex);

            if (!finalDiffuseTexture || !finalToonTexture) {
                console.warn(`Material "${mat.name}" missing textures (diffuse: ${!!finalDiffuseTexture}, toon: ${!!finalToonTexture}), but creating with fallbacks`);

                // Create with fallback textures anyway
                await this.createOptimizedMaterial(
                    mat,
                    finalDiffuseTexture || await this.createFallbackTexture(),
                    finalToonTexture || await this.loadToonTexture(-1),
                    currentIndexOffset,
                    indexCount
                );
            } else {
                await this.createOptimizedMaterial(
                    mat,
                    finalDiffuseTexture,
                    finalToonTexture,
                    currentIndexOffset,
                    indexCount
                );
            }

            currentIndexOffset += indexCount;
        }

        // DEBUG: Log batch counts
        console.log(`Batch counts - Opaque: ${this.opaqueBatches.length}, Eyes: ${this.eyeBatches.length}, Hair: ${this.hairBatchesOverEyes.length + this.hairBatchesOverNonEyes.length}, Transparent: ${this.transparentDraws.length}`);

        this.gpuMemoryMB = this.calculateGpuMemory();
    }

    private async ensureTexture(
        texture: GPUTexture | null,
        textureIndex: number,
        textures: Texture[],
        type: string
    ): Promise<GPUTexture | null> {
        if (texture) return texture;

        console.log(`Creating fallback ${type} texture for index ${textureIndex}`);

        // Try to load again with more aggressive path resolution
        if (textureIndex >= 0 && textureIndex < textures.length) {
            const textureInfo = textures[textureIndex];
            const retryTexture = await this.loadTextureWithFallbacks(textureInfo.path);
            if (retryTexture) return retryTexture;
        }

        return this.createFallbackTexture();
    }

    private async ensureToonTexture(
        toonTexture: GPUTexture | null,
        toonIndex: number
    ): Promise<GPUTexture> {
        if (toonTexture) return toonTexture;

        console.log(`Creating fallback toon texture for index ${toonIndex}`);
        return this.loadToonTexture(toonIndex);
    }

    private async loadTextureWithFallbacks(path: string): Promise<GPUTexture | null> {
        // Check cache first
        const cached = this.textureCache.get(path);
        if (cached) return cached;

        // Try different path resolutions
        const pathAttempts = [
            path,
            this.modelDir + path,
            path.split('/').pop()!, // filename only
            path.split('\\').pop()! // filename only for Windows paths
        ];

        // Remove duplicates
        const uniqueAttempts = [...new Set(pathAttempts)].filter(p => p);

        for (const attemptPath of uniqueAttempts) {
            try {
                console.log(`Attempting to load texture: ${attemptPath}`);

                // Check embedded texture data first
                const fileName = attemptPath.split(/[\\/]/).pop()!;
                const textureData = this.textureData.get(attemptPath) || this.textureData.get(fileName);

                if (textureData) {
                    const texture = await this.createTextureFromArrayBuffer(textureData, attemptPath);
                    this.textureCache.set(attemptPath, texture);
                    console.log(`Loaded embedded texture: ${attemptPath}`);
                    return texture;
                }

                // Try filesystem loading
                if (attemptPath.startsWith('http') || attemptPath.startsWith('/') || attemptPath.startsWith('./')) {
                    const texture = await this.createTextureFromPath(attemptPath);
                    if (texture) {
                        console.log(`Loaded filesystem texture: ${attemptPath}`);
                        return texture;
                    }
                }
            } catch (error) {
                console.warn(`Failed to load texture from ${attemptPath}:`, error);
                continue;
            }
        }

        console.warn(`All loading attempts failed for texture: ${path}`);
        return null;
    }

    private async createFallbackTexture(): Promise<GPUTexture> {
        const fallbackKey = "__fallback_texture__";
        const cached = this.textureCache.get(fallbackKey);
        if (cached) return cached;

        // Create a 1x1 pink texture as fallback
        const fallbackData = new Uint8Array([255, 0, 255, 255]); // Magenta
        const fallbackTexture = this.device.createTexture({
            label: "fallback texture",
            size: [1, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.device.queue.writeTexture(
            { texture: fallbackTexture },
            fallbackData,
            { bytesPerRow: 4 },
            [1, 1]
        );

        this.textureCache.set(fallbackKey, fallbackTexture);
        return fallbackTexture;
    }

    // Улучшенная загрузка toon текстур
    private async loadToonTexture(toonTextureIndex: number): Promise<GPUTexture> {
        // Сначала пытаемся загрузить как обычную текстуру
        const textures = this.currentModel?.getTextures() || [];
        const toonTexture = await this.loadTextureByIndex(toonTextureIndex, textures);

        if (toonTexture) {
            console.log(`Loaded toon texture from index ${toonTextureIndex}`);
            return toonTexture;
        }

        // Default toon texture fallback
        const defaultToonPath = "__default_toon__";
        const cached = this.textureCache.get(defaultToonPath);
        if (cached) return cached;

        console.log(`Creating default toon texture for index ${toonTextureIndex}`);

        const defaultToonData = new Uint8Array(256 * 2 * 4);
        for (let i = 0; i < 256; i++) {
            const factor = i / 255.0;
            const gray = Math.floor(128 + factor * 127);
            // First row: gradient
            defaultToonData[i * 4] = gray;
            defaultToonData[i * 4 + 1] = gray;
            defaultToonData[i * 4 + 2] = gray;
            defaultToonData[i * 4 + 3] = 255;
            // Second row: same gradient
            defaultToonData[(256 + i) * 4] = gray;
            defaultToonData[(256 + i) * 4 + 1] = gray;
            defaultToonData[(256 + i) * 4 + 2] = gray;
            defaultToonData[(256 + i) * 4 + 3] = 255;
        }

        const defaultToonTexture = this.device.createTexture({
            label: "default toon texture",
            size: [256, 2],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.device.queue.writeTexture(
            { texture: defaultToonTexture },
            defaultToonData,
            { bytesPerRow: 256 * 4 },
            [256, 2]
        );

        this.textureCache.set(defaultToonPath, defaultToonTexture);
        return defaultToonTexture;
    }

    // Улучшенный метод загрузки текстур по индексу
    private async loadTextureByIndex(texIndex: number, textures: Texture[]): Promise<GPUTexture | null> {
        if (texIndex < 0 || texIndex >= textures.length) {
            console.log(`Texture index ${texIndex} out of bounds (0-${textures.length - 1})`);
            return null;
        }

        const textureInfo = textures[texIndex];
        if (!textureInfo || !textureInfo.path) {
            console.log(`Texture info missing for index ${texIndex}`);
            return null;
        }

        const path = textureInfo.path;
        console.log(`Loading texture index ${texIndex}: ${path}`);

        return this.loadTextureWithFallbacks(path);
    }

    // Улучшенная загрузка текстур батчами
    private async loadTexturesBatch(textures: Texture[]): Promise<Map<number, GPUTexture>> {
        const results = new Map<number, GPUTexture>();
        const loadPromises: Promise<[number, GPUTexture | null]>[] = [];

        console.log(`Starting batch load of ${textures.length} textures`);

        for (let texIndex = 0; texIndex < textures.length; texIndex++) {
            loadPromises.push(
                this.loadTextureByIndex(texIndex, textures)
                    .then(texture => {
                        if (texture) {
                            console.log(`Successfully loaded texture ${texIndex}: ${textures[texIndex]?.path}`);
                        } else {
                            console.warn(`Failed to load texture ${texIndex}: ${textures[texIndex]?.path}`);
                        }
                        return [texIndex, texture] as [number, GPUTexture | null];
                    })
                    .catch(error => {
                        console.error(`Error loading texture ${texIndex}:`, error);
                        return [texIndex, null] as [number, GPUTexture | null];
                    })
            );
        }

        const loadedTextures = await Promise.all(loadPromises);

        let successCount = 0;
        loadedTextures.forEach(([index, texture]) => {
            if (texture) {
                results.set(index, texture);
                successCount++;
            }
        });

        console.log(`Batch load completed: ${successCount}/${textures.length} textures loaded successfully`);
        return results;
    }

    // Также обновим метод createOptimizedMaterial для лучшего логирования
    private async createOptimizedMaterial(
        mat: Material,
        diffuseTexture: GPUTexture,
        toonTexture: GPUTexture,
        currentIndexOffset: number,
        indexCount: number
    ): Promise<void> {
        const materialAlpha = mat.diffuse[3];
        const isTransparent = materialAlpha < 0.99;

        if (mat.isEye) {
            console.log(`Creating eye material: ${mat.name} with ${indexCount} indices`);
        }

        // Create main material bind group
        const mainBindGroup = await this.createMaterialBindGroup(mat, diffuseTexture, toonTexture);
        const mainBatch: Batch = {
            bindGroup: mainBindGroup,
            startIndex: currentIndexOffset,
            count: indexCount,
            pipeline: this.modelPipeline
        }

        // Create outline batch if needed
        if ((mat.edgeFlag & 0x10) !== 0 && mat.edgeSize > 0) {
            const outlineBindGroup = this.createOutlineBindGroup(mat);
            const outlineBatch: Batch = {
                bindGroup: outlineBindGroup,
                startIndex: currentIndexOffset,
                count: indexCount,
                pipeline: mat.isHair ? this.hairOutlinePipeline : this.outlinePipeline
            }
            this.outlineBatches.push(outlineBatch);
        }

        // Distribute to appropriate batch lists
        if (mat.isEye) {
            this.eyeBatches.push(mainBatch);
            console.log(`Added eye material to batches: ${mat.name}`);
        } else if (mat.isHair) {
            // Create separate batches for hair over eyes and non-eyes
            const hairOverEyesGroup = await this.createHairMaterialBindGroup(mat, diffuseTexture, toonTexture, true);
            const hairOverNonEyesGroup = await this.createHairMaterialBindGroup(mat, diffuseTexture, toonTexture, false);

            this.hairBatchesOverEyes.push({
                bindGroup: hairOverEyesGroup,
                startIndex: currentIndexOffset,
                count: indexCount,
                pipeline: this.hairPipelineOverEyes
            });

            this.hairBatchesOverNonEyes.push({
                bindGroup: hairOverNonEyesGroup,
                startIndex: currentIndexOffset,
                count: indexCount,
                pipeline: this.hairPipelineOverNonEyes
            });
        } else if (isTransparent) {
            // Transparent materials don't use batching for correct blending order
            this.transparentDraws.push({
                count: indexCount,
                firstIndex: currentIndexOffset,
                bindGroup: mainBindGroup,
                isTransparent: true
            });
        } else {
            this.opaqueBatches.push(mainBatch);
        }
    }

    private clearBatches() {
        this.opaqueBatches = []
        this.eyeBatches = []
        this.hairBatchesOverEyes = []
        this.hairBatchesOverNonEyes = []
        this.transparentDraws = []
        this.outlineBatches = []
    }



    private async loadToonTexturesBatch(materials: Material[]): Promise<Map<number, GPUTexture>> {
        const results = new Map<number, GPUTexture>()
        const uniqueToonIndices = new Set<number>()

        materials.forEach(mat => {
            if (mat.toonTextureIndex >= 0) {
                uniqueToonIndices.add(mat.toonTextureIndex)
            }
        })

        const loadPromises = Array.from(uniqueToonIndices).map(toonIndex =>
            this.loadToonTexture(toonIndex).then(texture => [toonIndex, texture] as [number, GPUTexture])
        )

        const loadedToonTextures = await Promise.all(loadPromises)
        loadedToonTextures.forEach(([index, texture]) => {
            results.set(index, texture)
        })

        return results
    }



    private async createMaterialBindGroup(
        mat: Material,
        diffuseTexture: GPUTexture,
        toonTexture: GPUTexture
    ): Promise<GPUBindGroup> {
        const cacheKey = `main_${mat.name}`
        if (this.materialUniformCache.has(cacheKey)) {
            // Reuse existing uniform buffer
            const uniformBuffer = this.materialUniformCache.get(cacheKey)!

            return this.device.createBindGroup({
                label: `material bind group: ${mat.name}`,
                layout: this.mainBindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
                    { binding: 1, resource: { buffer: this.lightUniformBuffer } },
                    { binding: 2, resource: diffuseTexture.createView() },
                    { binding: 3, resource: this.materialSampler },
                    { binding: 4, resource: { buffer: this.skinMatrixBuffer! } },
                    { binding: 5, resource: toonTexture.createView() },
                    { binding: 6, resource: this.materialSampler },
                    { binding: 7, resource: { buffer: uniformBuffer } },
                ],
            })
        }

        // Create new uniform buffer
        const uniformData = new Float32Array(12)
        uniformData[0] = mat.diffuse[3] // alpha
        uniformData[1] = 1.0 // alphaMultiplier
        uniformData[2] = this.rimLightIntensity
        uniformData[3] = 0.0 // padding
        uniformData[4] = 1.0 // rimColor.r
        uniformData[5] = 1.0 // rimColor.g
        uniformData[6] = 1.0 // rimColor.b
        uniformData[7] = 0.0 // isOverEyes
        uniformData[8] = mat.diffuse[0] // diffuse.r
        uniformData[9] = mat.diffuse[1] // diffuse.g
        uniformData[10] = mat.diffuse[2] // diffuse.b
        uniformData[11] = mat.diffuse[3] // diffuse.a

        const uniformBuffer = this.device.createBuffer({
            label: `material uniform: ${mat.name}`,
            size: uniformData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        this.device.queue.writeBuffer(uniformBuffer, 0, uniformData)
        this.materialUniformCache.set(cacheKey, uniformBuffer)

        return this.device.createBindGroup({
            label: `material bind group: ${mat.name}`,
            layout: this.mainBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
                { binding: 1, resource: { buffer: this.lightUniformBuffer } },
                { binding: 2, resource: diffuseTexture.createView() },
                { binding: 3, resource: this.materialSampler },
                { binding: 4, resource: { buffer: this.skinMatrixBuffer! } },
                { binding: 5, resource: toonTexture.createView() },
                { binding: 6, resource: this.materialSampler },
                { binding: 7, resource: { buffer: uniformBuffer } },
            ],
        })
    }

    private async createHairMaterialBindGroup(
        mat: Material,
        diffuseTexture: GPUTexture,
        toonTexture: GPUTexture,
        isOverEyes: boolean
    ): Promise<GPUBindGroup> {
        const cacheKey = `hair_${mat.name}_${isOverEyes}`
        if (this.materialUniformCache.has(cacheKey)) {
            const uniformBuffer = this.materialUniformCache.get(cacheKey)!

            return this.device.createBindGroup({
                label: `hair material bind group (${isOverEyes ? "over eyes" : "over non-eyes"}): ${mat.name}`,
                layout: this.mainBindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
                    { binding: 1, resource: { buffer: this.lightUniformBuffer } },
                    { binding: 2, resource: diffuseTexture.createView() },
                    { binding: 3, resource: this.materialSampler },
                    { binding: 4, resource: { buffer: this.skinMatrixBuffer! } },
                    { binding: 5, resource: toonTexture.createView() },
                    { binding: 6, resource: this.materialSampler },
                    { binding: 7, resource: { buffer: uniformBuffer } },
                ],
            })
        }

        const uniformData = new Float32Array(12)
        uniformData[0] = mat.diffuse[3] // alpha
        uniformData[1] = isOverEyes ? 0.5 : 1.0 // alphaMultiplier
        uniformData[2] = this.rimLightIntensity
        uniformData[3] = 0.0 // padding
        uniformData[4] = 1.0 // rimColor.r
        uniformData[5] = 1.0 // rimColor.g
        uniformData[6] = 1.0 // rimColor.b
        uniformData[7] = isOverEyes ? 1.0 : 0.0 // isOverEyes
        uniformData[8] = mat.diffuse[0] // diffuse.r
        uniformData[9] = mat.diffuse[1] // diffuse.g
        uniformData[10] = mat.diffuse[2] // diffuse.b
        uniformData[11] = mat.diffuse[3] // diffuse.a

        const uniformBuffer = this.device.createBuffer({
            label: `hair material uniform (${isOverEyes ? "over eyes" : "over non-eyes"}): ${mat.name}`,
            size: uniformData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        this.device.queue.writeBuffer(uniformBuffer, 0, uniformData)
        this.materialUniformCache.set(cacheKey, uniformBuffer)

        return this.device.createBindGroup({
            label: `hair material bind group (${isOverEyes ? "over eyes" : "over non-eyes"}): ${mat.name}`,
            layout: this.mainBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
                { binding: 1, resource: { buffer: this.lightUniformBuffer } },
                { binding: 2, resource: diffuseTexture.createView() },
                { binding: 3, resource: this.materialSampler },
                { binding: 4, resource: { buffer: this.skinMatrixBuffer! } },
                { binding: 5, resource: toonTexture.createView() },
                { binding: 6, resource: this.materialSampler },
                { binding: 7, resource: { buffer: uniformBuffer } },
            ],
        })
    }

    private createOutlineBindGroup(mat: Material): GPUBindGroup {
        const materialUniformData = new Float32Array(8)
        materialUniformData[0] = mat.edgeColor[0] // edgeColor.r
        materialUniformData[1] = mat.edgeColor[1] // edgeColor.g
        materialUniformData[2] = mat.edgeColor[2] // edgeColor.b
        materialUniformData[3] = mat.edgeColor[3] // edgeColor.a
        materialUniformData[4] = mat.edgeSize
        materialUniformData[5] = 0.0 // isOverEyes
        materialUniformData[6] = 0.0
        materialUniformData[7] = 0.0

        const materialUniformBuffer = this.device.createBuffer({
            label: `outline material uniform: ${mat.name}`,
            size: materialUniformData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        this.device.queue.writeBuffer(materialUniformBuffer, 0, materialUniformData)

        return this.device.createBindGroup({
            label: `outline bind group: ${mat.name}`,
            layout: this.outlineBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
                { binding: 1, resource: { buffer: materialUniformBuffer } },
                { binding: 2, resource: { buffer: this.skinMatrixBuffer! } },
            ],
        })
    }





    private async createTextureFromArrayBuffer(data: ArrayBuffer, path: string): Promise<GPUTexture> {
        const cached = this.textureCache.get(path)
        if (cached) return cached

        try {
            const mimeType = this.getMimeType(path)
            const blob = new Blob([data], { type: mimeType })

            const imageBitmap = await createImageBitmap(blob, {
                premultiplyAlpha: "none",
                colorSpaceConversion: "none",
                imageOrientation: "none"
            })

            const texture = this.device.createTexture({
                label: `texture: ${path}`,
                size: [imageBitmap.width, imageBitmap.height],
                format: "rgba8unorm",
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            })

            this.device.queue.copyExternalImageToTexture(
                { source: imageBitmap },
                { texture },
                [imageBitmap.width, imageBitmap.height]
            )

            imageBitmap.close()
            this.textureCache.set(path, texture)
            return texture
        } catch (error) {
            console.error(`Failed to create texture from ArrayBuffer for ${path}:`, error)
            throw error
        }
    }

    private async createTextureFromPath(path: string): Promise<GPUTexture | null> {
        const cached = this.textureCache.get(path)
        if (cached) return cached

        try {
            const response = await fetch(path)
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const imageBitmap = await createImageBitmap(await response.blob(), {
                premultiplyAlpha: "none",
                colorSpaceConversion: "none",
            })

            const texture = this.device.createTexture({
                label: `texture: ${path}`,
                size: [imageBitmap.width, imageBitmap.height],
                format: "rgba8unorm",
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            })

            this.device.queue.copyExternalImageToTexture(
                { source: imageBitmap },
                { texture },
                [imageBitmap.width, imageBitmap.height]
            )

            this.textureCache.set(path, texture)
            return texture
        } catch {
            return null
        }
    }

    private getMimeType(filename: string): string {
        const ext = filename.toLowerCase().split('.').pop()
        switch (ext) {
            case 'png': return 'image/png'
            case 'jpg':
            case 'jpeg': return 'image/jpeg'
            case 'bmp': return 'image/bmp'
            case 'tga': return 'image/x-tga'
            case 'gif': return 'image/gif'
            default: return 'image/png'
        }
    }

    // Rest of the existing methods (handleResize, setupModelBuffers, etc.) remain the same
    // but should use the optimized versions where applicable

    private handleResize() {
        const displayWidth = this.canvas.clientWidth
        const displayHeight = this.canvas.clientHeight

        if (displayWidth <= 0 || displayHeight <= 0) {
            return
        }

        const dpr = window.devicePixelRatio || 1
        const width = Math.max(1, Math.floor(displayWidth * dpr))
        const height = Math.max(1, Math.floor(displayHeight * dpr))

        if (!this.multisampleTexture || this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width
            this.canvas.height = height
            this.destroyTextures()

            if (width > 0 && height > 0) {
                this.createTextures(width, height)
            }
        }
    }

    private createTextures(width: number, height: number) {
        this.multisampleTexture = this.device.createTexture({
            label: "multisample render target",
            size: [width, height],
            sampleCount: this.sampleCount,
            format: this.presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        })

        this.depthTexture = this.device.createTexture({
            label: "depth texture",
            size: [width, height],
            sampleCount: this.sampleCount,
            format: "depth24plus-stencil8",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        })

        this.sceneRenderTexture = this.device.createTexture({
            label: "scene render texture",
            size: [width, height],
            format: this.presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        })
        this.sceneRenderTextureView = this.sceneRenderTexture.createView()

        this.setupBloom(width, height)

        const depthTextureView = this.depthTexture.createView()

        const colorAttachment: GPURenderPassColorAttachment =
            this.sampleCount > 1
                ? {
                    view: this.multisampleTexture.createView(),
                    resolveTarget: this.sceneRenderTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: "clear",
                    storeOp: "store",
                }
                : {
                    view: this.sceneRenderTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: "clear",
                    storeOp: "store",
                }

        this.renderPassDescriptor = {
            label: "renderPass",
            colorAttachments: [colorAttachment],
            depthStencilAttachment: {
                view: depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
                stencilClearValue: 0,
                stencilLoadOp: "clear",
                stencilStoreOp: "discard",
            },
        }

        this.camera.aspect = width / height
    }

    private setupBloom(width: number, height: number) {
        const bloomWidth = Math.floor(width / this.BLOOM_DOWNSCALE_FACTOR)
        const bloomHeight = Math.floor(height / this.BLOOM_DOWNSCALE_FACTOR)

        this.bloomExtractTexture = this.device.createTexture({
            label: "bloom extract",
            size: [bloomWidth, bloomHeight],
            format: this.presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        })

        this.bloomBlurTexture1 = this.device.createTexture({
            label: "bloom blur 1",
            size: [bloomWidth, bloomHeight],
            format: this.presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        })

        this.bloomBlurTexture2 = this.device.createTexture({
            label: "bloom blur 2",
            size: [bloomWidth, bloomHeight],
            format: this.presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        })

        this.bloomExtractBindGroup = this.device.createBindGroup({
            layout: this.bloomExtractPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sceneRenderTexture.createView() },
                { binding: 1, resource: this.linearSampler },
                { binding: 2, resource: { buffer: this.bloomThresholdBuffer } },
            ],
        })

        this.bloomBlurHBindGroup = this.device.createBindGroup({
            layout: this.bloomBlurPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.bloomExtractTexture.createView() },
                { binding: 1, resource: this.linearSampler },
                { binding: 2, resource: { buffer: this.blurDirectionBuffer } },
            ],
        })

        this.bloomBlurVBindGroup = this.device.createBindGroup({
            layout: this.bloomBlurPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.bloomBlurTexture1.createView() },
                { binding: 1, resource: this.linearSampler },
                { binding: 2, resource: { buffer: this.blurDirectionBuffer } },
            ],
        })

        this.bloomComposeBindGroup = this.device.createBindGroup({
            layout: this.bloomComposePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sceneRenderTexture.createView() },
                { binding: 1, resource: this.linearSampler },
                { binding: 2, resource: this.bloomBlurTexture2.createView() },
                { binding: 3, resource: this.linearSampler },
                { binding: 4, resource: { buffer: this.bloomIntensityBuffer } },
            ],
        })
    }

    private destroyTextures() {
        if (this.multisampleTexture) {
            this.multisampleTexture.destroy()
            this.multisampleTexture = null!
        }
        if (this.depthTexture) {
            this.depthTexture.destroy()
            this.depthTexture = null!
        }
        if (this.sceneRenderTexture) {
            this.sceneRenderTexture.destroy()
            this.sceneRenderTexture = null!
        }
        if (this.bloomExtractTexture) {
            this.bloomExtractTexture.destroy()
            this.bloomExtractTexture = null!
        }
        if (this.bloomBlurTexture1) {
            this.bloomBlurTexture1.destroy()
            this.bloomBlurTexture1 = null!
        }
        if (this.bloomBlurTexture2) {
            this.bloomBlurTexture2.destroy()
            this.bloomBlurTexture2 = null!
        }
    }

    private async setupModelBuffers(model: Model) {
        this.currentModel = model
        const vertices = model.getVertices()
        const skinning = model.getSkinning()
        const skeleton = model.getSkeleton()

        const bufferInitPromises = []

        this.vertexBuffer = this.device.createBuffer({
            label: "model vertex buffer",
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        })
        bufferInitPromises.push(
            this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices)
        )

        this.jointsBuffer = this.device.createBuffer({
            label: "joints buffer",
            size: skinning.joints.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        })
        bufferInitPromises.push(
            this.device.queue.writeBuffer(
                this.jointsBuffer,
                0,
                skinning.joints.buffer,
                skinning.joints.byteOffset,
                skinning.joints.byteLength
            )
        )

        this.weightsBuffer = this.device.createBuffer({
            label: "weights buffer",
            size: skinning.weights.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        })
        bufferInitPromises.push(
            this.device.queue.writeBuffer(
                this.weightsBuffer,
                0,
                skinning.weights.buffer,
                skinning.weights.byteOffset,
                skinning.weights.byteLength
            )
        )

        const boneCount = skeleton.bones.length
        const matrixSize = Math.max(256, boneCount * 16 * 4)

        this.skinMatrixBuffer = this.device.createBuffer({
            label: "skin matrices",
            size: matrixSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
        })

        this.worldMatrixBuffer = this.device.createBuffer({
            label: "world matrices",
            size: matrixSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        })

        this.inverseBindMatrixBuffer = this.device.createBuffer({
            label: "inverse bind matrices",
            size: matrixSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        })

        const invBindMatrices = skeleton.inverseBindMatrices
        bufferInitPromises.push(
            this.device.queue.writeBuffer(
                this.inverseBindMatrixBuffer,
                0,
                invBindMatrices.buffer,
                invBindMatrices.byteOffset,
                invBindMatrices.byteLength
            )
        )

        this.boneCountBuffer = this.device.createBuffer({
            label: "bone count uniform",
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })

        const boneCountData = new Uint32Array(8)
        boneCountData[0] = boneCount
        bufferInitPromises.push(
            this.device.queue.writeBuffer(this.boneCountBuffer, 0, boneCountData)
        )

        this.createSkinMatrixComputePipeline()

        this.skinMatrixComputeBindGroup = this.device.createBindGroup({
            layout: this.skinMatrixComputePipeline!.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.boneCountBuffer } },
                { binding: 1, resource: { buffer: this.worldMatrixBuffer } },
                { binding: 2, resource: { buffer: this.inverseBindMatrixBuffer } },
                { binding: 3, resource: { buffer: this.skinMatrixBuffer } },
            ],
        })

        const indices = model.getIndices()
        if (indices) {
            this.indexBuffer = this.device.createBuffer({
                label: "model index buffer",
                size: indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            })
            bufferInitPromises.push(
                this.device.queue.writeBuffer(this.indexBuffer, 0, indices)
            )
        } else {
            throw new Error("Model has no index buffer")
        }

        await Promise.all(bufferInitPromises)
        await this.setupMaterials(model)
    }

    private calculateGpuMemory(): number {
        let textureMemoryBytes = 0
        for (const texture of this.textureCache.values()) {
            textureMemoryBytes += texture.width * texture.height * 4
        }

        let bufferMemoryBytes = 0
        if (this.vertexBuffer) {
            const vertices = this.currentModel?.getVertices()
            if (vertices) bufferMemoryBytes += vertices.byteLength
        }
        if (this.indexBuffer) {
            const indices = this.currentModel?.getIndices()
            if (indices) bufferMemoryBytes += indices.byteLength
        }
        if (this.jointsBuffer) {
            const skinning = this.currentModel?.getSkinning()
            if (skinning) bufferMemoryBytes += skinning.joints.byteLength
        }
        if (this.weightsBuffer) {
            const skinning = this.currentModel?.getSkinning()
            if (skinning) bufferMemoryBytes += skinning.weights.byteLength
        }
        if (this.skinMatrixBuffer) {
            const skeleton = this.currentModel?.getSkeleton()
            if (skeleton) bufferMemoryBytes += Math.max(256, skeleton.bones.length * 16 * 4)
        }
        if (this.worldMatrixBuffer) {
            const skeleton = this.currentModel?.getSkeleton()
            if (skeleton) bufferMemoryBytes += Math.max(256, skeleton.bones.length * 16 * 4)
        }
        if (this.inverseBindMatrixBuffer) {
            const skeleton = this.currentModel?.getSkeleton()
            if (skeleton) bufferMemoryBytes += Math.max(256, skeleton.bones.length * 16 * 4)
        }

        bufferMemoryBytes += 40 * 4 // camera
        bufferMemoryBytes += 64 * 4 // light
        bufferMemoryBytes += 32 * 4 // bloom buffers
        if (this.fullscreenQuadBuffer) {
            bufferMemoryBytes += 24 * 4
        }

        // Material uniform buffers
        bufferMemoryBytes += this.materialUniformCache.size * 48

        let renderTargetMemoryBytes = 0
        if (this.multisampleTexture) {
            const width = this.canvas.width
            const height = this.canvas.height
            renderTargetMemoryBytes += width * height * 4 * this.sampleCount
            renderTargetMemoryBytes += width * height * 4
        }
        if (this.sceneRenderTexture) {
            const width = this.canvas.width
            const height = this.canvas.height
            renderTargetMemoryBytes += width * height * 4
        }
        if (this.bloomExtractTexture) {
            const width = Math.floor(this.canvas.width / this.BLOOM_DOWNSCALE_FACTOR)
            const height = Math.floor(this.canvas.height / this.BLOOM_DOWNSCALE_FACTOR)
            renderTargetMemoryBytes += width * height * 4 * 3
        }

        const totalGPUMemoryBytes = textureMemoryBytes + bufferMemoryBytes + renderTargetMemoryBytes
        return Math.round((totalGPUMemoryBytes / 1024 / 1024) * 100) / 100
    }

    // Public API methods remain the same
    public async loadAnimation(url: string) {
        const frames = await VMDLoader.load(url)
        this.animationFrames = frames
    }

    public playAnimation() {
        if (this.animationFrames.length === 0) return

        this.stopAnimation()

        const allBoneKeyFrames: BoneKeyFrame[] = []
        for (const keyFrame of this.animationFrames) {
            for (const boneFrame of keyFrame.boneFrames) {
                allBoneKeyFrames.push({
                    boneName: boneFrame.boneName,
                    time: keyFrame.time,
                    rotation: boneFrame.rotation,
                })
            }
        }

        const boneKeyFramesByBone = new Map<string, BoneKeyFrame[]>()
        for (const boneKeyFrame of allBoneKeyFrames) {
            if (!boneKeyFramesByBone.has(boneKeyFrame.boneName)) {
                boneKeyFramesByBone.set(boneKeyFrame.boneName, [])
            }
            boneKeyFramesByBone.get(boneKeyFrame.boneName)!.push(boneKeyFrame)
        }

        for (const keyFrames of boneKeyFramesByBone.values()) {
            keyFrames.sort((a, b) => a.time - b.time)
        }

        const time0Rotations: Array<{ boneName: string; rotation: Quat }> = []
        const bonesWithTime0 = new Set<string>()
        for (const [boneName, keyFrames] of boneKeyFramesByBone.entries()) {
            if (keyFrames.length > 0 && keyFrames[0].time === 0) {
                time0Rotations.push({
                    boneName: boneName,
                    rotation: keyFrames[0].rotation,
                })
                bonesWithTime0.add(boneName)
            }
        }

        if (this.currentModel) {
            if (time0Rotations.length > 0) {
                const boneNames = time0Rotations.map((r) => r.boneName)
                const rotations = time0Rotations.map((r) => r.rotation)
                this.rotateBones(boneNames, rotations, 0)
            }

            const skeleton = this.currentModel.getSkeleton()
            const bonesToReset: string[] = []
            for (const bone of skeleton.bones) {
                if (!bonesWithTime0.has(bone.name)) {
                    bonesToReset.push(bone.name)
                }
            }

            if (bonesToReset.length > 0) {
                const identityQuat = new Quat(0, 0, 0, 1)
                const identityQuats = new Array(bonesToReset.length).fill(identityQuat)
                this.rotateBones(bonesToReset, identityQuats, 0)
            }

            this.currentModel.evaluatePose()

            // Reset physics immediately and upload matrices to prevent A-pose flash
            if (this.physics) {
                const worldMats = this.currentModel.getBoneWorldMatrices()
                this.physics.reset(worldMats, this.currentModel.getBoneInverseBindMatrices())

                // Upload matrices immediately so next frame shows correct pose
                this.device.queue.writeBuffer(
                    this.worldMatrixBuffer!,
                    0,
                    worldMats.buffer,
                    worldMats.byteOffset,
                    worldMats.byteLength
                )
                const encoder = this.device.createCommandEncoder()
                this.computeSkinMatrices(encoder)
                this.device.queue.submit([encoder.finish()])
            }
        }
        for (const [_, keyFrames] of boneKeyFramesByBone.entries()) {
            for (let i = 0; i < keyFrames.length; i++) {
                const boneKeyFrame = keyFrames[i]
                const previousBoneKeyFrame = i > 0 ? keyFrames[i - 1] : null

                if (boneKeyFrame.time === 0) continue

                let durationMs = 0
                if (i === 0) {
                    durationMs = boneKeyFrame.time * 1000
                } else if (previousBoneKeyFrame) {
                    durationMs = (boneKeyFrame.time - previousBoneKeyFrame.time) * 1000
                }

                const scheduleTime = i > 0 && previousBoneKeyFrame ? previousBoneKeyFrame.time : 0
                const delayMs = scheduleTime * 1000

                if (delayMs <= 0) {
                    this.rotateBones([boneKeyFrame.boneName], [boneKeyFrame.rotation], durationMs)
                } else {
                    const timeoutId = window.setTimeout(() => {
                        this.rotateBones([boneKeyFrame.boneName], [boneKeyFrame.rotation], durationMs)
                    }, delayMs)
                    this.animationTimeouts.push(timeoutId)
                }
            }
        }

    }

    public stopAnimation() {
        for (const timeoutId of this.animationTimeouts) {
            clearTimeout(timeoutId)
        }
        this.animationTimeouts = []
    }

    public getStats(): EngineStats {
        return { ...this.stats }
    }

    public runRenderLoop(callback?: () => void) {
        this.renderLoopCallback = callback || null

        const loop = () => {
            this.render()

            if (this.renderLoopCallback) {
                this.renderLoopCallback()
            }

            this.animationFrameId = requestAnimationFrame(loop)
        }

        this.animationFrameId = requestAnimationFrame(loop)
    }

    public stopRenderLoop() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId)
            this.animationFrameId = null
        }
        this.renderLoopCallback = null
    }

    public dispose() {
        this.stopRenderLoop()
        this.stopAnimation()
        if (this.camera) this.camera.detachControl()
        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
            this.resizeObserver = null
        }
    }

    public async loadModel(path: string) {
        if (path.endsWith(".pmx")) {
            const pathParts = path.split("/")
            pathParts.pop()
            const dir = pathParts.join("/") + "/"
            this.modelDir = dir
            const model = await PmxLoader.load(path)
            this.physics = new Physics(model.getRigidbodies(), model.getJoints())
            await this.setupModelBuffers(model)
        } else {
            const { model, animations, metadata } = await RZengLoader.load(path)
            await this.setModelFromRZeng(model, animations)
            console.log('RZeng model loaded:', metadata.modelName)
        }
    }

    public rotateBones(bones: string[], rotations: Quat[], durationMs?: number) {
        this.currentModel?.rotateBones(bones, rotations, durationMs)
    }

    async setModelFromRZeng(model: Model, animations?: Map<string, VMDKeyFrame[]>): Promise<void> {
        this.textureData = model.getTextureData()
        this.currentModel = model
        this.physics = new Physics(model.getRigidbodies(), model.getJoints())
        this.modelDir = ""
        await this.setupModelBuffers(model)
        console.log('Model set from RZeng:', model.getBoneNames().length, 'bones')
    }

    async loadRZengFromBuffer(buffer: ArrayBuffer): Promise<void> {
        const { model, animations } = await RZengLoader.loadFromBuffer(buffer)
        await this.setModelFromRZeng(model, animations)
    }

    // Export methods
    async exportToBlender(filename: string = "animation_blender.json", options: ExportOptions = {}) {
        if (!this.currentModel || this.animationFrames.length === 0) {
            throw new Error("No model or animation loaded")
        }

        const blob = await AnimationExporter.exportToBlender(
            this.currentModel,
            this.animationFrames,
            options
        )
        downloadBlob(blob, filename)
    }

    async exportToUnity(filename: string = "animation_unity.json", options: ExportOptions = {}) {
        if (!this.currentModel || this.animationFrames.length === 0) {
            throw new Error("No model or animation loaded")
        }

        const blob = await AnimationExporter.exportToUnity(
            this.currentModel,
            this.animationFrames,
            options
        )
        downloadBlob(blob, filename)
    }

    async exportToFBX(filename: string = "animation.fbx", options: ExportOptions = {}) {
        if (!this.currentModel || this.animationFrames.length === 0) {
            throw new Error("No model or animation loaded")
        }

        const blob = await AnimationExporter.exportToFBX(
            this.currentModel,
            this.animationFrames,
            options
        )
        downloadBlob(blob, filename)
    }

    async exportToGLTF(filename: string = "animation.glb", options: ExportOptions = {}) {
        if (!this.currentModel || this.animationFrames.length === 0) {
            throw new Error("No model or animation loaded")
        }

        const blob = await AnimationExporter.exportToGLB(
            this.currentModel,
            this.animationFrames,
            options
        )
        downloadBlob(blob, filename)
    }
}