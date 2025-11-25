import { Model } from "./model";
import { VMDKeyFrame } from "./vmd-loader";
import { Mat4, Quat, Vec3 } from "./math";

export interface ExportOptions {
  fps?: number;
  scale?: number;
  applyRootMotion?: boolean;
  includeMaterials?: boolean;
}

export class AnimationExporter {
  /**
   * Export animation to Blender-friendly format (FBX or custom JSON)
   */
  static async exportToBlender(
    model: Model,
    animationFrames: VMDKeyFrame[],
    options: ExportOptions = {}
  ): Promise<Blob> {
    const {
      fps = 30,
      scale = 0.01, // MMD to Blender scale conversion (cm to m)
      applyRootMotion = false,
      includeMaterials = false
    } = options;

    // Convert VMD animation to Blender-compatible bone animation
    const blenderData = this.convertToBlenderFormat(model, animationFrames, {
      fps,
      scale,
      applyRootMotion
    });

    // Create JSON file for Blender import
    const jsonString = JSON.stringify(blenderData, null, 2);
    return new Blob([jsonString], { type: "application/json" });
  }

  /**
   * Export animation to Unity-friendly format (FBX or custom JSON)
   */
  static async exportToUnity(
    model: Model,
    animationFrames: VMDKeyFrame[],
    options: ExportOptions = {}
  ): Promise<Blob> {
    const {
      fps = 30,
      scale = 1.0, // MMD to Unity scale (usually 1:1 or slight adjustment)
      applyRootMotion = true,
      includeMaterials = false
    } = options;

    // Convert VMD animation to Unity-compatible bone animation
    const unityData = this.convertToUnityFormat(model, animationFrames, {
      fps,
      scale,
      applyRootMotion
    });

    // Create JSON file for Unity import
    const jsonString = JSON.stringify(unityData, null, 2);
    return new Blob([jsonString], { type: "application/json" });
  }

  /**
   * Export as FBX format (binary) - Universal format for both Blender and Unity
   */
  static async exportToFBX(
    model: Model,
    animationFrames: VMDKeyFrame[],
    options: ExportOptions = {}
  ): Promise<Blob> {
    // Note: FBX export would require a full FBX SDK implementation
    // For now, we'll create a simple ASCII FBX with basic animation
    const fbxContent = this.generateFBXContent(model, animationFrames, options);
    return new Blob([fbxContent], { type: "application/octet-stream" });
  }

  /**
   * Export as GLTF/GLB format - Modern standard for both Blender and Unity
   */
  static async exportToGLTF(
    model: Model,
    animationFrames: VMDKeyFrame[],
    options: ExportOptions = {}
  ): Promise<Blob> {
    const gltfData = this.generateGLTFContent(model, animationFrames, options);
    return new Blob([JSON.stringify(gltfData, null, 2)], {
      type: "model/gltf+json"
    });
  }

  private static convertToBlenderFormat(
    model: Model,
    animationFrames: VMDKeyFrame[],
    options: ExportOptions
  ): any {
    const bones = model.getSkeleton().bones;
    const boneMap = new Map<string, number>();
    bones.forEach((bone, index) => boneMap.set(bone.name, index));

    // Extract animation data
    const animationData = this.extractAnimationData(
      model,
      animationFrames,
      boneMap,
      options
    );

    return {
      metadata: {
        version: 1.0,
        exporter: "WebGPU MMD Engine",
        format: "blender-animation",
        fps: options.fps,
        scale: options.scale
      },
      armature: {
        bones: bones.map(bone => ({
          name: bone.name,
          parent: bone.parentIndex >= 0 ? bones[bone.parentIndex].name : null,
          bind_pose: bone.bindTranslation
        }))
      },
      animation: {
        name: "exported_animation",
        length: animationData.duration,
        frames: animationData.frames,
        bone_animations: animationData.boneAnimations
      },
      materials: options.includeMaterials ? this.extractMaterialData(model) : []
    };
  }

