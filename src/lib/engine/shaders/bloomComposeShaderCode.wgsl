struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    let x = f32((vertexIndex << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(vertexIndex & 2u) * 2.0 - 1.0;
    output.position = vec4f(x, y, 0.0, 1.0);
    output.uv = vec2f(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
    return output;
}

struct BloomComposeUniforms {
    intensity: f32,
    _padding1: f32,
    _padding2: f32,
    _padding3: f32,
    _padding4: f32,
    _padding5: f32,
    _padding6: f32,
    _padding7: f32,
};

@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;
@group(0) @binding(2) var bloomTexture: texture_2d<f32>;
@group(0) @binding(3) var bloomSampler: sampler;
@group(0) @binding(4) var<uniform> composeUniforms: BloomComposeUniforms;

@fragment fn fs(input: VertexOutput) -> @location(0) vec4f {
    let scene = textureSample(sceneTexture, sceneSampler, input.uv);
    let bloom = textureSample(bloomTexture, bloomSampler, input.uv);
    // Additive blending with intensity control
    let result = scene.rgb + bloom.rgb * composeUniforms.intensity;
    return vec4f(result, scene.a);
}