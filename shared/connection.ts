import { z } from "zod";

export const DEFAULT_CONNECTION = {
  format: "gemini" as const,
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  model: "gemini-3.5-flash-lite",
};
export const connectionFieldsSchema = z.object({
  format: z.enum(["gemini", "openai"]),
  baseUrl: z.string().trim().max(2048),
  model: z.string().trim().max(200),
});
export const connectionMetadataSchema = connectionFieldsSchema.extend({
  hasApiKey: z.boolean(),
  revision: z.string().min(1),
});
export const saveConnectionInputSchema = connectionFieldsSchema.extend({
  expectedRevision: z.string().min(1),
  key: z.discriminatedUnion("action", [
    z.object({ action: z.literal("keep") }),
    z.object({ action: z.literal("delete") }),
    z.object({ action: z.literal("replace"), value: z.string().min(1).max(8192) }),
  ]),
});
export type ConnectionMetadata = z.output<typeof connectionMetadataSchema>;
export type ConnectionFields = z.output<typeof connectionFieldsSchema>;
export type SaveConnectionInput = z.output<typeof saveConnectionInputSchema>;
export function isConnectionConfigured(connection: ConnectionMetadata | null | undefined): boolean {
  return Boolean(connection?.hasApiKey && connection.baseUrl && connection.model);
}
export const connectionQueryKey = (hostId: string) => ["translation-connection", hostId];
export function connectionQueryOptions(hostId: string, read: () => Promise<ConnectionMetadata>) {
  return {
    queryKey: connectionQueryKey(hostId), queryFn: read, staleTime: 5_000,
    refetchInterval: 5_000, retry: false as const,
    refetchOnWindowFocus: true, refetchOnReconnect: true,
  };
}