  private static convertToUnityFormat(
    model: Model,
    animationFrames: VMDKeyFrame[],
    options: ExportOptions
  ): any {
    const bones = model.getSkeleton().bones;
    const boneMap = new Map<string, number>();
    bones.forEach((bone, index) => boneMap.set(bone.name, index));

    // Extract animation data
    const animationData = this.extractAnimationData(
      model,
      animationFrames,
      boneMap,
      options
    );

    // Unity uses different coordinate system (left-handed, Y-up)
    const unityAnimationData = this.convertToUnityCoordinateSystem(animationData);

    return {
      metadata: {
        version: 1.0,
        exporter: "WebGPU MMD Engine",
        format: "unity-animation",
        fps: options.fps,
        scale: options.scale
      },
      animation_clip: {
        name: "ExportedAnimation",
        length: unityAnimationData.duration,
        wrap_mode: "Loop",
        events: []
      },
      curves: unityAnimationData.curves,
      humanoid: {
        human_bones: this.mapToUnityHumanBones(bones)
      },
      materials: options.includeMaterials ? this.extractMaterialData(model) : []
    };
  }

  private static extractAnimationData(
    model: Model,
    animationFrames: VMDKeyFrame[],
    boneMap: Map<string, number>,
    options: ExportOptions
  ): any {
    const bones = model.getSkeleton().bones;
    const frameRate = options.fps || 30;

    // Group bone frames by bone name
    const boneFramesMap = new Map<string, Array<{
      time: number;
      rotation: Quat;
      frame: number;
    }>>();

    // Initialize bone frames map
    bones.forEach(bone => {
      boneFramesMap.set(bone.name, []);
    });

    // Populate bone frames from VMD data
    animationFrames.forEach(keyFrame => {
      keyFrame.boneFrames.forEach(boneFrame => {
        if (boneFramesMap.has(boneFrame.boneName)) {
          const frames = boneFramesMap.get(boneFrame.boneName)!;
          frames.push({
            time: keyFrame.time,
            rotation: boneFrame.rotation,
            frame: Math.round(keyFrame.time * frameRate)
          });
        }
      });
    });

    // Sort frames by time for each bone
    boneFramesMap.forEach(frames => {
      frames.sort((a, b) => a.time - b.time);
    });

    // Calculate duration
    const duration = animationFrames.length > 0
      ? animationFrames[animationFrames.length - 1].time
      : 0;

    // Create bone animations with interpolation
    const boneAnimations: any = {};
    boneFramesMap.forEach((frames, boneName) => {
      if (frames.length > 0) {
        boneAnimations[boneName] = {
          rotations: frames.map(frame => ({
            time: frame.time,
            frame: frame.frame,
            rotation: [frame.rotation.x, frame.rotation.y, frame.rotation.z, frame.rotation.w]
          }))
        };
      }
    });

    return {
      duration,
      frames: Array.from({ length: Math.ceil(duration * frameRate) + 1 }, (_, i) => i),
      boneAnimations
    };
  }

  private static convertToUnityCoordinateSystem(animationData: any): any {
    // Convert from MMD coordinate system (right-handed, Y-up) 
    // to Unity (left-handed, Y-up) with some adjustments
    const curves: any[] = [];

    Object.entries(animationData.boneAnimations).forEach(([boneName, data]: [string, any]) => {
      // Unity uses Euler angles for animation curves, so we need to convert quaternions
      data.rotations.forEach((rot: any) => {
        const quat = new Quat(rot.rotation[0], rot.rotation[1], rot.rotation[2], rot.rotation[3]);
        const euler = quat.toEulerAngles();

        // Convert to Unity's coordinate system
        const unityEuler = new Vec3(
          -euler.x,  // Invert X rotation
          euler.y,   // Keep Y rotation
          -euler.z   // Invert Z rotation
        );

        // Create animation curves for each Euler component
        if (!curves.find(c => c.path === boneName && c.property === "localEulerAngles.x")) {
          curves.push({
            path: boneName,
            property: "localEulerAngles.x",
            type: "float",
            keys: []
          });
          curves.push({
            path: boneName,
            property: "localEulerAngles.y",
            type: "float",
            keys: []
          });
          curves.push({
            path: boneName,
            property: "localEulerAngles.z",
            type: "float",
            keys: []
          });
        }

        const xCurve = curves.find(c => c.path === boneName && c.property === "localEulerAngles.x");
        const yCurve = curves.find(c => c.path === boneName && c.property === "localEulerAngles.y");
        const zCurve = curves.find(c => c.path === boneName && c.property === "localEulerAngles.z");

        xCurve.keys.push({
          time: rot.time,
          value: unityEuler.x,
          inTangent: 0,
          outTangent: 0
        });
        yCurve.keys.push({
          time: rot.time,
          value: unityEuler.y,
          inTangent: 0,
          outTangent: 0
        });
        zCurve.keys.push({
          time: rot.time,
          value: unityEuler.z,
          inTangent: 0,
          outTangent: 0
        });
      });
    });

    return {
      duration: animationData.duration,
      curves
    };
  }

