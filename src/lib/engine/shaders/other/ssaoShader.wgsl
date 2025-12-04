struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    cameraPos: vec3f,
    padding: f32,
}

struct SSAOParams {
    radius: f32,
    bias: f32,
    power: f32,
    samples: i32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var depthTexture: texture_depth_2d;
@group(0) @binding(2) var normalTexture: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: SSAOParams;
@group(0) @binding(4) var randomTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2f, 6>(
        vec2f(-1.0, -1.0),
        vec2f(1.0, -1.0),
        vec2f(-1.0, 1.0),
        vec2f(-1.0, 1.0),
        vec2f(1.0, -1.0),
        vec2f(1.0, 1.0)
    );
    
    var output: VertexOutput;
    output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
    output.texCoord = pos[vertexIndex] * 0.5 + 0.5;
    return output;
}

fn getPositionFromDepth(depth: f32, texCoord: vec2f) -> vec3f {
    let clipPos = vec4f(texCoord * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    let viewPos = camera.projectionMatrix * clipPos;
    let viewPosNorm = viewPos.xyz / viewPos.w;
    let worldPos = inverse(camera.viewMatrix) * vec4f(viewPosNorm, 1.0);
    return worldPos.xyz;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let depth = textureLoad(depthTexture, vec2i(input.texCoord * textureDimensions(depthTexture)), 0);
    
    if (depth >= 0.999) {
        return vec4f(1.0);
    }
    
    let worldPos = getPositionFromDepth(depth, input.texCoord);
    let normal = textureLoad(normalTexture, vec2i(input.texCoord * textureDimensions(normalTexture)), 0).xyz;
    
    // Генерируем случайные точки
    var occlusion = 0.0;
    let texSize = textureDimensions(randomTexture);
    let randomVec = textureLoad(randomTexture, vec2i((input.texCoord * vec2f(texSize)) % vec2f(texSize)), 0).xyz * 2.0 - 1.0;
    
    // Создаем TBN матрицу
    let tangent = normalize(randomVec - normal * dot(randomVec, normal));
    let bitangent = cross(normal, tangent);
    let tbn = mat3x3f(tangent, bitangent, normal);
    
    // Итерируем по сэмплам
    for (var i = 0; i < params.samples; i++) {
        // Используем сэмплы в полусфере
        let sampleVec = tbn * generateSample(i);
        let samplePos = worldPos + sampleVec * params.radius;
        
        // Проектируем обратно
        let sampleClip = camera.projectionMatrix * camera.viewMatrix * vec4f(samplePos, 1.0);
        let sampleNDC = sampleClip.xyz / sampleClip.w;
        let sampleTexCoord = sampleNDC.xy * 0.5 + 0.5;
        
        if (sampleTexCoord.x < 0.0 || sampleTexCoord.x > 1.0 || 
            sampleTexCoord.y < 0.0 || sampleTexCoord.y > 1.0) {
            continue;
        }
        
        let sampleDepth = textureLoad(depthTexture, vec2i(sampleTexCoord * textureDimensions(depthTexture)), 0);
        let sampleWorldPos = getPositionFromDepth(sampleDepth, sampleTexCoord);
        
        // Проверяем, находится ли точка выше поверхности
        let rangeCheck = smoothstep(0.0, 1.0, params.radius / abs(worldPos.z - sampleWorldPos.z));
        let diff = sampleWorldPos.z - worldPos.z;
        
        if (diff > params.bias) {
            occlusion += 1.0 * rangeCheck;
        }
    }
    
    occlusion = 1.0 - (occlusion / f32(params.samples));
    return vec4f(vec3f(pow(occlusion, params.power)), 1.0);
}

fn generateSample(index: i32) -> vec3f {
    // Сэмплы в полусфере
    let samples = array<vec3f, 64>(
        vec3f(0.04977, 0.04471, 0.04996), vec3f(0.01457, 0.09653, 0.00576),
        vec3f(0.04049, 0.02738, 0.09629), vec3f(0.10118, 0.09023, 0.02915),
        vec3f(0.06572, 0.04402, 0.08054), vec3f(0.02257, 0.09420, 0.09992),
        vec3f(0.07922, 0.09030, 0.04085), vec3f(0.03949, 0.05879, 0.05708),
        vec3f(0.09397, 0.06885, 0.01789), vec3f(0.03634, 0.07445, 0.04275),
        vec3f(0.01678, 0.08892, 0.09570), vec3f(0.08482, 0.02737, 0.02424),
        vec3f(0.03750, 0.09091, 0.06793), vec3f(0.09630, 0.00595, 0.03423),
        vec3f(0.04224, 0.05463, 0.07446), vec3f(0.05498, 0.02457, 0.08083),
        vec3f(0.06787, 0.04434, 0.02946), vec3f(0.09615, 0.00895, 0.04305),
        vec3f(0.05932, 0.04402, 0.04054), vec3f(0.01551, 0.09988, 0.08289),
        vec3f(0.02329, 0.09906, 0.04039), vec3f(0.09385, 0.04185, 0.03267),
        vec3f(0.09748, 0.05035, 0.01392), vec3f(0.03748, 0.09134, 0.02566),
        vec3f(0.05416, 0.07138, 0.05781), vec3f(0.09763, 0.02883, 0.00183),
        vec3f(0.07941, 0.06166, 0.04451), vec3f(0.03057, 0.02786, 0.09618),
        vec3f(0.05227, 0.00481, 0.09828), vec3f(0.03188, 0.09579, 0.02558),
        vec3f(0.09169, 0.04739, 0.03068), vec3f(0.05884, 0.06824, 0.07052),
        vec3f(0.09800, 0.01390, 0.04363), vec3f(0.07763, 0.02927, 0.05820),
        vec3f(0.03367, 0.09954, 0.00538), vec3f(0.09686, 0.06489, 0.02492),
        vec3f(0.06854, 0.08863, 0.04816), vec3f(0.02691, 0.03839, 0.09736),
        vec3f(0.04901, 0.03683, 0.08788), vec3f(0.09916, 0.01678, 0.05649),
        vec3f(0.08078, 0.05226, 0.05869), vec3f(0.05275, 0.09359, 0.03575),
        vec3f(0.04940, 0.09685, 0.02019), vec3f(0.09714, 0.03983, 0.05833),
        vec3f(0.02274, 0.09052, 0.09707), vec3f(0.04842, 0.05332, 0.07734),
        vec3f(0.09977, 0.00339, 0.03449), vec3f(0.03401, 0.09994, 0.00246),
        vec3f(0.02830, 0.09422, 0.09928), vec3f(0.04032, 0.08377, 0.05544),
        vec3f(0.09932, 0.02218, 0.05895), vec3f(0.05568, 0.09095, 0.04073),
        vec3f(0.08304, 0.05912, 0.05310), vec3f(0.09976, 0.02463, 0.00343),
        vec3f(0.08684, 0.06730, 0.04901), vec3f(0.09984, 0.01186, 0.03128),
        vec3f(0.03162, 0.09969, 0.00345), vec3f(0.05147, 0.09910, 0.00600),
        vec3f(0.08248, 0.04205, 0.06900), vec3f(0.09922, 0.03452, 0.03065),
        vec3f(0.08919, 0.08949, 0.03582), vec3f(0.09985, 0.01537, 0.00498)
    );
    
    let i = index % 64;
    return normalize(samples[i]);
}