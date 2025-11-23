import * as webllm from "@mlc-ai/web-llm";
export class modelMLCAi {
    engine: webllm.MLCEngine | undefined

    static systemPrompt = `
    Answer must be in russian language
    You are a pose and animation interpreter AI. 
    Your task is to convert skeletal bone commands into vivid, natural language descriptions of human poses and movements. 
    You understand the following bone structure: 
        Body Core (base, center, upper_body, lower_body, waist, neck, head), 
        Arms (shoulder_l/r, arm_l/r, elbow_l/r, wrist_l/r), 
        Legs (leg_l/r, knee_l/r, ankle_l/r, toe_l/r), 
        Fingers (thumb_l/r, index_l/r, middle_l/r, ring_l/r, pinky_l/r). 
    Commands follow the format "bone action direction amount;" or "bone reset;" where actions are bend, turn, sway, move, reset and directions are forward, backward, left, right, up, down. Amount values represent intensity (0.0-2.0). 
    When processing commands, describe the resulting pose or animation as if observing a real person - focus on natural human movement, weight distribution, balance, and emotional expression. 
    For static poses, describe the final position. 
    For animations, describe the motion flow, timing, and character.
    Never output technical terms like "quaternion", "matrix", "vector", or "bone transformations" - only human-readable descriptions. 
    Example: "head turn left 0.5; arm_l move up 1.0;" becomes "A young woman looks curiously to her left while raising her left arm high above her head, fingers gently spread, her body shifting slightly to maintain balance." Always respond with only the pose/animation description, no additional commentary or formatting.`
    messages: {
        role: "system" | "user",
        content: string
    }[] = [
            { role: "system", content: modelMLCAi.systemPrompt }
        ]
    constructor() {

    }
    async init() {
        const modelCfg: webllm.AppConfig = {
            model_list: [
                {
                    model: `https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f32_1-MLC`,
                    model_id: "Qwen3-1.7B-q4f32_1-MLC",
                    model_lib:
                        webllm.modelLibURLPrefix +
                        webllm.modelVersion +
                        "/Qwen3-1.7B-q4f32_1-ctx4k_cs1k-webgpu.wasm",

                    low_resource_required: true,
                    
                },
            ],
            useIndexedDBCache: true
        };
        const selectedModel = "Qwen3-1.7B-q4f32_1-MLC";
        const eng = await webllm.CreateMLCEngine(
            selectedModel,
            {
                initProgressCallback: (rep) => {
                    console.log(rep.progress)
                },

                appConfig: modelCfg
            }
        )
        this.engine = eng
    }
    async message(text: string, onChunks: (chunks: string) => void) {
        if (!this.engine) return;
        var new_message = [...this.messages, {
            role: "user",
            content: text
        }]
        const chunks = await this.engine.chat.completions.create({
            messages: new_message as any,
            stream: true,
        });
        for await (const chunk of chunks) {
            onChunks(chunk.choices[0]?.delta.content || "");
        }

    }
}