  private static mapToUnityHumanBones(bones: any[]): any {
    // Map MMD bone names to Unity Humanoid bone names
    const humanBoneMap: { [key: string]: string } = {
      "センター": "Hips",
      "上半身": "Spine",
      "首": "Neck",
      "頭": "Head",
      "左肩": "LeftShoulder",
      "左腕": "LeftUpperArm",
      "左ひじ": "LeftLowerArm",
      "左手首": "LeftHand",
      "右肩": "RightShoulder",
      "右腕": "RightUpperArm",
      "右ひじ": "RightLowerArm",
      "右手首": "RightHand",
      "左足": "LeftUpperLeg",
      "左ひざ": "LeftLowerLeg",
      "左足首": "LeftFoot",
      "左つま先": "LeftToes",
      "右足": "RightUpperLeg",
      "右ひざ": "RightLowerLeg",
      "右足首": "RightFoot",
      "右つま先": "RightToes"
    };

    const humanBones: any = {};

    bones.forEach(bone => {
      const unityBoneName = humanBoneMap[bone.name];
      if (unityBoneName) {
        humanBones[unityBoneName] = {
          boneName: bone.name,
          humanName: unityBoneName
        };
      }
    });

    return humanBones;
  }

  private static extractMaterialData(model: Model): any[] {
    const materials = model.getMaterials();
    return materials.map(mat => ({
      name: mat.name,
      diffuse: mat.diffuse,
      specular: mat.specular,
      shininess: mat.shininess,
      diffuseTexture: mat.diffuseTextureIndex >= 0
        ? model.getTextures()[mat.diffuseTextureIndex]?.name
        : null
    }));
  }

