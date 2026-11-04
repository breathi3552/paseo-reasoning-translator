import { MAX_SOURCE_CHARS, type TranslationJob, type SubmitTranslationInput } from "./rpc";
import { isConnectionConfigured, type ConnectionMetadata } from "./connection";
import type { TranslationSettings } from "./settings";
// Keep shared bundles independent of client-only modules, including type imports.
interface QueryClient {
  getQueryCache(): {
    find(filters: { queryKey: readonly unknown[]; exact: boolean }): object | undefined;
  };
  setQueryData<T>(
    queryKey: readonly unknown[],
    updater: (current: T | undefined) => T | undefined,
  ): unknown;
}

export interface TranslationContext {
  hostId: string;
  agentId: string;
  text: string;
  revision: string | null;
  phase: "streaming" | "complete";
  values: TranslationSettings | null;
  connection: ConnectionMetadata | null;
}

type Submit = (input: SubmitTranslationInput) => Promise<TranslationJob>;
type GetJob = (input: { jobId: string }) => Promise<TranslationJob>;

export function translationIdentity(context: TranslationContext): string {
  return JSON.stringify([context.hostId, context.agentId, context.text, context.revision, context.connection?.revision ?? null]);
}

export function canTranslate(context: TranslationContext): boolean {
  return Boolean(
    context.values?.enabled && isConnectionConfigured(context.connection) &&
    context.revision !== null && context.phase === "complete" &&
    context.text.trim() && context.text.length <= MAX_SOURCE_CHARS,
  );
}

export interface TranslationIntent {
  identity: string;
  attempt: number;
  retranslateId?: string;
  submit(): Promise<TranslationJob>;
}

// A click permits one submission, not an indefinitely reusable spending permission.
// Re-evaluating a query or clearing its cache can only reuse this same promise.
let intentSequence = 0;
const intentOrders = new WeakMap<TranslationIntent, number>();
const latestOrders = new WeakMap<object, number>();
export function createTranslationIntent(
  context: TranslationContext,
  attempt: number,
  submit: Submit,
  retranslate: boolean | string = false,
): TranslationIntent | null {
  if (!canTranslate(context)) return null;
  const order = ++intentSequence;
  // Non-secret action identity: unique across repeated clicks and component remounts.
  // An existing ID resumes a lost submission response without authorizing another paid run.
  const retranslateId = typeof retranslate === "string" ? retranslate : retranslate
    ? `${Date.now().toString(36)}-${order.toString(36)}-${Math.random().toString(36).slice(2)}`
    : undefined;
  let result: Promise<TranslationJob> | undefined;
  const intent: TranslationIntent = {
    identity: translationIdentity(context),
    attempt,
    retranslateId,
    submit: () => result ??= Promise.resolve().then(() => submit({
      agentId: context.agentId, text: context.text, retry: attempt > 0 && !retranslate,
      retranslateId,
      settingsRevision: context.revision!, connectionRevision: context.connection!.revision,
    })),
  };
  intentOrders.set(intent, order);
  return intent;
}

function isAuthorized(context: TranslationContext, intent: TranslationIntent | null): boolean {
  return canTranslate(context) && (
    context.values?.translationMode === "automatic" ||
    intent?.identity === translationIdentity(context)
  );
}

function submitKey(context: TranslationContext, intent: TranslationIntent | null) {
  return ["translation-submit", context.hostId, context.agentId, context.text,
    context.revision ?? "init", context.connection?.revision ?? "no-connection", intent?.attempt ?? 0,
    intent?.retranslateId ?? "cached"];
}

function markLatest(client: QueryClient | undefined, context: TranslationContext, order: number) {
  const query = client?.getQueryCache().find({ queryKey: submitKey(context, null), exact: true });
  if (query) latestOrders.set(query, Math.max(latestOrders.get(query) ?? 0, order));
}

function publishResult(
  client: QueryClient | undefined, context: TranslationContext, job: TranslationJob,
  { polledJobId, order }: { polledJobId?: string; order?: number } = {},
) {
  if (!client || !job.jobId) return job;
  const key = submitKey(context, null);
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  const latest = query ? latestOrders.get(query) ?? 0 : 0;
  let result = job;
  client.setQueryData<TranslationJob>(key, (current) => {
    // Replayed old submissions and late polls cannot replace a newer admitted job.
    if (current && current.jobId !== job.jobId &&
      ((polledJobId && current.jobId !== polledJobId) || (order !== undefined && order < latest))) return result = current;
    if (current?.jobId === job.jobId && !["queued", "running"].includes(current.status) &&
      ["queued", "running"].includes(job.status)) return result = current;
    return result = job;
  });
  if (order !== undefined) markLatest(client, context, order);
  return result;
}

// These options are used directly by useQuery and exercised with QueryObserver offline.
export function translationSubmitOptions(
  context: TranslationContext,
  intent: TranslationIntent | null,
  submit: Submit,
) {
  const authorized = isAuthorized(context, intent);
  const matchingIntent = intent?.identity === translationIdentity(context) ? intent : null;
  return {
    queryKey: submitKey(context, matchingIntent),
    queryFn: async (query?: { client: QueryClient }) => {
      // refetch() bypasses TanStack's enabled flag, so guard the function too.
      if (!authorized) throw new Error("请先在此思考块点击翻译");
      const order = matchingIntent ? intentOrders.get(matchingIntent) ?? 0 : ++intentSequence;
      markLatest(query?.client, context, order);
      const job = await (matchingIntent ? matchingIntent.submit() : submit({
        agentId: context.agentId, text: context.text, retry: false,
        settingsRevision: context.revision!, connectionRevision: context.connection!.revision,
      }));
      // Keep the no-intent read cache current without granting it submission permission.
      return publishResult(query?.client, context, job, { order });
    },
    enabled: authorized,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: false as const,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: false as const,
  };
}

export function translationPollOptions(
  context: TranslationContext,
  intent: TranslationIntent | null,
  initialJob: TranslationJob | undefined,
  getJob: GetJob,
) {
  const enabled = Boolean(isAuthorized(context, intent) && initialJob?.jobId &&
    (initialJob.status === "queued" || initialJob.status === "running"));
  return {
    queryKey: ["translation-job", context.hostId, initialJob?.jobId, context.revision, context.connection?.revision],
    queryFn: async (query?: { client: QueryClient }) => {
      if (!enabled || !initialJob?.jobId) throw new Error("当前思考块没有可查询的已授权任务");
      const job = await getJob({ jobId: initialJob.jobId });
      publishResult(query?.client, context, job, { polledJobId: initialJob.jobId });
      return job;
    },
    enabled,
    refetchInterval: (query: { state: { status: string; data?: TranslationJob } }) => {
      if (query.state.status === "error") return false;
      const status = query.state.data?.status ?? initialJob?.status;
      return status === "queued" || status === "running" ? 1000 : false;
    },
    staleTime: 0,
    retry: false as const,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: false as const,
  };
}

export function translationRetryAction(
  context: TranslationContext,
  intent: TranslationIntent | null,
  busy: boolean,
  pollError: boolean,
  pollEnabled: boolean,
): "none" | "poll" | "submit" {
  if (busy || !canTranslate(context)) return "none";
  return pollError
    ? (pollEnabled && isAuthorized(context, intent) ? "poll" : "none")
    : "submit";
}
