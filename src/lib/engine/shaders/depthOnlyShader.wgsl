struct CameraUniforms {
    viewProjection: mat4x4f,
    viewPos: vec3f,
    _padding: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(4) var<storage, read> skinMats: array<mat4x4f>;

@vertex fn vs(
    @location(0) position: vec3f,
    @location(3) joints0: vec4<u32>,
    @location(4) weights0: vec4<f32>
) -> @builtin(position) vec4f {
    let pos4 = vec4f(position, 1.0);
    
    let weightSum = dot(weights0, vec4f(1.0));
    let normalizedWeights = select(vec4f(1.0, 0.0, 0.0, 0.0), weights0 / weightSum, weightSum > 0.0001);
    
    var skinnedPos = vec4f(0.0);
    for (var i = 0u; i < 4u; i++) {
        let m = skinMats[joints0[i]];
        skinnedPos += (m * pos4) * normalizedWeights[i];
    }
    
    return camera.viewProjection * vec4f(skinnedPos.xyz, 1.0);
}

@fragment fn fs() -> @location(0) vec4f {
    return vec4f(0.0);
}