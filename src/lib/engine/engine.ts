//v0.2.10
import { Camera } from "./camera"
import { Quat, Vec3 } from "./math"
import { Material, Model, Texture } from "./model"
import { PmxLoader } from "./pmx-loader"
import { Physics } from "./physics"
import { VMDKeyFrame, VMDLoader } from "./vmd-loader"
import { AnimationExporter, downloadBlob, ExportOptions } from "./animation-exporter"
//code wgsl
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
}
interface DrawCall {
  count: number
  firstIndex: number
  bindGroup: GPUBindGroup
  isTransparent: boolean
}
// Internal type for organizing bone keyframes during animation playback
type BoneKeyFrame = {
  boneName: string
  time: number
  rotation: Quat
}

export class Engine {
  ///
  ///
  private canvas: HTMLCanvasElement
  private device!: GPUDevice
  private context!: GPUCanvasContext
  private presentationFormat!: GPUTextureFormat
  private camera!: Camera
  private cameraUniformBuffer!: GPUBuffer
  private cameraMatrixData = new Float32Array(36)
  private cameraDistance: number = 26.6
  private cameraTarget: Vec3 = new Vec3(0, 12.5, 0)
  private lightUniformBuffer!: GPUBuffer
  private lightData = new Float32Array(64)
  private lightCount = 0
  private vertexBuffer!: GPUBuffer
  private indexBuffer?: GPUBuffer
  private resizeObserver: ResizeObserver | null = null
  private depthTexture!: GPUTexture
  // Material rendering pipelines
  private modelPipeline!: GPURenderPipeline
  private eyePipeline!: GPURenderPipeline
  private hairPipelineOverEyes!: GPURenderPipeline
  private hairPipelineOverNonEyes!: GPURenderPipeline
  private hairDepthPipeline!: GPURenderPipeline
  // Outline pipelines
  private outlinePipeline!: GPURenderPipeline
  private hairOutlinePipeline!: GPURenderPipeline
  private mainBindGroupLayout!: GPUBindGroupLayout
  private outlineBindGroupLayout!: GPUBindGroupLayout
  private jointsBuffer!: GPUBuffer
  private weightsBuffer!: GPUBuffer
  private skinMatrixBuffer?: GPUBuffer
  private worldMatrixBuffer?: GPUBuffer
  private inverseBindMatrixBuffer?: GPUBuffer
  private skinMatrixComputePipeline?: GPUComputePipeline
  private skinMatrixComputeBindGroup?: GPUBindGroup
  private boneCountBuffer?: GPUBuffer
  private multisampleTexture!: GPUTexture
  private readonly sampleCount = 4
  private renderPassDescriptor!: GPURenderPassDescriptor
  // Constants
  private readonly STENCIL_EYE_VALUE = 1
  private readonly COMPUTE_WORKGROUP_SIZE = 64
  private readonly BLOOM_DOWNSCALE_FACTOR = 2
  // Ambient light settings
  private ambient: number = 1.0
  // Bloom post-processing textures
  private sceneRenderTexture!: GPUTexture
  private sceneRenderTextureView!: GPUTextureView
  private bloomExtractTexture!: GPUTexture
  private bloomBlurTexture1!: GPUTexture
  private bloomBlurTexture2!: GPUTexture
  // Post-processing pipelines
  private bloomExtractPipeline!: GPURenderPipeline
  private bloomBlurPipeline!: GPURenderPipeline
  private bloomComposePipeline!: GPURenderPipeline
  // Fullscreen quad for post-processing
  private fullscreenQuadBuffer!: GPUBuffer
  private blurDirectionBuffer!: GPUBuffer
  private bloomIntensityBuffer!: GPUBuffer
  private bloomThresholdBuffer!: GPUBuffer
  private linearSampler!: GPUSampler
  // Bloom bind groups (created once, reused every frame)
  private bloomExtractBindGroup?: GPUBindGroup
  private bloomBlurHBindGroup?: GPUBindGroup
  private bloomBlurVBindGroup?: GPUBindGroup
  private bloomComposeBindGroup?: GPUBindGroup
  // Bloom settings
  private bloomThreshold: number = 0.3
  private bloomIntensity: number = 0.12
  // Rim light settings
  private rimLightIntensity: number = 0.45

