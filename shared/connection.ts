import { z } from "zod";

export const FORMAT_DEFAULTS = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-3.5-flash-lite",
  },
  openai: {
    baseUrl: "",
    model: "",
  },
} as const;

export const DEFAULT_CONNECTION = {
  format: "gemini" as const,
  baseUrl: FORMAT_DEFAULTS.gemini.baseUrl,
  model: FORMAT_DEFAULTS.gemini.model,
};

export const MAX_PRESETS = 50;

export const connectionFormatSchema = z.enum(["gemini", "openai"]);
export type ConnectionFormat = z.output<typeof connectionFormatSchema>;

export const connectionFieldsSchema = z.object({
  format: connectionFormatSchema,
  baseUrl: z.string().trim().max(2048),
  model: z.string().trim().max(200),
});

export const connectionPresetMetadataSchema = connectionFieldsSchema.extend({
  id: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(80),
  hasApiKey: z.boolean(),
});

export const connectionMetadataSchema = connectionFieldsSchema.extend({
  hasApiKey: z.boolean(),
  revision: z.string().min(1),
  activePresetId: z.string().nullable(),
  presets: z.array(connectionPresetMetadataSchema),
});

export const connectionKeyUpdateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep") }),
  z.object({ action: z.literal("replace"), value: z.string().min(1).max(8192) }),
]);

export const saveConnectionInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    expectedRevision: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    format: connectionFormatSchema,
    baseUrl: z.string().trim().min(1).max(2048),
    model: z.string().trim().min(1).max(200),
    apiKey: z.string().min(1).max(8192),
  }),
  z.object({
    action: z.literal("update"),
    expectedRevision: z.string().min(1),
    id: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(80),
    format: connectionFormatSchema,
    baseUrl: z.string().trim().min(1).max(2048),
    model: z.string().trim().min(1).max(200),
    key: connectionKeyUpdateSchema,
  }),
  z.object({
    action: z.literal("select"),
    expectedRevision: z.string().min(1),
    id: z.string().min(1).max(128),
  }),
  z.object({
    action: z.literal("delete"),
    expectedRevision: z.string().min(1),
    id: z.string().min(1).max(128),
  }),
]);

export const testConnectionInputSchema = z.object({
  presetId: z.string().min(1).max(128).nullable(),
  format: connectionFormatSchema,
  baseUrl: z.string().trim().min(1).max(2048),
  model: z.string().trim().min(1).max(200),
  key: connectionKeyUpdateSchema,
});

export type ConnectionMetadata = z.output<typeof connectionMetadataSchema>;
export type ConnectionPresetMetadata = z.output<typeof connectionPresetMetadataSchema>;
export type ConnectionFields = z.output<typeof connectionFieldsSchema>;
export type SaveConnectionInput = z.output<typeof saveConnectionInputSchema>;
export type TestConnectionInput = z.output<typeof testConnectionInputSchema>;

export function isConnectionConfigured(connection: ConnectionMetadata | null | undefined): boolean {
  return Boolean(connection?.hasApiKey && connection.baseUrl && connection.model);
}

export const connectionQueryKey = (hostId: string) => ["translation-connection", hostId];
export function connectionQueryOptions(hostId: string, read: () => Promise<ConnectionMetadata>) {
  return {
    queryKey: connectionQueryKey(hostId),
    queryFn: read,
    staleTime: 5_000,
    refetchInterval: 5_000,
    retry: false as const,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  };
}
