import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { Icon, Markdown, StreamedText } from "@getpaseo/plugin/client/ui";
import { useMemo, useState, useCallback, useRef } from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { translationSettings } from "../shared/settings";
import { MAX_SOURCE_CHARS, submitTranslation, getTranslation, type TranslationJob } from "../shared/rpc";
import {
  canTranslate,
  createTranslationIntent,
  translationIdentity,
  translationSubmitOptions,
  translationPollOptions,
  translationRetryAction,
  type TranslationContext,
  type TranslationIntent,
} from "../shared/translation-query";
import type { ReasoningData } from "../shared/timeline";
import { isConnectionConfigured } from "../shared/connection";
import { useConnection } from "./connection";

function getReasonLabel(reason: string | null): string {
  switch (reason) {
    case "disabled":
      return "翻译已在设置中关闭";
    case "connection_required":
      return "翻译连接未配置";
    case "connection_changed":
      return "翻译连接已更新";
    case "empty_text":
      return "思考文本为空";
    case "queue_full":
      return "翻译排队已满（等待队列上限 64，翻译并发 1）";
    case "job_expired":
      return "任务已过期，请重试";
    case "settings_changed":
      return "设置已更新";
    default:
      return "已跳过";
  }
}

export function TranslatedReasoning(props: PluginTimelineItemProps<ReasoningData>) {
  const settings = useSettings(translationSettings);
  const connection = useConnection(props.host.id);
  const context: TranslationContext = {
    hostId: props.host.id,
    agentId: props.agentId,
    text: props.item.data.text,
    phase: props.item.data.phase,
    revision: settings.status === "ready" ? settings.revision : null,
    values: settings.status === "ready" ? settings.values : null,
    connection: connection.status === "success" ? connection.data : null,
  };
  // The host owns the source row's identity. Appended text must not remount StreamedText.
  const mountKey = JSON.stringify([context.hostId, context.agentId, context.revision, context.connection?.revision]);
  return <ReasoningBlock key={mountKey} {...props} context={context} />;
}

