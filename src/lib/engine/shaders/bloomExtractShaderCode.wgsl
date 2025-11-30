struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    // Generate fullscreen quad from vertex index
    let x = f32((vertexIndex << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(vertexIndex & 2u) * 2.0 - 1.0;
    output.position = vec4f(x, y, 0.0, 1.0);
    output.uv = vec2f(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
    return output;
}

struct BloomExtractUniforms {
    threshold: f32,
    _padding1: f32,
    _padding2: f32,
    _padding3: f32,
    _padding4: f32,
    _padding5: f32,
    _padding6: f32,
    _padding7: f32,
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> extractUniforms: BloomExtractUniforms;

@fragment fn fs(input: VertexOutput) -> @location(0) vec4f {
    let color = textureSample(inputTexture, inputSampler, input.uv);
    // Extract bright areas above threshold
    let threshold = extractUniforms.threshold;
    let bloom = max(vec3f(0.0), color.rgb - vec3f(threshold)) / max(0.001, 1.0 - threshold);
    return vec4f(bloom, color.a);
}