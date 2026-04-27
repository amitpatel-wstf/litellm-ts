import type { Logger } from "../core/types.js";

export const consoleLogger: Logger = {
  debug: (message, metadata) => console.debug(message, metadata ?? {}),
  info: (message, metadata) => console.info(message, metadata ?? {}),
  warn: (message, metadata) => console.warn(message, metadata ?? {}),
  error: (message, metadata) => console.error(message, metadata ?? {}),
};