  private static generateFBXContent(
    model: Model,
    animationFrames: VMDKeyFrame[],
    options: ExportOptions
  ): string {
    // Simple ASCII FBX format (very basic implementation)
    const bones = model.getSkeleton().bones;
    const frameRate = options.fps || 30;

    let fbx = `; FBX 7.4.0 project file
; Exported from WebGPU MMD Engine

FBXHeaderExtension:  {
    FBXHeaderVersion: 1003
    FBXVersion: 7400
    Creator: "WebGPU MMD Engine"
}

GlobalSettings: {
    Version: 1000
    Properties70: {
        P: "UpAxis", "int", "Integer", "", 1
        P: "UpAxisSign", "int", "Integer", "", 1
        P: "FrontAxis", "int", "Integer", "", 2
        P: "FrontAxisSign", "int", "Integer", "", 1
        P: "CoordAxis", "int", "Integer", "", 0
        P: "CoordAxisSign", "int", "Integer", "", 1
        P: "UnitScaleFactor", "double", "Number", "", ${options.scale || 1.0}
    }
}

Documents: {
    Count: 1
    Document: 1000, "", "Scene" {
        Properties70: {
            P: "SourceObject", "object", "", ""
            P: "ActiveAnimStackName", "KString", "", "", "AnimationStack::Take 001"
        }
        RootNode: 0
    }
}

References: {
}

Definitions: {
    Version: 100
    Count: 3
    ObjectType: "Model" {
        Count: ${bones.length + 1}
    }
    ObjectType: "AnimationStack" {
        Count: 1
    }
    ObjectType: "AnimationLayer" {
        Count: 1
    }
}

Objects: {

`;

    // Add bone models
    bones.forEach((bone, index) => {
      fbx += `    Model: ${100 + index}, "Model::${bone.name}", "LimbNode" {
        Version: 232
        Properties70: {
            P: "Lcl Translation", "Lcl Translation", "", "A", ${bone.bindTranslation[0]}, ${bone.bindTranslation[1]}, ${bone.bindTranslation[2]}
            P: "Lcl Rotation", "Lcl Rotation", "", "A", 0, 0, 0
            P: "Lcl Scaling", "Lcl Scaling", "", "A", 1, 1, 1
        }
        Shading: T
        Culling: "CullingOff"
    }
`;
    });

    // Add animation stack
    fbx += `    AnimationStack: 200, "AnimationStack::Take 001", "" {
        Properties70: {
            P: "LocalStart", "KTime", "Time", "", 0
            P: "LocalStop", "KTime", "Time", "", ${animationFrames.length > 0 ? Math.round(animationFrames[animationFrames.length - 1].time * 46186158000) : 0}
        }
    }
    
    AnimationLayer: 201, "AnimationLayer::", "" {
    }

`;

    // Add animation curves for bones
    const boneFramesMap = new Map<string, Array<{
      time: number;
      rotation: Quat;
    }>>();

    bones.forEach(bone => {
      boneFramesMap.set(bone.name, []);
    });

    animationFrames.forEach(keyFrame => {
      keyFrame.boneFrames.forEach(boneFrame => {
        if (boneFramesMap.has(boneFrame.boneName)) {
          boneFramesMap.get(boneFrame.boneName)!.push({
            time: keyFrame.time,
            rotation: boneFrame.rotation
          });
        }
      });
    });

    let curveId = 300;
    boneFramesMap.forEach((frames, boneName) => {
      if (frames.length > 0) {
        const boneIndex = bones.findIndex(b => b.name === boneName);
        if (boneIndex >= 0) {
          // Add rotation curves (X, Y, Z, W)
          for (let i = 0; i < 4; i++) {
            fbx += `    AnimationCurve: ${curveId}, "AnimCurve::", "" {
        Default: 0
        KeyVer: 4008
        KeyTime: *${frames.length} {
`;
            // Key times
            frames.forEach((frame, idx) => {
              const fbxTime = Math.round(frame.time * 46186158000);
              fbx += `            ${fbxTime}${idx < frames.length - 1 ? ',' : ''}`;
            });
            fbx += `
        }
        KeyValueFloat: *${frames.length} {
`;
            // Key values
            frames.forEach((frame, idx) => {
              const values = [frame.rotation.x, frame.rotation.y, frame.rotation.z, frame.rotation.w];
              fbx += `            ${values[i]}${idx < frames.length - 1 ? ',' : ''}`;
            });
            fbx += `
        }
        KeyAttrFlags: "KeyAttrFlags::TangentAuto | KeyAttrFlags::ConstantKeyable"
        KeyAttrData: *${frames.length * 3} {
`;
            // Key attributes
            frames.forEach((frame, idx) => {
              fbx += `            0,0,0,0,0,0,0,0,0${idx < frames.length - 1 ? ',' : ''}`;
            });
            fbx += `
        }
        KeyAttrRefCount: ${frames.length}
    }
    
    AnimationCurveNode: ${curveId + 100}, "AnimationCurveNode::", "" {
        Properties70: {
            P: "d|X", "number", "", "A", 0
        }
    }
    
    Connection: ${curveId + 200}, "OO", ${curveId}, ${curveId + 100}
    Connection: ${curveId + 201}, "OO", ${curveId + 100}, 201
    Connection: ${curveId + 202}, "OP", ${curveId + 100}, 100${boneIndex}, "Lcl Rotation"
`;
            curveId++;
          }
        }
      }
    });

    fbx += `}

Connections: {
`;

    // Add bone hierarchy connections
    bones.forEach((bone, index) => {
      if (bone.parentIndex >= 0) {
        fbx += `    C: "OO", ${100 + index}, ${100 + bone.parentIndex}
`;
      } else {
        fbx += `    C: "OO", ${100 + index}, 0
`;
      }
    });

    fbx += `}

`;

    return fbx;
  }
  private static calculateMin(data: number[], components: number): number[] {
    const min = Array(components).fill(Number.MAX_VALUE);
    for (let i = 0; i < data.length; i += components) {
      for (let j = 0; j < components; j++) {
        min[j] = Math.min(min[j], data[i + j]);
      }
    }
    return min;
  }

