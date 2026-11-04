import { setTimeout as delay } from "node:timers/promises";
import type { PluginSettings, PluginSettingsState } from "@getpaseo/plugin/server";
import { settingsSchema, type TranslationSettings } from "../shared/settings";
import { DEFAULT_CONNECTION } from "../shared/connection";
import { publicConnection, type ConnectionSource, type PrivateConnection } from "./connection";
import type { TranslationRequest, TranslationRunner } from "./http-translator";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(1);
  }
  throw new Error("Test condition did not settle.");
}
export class MemorySettings implements PluginSettings<typeof settingsSchema> {
  values: TranslationSettings = settingsSchema.parse({ enabled: true });
  revision = "1";
  invalid = false;
  private listeners = new Set<(state: PluginSettingsState<typeof settingsSchema>) => void | Promise<void>>();
  async read(): Promise<PluginSettingsState<typeof settingsSchema>> {
    return this.invalid ? { status: "invalid", revision: this.revision, error: "invalid" }
      : { status: "ready", revision: this.revision, values: { ...this.values } };
  }
  subscribe(listener: (state: PluginSettingsState<typeof settingsSchema>) => void | Promise<void>) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  async change(patch: Partial<TranslationSettings>, notify = true) {
    this.values = { ...this.values, ...patch };
    this.revision = String(Number(this.revision) + 1);
    if (notify) for (const listener of this.listeners) await listener(await this.read());
  }
  get listenerCount() { return this.listeners.size; }
}
export class MemoryConnection implements ConnectionSource {
  value: PrivateConnection = { ...DEFAULT_CONNECTION, apiKey: "offline-secret", revision: "connection-1" };
  private listeners = new Set<() => void>();
  async read() { return { ...this.value }; }
  async metadata() { return publicConnection(this.value); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  change(patch: Partial<PrivateConnection>, notify = true) {
    this.value = { ...this.value, ...patch, revision: this.value.revision + "-new" };
    if (notify) for (const listener of this.listeners) listener();
  }
  get listenerCount() { return this.listeners.size; }
}
export function recordingRunner(run?: (request: TranslationRequest) => Promise<string>) {
  const requests: TranslationRequest[] = [];
  let closed = false;
  const runner: TranslationRunner = {
    async translate(request) { requests.push(request); return run ? run(request) : "译:" + request.text; },
    async close() { closed = true; },
  };
  return { runner, requests, isClosed: () => closed };
}
