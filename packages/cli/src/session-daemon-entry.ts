import { startSessionDaemon } from "./session-daemon.js";

const daemon = await startSessionDaemon();

const shutdown = (): void => {
  void daemon.close().finally(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
