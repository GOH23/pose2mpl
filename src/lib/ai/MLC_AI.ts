import * as webllm from "@mlc-ai/web-llm";
export class modelMLCAi {
    constructor() {

    }
    async init() {
        const modelCfg: webllm.AppConfig = {
            model_list: [
                {
                    model: `https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC`,
                    model_id: "Qwen3-0.6B-q4f16_1-MLC",
                    model_lib:
                        webllm.modelLibURLPrefix +
                        webllm.modelVersion +
                        "/Qwen3-0.6B-q4f16_1-ctx4k_cs1k-webgpu.wasm",
                    vram_required_MB: 3431.59,
                    low_resource_required: true,
                },
            ],
        };
        const selectedModel = "Qwen3-0.6B-q4f16_1-MLC";
        const eng = await webllm.CreateMLCEngine(
            selectedModel,
            {
                initProgressCallback: (rep) => {
                    console.log(rep.progress)
                },
                appConfig: modelCfg
            }
        )
    }
}