  private static calculateMax(data: number[], components: number): number[] {
    const max = Array(components).fill(Number.MIN_VALUE);
    for (let i = 0; i < data.length; i += components) {
      for (let j = 0; j < components; j++) {
        max[j] = Math.max(max[j], data[i + j]);
      }
    }
    return max;
  }

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private static generateGLTFContent(
    model: Model,
    animationFrames: VMDKeyFrame[],
    options: ExportOptions
  ): { json: any, binaryBuffer: ArrayBuffer } {
    const bones = model.getSkeleton().bones;
    const vertices = model.getVertices();
    const indices = model.getIndices();
    const skinning = model.getSkinning();
    const materials = model.getMaterials();

    // Создаем бинарный буфер для всех данных
    const binaryChunks: number[] = [];

    // 1. Геометрия - вершины, нормали, UV, индексы
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const joints: number[] = [];
    const weights: number[] = [];

    const vertexCount = vertices.length / 8;
    for (let i = 0; i < vertexCount; i++) {
      const base = i * 8;
      // Позиции (x, y, z)
      positions.push(vertices[base], vertices[base + 1], vertices[base + 2]);
      // Нормали (nx, ny, nz)
      normals.push(vertices[base + 3], vertices[base + 4], vertices[base + 5]);
      // UV (u, v)
      uvs.push(vertices[base + 6], vertices[base + 7]);

      // Скининг - joints и weights
      if (skinning.joints && skinning.weights) {
        const skinBase = i * 4;
        joints.push(
          skinning.joints[skinBase] || 0,
          skinning.joints[skinBase + 1] || 0,
          skinning.joints[skinBase + 2] || 0,
          skinning.joints[skinBase + 3] || 0
        );

        // Конвертируем UNORM8 [0-255] в float [0-1]
        weights.push(
          (skinning.weights[skinBase] || 0) / 255,
          (skinning.weights[skinBase + 1] || 0) / 255,
          (skinning.weights[skinBase + 2] || 0) / 255,
          (skinning.weights[skinBase + 3] || 0) / 255
        );
      }
    }

    // Создаем буферные представления (bufferViews)
    const bufferViews: any[] = [];
    let byteOffset = 0;

    // 0: positions
    const positionBuffer = new Float32Array(positions);
    bufferViews.push({
      buffer: 0,
      byteOffset: byteOffset,
      byteLength: positionBuffer.byteLength,
      target: 34962 // ARRAY_BUFFER
    });
    byteOffset += positionBuffer.byteLength;

    // 1: normals
    const normalBuffer = new Float32Array(normals);
    bufferViews.push({
      buffer: 0,
      byteOffset: byteOffset,
      byteLength: normalBuffer.byteLength,
      target: 34962
    });
    byteOffset += normalBuffer.byteLength;

    // 2: uvs
    const uvBuffer = new Float32Array(uvs);
    bufferViews.push({
      buffer: 0,
      byteOffset: byteOffset,
      byteLength: uvBuffer.byteLength,
      target: 34962
    });
    byteOffset += uvBuffer.byteLength;

    // 3: joints (Uint16Array)
    const jointBuffer = new Uint16Array(joints);
    bufferViews.push({
      buffer: 0,
      byteOffset: byteOffset,
      byteLength: jointBuffer.byteLength,
      target: 34962
    });
    byteOffset += jointBuffer.byteLength;

    // 4: weights
    const weightBuffer = new Float32Array(weights);
    bufferViews.push({
      buffer: 0,
      byteOffset: byteOffset,
      byteLength: weightBuffer.byteLength,
      target: 34962
    });
    byteOffset += weightBuffer.byteLength;

    // 5: indices (Uint32Array)
    const indexBuffer = new Uint32Array(indices);
    bufferViews.push({
      buffer: 0,
      byteOffset: byteOffset,
      byteLength: indexBuffer.byteLength,
      target: 34963 // ELEMENT_ARRAY_BUFFER
    });
    byteOffset += indexBuffer.byteLength;

    // 6: inverseBindMatrices
    const inverseBindMatrices = model.getBoneInverseBindMatrices();
    const inverseBindBuffer = new Float32Array(inverseBindMatrices);
    bufferViews.push({
      buffer: 0,
      byteOffset: byteOffset,
      byteLength: inverseBindBuffer.byteLength,
      target: 34962
    });
    byteOffset += inverseBindBuffer.byteLength;

    // Собираем все бинарные данные в один буфер
    const totalBuffer = new ArrayBuffer(byteOffset);
    const dataView = new DataView(totalBuffer);

    let offset = 0;

    // Копируем positionBuffer
    new Uint8Array(totalBuffer, offset, positionBuffer.byteLength)
      .set(new Uint8Array(positionBuffer.buffer));
    offset += positionBuffer.byteLength;

    // Копируем normalBuffer
    new Uint8Array(totalBuffer, offset, normalBuffer.byteLength)
      .set(new Uint8Array(normalBuffer.buffer));
    offset += normalBuffer.byteLength;

    // Копируем uvBuffer
    new Uint8Array(totalBuffer, offset, uvBuffer.byteLength)
      .set(new Uint8Array(uvBuffer.buffer));
    offset += uvBuffer.byteLength;

    // Копируем jointBuffer
    new Uint8Array(totalBuffer, offset, jointBuffer.byteLength)
      .set(new Uint8Array(jointBuffer.buffer));
    offset += jointBuffer.byteLength;

    // Копируем weightBuffer
    new Uint8Array(totalBuffer, offset, weightBuffer.byteLength)
      .set(new Uint8Array(weightBuffer.buffer));
    offset += weightBuffer.byteLength;

    // Копируем indexBuffer
    new Uint8Array(totalBuffer, offset, indexBuffer.byteLength)
      .set(new Uint8Array(indexBuffer.buffer));
    offset += indexBuffer.byteLength;

    // Копируем inverseBindBuffer
    new Uint8Array(totalBuffer, offset, inverseBindBuffer.byteLength)
      .set(new Uint8Array(inverseBindBuffer.buffer));
    offset += inverseBindBuffer.byteLength;

    // 2. Создаем accessors
    const accessors = [
      { // 0: positions
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: positions.length / 3,
        type: "VEC3",
        min: this.calculateMin(positions, 3),
        max: this.calculateMax(positions, 3)
      },
      { // 1: normals
        bufferView: 1,
        componentType: 5126, // FLOAT
        count: normals.length / 3,
        type: "VEC3"
      },
      { // 2: uvs
        bufferView: 2,
        componentType: 5126, // FLOAT
        count: uvs.length / 2,
        type: "VEC2"
      },
      { // 3: joints
        bufferView: 3,
        componentType: 5123, // UNSIGNED_SHORT
        count: joints.length / 4,
        type: "VEC4"
      },
      { // 4: weights
        bufferView: 4,
        componentType: 5126, // FLOAT
        count: weights.length / 4,
        type: "VEC4"
      },
      { // 5: indices
        bufferView: 5,
        componentType: 5125, // UNSIGNED_INT
        count: indices.length,
        type: "SCALAR"
      },
      { // 6: inverseBindMatrices
        bufferView: 6,
        componentType: 5126, // FLOAT
        count: bones.length,
        type: "MAT4"
      }
    ];

    // 3. Создаем материалы (упрощенные)
    const gltfMaterials = materials.map((mat, index) => ({
      name: mat.name,
      pbrMetallicRoughness: {
        baseColorFactor: mat.diffuse,
        metallicFactor: 0.0,
        roughnessFactor: 0.9
      },
      alphaMode: mat.diffuse[3] < 1.0 ? "BLEND" : "OPAQUE",
      doubleSided: true
    }));

    // 4. Создаем меш с примитивами для каждого материала
    let currentIndex = 0;
    const primitives = materials.map((mat, matIndex) => {
      const primitive = {
        attributes: {
          POSITION: 0,
          NORMAL: 1,
          TEXCOORD_0: 2,
          JOINTS_0: 3,
          WEIGHTS_0: 4
        },
        indices: 5,
        material: matIndex,
        mode: 4 // TRIANGLES
      };

      currentIndex += mat.vertexCount;
      return primitive;
    });

    // 5. Создаем узлы для костей
    const boneNodes = bones.map((bone, index) => {
      const node: any = {
        name: bone.name,
        translation: bone.bindTranslation,
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1]
      };

      // Добавляем детей, если есть
      const children = bones
        .map((b, i) => ({ bone: b, index: i }))
        .filter(({ bone: b }) => b.parentIndex === index)
        .map(({ index: i }) => i + 1); // +1 потому что 0-й узел - корневой

      if (children.length > 0) {
        node.children = children;
      }

      return node;
    });