function ReasoningBlock({
  item,
  theme,
  layout,
  context,
}: PluginTimelineItemProps<ReasoningData> & { context: TranslationContext }) {
  const isSettingsReady = context.values !== null;
  const isEnabled = Boolean(context.values?.enabled && isConnectionConfigured(context.connection));
  const isManual = context.values?.translationMode !== "automatic";
  const eligible = canTranslate(context);
  const isComplete = item.data.phase === "complete";
  const isOverLimit = item.data.text.length > MAX_SOURCE_CHARS;

  const [intent, setIntent] = useState<TranslationIntent | null>(null);
  const [intentSource, setIntentSource] = useState(context.text);
  const intentRef = useRef<TranslationIntent | null>(null);
  const pollRetrying = useRef(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Revoke spending permission on every source change, including A → B → A,
  // without resetting the row's collapsed state or remounting paced text.
  if (intentSource !== context.text) {
    setIntentSource(context.text);
    setIntent(null);
    intentRef.current = null;
    pollRetrying.current = false;
  }

  const submitRpc = useRpc(submitTranslation);
  const getJobRpc = useRpc(getTranslation);

  const hasIntent = !isManual || intent?.identity === translationIdentity(context);
  const submitResult = useQuery(translationSubmitOptions(context, intent, submitRpc));
  const initialJob = submitResult.data;
  const submitQuery = {
    ...submitResult,
    isError: hasIntent && submitResult.isError,
    isFetching: hasIntent && submitResult.isFetching,
  };
  const pollOptions = translationPollOptions(context, intent, initialJob, getJobRpc);
  const pollResult = useQuery(pollOptions);
  const pollQuery = {
    ...pollResult,
    isError: hasIntent && pollResult.isError,
    isFetching: hasIntent && pollResult.isFetching,
  };
  const pendingJob = pollQuery.data ?? initialJob;
  const busy = submitQuery.isFetching || pollQuery.isFetching ||
    (!pollQuery.isError && (pendingJob?.status === "queued" || pendingJob?.status === "running"));

  const handleTranslate = useCallback(() => {
    if (!eligible || intentRef.current) return;
    const next = createTranslationIntent(context, 0, submitRpc);
    intentRef.current = next;
    setIntent(next);
  }, [eligible, context, submitRpc]);

  // Cached ready text survives remounts. An unclicked block is never shown as queued.
  const cachedJob = pollQuery.data ?? initialJob;
  const currentJob: TranslationJob | undefined =
    hasIntent || cachedJob?.status === "ready" ? cachedJob : undefined;

  const retryAction = translationRetryAction(
    context, intent, submitQuery.isFetching || pollQuery.isFetching,
    pollQuery.isError, pollOptions.enabled,
  );
  const handleRetry = useCallback(() => {
    if (retryAction === "none" || pollRetrying.current || intentRef.current !== intent) return;
    // A transport error resumes the same admitted job, never a new AI submission.
    if (retryAction === "poll") {
      pollRetrying.current = true;
      void pollQuery.refetch().finally(() => { pollRetrying.current = false; });
      return;
    }
    const retranslate = intent?.retranslateId
      ? (submitQuery.isError ? intent.retranslateId : true)
      : false;
    const next = createTranslationIntent(context, (intent?.attempt ?? 0) + 1, submitRpc, retranslate);
    intentRef.current = next;
    setIntent(next);
  }, [retryAction, context, intent, pollQuery, submitRpc, submitQuery.isError]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          marginVertical: 4,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          overflow: "hidden",
        },
        header: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          paddingHorizontal: layout.compact ? 10 : 14,
          paddingVertical: 8,
          backgroundColor: theme.colors.surface2,
          borderBottomWidth: collapsed ? 0 : 1,
          borderBottomColor: theme.colors.border,
        },
        headerLeft: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          flexShrink: 1,
        },
        headerRight: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          flexShrink: 1,
        },
        title: {
          fontSize: layout.compact ? 12 : 13,
          fontWeight: "600",
          color: theme.colors.foreground,
        },
        badge: {
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: theme.colors.surface0,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        badgeText: {
          fontSize: 10,
          fontWeight: "500",
          color: theme.colors.foregroundMuted,
        },
        badgeStreaming: {
          borderColor: theme.colors.accent,
        },
        badgeStreamingText: {
          color: theme.colors.accent,
        },
        badgeSuccess: {
          borderColor: theme.colors.statusSuccess,
        },
        badgeSuccessText: {
          color: theme.colors.statusSuccess,
        },
        badgeWarning: {
          borderColor: theme.colors.statusWarning,
        },
        badgeWarningText: {
          color: theme.colors.statusWarning,
        },
        badgeDanger: {
          borderColor: theme.colors.statusDanger,
        },
        badgeDangerText: {
          color: theme.colors.statusDanger,
        },
        actionButton: {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 4,
          backgroundColor: theme.colors.surface0,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        actionButtonText: {
          fontSize: 11,
          fontWeight: "500",
          color: theme.colors.foreground,
        },
        retryButton: {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 4,
          backgroundColor: theme.colors.accent,
        },
        disabledButton: {
          opacity: 0.5,
        },
        retryButtonText: {
          fontSize: 11,
          fontWeight: "600",
          color: theme.colors.accentForeground,
        },
        body: {
          paddingHorizontal: layout.compact ? 10 : 14,
          paddingVertical: layout.compact ? 8 : 12,
        },
        infoBox: {
          marginBottom: 8,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 4,
          backgroundColor: theme.colors.surface0,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        infoText: {
          fontSize: 11,
          color: theme.colors.foregroundMuted,
        },
        errorBox: {
          marginBottom: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 4,
          backgroundColor: theme.colors.surface0,
          borderWidth: 1,
          borderColor: theme.colors.statusDanger,
        },
        errorTitle: {
          fontSize: 11,
          fontWeight: "600",
          color: theme.colors.statusDanger,
          marginBottom: 2,
        },
        errorText: {
          fontSize: 11,
          color: theme.colors.foregroundMuted,
        },
        reasoningText: {
          fontSize: layout.compact ? 12 : 13,
          lineHeight: layout.compact ? 18 : 20,
          color: theme.colors.foreground,
          opacity: 0.9,
        },
        collapsedHint: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          fontSize: 11,
          fontStyle: "italic",
          color: theme.colors.foregroundMuted,
        },
      }),
    [theme, layout.compact, collapsed],
  );

  // Determine transport, limit, or job error states
  let errorTitle: string | null = null;
  let errorMessage: string | null = null;
  let canRetry = false;

  if (isComplete) {
    if (isOverLimit) {
      errorTitle = `思考文本超出上限 (${item.data.text.length.toLocaleString()} / ${MAX_SOURCE_CHARS.toLocaleString()} 字符)`;
      errorMessage = `文本长度已超过单次翻译最大上限（${MAX_SOURCE_CHARS.toLocaleString()} 字符）。在源思考文本改变或缩短前不可翻译，重试无效。`;
      canRetry = false;
    } else if (submitQuery.isError) {
      errorTitle = "提交翻译任务失败（网络或服务异常）";
      errorMessage =
        submitQuery.error instanceof Error
          ? submitQuery.error.message
          : String(submitQuery.error);
      canRetry = true;
    } else if (pollQuery.isError) {
      errorTitle = "查询翻译进度失败（网络中断或连接断开）";
      errorMessage =
        pollQuery.error instanceof Error
          ? pollQuery.error.message
          : String(pollQuery.error);
      canRetry = true;
    } else if (currentJob?.status === "error") {
      errorTitle = "翻译执行失败";
      errorMessage = currentJob.error ?? "翻译过程中出现未知错误";
      canRetry = true;
    } else if (currentJob?.status === "skipped") {
      if (currentJob.reason === "settings_changed" || currentJob.reason === "connection_changed") {
        errorTitle = "翻译设置或连接已变化";
        errorMessage = "旧任务已取消。确认当前连接后，可手动重新翻译此块。";
        canRetry = true;
      } else if (currentJob.reason === "queue_full") {
        errorTitle = "翻译排队已满";
        errorMessage =
          "当前等待队列已达到 64 个任务上限（翻译并发为 1），请稍候点击「重试」。";
        canRetry = true;
      } else if (currentJob.reason === "job_expired") {
        errorTitle = "翻译任务已过期";
        errorMessage = "后台任务已过期清理，可点击「重试」重新提交。";
        canRetry = true;
      } else if (
        currentJob.reason !== "disabled" &&
        currentJob.reason !== "empty_text"
      ) {
        errorTitle = "翻译已跳过";
        errorMessage = getReasonLabel(currentJob.reason);
        canRetry = false;
      }
    }
  }

  const hasError = Boolean(errorTitle);

  // Compute status badge
  let badgeLabel = "原文";
  let badgeStyle: StyleProp<ViewStyle> = styles.badge;
  let badgeTextStyle: StyleProp<TextStyle> = styles.badgeText;

  if (!isComplete) {
    badgeLabel = "思考中...";
    badgeStyle = [styles.badge, styles.badgeStreaming];
    badgeTextStyle = [styles.badgeText, styles.badgeStreamingText];
  } else if (isOverLimit) {
    badgeLabel = "文本超限";
    badgeStyle = [styles.badge, styles.badgeDanger];
    badgeTextStyle = [styles.badgeText, styles.badgeDangerText];
  } else if (!isEnabled) {
    if (isSettingsReady && !context.values?.enabled) {
      badgeLabel = "未开启翻译";
    } else {
      badgeLabel = "连接未配置";
    }
  } else if (submitQuery.isFetching) {
    badgeLabel = "提交中...";
    badgeStyle = [styles.badge, styles.badgeWarning];
    badgeTextStyle = [styles.badgeText, styles.badgeWarningText];
  } else if (submitQuery.isError) {
    badgeLabel = "提交失败";
    badgeStyle = [styles.badge, styles.badgeDanger];
    badgeTextStyle = [styles.badgeText, styles.badgeDangerText];
  } else if (pollQuery.isError) {
    badgeLabel = "查询失败";
    badgeStyle = [styles.badge, styles.badgeDanger];
    badgeTextStyle = [styles.badgeText, styles.badgeDangerText];
  } else if (currentJob) {
    if (currentJob.status === "ready") {
      badgeLabel = `译文 (${currentJob.targetLanguage})`;
      badgeStyle = [styles.badge, styles.badgeSuccess];
      badgeTextStyle = [styles.badgeText, styles.badgeSuccessText];
    } else if (currentJob.status === "running") {
      badgeLabel = "正在翻译...";
      badgeStyle = [styles.badge, styles.badgeWarning];
      badgeTextStyle = [styles.badgeText, styles.badgeWarningText];
    } else if (currentJob.status === "queued") {
      badgeLabel = "排队中...";
      badgeStyle = [styles.badge, styles.badgeWarning];
      badgeTextStyle = [styles.badgeText, styles.badgeWarningText];
    } else if (currentJob.status === "error") {
      badgeLabel = "翻译失败";
      badgeStyle = [styles.badge, styles.badgeDanger];
      badgeTextStyle = [styles.badgeText, styles.badgeDangerText];
    } else if (currentJob.status === "skipped") {
      badgeLabel = getReasonLabel(currentJob.reason);
      if (canRetry) {
        badgeStyle = [styles.badge, styles.badgeWarning];
        badgeTextStyle = [styles.badgeText, styles.badgeWarningText];
      }
    }
  }

  if (isManual && eligible && !intent && !currentJob && !submitQuery.isError) {
    badgeLabel = "待翻译";
  }

  const isTranslatedReady = Boolean(
    currentJob?.status === "ready" && currentJob.translatedText,
  );
  const retranslateDisabled = !eligible || busy;
  const handleRetranslate = useCallback(() => {
    if (!isTranslatedReady || retranslateDisabled || pollRetrying.current || intentRef.current !== intent) return;
    const next = createTranslationIntent(context, (intent?.attempt ?? 0) + 1, submitRpc, true);
    // Synchronous latch covers rapid clicks before React commits the pending state.
    intentRef.current = next;
    setIntent(next);
  }, [isTranslatedReady, retranslateDisabled, context, intent, submitRpc]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Icon name="Brain" size={14} color={theme.colors.foregroundMuted} />
          <Text style={styles.title}>思考过程</Text>
          <View style={badgeStyle}>
            <Text style={badgeTextStyle}>{badgeLabel}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {isManual && intent && busy && !canRetry && !collapsed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="翻译已提交"
              accessibilityState={{ disabled: true, busy: true }}
              disabled
              style={[styles.actionButton, styles.disabledButton]}
            >
              <Text style={styles.actionButtonText}>
                {submitQuery.isFetching ? "提交中..." : "翻译中..."}
              </Text>
            </Pressable>
          )}

          {isTranslatedReady && !collapsed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showOriginal ? "显示译文" : "显示原文"}
              onPress={() => setShowOriginal((prev) => !prev)}
              style={styles.actionButton}
            >
              <Text style={styles.actionButtonText}>
                {showOriginal ? "显示译文" : "显示原文"}
              </Text>
            </Pressable>
          )}

          {isTranslatedReady && !collapsed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="重新翻译此思考块"
              accessibilityHint="发起新的模型请求，可能产生额外费用"
              accessibilityState={{ disabled: retranslateDisabled, busy }}
              disabled={retranslateDisabled}
              onPress={handleRetranslate}
              style={[styles.actionButton, retranslateDisabled && styles.disabledButton]}
            >
              <Text style={styles.actionButtonText}>重新翻译</Text>
            </Pressable>
          )}

          {isManual && !intent && !isTranslatedReady && !collapsed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="翻译此思考块"
              accessibilityState={{ disabled: !eligible, busy: submitQuery.isFetching }}
              disabled={!eligible || submitQuery.isFetching}
              onPress={handleTranslate}
              style={[styles.actionButton, !eligible && styles.disabledButton]}
            >
              <Text style={styles.actionButtonText}>
                {pendingJob?.jobId && (pendingJob.status === "queued" || pendingJob.status === "running")
                  ? "继续查询" : "翻译"}
              </Text>
            </Pressable>
          )}

          {canRetry && !collapsed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="重试翻译"
              accessibilityState={{ disabled: retryAction === "none", busy }}
              disabled={retryAction === "none"}
              onPress={handleRetry}
              style={[styles.retryButton, retryAction === "none" && styles.disabledButton]}
            >
              <Text style={styles.retryButtonText}>重试</Text>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={collapsed ? "展开思考内容" : "折叠思考内容"}
            onPress={() => setCollapsed((prev) => !prev)}
            style={styles.actionButton}
          >
            <Text style={styles.actionButtonText}>
              {collapsed ? "展开" : "折叠"}
            </Text>
          </Pressable>
        </View>
      </View>

      {collapsed ? (
        <Text style={styles.collapsedHint}>思考内容已折叠（点击右上角展开）</Text>
      ) : (
        <View style={styles.body}>
          {/* While streaming: render host-paced streamed text */}
          {!isComplete && (
            <StreamedText
              text={item.data.text}
              phase="streaming"
              style={styles.reasoningText}
            />
          )}

          {/* When completed: handle translation states */}
          {isComplete && (
            <>
              {context.values?.enabled && !isConnectionConfigured(context.connection) && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    翻译连接未配置或暂不可读取。请从侧边栏「思考翻译」或命令中心打开设置，填写 Base URL、模型 ID 和 API key。
                  </Text>
                </View>
              )}
              {submitQuery.isFetching && (
                <View style={styles.infoBox}>
                  <Text accessibilityLiveRegion="polite" style={styles.infoText}>
                    正在提交此思考块的翻译任务，原文已保留...
                  </Text>
                </View>
              )}
              {/* Show translating progress banner while waiting */}
              {(currentJob?.status === "queued" ||
                currentJob?.status === "running") && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    {currentJob.status === "queued"
                      ? `任务已进入后台排队，目标语言：${currentJob.targetLanguage}...`
                      : `正在通过所选 HTTP 接口翻译为 ${currentJob.targetLanguage}，请稍候...`}
                  </Text>
                </View>
              )}

              {/* Show error explanation box on failure */}
              {hasError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorTitle}>
                    {errorTitle}（已保留原文）：
                  </Text>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {/* Show translated text if ready and user has not chosen original */}
              {isTranslatedReady && !showOriginal ? (
                <Markdown>{currentJob?.translatedText ?? ""}</Markdown>
              ) : (
                /* Show original text */
                <Text selectable style={styles.reasoningText}>
                  {item.data.text}
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}
