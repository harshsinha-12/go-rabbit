export const GPT_5_5 = "gpt-5.5";

export const QA_MODELS = [GPT_5_5] as const;

export type QAModel = (typeof QA_MODELS)[number];