  private currentModel: Model | null = null
  private modelDir: string = ""
  private physics: Physics | null = null
  private materialSampler!: GPUSampler
  private textureCache = new Map<string, GPUTexture>()
  // Draw lists
  private opaqueDraws: DrawCall[] = []
  private eyeDraws: DrawCall[] = []
  private hairDrawsOverEyes: DrawCall[] = []
  private hairDrawsOverNonEyes: DrawCall[] = []
  private transparentDraws: DrawCall[] = []
  private opaqueOutlineDraws: DrawCall[] = []
  private eyeOutlineDraws: DrawCall[] = []
  private hairOutlineDraws: DrawCall[] = []
  private transparentOutlineDraws: DrawCall[] = []

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
  }
  private animationFrameId: number | null = null
  private renderLoopCallback: (() => void) | null = null

  private animationFrames: VMDKeyFrame[] = []
  private animationTimeouts: number[] = []
  private gpuMemoryMB: number = 0



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

  // Step 1: Get WebGPU device and context
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
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // camera
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // light
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} }, // diffuseTexture
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} }, // diffuseSampler
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } }, // skinMats
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} }, // toonTexture
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: {} }, // toonSampler
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // material
      ],
    })

    const mainPipelineLayout = this.device.createPipelineLayout({
      label: "main pipeline layout",
      bindGroupLayouts: [this.mainBindGroupLayout],
    })

    this.modelPipeline = this.device.createRenderPipeline({
      label: "model pipeline",
      layout: mainPipelineLayout,
      vertex: {
        module: shaderModule,
        buffers: [
          {
            arrayStride: 8 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" as GPUVertexFormat },
              { shaderLocation: 1, offset: 3 * 4, format: "float32x3" as GPUVertexFormat },
              { shaderLocation: 2, offset: 6 * 4, format: "float32x2" as GPUVertexFormat },
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" as GPUVertexFormat }],
          },
          {
            arrayStride: 4,
            attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" as GPUVertexFormat }],
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
      multisample: {
        count: this.sampleCount,
      },
    })

    // Create bind group layout for outline pipelines
    this.outlineBindGroupLayout = this.device.createBindGroupLayout({
      label: "outline bind group layout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // camera
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // material
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } }, // skinMats
      ],
    })

    const outlinePipelineLayout = this.device.createPipelineLayout({
      label: "outline pipeline layout",
      bindGroupLayouts: [this.outlineBindGroupLayout],
    })

    const outlineShaderModule = this.device.createShaderModule({
      label: "outline shaders",
      code: `
       ${outlineShaderCode}
      `,
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
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3" as GPUVertexFormat,
              },
              {
                shaderLocation: 1,
                offset: 3 * 4,
                format: "float32x3" as GPUVertexFormat,
              },
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" as GPUVertexFormat }],
          },
          {
            arrayStride: 4,
            attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" as GPUVertexFormat }],
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
      primitive: {
        cullMode: "back",
      },
      depthStencil: {
        format: "depth24plus-stencil8",
        depthWriteEnabled: true,
        depthCompare: "less-equal",
      },
      multisample: {
        count: this.sampleCount,
      },
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
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3" as GPUVertexFormat,
              },
              {
                shaderLocation: 1,
                offset: 3 * 4,
                format: "float32x3" as GPUVertexFormat,
              },
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" as GPUVertexFormat }],
          },
          {
            arrayStride: 4,
            attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" as GPUVertexFormat }],
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
      primitive: {
        cullMode: "back",
      },
      depthStencil: {
        format: "depth24plus-stencil8",
        depthWriteEnabled: false, // Don't write depth - let hair geometry control depth
        depthCompare: "less-equal", // Only draw where hair depth exists (no stencil test needed)
        depthBias: -0.0001, // Small negative bias to bring outline slightly closer for depth test
        depthBiasSlopeScale: 0.0,
        depthBiasClamp: 0.0,
      },
      multisample: {
        count: this.sampleCount,
      },
    })

    // Eye overlay pipeline (renders after opaque, writes stencil)
    this.eyePipeline = this.device.createRenderPipeline({
      label: "eye overlay pipeline",
      layout: mainPipelineLayout,
      vertex: {
        module: shaderModule,
        buffers: [
          {
            arrayStride: 8 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" as GPUVertexFormat },
              { shaderLocation: 1, offset: 3 * 4, format: "float32x3" as GPUVertexFormat },
              { shaderLocation: 2, offset: 6 * 4, format: "float32x2" as GPUVertexFormat },
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" as GPUVertexFormat }],
          },
          {
            arrayStride: 4,
            attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" as GPUVertexFormat }],
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
        depthWriteEnabled: true, // Write depth to occlude back of head
        depthCompare: "less-equal", // More lenient to reduce precision conflicts
        depthBias: -0.00005, // Reduced bias to minimize conflicts while still occluding back face
        depthBiasSlopeScale: 0.0,
        depthBiasClamp: 0.0,
        stencilFront: {
          compare: "always",
          failOp: "keep",
          depthFailOp: "keep",
          passOp: "replace", // Write stencil value 1
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

    // Depth-only shader for hair pre-pass (reduces overdraw by early depth rejection)
    const depthOnlyShaderModule = this.device.createShaderModule({
      label: "depth only shader",
      code: /* wgsl */ `${depthOnlyShaderCode}`,
    })

    // Hair depth pre-pass pipeline: depth-only with color writes disabled to eliminate overdraw
    this.hairDepthPipeline = this.device.createRenderPipeline({
      label: "hair depth pre-pass",
      layout: mainPipelineLayout,
      vertex: {
        module: depthOnlyShaderModule,
        buffers: [
          {
            arrayStride: 8 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" as GPUVertexFormat },
              { shaderLocation: 1, offset: 3 * 4, format: "float32x3" as GPUVertexFormat },
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" as GPUVertexFormat }],
          },
          {
            arrayStride: 4,
            attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" as GPUVertexFormat }],
          },
        ],
      },
      fragment: {
        module: depthOnlyShaderModule,
        entryPoint: "fs",
        targets: [
          {
            format: this.presentationFormat,
            writeMask: 0, // Disable all color writes - we only care about depth
          },
        ],
      },
      primitive: { cullMode: "front" },
      depthStencil: {
        format: "depth24plus-stencil8",
        depthWriteEnabled: true,
        depthCompare: "less-equal", // Match the color pass compare mode for consistency
        depthBias: 0.0,
        depthBiasSlopeScale: 0.0,
        depthBiasClamp: 0.0,
      },
      multisample: { count: this.sampleCount },
    })

    // Hair pipeline for rendering over eyes (stencil == 1)
    this.hairPipelineOverEyes = this.device.createRenderPipeline({
      label: "hair pipeline (over eyes)",
      layout: mainPipelineLayout,
      vertex: {
        module: shaderModule,
        buffers: [
          {
            arrayStride: 8 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" as GPUVertexFormat },
              { shaderLocation: 1, offset: 3 * 4, format: "float32x3" as GPUVertexFormat },
              { shaderLocation: 2, offset: 6 * 4, format: "float32x2" as GPUVertexFormat },
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" as GPUVertexFormat }],
          },
          {
            arrayStride: 4,
            attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" as GPUVertexFormat }],
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
        depthWriteEnabled: false, // Don't write depth (already written in pre-pass)
        depthCompare: "less-equal", // More lenient than "equal" to avoid precision issues with MSAA
        stencilFront: {
          compare: "equal", // Only render where stencil == 1 (over eyes)
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

    // Hair pipeline for rendering over non-eyes (stencil != 1)
    this.hairPipelineOverNonEyes = this.device.createRenderPipeline({
      label: "hair pipeline (over non-eyes)",
      layout: mainPipelineLayout,
      vertex: {
        module: shaderModule,
        buffers: [
          {
            arrayStride: 8 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" as GPUVertexFormat },
              { shaderLocation: 1, offset: 3 * 4, format: "float32x3" as GPUVertexFormat },
              { shaderLocation: 2, offset: 6 * 4, format: "float32x2" as GPUVertexFormat },
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" as GPUVertexFormat }],
          },
          {
            arrayStride: 4,
            attributes: [{ shaderLocation: 4, offset: 0, format: "unorm8x4" as GPUVertexFormat }],
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
        depthWriteEnabled: false, // Don't write depth (already written in pre-pass)
        depthCompare: "less-equal", // More lenient than "equal" to avoid precision issues with MSAA
        stencilFront: {
          compare: "not-equal", // Only render where stencil != 1 (over non-eyes)
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

  // Create compute shader for skin matrix computation
  private createSkinMatrixComputePipeline() {
    const computeShader = this.device.createShaderModule({
      label: "skin matrix compute",
      code: /* wgsl */ `
        ${computeShaderCode}
      `,
    })

    this.skinMatrixComputePipeline = this.device.createComputePipeline({
      label: "skin matrix compute pipeline",
      layout: "auto",
      compute: {
        module: computeShader,
      },
    })
  }

  // Create fullscreen quad for post-processing
  private createFullscreenQuad() {
    // Fullscreen quad vertices: two triangles covering the entire screen - Format: position (x, y), uv (u, v)
    const quadVertices = new Float32Array([
      // Triangle 1
      -1.0,
      -1.0,
      0.0,
      0.0, // bottom-left
      1.0,
      -1.0,
      1.0,
      0.0, // bottom-right
      -1.0,
      1.0,
      0.0,
      1.0, // top-left
      // Triangle 2
      -1.0,
      1.0,
      0.0,
      1.0, // top-left
      1.0,
      -1.0,
      1.0,
      0.0, // bottom-right
      1.0,
      1.0,
      1.0,
      1.0, // top-right
    ])

    this.fullscreenQuadBuffer = this.device.createBuffer({
      label: "fullscreen quad",
      size: quadVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    this.device.queue.writeBuffer(this.fullscreenQuadBuffer, 0, quadVertices)
  }

  // Create bloom post-processing pipelines
  private createBloomPipelines() {
    // Bloom extraction shader (extracts bright areas)
    const bloomExtractShader = this.device.createShaderModule({
      label: "bloom extract",
      code: /* wgsl */ `
        ${bloomExtractShaderCode}
      `,
    })

    // Bloom blur shader (gaussian blur - can be used for both horizontal and vertical)
    const bloomBlurShader = this.device.createShaderModule({
      label: "bloom blur",
      code: /* wgsl */ `
       ${bloomBlurShaderCode}
      `,
    })

    // Bloom composition shader (combines original scene with bloom)
    const bloomComposeShader = this.device.createShaderModule({
      label: "bloom compose",
      code: /* wgsl */ `
        ${bloomComposeShaderCode}
      `,
    })

    // Create uniform buffer for blur direction (minimum 32 bytes for WebGPU)
    const blurDirectionBuffer = this.device.createBuffer({
      label: "blur direction",
      size: 32, // Minimum 32 bytes required for uniform buffers in WebGPU
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // Create uniform buffer for bloom intensity (minimum 32 bytes for WebGPU)
    const bloomIntensityBuffer = this.device.createBuffer({
      label: "bloom intensity",
      size: 32, // Minimum 32 bytes required for uniform buffers in WebGPU
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // Create uniform buffer for bloom threshold (minimum 32 bytes for WebGPU)
    const bloomThresholdBuffer = this.device.createBuffer({
      label: "bloom threshold",
      size: 32, // Minimum 32 bytes required for uniform buffers in WebGPU
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // Set default bloom values
    const intensityData = new Float32Array(8) // f32 + 7 padding floats = 8 floats = 32 bytes
    intensityData[0] = this.bloomIntensity
    this.device.queue.writeBuffer(bloomIntensityBuffer, 0, intensityData)

    const thresholdData = new Float32Array(8) // f32 + 7 padding floats = 8 floats = 32 bytes
    thresholdData[0] = this.bloomThreshold
    this.device.queue.writeBuffer(bloomThresholdBuffer, 0, thresholdData)

    // Create linear sampler for post-processing
    const linearSampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    })

    // Bloom extraction pipeline
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

    // Bloom blur pipeline
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

    // Bloom composition pipeline
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

    // Store buffers and sampler for later use
    this.blurDirectionBuffer = blurDirectionBuffer
    this.bloomIntensityBuffer = bloomIntensityBuffer
    this.bloomThresholdBuffer = bloomThresholdBuffer
    this.linearSampler = linearSampler
  }


  // Step 3: Setup canvas resize handling
  private setupResize() {
    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(this.canvas)
    this.handleResize()
  }


  // Step 4: Create camera and uniform buffer
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

  // Step 5: Create lighting buffers
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

  // Load RZeng orv PMX
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

    // console.log({
    //   vertices: Array.from(model.getVertices()),
    //   indices: Array.from(model.getIndices()),
    //   materials: model.getMaterials(),
    //   textures: model.getTextures(),
    //   bones: model.getSkeleton().bones,
    //   skinning: { joints: Array.from(model.getSkinning().joints), weights: Array.from(model.getSkinning().weights) },
    // })

  }
  private handleResize() {
    const displayWidth = this.canvas.clientWidth
    const displayHeight = this.canvas.clientHeight

    // Добавляем проверку на минимальный размер
    if (displayWidth <= 0 || displayHeight <= 0) {
      console.log('Canvas has zero or negative size, skipping resize')
      return
    }

    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(displayWidth * dpr)) // Минимальный размер 1px
    const height = Math.max(1, Math.floor(displayHeight * dpr)) // Минимальный размер 1px

    if (!this.multisampleTexture || this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height

      // Уничтожаем старые текстуры если они существуют
      this.destroyTextures()

      // Создаем текстуры только если размеры валидны
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

    // Создаем scene render texture
    this.sceneRenderTexture = this.device.createTexture({
      label: "scene render texture",
      size: [width, height],
      format: this.presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    this.sceneRenderTextureView = this.sceneRenderTexture.createView()

    // Setup bloom textures
    this.setupBloom(width, height)

    const depthTextureView = this.depthTexture.createView()

    // Render scene to texture instead of directly to canvas
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
  private destroyTextures() {
    // Освобождаем ресурсы старых текстур
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
  public rotateBones(bones: string[], rotations: Quat[], durationMs?: number) {
    this.currentModel?.rotateBones(bones, rotations, durationMs)
  }
  private textureData: Map<string, ArrayBuffer> = new Map()

  async setModelFromRZeng(model: Model, animations?: Map<string, VMDKeyFrame[]>): Promise<void> {
    this.textureData = model.getTextureData()

    console.log('Texture data loaded from RZeng:', this.textureData.size, 'textures') // Для отладки

    this.currentModel = model
    this.physics = new Physics(model.getRigidbodies(), model.getJoints())
    this.modelDir = ""

    // Настраиваем буферы модели
    await this.setupModelBuffers(model)

    console.log('Model set from RZeng:', model.getBoneNames().length, 'bones')
  }

  /**
   * Загружает RZeng файл из ArrayBuffer
   */
  async loadRZengFromBuffer(buffer: ArrayBuffer): Promise<void> {
    const { model, animations } = await RZengLoader.loadFromBuffer(buffer)
    await this.setModelFromRZeng(model, animations)
  }
  // Step 7: Create vertex, index, and joint buffers
  private async setupModelBuffers(model: Model) {
    this.currentModel = model;
    const vertices = model.getVertices();
    const skinning = model.getSkinning();
    const skeleton = model.getSkeleton();

    // Создаем все буферы в одном месте для минимизации вызовов GPU
    const bufferInitPromises = [];

    // Основной буфер вершин
    this.vertexBuffer = this.device.createBuffer({
      label: "model vertex buffer",
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    bufferInitPromises.push(
      this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices)
    );

    // Буферы скининга
    this.jointsBuffer = this.device.createBuffer({
      label: "joints buffer",
      size: skinning.joints.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    bufferInitPromises.push(
      this.device.queue.writeBuffer(
        this.jointsBuffer,
        0,
        skinning.joints.buffer,
        skinning.joints.byteOffset,
        skinning.joints.byteLength
      )
    );

    this.weightsBuffer = this.device.createBuffer({
      label: "weights buffer",
      size: skinning.weights.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    bufferInitPromises.push(
      this.device.queue.writeBuffer(
        this.weightsBuffer,
        0,
        skinning.weights.buffer,
        skinning.weights.byteOffset,
        skinning.weights.byteLength
      )
    );

    const boneCount = skeleton.bones.length;
    const matrixSize = Math.max(256, boneCount * 16 * 4);

    // Предварительно вычисляем необходимые размеры буферов
    this.skinMatrixBuffer = this.device.createBuffer({
      label: "skin matrices",
      size: matrixSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    });

    this.worldMatrixBuffer = this.device.createBuffer({
      label: "world matrices",
      size: matrixSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.inverseBindMatrixBuffer = this.device.createBuffer({
      label: "inverse bind matrices",
      size: matrixSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const invBindMatrices = skeleton.inverseBindMatrices;
    bufferInitPromises.push(
      this.device.queue.writeBuffer(
        this.inverseBindMatrixBuffer,
        0,
        invBindMatrices.buffer,
        invBindMatrices.byteOffset,
        invBindMatrices.byteLength
      )
    );

    this.boneCountBuffer = this.device.createBuffer({
      label: "bone count uniform",
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const boneCountData = new Uint32Array(8);
    boneCountData[0] = boneCount;
    bufferInitPromises.push(
      this.device.queue.writeBuffer(this.boneCountBuffer, 0, boneCountData)
    );

    this.createSkinMatrixComputePipeline();

    // Создаем bind group для вычислений
    this.skinMatrixComputeBindGroup = this.device.createBindGroup({
      layout: this.skinMatrixComputePipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.boneCountBuffer } },
        { binding: 1, resource: { buffer: this.worldMatrixBuffer } },
        { binding: 2, resource: { buffer: this.inverseBindMatrixBuffer } },
        { binding: 3, resource: { buffer: this.skinMatrixBuffer } },
      ],
    });

    const indices = model.getIndices();
    if (indices) {
      this.indexBuffer = this.device.createBuffer({
        label: "model index buffer",
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      bufferInitPromises.push(
        this.device.queue.writeBuffer(this.indexBuffer, 0, indices)
      );
    } else {
      throw new Error("Model has no index buffer");
    }

    // Ждем завершения всех операций записи в буферы
    await Promise.all(bufferInitPromises);

    // Параллельная загрузка материалов
    await this.setupMaterials(model);
  }
  // Добавляем недостающие методы в класс Engine

  private async loadToonTexture(toonTextureIndex: number): Promise<GPUTexture> {
    // Сначала пытаемся загрузить как обычную текстуру
    const texture = await this.loadTextureByIndex(toonTextureIndex, this.currentModel?.getTextures() || []);
    if (texture) return texture;

    // Default toon texture fallback - cache it
    const defaultToonPath = "__default_toon__";
    const cached = this.textureCache.get(defaultToonPath);
    if (cached) return cached;

    const defaultToonData = new Uint8Array(256 * 2 * 4);
    for (let i = 0; i < 256; i++) {
      const factor = i / 255.0;
      const gray = Math.floor(128 + factor * 127);
      defaultToonData[i * 4] = gray;
      defaultToonData[i * 4 + 1] = gray;
      defaultToonData[i * 4 + 2] = gray;
      defaultToonData[i * 4 + 3] = 255;
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

  private async createHairMaterialBindGroups(
    mat: Material,
    diffuseTexture: GPUTexture,
    toonTexture: GPUTexture,
    currentIndexOffset: number,
    indexCount: number
  ): Promise<void> {
    const materialAlpha = mat.diffuse[3];

    // Создаем отдельные bind groups для волос над глазами и над не-глазами
    const createHairBindGroup = (isOverEyes: boolean) => {
      const uniformData = new Float32Array(12);
      uniformData[0] = materialAlpha;
      uniformData[1] = isOverEyes ? 0.5 : 1.0; // alphaMultiplier
      uniformData[2] = this.rimLightIntensity;
      uniformData[3] = 0.0; // _padding1
      uniformData[4] = 1.0; // rimColor.r
      uniformData[5] = 1.0; // rimColor.g
      uniformData[6] = 1.0; // rimColor.b
      uniformData[7] = isOverEyes ? 1.0 : 0.0; // isOverEyes
      uniformData[8] = mat.diffuse[0]; // diffuseColor.r
      uniformData[9] = mat.diffuse[1]; // diffuseColor.g
      uniformData[10] = mat.diffuse[2]; // diffuseColor.b
      uniformData[11] = mat.diffuse[3]; // diffuseColor.a

      const buffer = this.device.createBuffer({
        label: `material uniform (${isOverEyes ? "over eyes" : "over non-eyes"}): ${mat.name}`,
        size: uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      this.device.queue.writeBuffer(buffer, 0, uniformData);

      return this.device.createBindGroup({
        label: `material bind group (${isOverEyes ? "over eyes" : "over non-eyes"}): ${mat.name}`,
        layout: this.mainBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
          { binding: 1, resource: { buffer: this.lightUniformBuffer } },
          { binding: 2, resource: diffuseTexture.createView() },
          { binding: 3, resource: this.materialSampler },
          { binding: 4, resource: { buffer: this.skinMatrixBuffer! } },
          { binding: 5, resource: toonTexture.createView() },
          { binding: 6, resource: this.materialSampler },
          { binding: 7, resource: { buffer: buffer } },
        ],
      });
    };

    const bindGroupOverEyes = createHairBindGroup(true);
    const bindGroupOverNonEyes = createHairBindGroup(false);

    const drawCallOverEyes = {
      count: indexCount,
      firstIndex: currentIndexOffset,
      bindGroup: bindGroupOverEyes,
      isTransparent: materialAlpha < 0.99,
    };

    const drawCallOverNonEyes = {
      count: indexCount,
      firstIndex: currentIndexOffset,
      bindGroup: bindGroupOverNonEyes,
      isTransparent: materialAlpha < 0.99,
    };

    this.hairDrawsOverEyes.push(drawCallOverEyes);
    this.hairDrawsOverNonEyes.push(drawCallOverNonEyes);
  }

  private createOutlineBindGroup(mat: Material, currentIndexOffset: number, indexCount: number): void {
    const materialUniformData = new Float32Array(8);
    materialUniformData[0] = mat.edgeColor[0]; // edgeColor.r
    materialUniformData[1] = mat.edgeColor[1]; // edgeColor.g
    materialUniformData[2] = mat.edgeColor[2]; // edgeColor.b
    materialUniformData[3] = mat.edgeColor[3]; // edgeColor.a
    materialUniformData[4] = mat.edgeSize;
    materialUniformData[5] = 0.0; // isOverEyes
    materialUniformData[6] = 0.0;
    materialUniformData[7] = 0.0;

    const materialUniformBuffer = this.device.createBuffer({
      label: `outline material uniform: ${mat.name}`,
      size: materialUniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.device.queue.writeBuffer(materialUniformBuffer, 0, materialUniformData);

    const outlineBindGroup = this.device.createBindGroup({
      label: `outline bind group: ${mat.name}`,
      layout: this.outlineBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: materialUniformBuffer } },
        { binding: 2, resource: { buffer: this.skinMatrixBuffer! } },
      ],
    });

    const outlineDrawCall = {
      count: indexCount,
      firstIndex: currentIndexOffset,
      bindGroup: outlineBindGroup,
      isTransparent: mat.diffuse[3] < 0.99,
    };

    if (mat.isEye) {
      this.eyeOutlineDraws.push(outlineDrawCall);
    } else if (mat.isHair) {
      this.hairOutlineDraws.push(outlineDrawCall);
    } else if (mat.diffuse[3] < 0.99) {
      this.transparentOutlineDraws.push(outlineDrawCall);
    } else {
      this.opaqueOutlineDraws.push(outlineDrawCall);
    }
  }

  // Исправляем создание текстур - используем правильные флаги GPUTextureUsage
  private async createTextureFromArrayBuffer(data: ArrayBuffer, path: string): Promise<GPUTexture> {
    const cached = this.textureCache.get(path);
    if (cached) {
      return cached;
    }

    try {
      const mimeType = this.getMimeType(path);
      const blob = new Blob([data], { type: mimeType });

      const imageBitmap = await createImageBitmap(blob, {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
        imageOrientation: "none"
      });

      const texture = this.device.createTexture({
        label: `texture: ${path}`,
        size: [imageBitmap.width, imageBitmap.height],
        format: "rgba8unorm",
        // ИСПРАВЛЕНО: используем правильные флаги GPUTextureUsage
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      this.device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture },
        [imageBitmap.width, imageBitmap.height]
      );

      imageBitmap.close();

      this.textureCache.set(path, texture);
      return texture;
    } catch (error) {
      console.error(`Failed to create texture from ArrayBuffer for ${path}:`, error);
      throw error;
    }
  }

  private async createTextureFromPath(path: string): Promise<GPUTexture | null> {
    const cached = this.textureCache.get(path);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const imageBitmap = await createImageBitmap(await response.blob(), {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });

      const texture = this.device.createTexture({
        label: `texture: ${path}`,
        size: [imageBitmap.width, imageBitmap.height],
        format: "rgba8unorm",
        // ИСПРАВЛЕНО: используем правильные флаги GPUTextureUsage
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      this.device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture },
        [imageBitmap.width, imageBitmap.height]
      );

      this.textureCache.set(path, texture);
      return texture;
    } catch {
      return null;
    }
  }

  // Обновляем метод setupBloom для использования правильных флагов
  private setupBloom(width: number, height: number) {
    const bloomWidth = Math.floor(width / this.BLOOM_DOWNSCALE_FACTOR);
    const bloomHeight = Math.floor(height / this.BLOOM_DOWNSCALE_FACTOR);

    this.bloomExtractTexture = this.device.createTexture({
      label: "bloom extract",
      size: [bloomWidth, bloomHeight],
      format: this.presentationFormat,
      // ИСПРАВЛЕНО: используем правильные флаги GPUTextureUsage
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.bloomBlurTexture1 = this.device.createTexture({
      label: "bloom blur 1",
      size: [bloomWidth, bloomHeight],
      format: this.presentationFormat,
      // ИСПРАВЛЕНО: используем правильные флаги GPUTextureUsage
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.bloomBlurTexture2 = this.device.createTexture({
      label: "bloom blur 2",
      size: [bloomWidth, bloomHeight],
      format: this.presentationFormat,
      // ИСПРАВЛЕНО: используем правильные флаги GPUTextureUsage
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Создаем bloom bind groups
    this.bloomExtractBindGroup = this.device.createBindGroup({
      layout: this.bloomExtractPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sceneRenderTexture.createView() },
        { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: { buffer: this.bloomThresholdBuffer } },
      ],
    });

    this.bloomBlurHBindGroup = this.device.createBindGroup({
      layout: this.bloomBlurPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.bloomExtractTexture.createView() },
        { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: { buffer: this.blurDirectionBuffer } },
      ],
    });

    this.bloomBlurVBindGroup = this.device.createBindGroup({
      layout: this.bloomBlurPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.bloomBlurTexture1.createView() },
        { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: { buffer: this.blurDirectionBuffer } },
      ],
    });

    this.bloomComposeBindGroup = this.device.createBindGroup({
      layout: this.bloomComposePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sceneRenderTexture.createView() },
        { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: this.bloomBlurTexture2.createView() },
        { binding: 3, resource: this.linearSampler },
        { binding: 4, resource: { buffer: this.bloomIntensityBuffer } },
      ],
    });
  }


  private async setupMaterials(model: Model) {
    const materials = model.getMaterials();
    if (materials.length === 0) {
      throw new Error("Model has no materials");
    }

    const textures = model.getTextures();

    // Предварительная загрузка всех текстур
    const textureLoadPromises: Promise<[number, GPUTexture | null]>[] = [];
    const toonTextureLoadPromises: Promise<[number, GPUTexture]>[] = [];

    // Загружаем диффузные текстуры
    for (let texIndex = 0; texIndex < textures.length; texIndex++) {
      textureLoadPromises.push(
        this.loadTextureByIndex(texIndex, textures).then(texture => [texIndex, texture])
      );
    }

    // Загружаем toon текстуры параллельно
    const uniqueToonIndices = new Set<number>();
    materials.forEach(mat => {
      if (mat.toonTextureIndex >= 0) {
        uniqueToonIndices.add(mat.toonTextureIndex);
      }
    });

    for (const toonIndex of uniqueToonIndices) {
      toonTextureLoadPromises.push(
        this.loadToonTexture(toonIndex).then(texture => [toonIndex, texture])
      );
    }

    // Ждем загрузки всех текстур
    const loadedTextures = new Map<number, GPUTexture | null>();
    const loadedToonTextures = new Map<number, GPUTexture>();

    const [textureResults, toonResults] = await Promise.all([
      Promise.all(textureLoadPromises),
      Promise.all(toonTextureLoadPromises)
    ]);

    // Заполняем мапы загруженными текстурами
    textureResults.forEach(([index, texture]) => {
      loadedTextures.set(index as number, texture);
    });

    toonResults.forEach(([index, texture]) => {
      loadedToonTextures.set(index as number, texture);
    });

    // Инициализируем списки отрисовки
    this.initializeDrawLists();

    let currentIndexOffset = 0;

    // Создаем bind groups для материалов
    for (const mat of materials) {
      const indexCount = mat.vertexCount;
      if (indexCount === 0) continue;

      const diffuseTexture = loadedTextures.get(mat.diffuseTextureIndex);
      if (!diffuseTexture) {
        console.warn(`Material "${mat.name}" has no diffuse texture, skipping`);
        currentIndexOffset += indexCount;
        continue;
      }

      const toonTexture = loadedToonTextures.get(mat.toonTextureIndex) ||
        await this.loadToonTexture(mat.toonTextureIndex);

      await this.createMaterialBindGroups(
        mat,
        diffuseTexture,
        toonTexture,
        currentIndexOffset,
        indexCount
      );

      currentIndexOffset += indexCount;
    }

    this.gpuMemoryMB = this.calculateGpuMemory();
  }
  private async loadTextureByIndex(texIndex: number, textures: Texture[]): Promise<GPUTexture | null> {
    if (texIndex < 0 || texIndex >= textures.length) {
      return null;
    }

    const textureInfo = textures[texIndex];
    const path = textureInfo.path;

    // Проверяем кэш
    const cached = this.textureCache.get(path);
    if (cached) {
      return cached;
    }

    // Пытаемся найти текстуру в данных .rzeng
    const fileName = path.split(/[\\/]/).pop()!;

    // Проверяем полный путь и имя файла
    const textureData = this.textureData.get(path) || this.textureData.get(fileName);
    if (textureData) {
      try {
        const texture = await this.createTextureFromArrayBuffer(textureData, path);
        this.textureCache.set(path, texture);
        return texture;
      } catch (error) {
        console.warn(`Failed to load embedded texture ${path}:`, error);
      }
    }

    // Fallback: загрузка по пути
    if (this.modelDir) {
      try {
        const fullPath = this.modelDir + path;
        const texture = await this.createTextureFromPath(fullPath);
        if (texture) {
          this.textureCache.set(path, texture);
          return texture;
        }
      } catch (error) {
        console.warn(`Failed to load texture from path ${path}:`, error);
      }
    }

    return null;
  }



  // Инициализация списков отрисовки одним вызовом
  private initializeDrawLists() {
    this.opaqueDraws = [];
    this.eyeDraws = [];
    this.hairDrawsOverEyes = [];
    this.hairDrawsOverNonEyes = [];
    this.transparentDraws = [];
    this.opaqueOutlineDraws = [];
    this.eyeOutlineDraws = [];
    this.hairOutlineDraws = [];
    this.transparentOutlineDraws = [];
  }

  // Оптимизированное создание bind groups для материалов
  private async createMaterialBindGroups(
    mat: Material,
    diffuseTexture: GPUTexture,
    toonTexture: GPUTexture,
    currentIndexOffset: number,
    indexCount: number
  ): Promise<void> {
    const materialAlpha = mat.diffuse[3];
    const EPSILON = 0.001;
    const isTransparent = materialAlpha < 1.0 - EPSILON;

    // Создаем uniform данные для материала
    const materialUniformData = this.createMaterialUniformData(mat, materialAlpha);
    const materialUniformBuffer = this.device.createBuffer({
      label: `material uniform: ${mat.name}`,
      size: materialUniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(materialUniformBuffer, 0, materialUniformData.slice());

    // Основной bind group
    const bindGroup = this.device.createBindGroup({
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
        { binding: 7, resource: { buffer: materialUniformBuffer } },
      ],
    });

    const drawCall = {
      count: indexCount,
      firstIndex: currentIndexOffset,
      bindGroup,
      isTransparent,
    };

    // Распределяем по соответствующим спискам отрисовки
    if (mat.isEye) {
      this.eyeDraws.push(drawCall);
    } else if (mat.isHair) {
      await this.createHairMaterialBindGroups(mat, diffuseTexture, toonTexture, currentIndexOffset, indexCount);
    } else if (isTransparent) {
      this.transparentDraws.push(drawCall);
    } else {
      this.opaqueDraws.push(drawCall);
    }

    // Создаем контуры если нужно
    if ((mat.edgeFlag & 0x10) !== 0 && mat.edgeSize > 0) {
      this.createOutlineBindGroup(mat, currentIndexOffset, indexCount);
    }
  }

  // Предварительное вычисление uniform данных для материала
  private createMaterialUniformData(mat: Material, materialAlpha: number): Float32Array {
    const uniformData = new Float32Array(12);
    uniformData[0] = materialAlpha;
    uniformData[1] = 1.0; // alphaMultiplier
    uniformData[2] = this.rimLightIntensity;
    uniformData[3] = 0.0; // _padding1
    uniformData[4] = 1.0; // rimColor.r
    uniformData[5] = 1.0; // rimColor.g
    uniformData[6] = 1.0; // rimColor.b
    uniformData[7] = 0.0; // isOverEyes
    uniformData[8] = mat.diffuse[0]; // diffuse.r
    uniformData[9] = mat.diffuse[1]; // diffuse.g
    uniformData[10] = mat.diffuse[2]; // diffuse.b
    uniformData[11] = mat.diffuse[3]; // diffuse.a

    return uniformData;
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


  // Render strategy: 1) Opaque non-eye/hair 2) Eyes (stencil=1) 3) Hair (depth pre-pass + split by stencil) 4) Transparent 5) Bloom
  public render() {
    if (this.multisampleTexture && this.camera && this.device && this.currentModel) {
      const currentTime = performance.now()
      const deltaTime = this.lastFrameTime > 0 ? (currentTime - this.lastFrameTime) / 1000 : 0.016
      this.lastFrameTime = currentTime

      this.updateCameraUniforms()
      this.updateRenderTarget()

      // Use single encoder for both compute and render (reduces sync points)
      const encoder = this.device.createCommandEncoder()

      this.updateModelPose(deltaTime, encoder)

      const pass = encoder.beginRenderPass(this.renderPassDescriptor)

      pass.setVertexBuffer(0, this.vertexBuffer)
      pass.setVertexBuffer(1, this.jointsBuffer)
      pass.setVertexBuffer(2, this.weightsBuffer)
      pass.setIndexBuffer(this.indexBuffer!, "uint32")

      this.drawCallCount = 0

      // Pass 1: Opaque
      pass.setPipeline(this.modelPipeline)
      for (const draw of this.opaqueDraws) {
        if (draw.count > 0) {
          pass.setBindGroup(0, draw.bindGroup)
          pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
          this.drawCallCount++
        }
      }

      // Pass 2: Eyes (writes stencil value for hair to test against)
      pass.setPipeline(this.eyePipeline)
      pass.setStencilReference(this.STENCIL_EYE_VALUE)
      for (const draw of this.eyeDraws) {
        if (draw.count > 0) {
          pass.setBindGroup(0, draw.bindGroup)
          pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
          this.drawCallCount++
        }
      }

      // Pass 3: Hair rendering (depth pre-pass + shading + outlines)
      this.drawOutlines(pass, false)

      // 3a: Hair depth pre-pass (reduces overdraw via early depth rejection)
      if (this.hairDrawsOverEyes.length > 0 || this.hairDrawsOverNonEyes.length > 0) {
        pass.setPipeline(this.hairDepthPipeline)
        for (const draw of this.hairDrawsOverEyes) {
          if (draw.count > 0) {
            pass.setBindGroup(0, draw.bindGroup)
            pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
          }
        }
        for (const draw of this.hairDrawsOverNonEyes) {
          if (draw.count > 0) {
            pass.setBindGroup(0, draw.bindGroup)
            pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
          }
        }
      }

      // 3b: Hair shading (split by stencil for transparency over eyes)
      if (this.hairDrawsOverEyes.length > 0) {
        pass.setPipeline(this.hairPipelineOverEyes)
        pass.setStencilReference(this.STENCIL_EYE_VALUE)
        for (const draw of this.hairDrawsOverEyes) {
          if (draw.count > 0) {
            pass.setBindGroup(0, draw.bindGroup)
            pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
            this.drawCallCount++
          }
        }
      }

      if (this.hairDrawsOverNonEyes.length > 0) {
        pass.setPipeline(this.hairPipelineOverNonEyes)
        pass.setStencilReference(this.STENCIL_EYE_VALUE)
        for (const draw of this.hairDrawsOverNonEyes) {
          if (draw.count > 0) {
            pass.setBindGroup(0, draw.bindGroup)
            pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
            this.drawCallCount++
          }
        }
      }

      // 3c: Hair outlines
      if (this.hairOutlineDraws.length > 0) {
        pass.setPipeline(this.hairOutlinePipeline)
        for (const draw of this.hairOutlineDraws) {
          if (draw.count > 0) {
            pass.setBindGroup(0, draw.bindGroup)
            pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
          }
        }
      }

      // Pass 4: Transparent
      pass.setPipeline(this.modelPipeline)
      for (const draw of this.transparentDraws) {
        if (draw.count > 0) {
          pass.setBindGroup(0, draw.bindGroup)
          pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
          this.drawCallCount++
        }
      }

      this.drawOutlines(pass, true)

      pass.end()
      this.device.queue.submit([encoder.finish()])

      this.applyBloom()

      this.updateStats(performance.now() - currentTime)
    }
  }

  private applyBloom() {
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

    const encoder = this.device.createCommandEncoder()

    // Extract bright areas
    const extractPass = encoder.beginRenderPass({
      label: "bloom extract",
      colorAttachments: [
        {
          view: this.bloomExtractTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
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
      colorAttachments: [
        {
          view: this.bloomBlurTexture1.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
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
      colorAttachments: [
        {
          view: this.bloomBlurTexture2.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    })

    blurVPass.setPipeline(this.bloomBlurPipeline)
    blurVPass.setBindGroup(0, this.bloomBlurVBindGroup!)
    blurVPass.draw(6, 1, 0, 0)
    blurVPass.end()

    // Compose to canvas
    const composePass = encoder.beginRenderPass({
      label: "bloom compose",
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    })

    composePass.setPipeline(this.bloomComposePipeline)
    composePass.setBindGroup(0, this.bloomComposeBindGroup!)
    composePass.draw(6, 1, 0, 0)
    composePass.end()

    this.device.queue.submit([encoder.finish()])
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
    const worldMats = this.currentModel!.getBoneWorldMatrices()

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

  private drawOutlines(pass: GPURenderPassEncoder, transparent: boolean) {
    pass.setPipeline(this.outlinePipeline)
    if (transparent) {
      for (const draw of this.transparentOutlineDraws) {
        if (draw.count > 0) {
          pass.setBindGroup(0, draw.bindGroup)
          pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
        }
      }
    } else {
      for (const draw of this.opaqueOutlineDraws) {
        if (draw.count > 0) {
          pass.setBindGroup(0, draw.bindGroup)
          pass.drawIndexed(draw.count, 1, draw.firstIndex, 0, 0)
        }
      }
    }
  }

  private updateStats(frameTime: number) {
    const maxSamples = 60
    this.frameTimeSamples.push(frameTime)
    this.frameTimeSum += frameTime
    if (this.frameTimeSamples.length > maxSamples) {
      const removed = this.frameTimeSamples.shift()!
      this.frameTimeSum -= removed
    }
    const avgFrameTime = this.frameTimeSum / this.frameTimeSamples.length
    this.stats.frameTime = Math.round(avgFrameTime * 100) / 100

    const now = performance.now()
    this.framesSinceLastUpdate++
    const elapsed = now - this.lastFpsUpdate

    if (elapsed >= 1000) {
      this.stats.fps = Math.round((this.framesSinceLastUpdate / elapsed) * 1000)
      this.framesSinceLastUpdate = 0
      this.lastFpsUpdate = now
    }

    this.stats.gpuMemory = this.gpuMemoryMB
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
    bufferMemoryBytes += 40 * 4
    bufferMemoryBytes += 64 * 4
    bufferMemoryBytes += 32
    bufferMemoryBytes += 32
    bufferMemoryBytes += 32
    bufferMemoryBytes += 32
    if (this.fullscreenQuadBuffer) {
      bufferMemoryBytes += 24 * 4
    }
    const totalMaterialDraws =
      this.opaqueDraws.length +
      this.eyeDraws.length +
      this.hairDrawsOverEyes.length +
      this.hairDrawsOverNonEyes.length +
      this.transparentDraws.length
    bufferMemoryBytes += totalMaterialDraws * 32

    const totalOutlineDraws =
      this.opaqueOutlineDraws.length +
      this.eyeOutlineDraws.length +
      this.hairOutlineDraws.length +
      this.transparentOutlineDraws.length
    bufferMemoryBytes += totalOutlineDraws * 32

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
  async exportToBlender(filename: string = "animation_blender.json",
    options: ExportOptions = {}) {
    if (!this.currentModel || this.animationFrames.length === 0) {
      throw new Error("No model or animation loaded");
    }

    const blob = await AnimationExporter.exportToBlender(
      this.currentModel,
      this.animationFrames,
      options
    );

    downloadBlob(blob, filename);
  }
  async exportToUnity(
    filename: string = "animation_unity.json",
    options: ExportOptions = {}
  ) {
    if (!this.currentModel || this.animationFrames.length === 0) {
      throw new Error("No model or animation loaded");
    }

    const blob = await AnimationExporter.exportToUnity(
      this.currentModel,
      this.animationFrames,
      options
    );

    downloadBlob(blob, filename);
  }
  async exportToFBX(
    filename: string = "animation.fbx",
    options: ExportOptions = {}
  ) {
    if (!this.currentModel || this.animationFrames.length === 0) {
      throw new Error("No model or animation loaded");
    }

    const blob = await AnimationExporter.exportToFBX(
      this.currentModel,
      this.animationFrames,
      options
    );

    downloadBlob(blob, filename);
  }
  async exportToGLTF(
    filename: string = "animation.glb",
    options: ExportOptions = {}
  ) {
    if (!this.currentModel || this.animationFrames.length === 0) {
      throw new Error("No model or animation loaded");
    }

    const blob = await AnimationExporter.exportToGLB( // Используем GLB вместо GLTF
      this.currentModel,
      this.animationFrames,
      options
    );

    downloadBlob(blob, filename); // Меняем расширение на .glb
  }

}
