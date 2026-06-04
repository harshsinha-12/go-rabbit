import { GPT_5_2, GPT_5_4, type QAModel } from "@/config";
import { getRequiredEnv, logger } from "@/utils";
import OpenAI, { AzureOpenAI } from "openai";

export const getAIClient = (model: QAModel, apiVersion: string) => {
  if (model === GPT_5_2 || model === GPT_5_4) {
    const client = new AzureOpenAI({
      apiKey: getRequiredEnv("AZURE_OPENAI_API_KEY_EAST_US"),
      endpoint: getRequiredEnv("AZURE_OPENAI_ENDPOINT_EAST_US"),
      deployment: model,
      apiVersion,
    });
    logger.debug("Using Azure OpenAI East US client for model:", model);
    return client;
  }
  const client = new AzureOpenAI({
    apiKey: getRequiredEnv("AZURE_OPENAI_API_KEY"),
    endpoint: getRequiredEnv("AZURE_OPENAI_ENDPOINT"),
    deployment: model,
    apiVersion,
  });
  logger.debug("Using Azure OpenAI client for model:", model);
  return client;
};
