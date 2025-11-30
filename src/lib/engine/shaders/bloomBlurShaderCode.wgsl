struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    // Более читаемая версия генерации полноэкранного треугольника
    let position = vec2f(
        f32(vertexIndex & 1u) * 4.0 - 1.0,  // -1, 3, -1 для vertexIndex 0,1,2
        f32(vertexIndex >> 1u) * 4.0 - 1.0   // -1, -1, 3 для vertexIndex 0,1,2
    );
    
    output.position = vec4f(position, 0.0, 1.0);
    output.uv = position * vec2f(0.5, -0.5) + 0.5; // Одной операцией
    return output;
}

struct BlurUniforms {
    direction_texel_size: vec4f,  // xy: direction, zw: texel_size
    weights_offsets: vec4f,       // x: weight0, y: weight1, z: offset1
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> blurUniforms: BlurUniforms;

@fragment fn fs(input: VertexOutput) -> @location(0) vec4f {
    let direction = blurUniforms.direction_texel_size.xy;
    let texel_size = blurUniforms.direction_texel_size.zw;
    let weights = blurUniforms.weights_offsets.xy;
    let offset1 = blurUniforms.weights_offsets.z;
    
    // Векторизованные вычисления
    let offset_vec = offset1 * texel_size * direction;
    
    var result = textureSample(inputTexture, inputSampler, input.uv) * weights.x;
    
    // Одновременно вычисляем оба смещения
    let uv_offsets = vec2f(1.0, -1.0) * offset_vec;
    result += textureSample(inputTexture, inputSampler, input.uv + uv_offsets.x) * weights.y;
    result += textureSample(inputTexture, inputSampler, input.uv + uv_offsets.y) * weights.y;
    
    return result;
}