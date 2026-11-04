import type { PluginServerContext } from "@getpaseo/plugin/server";
import { ConnectionFailure, ConnectionStore } from "./server/connection";
import { TranslationService } from "./server/translation-service";
import { clearTranslationCache, getTranslation, getConnection, saveConnection, submitTranslation } from "./shared/rpc";
import { translationSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(translationSettings);
  const connections = new ConnectionStore();
  const service = new TranslationService(settings, connections);
  server.handle(getConnection, () => connections.metadata());
  server.handle(saveConnection, async (input) => {
    try { return { status: "saved" as const, connection: await connections.save(input) }; }
    catch (error) {
      return { status: error instanceof ConnectionFailure ? error.kind : "error" as const,
        error: error instanceof ConnectionFailure ? error.message : "保存本机连接失败，请重试" };
    }
  });
  server.handle(submitTranslation, (input) => service.submit(input));
  server.handle(getTranslation, ({ jobId }) => service.get(jobId));
  server.handle(clearTranslationCache, () => service.clear());
  return () => service.close();
}
