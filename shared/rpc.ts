import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { connectionMetadataSchema, saveConnectionInputSchema } from "./connection";

export const MAX_SOURCE_CHARS = 200_000;
export const getConnection = defineRpc({
  name: "translation.connection.get", input: z.object({}), output: connectionMetadataSchema,
});
export const saveConnection = defineRpc({
  name: "translation.connection.save", input: saveConnectionInputSchema,
  output: z.discriminatedUnion("status", [
    z.object({ status: z.literal("saved"), connection: connectionMetadataSchema }),
    z.object({ status: z.enum(["conflict", "invalid", "error"]), error: z.string() }),
  ]),
});
export const translationJobSchema = z.object({
  jobId: z.string().nullable(),
  status: z.enum(["queued", "running", "ready", "skipped", "error"]),
  translatedText: z.string().nullable(), targetLanguage: z.string(),
  reason: z.enum(["disabled", "connection_required", "connection_changed", "empty_text", "queue_full", "job_expired", "settings_changed"]).nullable(),
  error: z.string().nullable(),
});
export const submitTranslationInputSchema = z.object({
  agentId: z.string().min(1),
  text: z.string().max(MAX_SOURCE_CHARS, "Reasoning is longer than 200,000 characters. Original text is still available."),
  settingsRevision: z.string().min(1), connectionRevision: z.string().min(1),
  retry: z.boolean().default(false),
  // One explicit retranslation action; repeated delivery must not spend again.
  retranslateId: z.string().min(1).max(128).optional(),
});
export const submitTranslation = defineRpc({ name: "translation.submit", input: submitTranslationInputSchema, output: translationJobSchema });
export const getTranslation = defineRpc({ name: "translation.get", input: z.object({ jobId: z.string().min(1) }), output: translationJobSchema });
export const clearTranslationCache = defineRpc({ name: "translation.clear", input: z.object({}), output: z.object({ cleared: z.number().int().nonnegative() }) });
export type TranslationJob = z.output<typeof translationJobSchema>;
export type SubmitTranslationInput = z.output<typeof submitTranslationInputSchema>;
