type LogInput = unknown[];

export const logger = {
  debug: (...input: LogInput) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[go-rabbit]", ...input);
    }
  },
  info: (...input: LogInput) => {
    console.info("[go-rabbit]", ...input);
  },
  error: (...input: LogInput) => {
    console.error("[go-rabbit]", ...input);
  },
};
