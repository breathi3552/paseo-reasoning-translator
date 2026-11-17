import { createHash, randomUUID } from "node:crypto";
import type { PluginSettings } from "@getpaseo/plugin/server";
import { MAX_SOURCE_CHARS, type SubmitTranslationInput, type TranslationJob } from "../shared/rpc";
import { settingsSchema, type TranslationSettings } from "../shared/settings";
import { splitReasoning } from "./chunks";
import type { ConnectionSource, PrivateConnection } from "./connection";
import { createHttpTranslator, TranslationFailure, type TranslationRunner } from "./http-translator";

type SettingsHandle = PluginSettings<typeof settingsSchema>;
type ReadySettings = { revision: string; values: TranslationSettings };
type SkipReason = NonNullable<TranslationJob["reason"]>;
class SkipTranslation extends Error {
  constructor(readonly reason: SkipReason) { super(reason); }
}
type Job = {
  result: TranslationJob; key: string; settings: ReadySettings; connectionRevision: string;
  generation: number; text: string; controller: AbortController; finishedAt: number | null;
  retranslateId?: string;
};
export interface ServiceOptions {
  runner?: TranslationRunner; now?: () => number; maxQueue?: number; maxCache?: number; ttlMs?: number; chunkChars?: number; concurrency?: number;
}
function response(language = "简体中文", status: TranslationJob["status"] = "skipped", reason: TranslationJob["reason"] = null, error: string | null = null): TranslationJob {
  return { jobId: null, status, translatedText: null, targetLanguage: language, reason, error };
}

/** Owns serial admission, revision authorization and in-memory results, never credentials or Paseo handles. */
export class TranslationService {
  private readonly runner: TranslationRunner;
  private readonly now: () => number;
  private readonly maxQueue: number;
  private readonly maxCache: number;
  private readonly ttlMs: number;
  private readonly chunkChars: number;
  private readonly jobs = new Map<string, Job>();
  private readonly byKey = new Map<string, Job>();
  private readonly fixedConcurrency?: number;
  private configuredConcurrency = 5;
  private queue: Job[] = [];
  private readonly activeWorkers = new Set<Promise<void>>();
  private closed = false;
  private generation = 0;
  private invalidationReason: SkipReason = "settings_changed";
  private closing?: Promise<void>;
  private readonly unsubscribeSettings: ReturnType<SettingsHandle["subscribe"]>;
  private readonly unsubscribeConnection: () => void;

