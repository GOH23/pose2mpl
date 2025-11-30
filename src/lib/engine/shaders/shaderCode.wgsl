struct CameraUniforms {
    view: mat4x4f,
    projection: mat4x4f,
    viewPos: vec3f,
    _padding: f32,
};

struct Light {
    direction: vec3f,
    _padding1: f32,
    color: vec3f,
    intensity: f32,
};

struct LightUniforms {
    ambient: f32,
    lightCount: f32,
    _padding1: f32,
    _padding2: f32,
    lights: array<Light, 4>,
};

struct MaterialUniforms {
    alpha: f32,
    alphaMultiplier: f32,
    rimIntensity: f32,
    _padding1: f32,
    rimColor: vec3f,
    isOverEyes: f32,
    diffuseColor: vec4f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
    @location(1) uv: vec2f,
    @location(2) worldPos: vec3f,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> light: LightUniforms;
@group(0) @binding(2) var diffuseTexture: texture_2d<f32>;
@group(0) @binding(3) var diffuseSampler: sampler;
@group(0) @binding(4) var<storage, read> skinMats: array<mat4x4f>;
@group(0) @binding(5) var toonTexture: texture_2d<f32>;
@group(0) @binding(6) var toonSampler: sampler;
@group(0) @binding(7) var<uniform> material: MaterialUniforms;

@vertex fn vs(
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
    @location(3) joints0: vec4<u32>,
    @location(4) weights0: vec4<f32>
) -> VertexOutput {
    var output: VertexOutput;
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
    
    let worldPos = skinnedPos.xyz;
    output.position = camera.projection * camera.view * vec4f(worldPos, 1.0);
    output.normal = normalize(skinnedNrm);
    output.uv = uv;
    output.worldPos = worldPos;
    return output;
}

@fragment fn fs(input: VertexOutput) -> @location(0) vec4f {
    var finalAlpha = material.alpha * material.alphaMultiplier;
    let overEyesFactor = mix(1.0, 0.5, material.isOverEyes);
    finalAlpha *= overEyesFactor;
    
    if (finalAlpha < 0.001) {
        discard;
    }
    
    let n = normalize(input.normal);
    let textureColor = textureSample(diffuseTexture, diffuseSampler, input.uv);
    var albedo = textureColor.rgb * material.diffuseColor.rgb;
    finalAlpha *= textureColor.a * material.diffuseColor.a;

    var lightAccum = vec3f(light.ambient);
    let numLights = u32(light.lightCount);
    
    for (var i = 0u; i < numLights; i++) {
        let l = -light.lights[i].direction;
        let nDotL = max(dot(n, l), 0.0);
        let toonUV = vec2f(nDotL, 0.5);
        let toonFactor = textureSample(toonTexture, toonSampler, toonUV).r;
        let radiance = light.lights[i].color * light.lights[i].intensity;
        lightAccum += toonFactor * radiance * nDotL;
    }
    
    let viewDir = normalize(camera.viewPos - input.worldPos);
    let rimFactor = 1.0 - max(dot(n, viewDir), 0.0);
    let rimFactorSquared = rimFactor * rimFactor;
    let rimLight = material.rimColor * material.rimIntensity * rimFactorSquared;
    
    let color = albedo * lightAccum + rimLight;
    
    return vec4f(color, finalAlpha);
}