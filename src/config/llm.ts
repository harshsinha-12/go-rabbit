export const GPT_5_2 = "gpt-5.2";
export const GPT_5_4 = "gpt-5.4";

export const DEFAULT_LLM_API_VERSION = "2025-04-01-preview";

export const QA_MODELS = [GPT_5_2, GPT_5_4] as const;

export type QAModel = (typeof QA_MODELS)[number];