  constructor(private readonly settings: SettingsHandle, private readonly connections: ConnectionSource, options: ServiceOptions = {}) {
    this.runner = options.runner ?? createHttpTranslator();
    this.now = options.now ?? Date.now;
    this.maxQueue = options.maxQueue ?? 64;
    this.maxCache = options.maxCache ?? 128;
    this.ttlMs = options.ttlMs ?? 30 * 60_000;
    this.chunkChars = options.chunkChars ?? 12_000;
    this.fixedConcurrency = options.concurrency;
    this.unsubscribeSettings = settings.subscribe(() => { this.invalidate("settings_changed"); });
    this.unsubscribeConnection = connections.subscribe(() => { this.invalidate("connection_changed"); });
  }
  private async readSettings(): Promise<ReadySettings> {
    if (this.closed) throw new SkipTranslation("settings_changed");
    const state = await this.settings.read();
    if (this.closed) throw new SkipTranslation("settings_changed");
    if (state.status !== "ready") throw new Error("invalid settings");
    if (!state.values.enabled) throw new SkipTranslation("disabled");
    return state;
  }
  private finish(job: Job, result: TranslationJob) {
    job.result = result;
    job.text = "";
    job.finishedAt = this.now();
  }
  private skip(job: Job, reason: SkipReason) {
    job.controller.abort();
    this.finish(job, { ...response(job.settings.values.targetLanguage, "skipped", reason), jobId: job.result.jobId });
  }
  private invalidate(reason: SkipReason) {
    this.generation++;
    this.invalidationReason = reason;
    for (const job of this.jobs.values()) this.skip(job, reason);
    this.queue = [];
    this.byKey.clear();
    this.prune();
  }
  private prune() {
    const terminals = [...this.jobs.values()].filter((job) => job.finishedAt !== null);
    for (const job of terminals) if (this.now() - job.finishedAt! >= this.ttlMs) this.evict(job);
    const remaining = terminals.filter((job) => this.jobs.has(job.result.jobId!));
    remaining.sort((a, b) => a.finishedAt! - b.finishedAt!);
    for (const job of remaining.slice(0, Math.max(0, remaining.length - this.maxCache))) this.evict(job);
  }
  private evict(job: Job) {
    this.jobs.delete(job.result.jobId!);
    if (this.byKey.get(job.key) === job) this.byKey.delete(job.key);
  }
  private assertGeneration(generation: number) {
    if (this.closed || generation !== this.generation) throw new SkipTranslation(this.invalidationReason);
  }
  private async authorize(job: Job): Promise<PrivateConnection> {
    this.assertGeneration(job.generation);
    if (job.controller.signal.aborted) throw new SkipTranslation(this.invalidationReason);
    const current = await this.readSettings();
    if (current.revision !== job.settings.revision) throw new SkipTranslation("settings_changed");
    const connection = await this.connections.read();
    this.assertGeneration(job.generation);
    if (connection.revision !== job.connectionRevision) throw new SkipTranslation("connection_changed");
    if (!connection.apiKey || !connection.baseUrl || !connection.model) throw new SkipTranslation("connection_required");
    const latest = await this.readSettings();
    this.assertGeneration(job.generation);
    if (latest.revision !== job.settings.revision || job.controller.signal.aborted) throw new SkipTranslation("settings_changed");
    return connection;
  }
  async submit(input: SubmitTranslationInput): Promise<TranslationJob> {
    let language = "简体中文";
    const generation = this.generation;
    try {
      const settings = await this.readSettings();
      this.assertGeneration(generation);
      language = settings.values.targetLanguage;
      this.configuredConcurrency = settings.values.concurrency;
      if (input.text.length > MAX_SOURCE_CHARS) return response(language, "error", null, "Reasoning is longer than 200,000 characters. Original text is still available.");
      if (!input.text.trim()) return response(language, "skipped", "empty_text");
      const connection = await this.connections.read();
      this.assertGeneration(generation);
      if (!connection.apiKey || !connection.baseUrl || !connection.model) throw new SkipTranslation("connection_required");
      if (settings.revision !== input.settingsRevision) throw new SkipTranslation("settings_changed");
      if (connection.revision !== input.connectionRevision) throw new SkipTranslation("connection_changed");
      const latest = await this.readSettings();
      this.assertGeneration(generation);
      if (latest.revision !== settings.revision) throw new SkipTranslation("settings_changed");
      // Credential values never enter cache identities or public results.
      const key = createHash("sha256").update(JSON.stringify([input.agentId, input.text, language, settings.revision, connection.revision])).digest("hex");
      this.prune();
      const existing = this.byKey.get(key);
      if (existing) {
        if (input.retranslateId && input.retranslateId === existing.retranslateId) return { ...existing.result };
        const retryFailure = input.retry && ["error", "skipped"].includes(existing.result.status);
        const retranslateTerminal = input.retranslateId && ["ready", "error", "skipped"].includes(existing.result.status);
        // Queued/running work is always shared, including rapid distinct clicks.
        if (!retryFailure && !retranslateTerminal) return { ...existing.result };
      }
      if (this.queue.length >= this.maxQueue) return response(language, "skipped", "queue_full");
      if (existing) this.evict(existing);
      const result = { ...response(language, "queued"), jobId: randomUUID() };
      const job: Job = { result, key, settings, connectionRevision: connection.revision, generation,
        text: input.text, controller: new AbortController(), finishedAt: null, retranslateId: input.retranslateId };
      this.jobs.set(result.jobId, job);
      this.byKey.set(key, job);
      this.queue.push(job);
      this.schedule();
      return { ...job.result };
    } catch (error) {
      if (error instanceof SkipTranslation) return response(language, "skipped", error.reason);
      return response(language, "error", null, "无法准备翻译，请检查插件设置与本机连接配置");
    }
  }
  async get(jobId: string): Promise<TranslationJob> {
    this.prune();
    const job = this.jobs.get(jobId);
    if (!job) return response("简体中文", "skipped", "job_expired");
    try { await this.authorize(job); }
    catch (error) { this.skip(job, error instanceof SkipTranslation ? error.reason : "connection_changed"); }
    return { ...job.result };
  }
  clear(): { cleared: number } {
    const cleared = this.jobs.size;
    this.invalidate("settings_changed");
    return { cleared };
  }
  private get concurrencyLimit(): number {
    return Math.max(1, this.fixedConcurrency ?? this.configuredConcurrency);
  }
  private schedule() {
    if (this.closed) return;
    while (this.queue.length > 0 && this.activeWorkers.size < this.concurrencyLimit) {
      const worker = this.drain().finally(() => {
        this.activeWorkers.delete(worker);
        if (this.queue.length && !this.closed) this.schedule();
      });
      this.activeWorkers.add(worker);
    }
  }
  private async drain() {
    while (this.queue.length && !this.closed && this.activeWorkers.size <= this.concurrencyLimit) {
      const job = this.queue.shift()!;
      if (job.controller.signal.aborted) continue;
      try {
        await this.authorize(job);
        job.result = { ...job.result, status: "running" };
        const chunks = splitReasoning(job.text, this.chunkChars);
        const translated: string[] = [];
        for (const text of chunks) {
          const connection = await this.authorize(job);
          const output = await this.runner.translate({ connection, text, language: job.settings.values.targetLanguage, signal: job.controller.signal });
          await this.authorize(job);
          translated.push(output);
          if (translated.reduce((size, item) => size + item.length, 0) > 1_000_000) throw new TranslationFailure("译文超过安全长度上限");
        }
        this.finish(job, { ...job.result, status: "ready", translatedText: translated.join("\n\n"), reason: null, error: null });
      } catch (error) {
        if (!job.controller.signal.aborted && !this.closed) {
          if (error instanceof SkipTranslation) this.skip(job, error.reason);
          else this.finish(job, { ...job.result, status: "error", translatedText: null, reason: null,
            error: error instanceof TranslationFailure ? error.message : "翻译失败，请检查连接后手动重试；原文已保留" });
        }
      } finally { this.prune(); }
    }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.invalidate("settings_changed");
    this.closing = (async () => {
      await this.unsubscribeSettings();
      this.unsubscribeConnection();
      await this.runner.close();
      await Promise.allSettled([...this.activeWorkers]);
      this.jobs.clear(); this.byKey.clear();
    })();
    return this.closing;
  }
}