    // 6. Создаем узел для меша
    const meshNode = {
      name: "ModelMesh",
      mesh: 0,
      skin: 0
    };

    // 7. Создаем корневой узел
    const rootNode = {
      name: "Root",
      children: [bones.length + 1] // Индекс meshNode
    };

    // 8. Собираем все узлы
    const nodes = [rootNode, ...boneNodes, meshNode];

    // 9. Создаем скин
    const skin = {
      inverseBindMatrices: 6, // accessor index для inverseBindMatrices
      joints: Array.from({ length: bones.length }, (_, i) => i + 1) // индексы bone nodes
    };

    // 10. Создаем анимацию
    const animations = this.createGLTFAnimations(model, animationFrames, bones);

    // 11. Собираем полную JSON структуру GLTF
    const json = {
      asset: {
        version: "2.0",
        generator: "WebGPU MMD Engine"
      },
      scene: 0,
      scenes: [{
        nodes: [0] // Корневой узел
      }],
      nodes: nodes,
      meshes: [{
        name: "ModelMesh",
        primitives: primitives
      }],
      skins: [skin],
      animations: animations,
      materials: gltfMaterials,
      accessors: accessors,
      bufferViews: bufferViews,
      buffers: [{
        byteLength: byteOffset
        // Не указываем URI, так как данные будут встроены в GLB
      }]
    };

