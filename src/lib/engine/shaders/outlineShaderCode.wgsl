struct CameraUniforms {
    viewProjection: mat4x4f,
    viewPos: vec3f,
    _padding: f32,
};

struct MaterialUniforms {
    edgeColor: vec4f,
    edgeSizeScale: f32,
    isOverEyes: f32,
    _padding1: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> material: MaterialUniforms;
@group(0) @binding(2) var<storage, read> skinMats: array<mat4x4f>;

struct VertexOutput {
    @builtin(position) position: vec4f,
};

@vertex fn vs(
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(3) joints0: vec4<u32>,
    @location(4) weights0: vec4<f32>
) -> VertexOutput {
    let pos4 = vec4f(position, 1.0);
    
    let weightSum = weights0.x + weights0.y + weights0.z + weights0.w;
    let invWeightSum = select(1.0, 1.0 / weightSum, weightSum > 0.0001);
    let normalizedWeights = select(vec4f(1.0, 0.0, 0.0, 0.0), weights0 * invWeightSum, weightSum > 0.0001);
    
    var skinnedPos = vec4f(0.0);
    var skinnedNrm = vec3f(0.0);
    
    for (var i = 0u; i < 4u; i++) {
        let j = joints0[i];
        let w = normalizedWeights[i];
        let m = skinMats[j];
        skinnedPos += (m * pos4) * w;
        let r3 = mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz);
        skinnedNrm += (r3 * normal) * w;
    }
    
    let worldNormal = normalize(skinnedNrm);
    let expandedPos = skinnedPos.xyz + worldNormal * material.edgeSizeScale;
    
    var output: VertexOutput;
    output.position = camera.viewProjection * vec4f(expandedPos, 1.0);
    return output;
}

@fragment fn fs() -> @location(0) vec4f {
    let alpha = material.edgeColor.a * mix(1.0, 0.5, material.isOverEyes);
    return vec4f(material.edgeColor.rgb, alpha);
}