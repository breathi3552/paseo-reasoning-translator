import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, settingsSchema } from "../shared/settings";
import { reasoningDataSchema } from "../shared/timeline";
import { connectionMetadataSchema, DEFAULT_CONNECTION } from "../shared/connection";
import { submitTranslation, translationJobSchema } from "../shared/rpc";

test("ordinary host settings contain no connection or credential fields and default to manual opt-in", () => {
  assert.deepEqual(DEFAULT_SETTINGS, { enabled: false, translationMode: "manual", targetLanguage: "简体中文" });
  assert.equal(settingsSchema.safeParse({ apiKey: "not-allowed" }).success, false);
  assert.equal(settingsSchema.safeParse({ targetLanguage: " " }).success, false);
  const metadata = connectionMetadataSchema.parse({ ...DEFAULT_CONNECTION, hasApiKey: false, revision: "r" });
  assert.deepEqual(Object.keys(metadata).sort(), ["baseUrl", "format", "hasApiKey", "model", "revision"]);
});
test("source payload and click revisions are explicit contracts", () => {
  const text = "Existing host-visible reasoning.\n原文";
  assert.deepEqual(reasoningDataSchema.parse({ text, phase: "streaming" }), { text, phase: "streaming" });
  assert.equal(submitTranslation.input.safeParse({ agentId: "a", text }).success, false);
  assert.equal(submitTranslation.input.safeParse({ agentId: "a", text, settingsRevision: "s", connectionRevision: "c" }).success, true);
  const retranslation = { agentId: "a", text, settingsRevision: "s", connectionRevision: "c", retranslateId: "explicit-click" };
  assert.equal(submitTranslation.input.parse(retranslation).retranslateId, "explicit-click");
  assert.equal(submitTranslation.input.safeParse({ ...retranslation, retranslateId: "" }).success, false);
  const skipped = translationJobSchema.parse({ jobId: null, status: "skipped", translatedText: null,
    targetLanguage: "简体中文", reason: "connection_required", error: null });
  assert.equal(skipped.translatedText, null);
});
