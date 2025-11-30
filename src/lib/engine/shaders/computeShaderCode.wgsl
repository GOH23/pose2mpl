struct BoneCountUniform {
    count: u32,
    _padding1: u32,
    _padding2: u32,
    _padding3: u32,
    _padding4: vec4<u32>,
};

@group(0) @binding(0) var<uniform> boneCount: BoneCountUniform;
@group(0) @binding(1) var<storage, read> worldMatrices: array<mat4x4f>;
@group(0) @binding(2) var<storage, read> inverseBindMatrices: array<mat4x4f>;
@group(0) @binding(3) var<storage, read_write> skinMatrices: array<mat4x4f>;

@compute @workgroup_size(64) // Must match COMPUTE_WORKGROUP_SIZE
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let boneIndex = globalId.x;
    if (boneIndex >= boneCount.count) {
    return;
    }
    let worldMat = worldMatrices[boneIndex];
    let invBindMat = inverseBindMatrices[boneIndex];
    skinMatrices[boneIndex] = worldMat * invBindMat;
}