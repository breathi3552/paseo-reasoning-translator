import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const settingsSchema = z.object({
  enabled: z.boolean().default(false),
  translationMode: z.enum(["manual", "automatic"]).default("manual"),
  targetLanguage: z.string().trim().min(1).max(80).default("简体中文"),
}).strict();

export const translationSettings = defineSettings({
  id: "translation",
  scope: "host",
  version: 2,
  schema: settingsSchema,
});

export type TranslationSettings = z.output<typeof settingsSchema>;
export const DEFAULT_SETTINGS: TranslationSettings = settingsSchema.parse({});