    return {
      json: json,
      binaryBuffer: totalBuffer
    };
  }

  private static createGLTFAnimations(
    model: Model,
    animationFrames: VMDKeyFrame[],
    bones: any[]
  ): any[] {
    if (animationFrames.length === 0) return [];

    const boneMap = new Map<string, number>();
    bones.forEach((bone, index) => boneMap.set(bone.name, index));

    // Группируем кадры анимации по костям
    const boneAnimations = new Map<string, Array<{ time: number, rotation: Quat }>>();
    bones.forEach(bone => boneAnimations.set(bone.name, []));

    animationFrames.forEach(keyFrame => {
      keyFrame.boneFrames.forEach(boneFrame => {
        if (boneAnimations.has(boneFrame.boneName)) {
          boneAnimations.get(boneFrame.boneName)!.push({
            time: keyFrame.time,
            rotation: boneFrame.rotation
          });
        }
      });
    });

    const animation = {
      name: "MMD_Animation",
      channels: [] as any[],
      samplers: [] as any[]
    };

    let samplerIndex = 0;

    boneAnimations.forEach((frames, boneName) => {
      if (frames.length > 0) {
        const boneIndex = boneMap.get(boneName);
        if (boneIndex === undefined) return;

        // Создаем временные ключи и значения вращения
        const times = frames.map(f => f.time);
        const rotations = frames.flatMap(f =>
          [f.rotation.x, f.rotation.y, f.rotation.z, f.rotation.w]
        );

        // Для анимации нам нужно добавить bufferViews и accessors
        // Но в данном упрощенном примере мы пропустим это
        // и создадим только структуру анимации без реальных данных

        const timeAccessorIndex = 7 + samplerIndex * 2; // Предполагаемые индексы
        const rotationAccessorIndex = 8 + samplerIndex * 2;

        animation.samplers.push({
          input: timeAccessorIndex,
          output: rotationAccessorIndex,
          interpolation: "LINEAR"
        });

        animation.channels.push({
          sampler: samplerIndex,
          target: {
            node: boneIndex + 1, // +1 потому что 0-й узел - корневой
            path: "rotation"
          }
        });

        samplerIndex++;
      }
    });

    return animation.channels.length > 0 ? [animation] : [];
  }

  /**
   * Export as GLB format (binary GLTF) - Modern standard for both Blender and Unity
   */
  static async exportToGLB(
    model: Model,
    animationFrames: VMDKeyFrame[],
    options: ExportOptions = {}
  ): Promise<Blob> {
    const { json, binaryBuffer } = this.generateGLTFContent(model, animationFrames, options);

    // Создаем правильный GLB файл
    const glbBuffer = this.createGLBBuffer(json, binaryBuffer);
    return new Blob([glbBuffer], { type: "model/gltf-binary" });
  }

  private static createGLBBuffer(json: any, binaryBuffer: ArrayBuffer): ArrayBuffer {
    // Кодируем JSON в UTF-8
    const jsonString = JSON.stringify(json);
    const jsonEncoder = new TextEncoder();
    const jsonChunk = jsonEncoder.encode(jsonString);

    // Выравниваем JSON до 4 байт
    const jsonPadding = (4 - (jsonChunk.length % 4)) % 4;
    const paddedJsonChunk = new Uint8Array(jsonChunk.length + jsonPadding);
    paddedJsonChunk.set(jsonChunk);

    // Выравниваем бинарные данные до 4 байт
    const binaryPadding = (4 - (binaryBuffer.byteLength % 4)) % 4;
    const paddedBinaryChunk = new Uint8Array(binaryBuffer.byteLength + binaryPadding);
    paddedBinaryChunk.set(new Uint8Array(binaryBuffer));

    // Создаем заголовок GLB (12 байт)
    const header = new ArrayBuffer(12);
    const headerView = new DataView(header);
    headerView.setUint32(0, 0x46546C67, false); // Magic: "glTF"
    headerView.setUint32(4, 2, false); // Version: 2
    headerView.setUint32(8, 12 + 8 + paddedJsonChunk.length + 8 + paddedBinaryChunk.length, false); // Total length

    // Создаем JSON chunk header (8 байт)
    const jsonChunkHeader = new ArrayBuffer(8);
    const jsonChunkHeaderView = new DataView(jsonChunkHeader);
    jsonChunkHeaderView.setUint32(0, paddedJsonChunk.length, false);
    jsonChunkHeaderView.setUint32(4, 0x4E4F534A, false); // Chunk type: "JSON"

    // Создаем BIN chunk header (8 байт)
    const binChunkHeader = new ArrayBuffer(8);
    const binChunkHeaderView = new DataView(binChunkHeader);
    binChunkHeaderView.setUint32(0, paddedBinaryChunk.length, false);
    binChunkHeaderView.setUint32(4, 0x004E4942, false); // Chunk type: "BIN"

    // Собираем все вместе
    const glbBuffer = new Uint8Array(
      header.byteLength +
      jsonChunkHeader.byteLength +
      paddedJsonChunk.length +
      binChunkHeader.byteLength +
      paddedBinaryChunk.length
    );

    let offset = 0;
    glbBuffer.set(new Uint8Array(header), offset);
    offset += header.byteLength;

    glbBuffer.set(new Uint8Array(jsonChunkHeader), offset);
    offset += jsonChunkHeader.byteLength;

    glbBuffer.set(paddedJsonChunk, offset);
    offset += paddedJsonChunk.length;

    glbBuffer.set(new Uint8Array(binChunkHeader), offset);
    offset += binChunkHeader.byteLength;

    glbBuffer.set(paddedBinaryChunk, offset);

    return glbBuffer.buffer;
  }

}

// Utility function to trigger download
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}