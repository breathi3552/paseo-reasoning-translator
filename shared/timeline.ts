import { z } from "zod";

export const REASONING_KIND = "translated-reasoning";
export const REASONING_VERSION = 1;
export const reasoningDataSchema = z.object({
  text: z.string(),
  phase: z.enum(["streaming", "complete"]),
});
export type ReasoningData = z.output<typeof reasoningDataSchema>;
