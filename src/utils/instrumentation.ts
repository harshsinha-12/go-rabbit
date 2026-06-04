import { logger } from "./logger";

type LogMetadata = Record<string, unknown>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return error;
}

export async function withToolLogging<T>(
  toolName: string,
  metadata: LogMetadata,
  operation: () => Promise<T>,
) {
  logger.info({ toolName, ...metadata }, "Tool call started");

  try {
    const result = await operation();
    logger.info({ toolName, ...metadata }, "Tool call completed");
    return result;
  } catch (error) {
    logger.error(
      { toolName, ...metadata, error: serializeError(error) },
      "Tool call failed",
    );
    throw error;
  }
}

export function withSyncToolLogging<T>(
  toolName: string,
  metadata: LogMetadata,
  operation: () => T,
) {
  logger.info({ toolName, ...metadata }, "Tool call started");

  try {
    const result = operation();
    logger.info({ toolName, ...metadata }, "Tool call completed");
    return result;
  } catch (error) {
    logger.error(
      { toolName, ...metadata, error: serializeError(error) },
      "Tool call failed",
    );
    throw error;
  }
}

export async function withAgentLogging<T>(
  agentName: string,
  metadata: LogMetadata,
  operation: () => Promise<T>,
) {
  logger.info({ agentName, ...metadata }, "Agent run started");

  try {
    const result = await operation();
    logger.info({ agentName, ...metadata }, "Agent run completed");
    return result;
  } catch (error) {
    logger.error(
      { agentName, ...metadata, error: serializeError(error) },
      "Agent run failed",
    );
    throw error;
  }
}
