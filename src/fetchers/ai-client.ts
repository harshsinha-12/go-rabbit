import { type QAModel } from "@/config";
import { getRequiredEnv, logger } from "@/utils";
import OpenAI from "openai";

export const getAIClient = (model: QAModel) => {
  const client = new OpenAI({
    apiKey: getRequiredEnv("OPENAI_API_KEY"),
  });
  logger.debug("Using OpenAI client for model:", model);
  return client;
};
