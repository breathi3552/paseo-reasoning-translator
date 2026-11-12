import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { Icon, Markdown, StreamedText } from "@getpaseo/plugin/client/ui";
import { useMemo, useState, useCallback, useRef } from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import {
  localizeServerError,
  useI18n,
  type TranslationKey,
  type TranslationParams,
} from "./i18n";

const MONO_FONT =
  typeof Platform !== "undefined" && Platform?.select
    ? Platform.select({
        web: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        default: "monospace",
      })
    : "monospace";

const UI_FONT =
  typeof Platform !== "undefined" && Platform?.select
    ? Platform.select({
        web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        default: undefined,
      })
    : undefined;

function getReasonLabel(
  reason: string | null,
  t: (key: TranslationKey, params?: TranslationParams) => string,
): string {
  switch (reason) {
    case "disabled":
      return t("timeline.reason.disabled");
    case "connection_required":
      return t("timeline.reason.connection_required");
    case "connection_changed":
      return t("timeline.reason.connection_changed");
    case "empty_text":
      return t("timeline.reason.empty_text");
    case "queue_full":
      return t("timeline.reason.queue_full");
    case "job_expired":
      return t("timeline.reason.job_expired");
    case "settings_changed":
      return t("timeline.reason.settings_changed");
    default:
      return t("timeline.reason.skipped");
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

function ReasoningBlock(
  props: PluginTimelineItemProps<ReasoningData> & { context: TranslationContext },
) {
  const { item, theme, layout, context } = props;
  const { t, language } = useI18n(props);
  const isSettingsReady = context.values !== null;
  const isEnabled = Boolean(context.values?.enabled && isConnectionConfigured(context.connection));
  const isManual = context.values?.translationMode !== "automatic";
  const eligible = canTranslate(context);
  const isComplete = item.data.phase === "complete";
  const isStreaming = !isComplete;
  const isOverLimit = item.data.text.length > MAX_SOURCE_CHARS;

  const [intent, setIntent] = useState<TranslationIntent | null>(null);
  const [intentSource, setIntentSource] = useState(context.text);
  const intentRef = useRef<TranslationIntent | null>(null);
  const pollRetrying = useRef(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // ADR-0002: null means governed by lifecycle (streaming expanded, complete auto-collapsed);
  // boolean means explicitly toggled by user.
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Revoke spending permission on every source change, including A → B → A,
  // without resetting user intent or remounting paced text.
  if (intentSource !== context.text) {
    setIntentSource(context.text);
    setIntent(null);
    intentRef.current = null;
    pollRetrying.current = false;
  }

  const collapsed = userCollapsed !== null ? userCollapsed : !isStreaming;

  const toggleCollapse = useCallback(() => {
    setUserCollapsed((prev) => (prev !== null ? !prev : isStreaming ? true : false));
  }, [isStreaming]);

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
  const busy =
    submitQuery.isFetching ||
    pollQuery.isFetching ||
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
    context,
    intent,
    submitQuery.isFetching || pollQuery.isFetching,
    pollQuery.isError,
    pollOptions.enabled,
  );
  const handleRetry = useCallback(() => {
    if (retryAction === "none" || pollRetrying.current || intentRef.current !== intent) return;
    // A transport error resumes the same admitted job, never a new AI submission.
    if (retryAction === "poll") {
      pollRetrying.current = true;
      void pollQuery.refetch().finally(() => {
        pollRetrying.current = false;
      });
      return;
    }
    const retranslate = intent?.retranslateId
      ? submitQuery.isError
        ? intent.retranslateId
        : true
      : false;
    const next = createTranslationIntent(
      context,
      (intent?.attempt ?? 0) + 1,
      submitRpc,
      retranslate,
    );
    intentRef.current = next;
    setIntent(next);
  }, [retryAction, context, intent, pollQuery, submitRpc, submitQuery.isError]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Folded state: matching native tool calls (Search/Read/Shell/Thinking)
        foldedContainer: {
          marginHorizontal: -13,
          marginTop: -16,
          marginBottom: -16,
        },
        pressable: {
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "transparent",
          paddingHorizontal: 8,
          paddingVertical: 4,
          overflow: "hidden",
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
        },
        labelRow: {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          overflow: "hidden",
        },
        iconBadge: {
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 4,
          backgroundColor: "transparent",
        },
        iconNode: {
          marginLeft: -1,
        },
        chevronNode: {
          marginLeft: -4,
          transform: [{ scale: 1.3 }],
        },
        label: {
          fontFamily: UI_FONT,
          fontSize: layout.compact ? 13 : 14,
          fontWeight: "400",
          color: theme.colors.foregroundMuted,
          flexShrink: 0,
        },
        labelActive: {
          color: theme.colors.foreground,
        },
        secondaryLabel: {
          fontFamily: UI_FONT,
          fontSize: layout.compact ? 13 : 14,
          fontWeight: "400",
          color: theme.colors.foregroundMuted,
          marginLeft: 8,
          flexShrink: 1,
          minWidth: 0,
        },
        secondaryLabelActive: {
          color: theme.colors.foreground,
        },

        // Expanded state: unified card matching native tool calls (Read/Shell)
        cardContainer: {
          marginHorizontal: -13,
          marginTop: -16,
          marginBottom: -16,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          overflow: "hidden",
        },
        cardHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        cardTitle: {
          fontFamily: UI_FONT,
          fontSize: layout.compact ? 13 : 14,
          fontWeight: "500",
          color: theme.colors.foreground,
        },
        detailWrapper: {
          backgroundColor: theme.colors.surface2,
          flexShrink: 1,
          minWidth: 0,
        },
        detailScroll: {
          maxHeight: 360,
        },
        detailContent: {
          padding: layout.compact ? 10 : 12,
        },
        chevronDownNode: {
          transform: [{ scale: 1.3 }],
        },

        // Common components
        headerLeft: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          flexShrink: 1,
        },
        headerRight: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        badge: {
          paddingHorizontal: 4,
          paddingVertical: 1,
        },
        badgeText: {
          fontFamily: MONO_FONT,
          fontSize: 10,
          fontWeight: "400",
          color: theme.colors.foregroundMuted,
        },
        badgeStreamingText: {
          color: theme.colors.accent,
        },
        badgeSuccessText: {
          color: theme.colors.statusSuccess,
        },
        badgeWarningText: {
          color: theme.colors.statusWarning,
        },
        badgeDangerText: {
          color: theme.colors.statusDanger,
        },
        ghostButton: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: theme.colors.surface2,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        ghostButtonText: {
          fontFamily: UI_FONT,
          fontSize: 11,
          fontWeight: "500",
          color: theme.colors.foregroundMuted,
        },
        ghostButtonDanger: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: theme.colors.surface2,
          borderWidth: 1,
          borderColor: theme.colors.statusDanger,
        },
        ghostButtonDangerText: {
          fontFamily: UI_FONT,
          fontSize: 11,
          fontWeight: "500",
          color: theme.colors.statusDanger,
        },
        disabledButton: {
          opacity: 0.4,
        },
        pillButton: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: theme.colors.surface2,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        pillButtonText: {
          fontFamily: UI_FONT,
          fontSize: 11,
          fontWeight: "500",
          color: theme.colors.foreground,
        },
        inlineDiagnostic: {
          marginHorizontal: 12,
          marginTop: 8,
          marginBottom: 4,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 4,
          backgroundColor: theme.colors.surface1,
          borderWidth: 1,
          borderColor: theme.colors.statusDanger,
        },
        inlineDiagnosticText: {
          fontSize: 11,
          color: theme.colors.statusDanger,
          flexShrink: 1,
        },
        contentBox: {
          marginTop: 2,
        },
        reasoningText: {
          fontFamily: UI_FONT,
          fontSize: layout.compact ? 13 : 14,
          lineHeight: 22,
          color: theme.colors.foreground,
        },
      }),
    [theme, layout.compact],
  );

  // Determine transport, limit, or job error states
  let errorTitle: string | null = null;
  let errorMessage: string | null = null;
  let canRetry = false;

  if (isComplete) {
    if (isOverLimit) {
      errorTitle = t("timeline.error.overLimitTitle", {
        length: item.data.text.length.toLocaleString(),
        limit: MAX_SOURCE_CHARS.toLocaleString(),
      });
      errorMessage = t("timeline.error.overLimitMessage", {
        limit: MAX_SOURCE_CHARS.toLocaleString(),
      });
      canRetry = false;
    } else if (submitQuery.isError) {
      errorTitle = t("timeline.error.submitFailedTitle");
      const rawError =
        submitQuery.error instanceof Error
          ? submitQuery.error.message
          : String(submitQuery.error);
      errorMessage = localizeServerError(rawError, language);
      canRetry = true;
    } else if (pollQuery.isError) {
      errorTitle = t("timeline.error.pollFailedTitle");
      const rawError =
        pollQuery.error instanceof Error
          ? pollQuery.error.message
          : String(pollQuery.error);
      errorMessage = localizeServerError(rawError, language);
      canRetry = true;
    } else if (currentJob?.status === "error") {
      errorTitle = t("timeline.error.jobFailedTitle");
      errorMessage = currentJob.error
        ? localizeServerError(currentJob.error, language)
        : t("timeline.error.unknownError");
      canRetry = true;
    } else if (currentJob?.status === "skipped") {
      if (currentJob.reason === "settings_changed" || currentJob.reason === "connection_changed") {
        errorTitle = t("timeline.error.configChangedTitle");
        errorMessage = t("timeline.error.configChangedMessage");
        canRetry = true;
      } else if (currentJob.reason === "queue_full") {
        errorTitle = t("timeline.error.queueFullTitle");
        errorMessage = t("timeline.error.queueFullMessage");
        canRetry = true;
      } else if (currentJob.reason === "job_expired") {
        errorTitle = t("timeline.error.jobExpiredTitle");
        errorMessage = t("timeline.error.jobExpiredMessage");
        canRetry = true;
      } else if (
        currentJob.reason !== "disabled" &&
        currentJob.reason !== "empty_text"
      ) {
        errorTitle = t("timeline.error.skippedTitle");
        errorMessage = getReasonLabel(currentJob.reason, t);
        canRetry = false;
      }
    }
  }

  const hasError = Boolean(errorTitle);

  // Compute status badge
  const originalLabel = t("timeline.badge.original");
  const pendingLabel = t("timeline.badge.pending");
  const disabledLabel = t("timeline.badge.disabled");
  const unconfiguredLabel = t("timeline.badge.unconfigured");

  let badgeLabel = originalLabel;
  let badgeTextStyle: StyleProp<TextStyle> = styles.badgeText;

  if (!isComplete) {
    badgeLabel = t("timeline.badge.streaming");
    badgeTextStyle = [styles.badgeText, styles.badgeStreamingText];
  } else if (isOverLimit) {
    badgeLabel = t("timeline.badge.overLimit");
    badgeTextStyle = [styles.badgeText, styles.badgeDangerText];
  } else if (!isEnabled) {
    if (isSettingsReady && !context.values?.enabled) {
      badgeLabel = disabledLabel;
    } else {
      badgeLabel = unconfiguredLabel;
    }
  } else if (submitQuery.isFetching) {
    badgeLabel = t("timeline.badge.submitting");
    badgeTextStyle = [styles.badgeText, styles.badgeWarningText];
  } else if (submitQuery.isError) {
    badgeLabel = t("timeline.badge.submitFailed");
    badgeTextStyle = [styles.badgeText, styles.badgeDangerText];
  } else if (pollQuery.isError) {
    badgeLabel = t("timeline.badge.pollFailed");
    badgeTextStyle = [styles.badgeText, styles.badgeDangerText];
  } else if (currentJob) {
    if (currentJob.status === "ready") {
      badgeLabel = currentJob.targetLanguage;
      badgeTextStyle = [styles.badgeText, styles.badgeSuccessText];
    } else if (currentJob.status === "running") {
      badgeLabel = t("timeline.badge.running");
      badgeTextStyle = [styles.badgeText, styles.badgeWarningText];
    } else if (currentJob.status === "queued") {
      badgeLabel = t("timeline.badge.queued");
      badgeTextStyle = [styles.badgeText, styles.badgeWarningText];
    } else if (currentJob.status === "error") {
      badgeLabel = t("timeline.badge.error");
      badgeTextStyle = [styles.badgeText, styles.badgeDangerText];
    } else if (currentJob.status === "skipped") {
      badgeLabel = getReasonLabel(currentJob.reason, t);
      if (canRetry) {
        badgeTextStyle = [styles.badgeText, styles.badgeWarningText];
      }
    }
  }

  if (isManual && eligible && !intent && !currentJob && !submitQuery.isError) {
    badgeLabel = pendingLabel;
  }

  const showSecondary =
    badgeLabel !== pendingLabel &&
    badgeLabel !== originalLabel &&
    badgeLabel !== unconfiguredLabel &&
    badgeLabel !== disabledLabel;

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

  if (collapsed) {
    return (
      <View style={styles.foldedContainer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("timeline.expandLabel")}
          onPress={toggleCollapse}
          onHoverIn={() => setIsHovered(true)}
          onHoverOut={() => setIsHovered(false)}
          onPointerEnter={() => setIsHovered(true)}
          onPointerLeave={() => setIsHovered(false)}
          style={styles.pressable}
        >
          <View style={styles.headerRow}>
            <View style={styles.iconBadge}>
              {isHovered ? (
                <View style={styles.chevronNode}>
                  <Icon
                    name="ChevronRight"
                    size={12}
                    color={theme.colors.foreground}
                  />
                </View>
              ) : (
                <View style={styles.iconNode}>
                  <Icon
                    name="Brain"
                    size={12}
                    color={theme.colors.foregroundMuted}
                  />
                </View>
              )}
            </View>

            <View style={styles.labelRow}>
              <Text style={[styles.label, isHovered && styles.labelActive]}>
                {t("timeline.title")}
              </Text>
              {showSecondary && (
                <Text
                  style={[
                    styles.secondaryLabel,
                    isHovered && styles.secondaryLabelActive,
                    badgeTextStyle,
                  ]}
                  numberOfLines={1}
                >
                  {badgeLabel}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.cardContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("timeline.collapseLabel")}
        onPress={toggleCollapse}
        style={styles.cardHeader}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconBadge}>
            <View style={styles.chevronDownNode}>
              <Icon name="ChevronDown" size={12} color={theme.colors.foreground} />
            </View>
          </View>
          <Text style={styles.cardTitle}>{t("timeline.title")}</Text>
          {showSecondary && (
            <View style={styles.badge}>
              <Text style={badgeTextStyle}>{badgeLabel}</Text>
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          {isTranslatedReady && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showOriginal
                  ? t("timeline.action.showTranslation")
                  : t("timeline.action.showOriginal")
              }
              onPress={(e) => {
                (e as any)?.stopPropagation?.();
                setShowOriginal((prev) => !prev);
              }}
              style={styles.pillButton}
            >
              <Text style={styles.pillButtonText}>
                {showOriginal
                  ? t("timeline.action.showTranslation")
                  : t("timeline.action.showOriginal")}
              </Text>
            </Pressable>
          )}

          {isTranslatedReady && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("timeline.action.retranslateLabel")}
              accessibilityHint={t("timeline.action.retranslateHint")}
              accessibilityState={{ disabled: retranslateDisabled, busy }}
              disabled={retranslateDisabled}
              onPress={(e) => {
                (e as any)?.stopPropagation?.();
                handleRetranslate();
              }}
              style={[styles.ghostButton, retranslateDisabled && styles.disabledButton]}
            >
              <Text style={styles.ghostButtonText}>
                {t("timeline.action.retranslate")}
              </Text>
            </Pressable>
          )}

          {isManual && !intent && !isTranslatedReady && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("timeline.action.translateLabel")}
              accessibilityState={{ disabled: !eligible, busy: submitQuery.isFetching }}
              disabled={!eligible || submitQuery.isFetching}
              onPress={(e) => {
                (e as any)?.stopPropagation?.();
                handleTranslate();
              }}
              style={[styles.ghostButton, !eligible && styles.disabledButton]}
            >
              <Text style={styles.ghostButtonText}>
                {pendingJob?.jobId && (pendingJob.status === "queued" || pendingJob.status === "running")
                  ? t("timeline.action.resumePoll")
                  : t("timeline.action.translate")}
              </Text>
            </Pressable>
          )}

          {canRetry && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("timeline.action.retryLabel")}
              accessibilityState={{ disabled: retryAction === "none", busy }}
              disabled={retryAction === "none"}
              onPress={(e) => {
                (e as any)?.stopPropagation?.();
                handleRetry();
              }}
              style={[styles.ghostButtonDanger, retryAction === "none" && styles.disabledButton]}
            >
              <Text style={styles.ghostButtonDangerText}>
                {t("timeline.action.retry")}
              </Text>
            </Pressable>
          )}
        </View>
      </Pressable>

      <View style={styles.detailWrapper}>
        {hasError && (
          <View style={styles.inlineDiagnostic}>
            <Text style={styles.inlineDiagnosticText}>
              {errorTitle}{t("timeline.error.separator")}{errorMessage}
            </Text>
          </View>
        )}

        <ScrollView
          style={styles.detailScroll}
          contentContainerStyle={styles.detailContent}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={true}
        >
          {!isComplete && (
            <StreamedText
              text={item.data.text}
              phase="streaming"
              style={styles.reasoningText}
            />
          )}

          {isComplete && (
            isTranslatedReady && !showOriginal ? (
              <Markdown>{currentJob?.translatedText ?? ""}</Markdown>
            ) : (
              <Text selectable style={styles.reasoningText}>
                {item.data.text}
              </Text>
            )
          )}
        </ScrollView>
      </View>
    </View>
  );
}
