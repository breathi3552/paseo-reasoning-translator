import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Icon,
  Loading,
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  FORMAT_DEFAULTS,
  connectionQueryKey,
  isConnectionConfigured,
  type ConnectionFormat,
  type ConnectionMetadata,
  type ConnectionPresetMetadata,
} from "../shared/connection";
import { clearTranslationCache, saveConnection, testConnection } from "../shared/rpc";
import { translationSettings, type TranslationSettings } from "../shared/settings";
import { useConnection } from "./connection";
import { localizeServerError, useI18n } from "./i18n";

type PresetDraft = {
  name: string;
  format: ConnectionFormat;
  baseUrl: string;
  model: string;
  keyInput: string;
};

type InlineMode = "edit" | "create";

type StatusMessage = {
  kind: "neutral" | "ok" | "err" | "warn";
  text: string;
};

function createBlankDraft(format: ConnectionFormat = "gemini"): PresetDraft {
  return {
    name: "",
    format,
    baseUrl: FORMAT_DEFAULTS[format].baseUrl,
    model: FORMAT_DEFAULTS[format].model,
    keyInput: "",
  };
}

function presetToDraft(preset: ConnectionPresetMetadata | null): PresetDraft {
  if (!preset) return createBlankDraft("gemini");
  return {
    name: preset.name,
    format: preset.format,
    baseUrl: preset.baseUrl,
    model: preset.model,
    keyInput: "",
  };
}

export function TranslationSettingsScreen(props: PluginSurfaceProps) {
  return <SettingsForm key={props.host.id} {...props} />;
}

function SettingsForm(props: PluginSurfaceProps) {
  const { theme, layout, host } = props;
  const { t, language: uiLanguage } = useI18n(props);
  const settings = useSettings(translationSettings);
  const connection = useConnection(host.id);
  const saveRpc = useRpc(saveConnection);
  const testRpc = useRpc(testConnection);
  const clearRpc = useRpc(clearTranslationCache);
  const queries = useQueryClient();
  const toast = useToast();

  const [mode, setMode] = useState<InlineMode>("edit");
  const [draft, setDraft] = useState<PresetDraft>(() => {
    const initialActive = connection.data?.activePresetId
      ? connection.data.presets.find((p) => p.id === connection.data?.activePresetId) ?? null
      : null;
    return presetToDraft(initialActive);
  });
  const [formEpoch, setFormEpoch] = useState(0);
  const [keyEpoch, setKeyEpoch] = useState(0);
  const [selectEpoch, setSelectEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<StatusMessage | null>(null);
  const [syncedRevision, setSyncedRevision] = useState<string | null>(
    () => connection.data?.revision ?? null,
  );
  const saveLock = useRef(false);
  const testLock = useRef(false);

  const settingsLock = useRef(false);
  const pendingSettingsPatch = useRef<Partial<TranslationSettings> | null>(null);
  const [language, setLanguage] = useState("");
  const [clearing, setClearing] = useState(false);
  const clearLock = useRef(false);
  const [showDetails, setShowDetails] = useState(false);

  const activePreset = useMemo(() => {
    if (!connection.data?.activePresetId) return null;
    return connection.data.presets.find((p) => p.id === connection.data.activePresetId) ?? null;
  }, [connection.data]);

  const hasPresets = Boolean(connection.data && connection.data.presets.length > 0);
  const isCreate = mode === "create";

  const isDirty = useMemo(() => {
    if (!syncedRevision) return false;
    if (isCreate) {
      return Boolean(
        draft.name.trim() || draft.baseUrl.trim() || draft.model.trim() || draft.keyInput.length > 0,
      );
    }
    if (!activePreset) return false;
    return (
      draft.name.trim() !== activePreset.name ||
      draft.format !== activePreset.format ||
      draft.baseUrl.trim().replace(/\/+$/, "") !== activePreset.baseUrl ||
      draft.model.trim() !== activePreset.model ||
      draft.keyInput.length > 0
    );
  }, [syncedRevision, isCreate, activePreset, draft]);

  useEffect(() => {
    if (!connection.data) return;
    if (syncedRevision === connection.data.revision) return;
    if (syncedRevision === null || (mode === "edit" && !isDirty)) {
      const nextActive = connection.data.activePresetId
        ? connection.data.presets.find((p) => p.id === connection.data.activePresetId) ?? null
        : null;
      setSyncedRevision(connection.data.revision);
      setDraft(presetToDraft(nextActive));
      setFormEpoch((v) => v + 1);
      setKeyEpoch((v) => v + 1);
    }
  }, [connection.data, syncedRevision, mode, isDirty]);

  useEffect(() => {
    if (settings.status === "ready") {
      setLanguage(settings.values.targetLanguage);
    }
  }, [settings.status, settings.status === "ready" ? settings.values.targetLanguage : ""]);

  const normalizedBaseUrl = draft.baseUrl.trim().replace(/\/+$/, "");
  const targetChanged = Boolean(
    !isCreate &&
      activePreset &&
      (draft.format !== activePreset.format || normalizedBaseUrl !== activePreset.baseUrl),
  );

  async function saveSettings(patch: Partial<TranslationSettings>) {
    if (settings.status !== "ready") return;
    if (settings.saving || settingsLock.current) {
      pendingSettingsPatch.current = { ...pendingSettingsPatch.current, ...patch };
      return;
    }
    settingsLock.current = true;
    try {
      if (!(await settings.save({ ...settings.values, ...patch }, settings.revision))) {
        toast.error(
          settings.saveError
            ? localizeServerError(settings.saveError, uiLanguage)
            : t("settings.saveFailedToast"),
        );
      }
    } finally {
      settingsLock.current = false;
    }
  }

  useEffect(() => {
    if (settings.status === "ready" && !settings.saving && !settingsLock.current && pendingSettingsPatch.current) {
      const queued = pendingSettingsPatch.current;
      pendingSettingsPatch.current = null;
      void saveSettings(queued);
    }
  }, [settings.status, settings.saving, settings.status === "ready" ? settings.revision : ""]);

  async function commitTargetLanguage() {
    if (settings.status !== "ready") return;
    const next = language.trim();
    if (!next) {
      setLanguage(settings.values.targetLanguage);
      return;
    }
    if (next === settings.values.targetLanguage) {
      if (language !== next) setLanguage(next);
      return;
    }
    setLanguage(next);
    await saveSettings({ targetLanguage: next });
  }

  function validateDraft(): string | null {
    if (!draft.name.trim()) return t("settings.preset.errorNameRequired");
    if (!draft.baseUrl.trim()) return t("settings.preset.errorBaseUrlRequired");
    if (!draft.model.trim()) return t("settings.preset.errorModelRequired");
    if (draft.keyInput.length > 0 && !draft.keyInput.trim()) {
      return t("settings.apiKey.errorBlank");
    }
    if (isCreate) {
      if (!draft.keyInput.trim()) return t("settings.apiKey.errorRequired");
      return null;
    }
    if (!activePreset) return t("settings.preset.modeEmptyDesc");
    if (targetChanged && !draft.keyInput.trim()) {
      return t("settings.apiKey.errorTargetChanged");
    }
    if (!activePreset.hasApiKey && !draft.keyInput.trim()) {
      return t("settings.apiKey.errorRequired");
    }
    return null;
  }

  function applySavedConnection(
    next: ConnectionMetadata,
    nextStatus: StatusMessage,
    toastMessage: string,
  ) {
    setSyncedRevision(next.revision);
    queries.setQueryData(connectionQueryKey(host.id), next);
    const nextActive = next.activePresetId
      ? next.presets.find((p) => p.id === next.activePresetId) ?? null
      : null;
    setMode("edit");
    setDraft(presetToDraft(nextActive));
    setFormEpoch((v) => v + 1);
    setKeyEpoch((v) => v + 1);
    setStatusMsg(nextStatus);
    void queries.invalidateQueries({ queryKey: connectionQueryKey(host.id) });
    toast.show(toastMessage, { variant: "success" });
  }

  function handleFormatChange(nextFormat: ConnectionFormat) {
    const prevDefaults = FORMAT_DEFAULTS[draft.format];
    const nextDefaults = FORMAT_DEFAULTS[nextFormat];
    const currentBase = draft.baseUrl.trim().replace(/\/+$/, "");
    const currentModel = draft.model.trim();
    const shouldPrefillBase = !currentBase || currentBase === prevDefaults.baseUrl;
    const shouldPrefillModel = !currentModel || currentModel === prevDefaults.model;

    setDraft((prev) => ({
      ...prev,
      format: nextFormat,
      baseUrl: shouldPrefillBase ? nextDefaults.baseUrl : prev.baseUrl,
      model: shouldPrefillModel ? nextDefaults.model : prev.model,
    }));
    // Deliberately keep keyInput and keyEpoch untouched so switching format never clears typed API keys.
    setFormEpoch((v) => v + 1);
    setStatusMsg({ kind: "neutral", text: t("settings.preset.statusEditing") });
  }

  async function handleSelectPreset(nextId: string) {
    if (!nextId || isCreate || saveLock.current || testLock.current || connection.status !== "success") {
      return;
    }
    if (nextId === connection.data.activePresetId) return;
    if (isDirty) {
      setSelectEpoch((v) => v + 1);
      setStatusMsg({ kind: "warn", text: t("settings.preset.dirtySwitchBlocked") });
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const result = await saveRpc({
        action: "select",
        expectedRevision: connection.data.revision,
        id: nextId,
      });
      if (result.status !== "saved") {
        setSelectEpoch((v) => v + 1);
        setStatusMsg({ kind: "err", text: localizeServerError(result.error, uiLanguage) });
        return;
      }
      const nextName =
        result.connection.presets.find((p) => p.id === result.connection.activePresetId)?.name ?? "";
      applySavedConnection(
        result.connection,
        { kind: "neutral", text: t("settings.preset.switchedToast", { name: nextName }) },
        t("settings.preset.switchedToast", { name: nextName }),
      );
    } catch {
      setSelectEpoch((v) => v + 1);
      setStatusMsg({ kind: "err", text: t("settings.preset.switchFailed") });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function handleStartCreate() {
    if (isCreate || saving || testing || connection.status !== "success") return;
    if (isDirty) {
      setStatusMsg({ kind: "warn", text: t("settings.preset.dirtySwitchBlocked") });
      return;
    }
    setMode("create");
    setDraft(createBlankDraft("gemini"));
    setFormEpoch((v) => v + 1);
    setKeyEpoch((v) => v + 1);
    setStatusMsg({ kind: "neutral", text: t("settings.preset.statusCreating") });
  }

  function handleRevertOrCancel() {
    if (saving || testing) return;
    setMode("edit");
    setDraft(presetToDraft(activePreset));
    setFormEpoch((v) => v + 1);
    setKeyEpoch((v) => v + 1);
    setStatusMsg({
      kind: "neutral",
      text: isCreate
        ? t("settings.preset.cancelledCreateStatus")
        : t("settings.preset.revertedStatus"),
    });
  }

  async function handleTestConnection() {
    if (testLock.current || saveLock.current || connection.status !== "success") return;
    const validationError = validateDraft();
    if (validationError) {
      setStatusMsg({
        kind: "err",
        text: t("settings.preset.testFailedPrefix", { reason: validationError }),
      });
      return;
    }
    testLock.current = true;
    setTesting(true);
    try {
      const result = await testRpc({
        presetId: isCreate ? null : activePreset?.id ?? null,
        format: draft.format,
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim(),
        key: draft.keyInput.trim()
          ? { action: "replace", value: draft.keyInput.trim() }
          : { action: "keep" },
      });
      if (result.status === "ok") {
        setStatusMsg({ kind: "ok", text: t("settings.preset.testSuccessStatus") });
        toast.show(t("settings.preset.testSuccessToast"), { variant: "success" });
      } else {
        setStatusMsg({
          kind: "err",
          text: t("settings.preset.testFailedPrefix", {
            reason: localizeServerError(result.error, uiLanguage),
          }),
        });
      }
    } catch {
      setStatusMsg({ kind: "err", text: t("settings.preset.testRequestFailed") });
    } finally {
      testLock.current = false;
      setTesting(false);
    }
  }

  async function handleSave() {
    if (saveLock.current || testLock.current || connection.status !== "success") return;
    const validationError = validateDraft();
    if (validationError) {
      setStatusMsg({ kind: "err", text: validationError });
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      if (isCreate) {
        const result = await saveRpc({
          action: "create",
          expectedRevision: connection.data.revision,
          name: draft.name.trim(),
          format: draft.format,
          baseUrl: draft.baseUrl.trim(),
          model: draft.model.trim(),
          apiKey: draft.keyInput.trim(),
        });
        if (result.status !== "saved") {
          setStatusMsg({ kind: "err", text: localizeServerError(result.error, uiLanguage) });
          return;
        }
        applySavedConnection(
          result.connection,
          { kind: "ok", text: t("settings.preset.createdToast") },
          t("settings.preset.createdToast"),
        );
      } else if (activePreset) {
        const result = await saveRpc({
          action: "update",
          expectedRevision: connection.data.revision,
          id: activePreset.id,
          name: draft.name.trim(),
          format: draft.format,
          baseUrl: draft.baseUrl.trim(),
          model: draft.model.trim(),
          key: draft.keyInput.trim()
            ? { action: "replace", value: draft.keyInput.trim() }
            : { action: "keep" },
        });
        if (result.status !== "saved") {
          setStatusMsg({ kind: "err", text: localizeServerError(result.error, uiLanguage) });
          return;
        }
        applySavedConnection(
          result.connection,
          { kind: "ok", text: t("settings.preset.updatedToast") },
          t("settings.preset.updatedToast"),
        );
      }
    } catch {
      setStatusMsg({ kind: "err", text: t("settings.preset.saveFailed") });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function handleDeletePreset() {
    if (
      isCreate ||
      !activePreset ||
      saveLock.current ||
      testLock.current ||
      connection.status !== "success"
    ) {
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const result = await saveRpc({
        action: "delete",
        expectedRevision: connection.data.revision,
        id: activePreset.id,
      });
      if (result.status !== "saved") {
        setStatusMsg({ kind: "err", text: localizeServerError(result.error, uiLanguage) });
        return;
      }
      const nextName = result.connection.activePresetId
        ? result.connection.presets.find((p) => p.id === result.connection.activePresetId)?.name ?? ""
        : "";
      applySavedConnection(
        result.connection,
        {
          kind: nextName ? "neutral" : "warn",
          text: nextName
            ? t("settings.preset.switchedToast", { name: nextName })
            : t("settings.preset.modeEmptyDesc"),
        },
        t("settings.preset.deletedToast"),
      );
    } catch {
      setStatusMsg({ kind: "err", text: t("settings.preset.deleteFailed") });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function clearCache() {
    if (clearLock.current) return;
    clearLock.current = true;
    setClearing(true);
    try {
      const result = await clearRpc({});
      // Polls are safe to refresh; submit queries are deliberately never invalidated.
      void queries.invalidateQueries({ queryKey: ["translation-job"] });
      toast.show(t("settings.cache.clearedToast", { count: result.cleared }), { variant: "success" });
    } catch {
      toast.error(t("settings.cache.clearFailedToast"));
    } finally {
      clearLock.current = false;
      setClearing(false);
    }
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          padding: layout.compact ? 12 : 20,
          backgroundColor: theme.colors.surface0,
        },
        badge: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        dot: {
          width: 6,
          height: 6,
          borderRadius: 3,
        },
        badgeText: {
          fontSize: 11,
          fontWeight: "600",
        },
        textInput: {
          minWidth: layout.compact ? 140 : 200,
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          color: theme.colors.foreground,
          fontSize: 13,
        },
        presetHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingRight: 14,
          gap: 8,
        },
        presetSelectWrap: {
          flex: 1,
        },
        presetNameWrap: {
          position: "relative",
        },
        presetNameOverlay: {
          position: "absolute",
          left: 16,
          top: 0,
          bottom: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
        presetNameTitle: {
          fontSize: 14,
          fontWeight: "500",
          color: theme.colors.foreground,
        },
        subbar: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        modePill: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: theme.colors.statusWarning,
          backgroundColor: theme.colors.surface0,
        },
        modePillCreate: {
          borderColor: theme.colors.accent,
        },
        modePillText: {
          fontSize: 11,
          fontWeight: "600",
          color: theme.colors.statusWarning,
        },
        modePillTextCreate: {
          color: theme.colors.accent,
        },
        subbarText: {
          flex: 1,
          fontSize: 12,
          color: theme.colors.foregroundMuted,
        },
        buttonGroup: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
        },
        button: {
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        buttonPrimary: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accent,
        },
        buttonDanger: {
          borderColor: theme.colors.statusDanger,
        },
        buttonDisabled: {
          opacity: 0.45,
        },
        buttonText: {
          fontSize: 12,
          fontWeight: "600",
          color: theme.colors.foreground,
        },
        buttonTextPrimary: {
          color: theme.colors.surface0,
        },
        buttonTextDanger: {
          color: theme.colors.statusDanger,
        },
        statusBar: {
          minHeight: 38,
          justifyContent: "center",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        statusText: {
          fontSize: 12,
          lineHeight: 18,
          color: theme.colors.foregroundMuted,
        },
        error: {
          color: theme.colors.statusDanger,
          fontSize: 12,
          lineHeight: 18,
          paddingHorizontal: 14,
          paddingVertical: 8,
        },
        disclosureHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        },
        disclosureTitle: {
          fontSize: 13,
          fontWeight: "500",
          color: theme.colors.foregroundMuted,
        },
        detailsBox: {
          paddingHorizontal: 14,
          paddingBottom: 14,
          gap: 6,
        },
        detailItem: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 18,
        },
      }),
    [theme, layout.compact],
  );

  const settingsDisabled = settings.status !== "ready" || settings.saving;
  const formBusy = saving || testing;
  const fieldsDisabled = formBusy || connection.status !== "success" || (!hasPresets && !isCreate);
  const selectDisabled = formBusy || connection.status !== "success" || !hasPresets || isCreate;
  const topButtonIsRevert = isCreate || isDirty;
  const topButtonDisabled = formBusy || (!topButtonIsRevert && connection.status !== "success");
  const showModePill = isCreate || isDirty;
  const deleteDisabled = formBusy || connection.status !== "success" || !hasPresets || isCreate;
  const saveDisabled = fieldsDisabled || (!isCreate && !isDirty);

  const isConfigured = isConnectionConfigured(connection.data);
  const statusLabel = connection.isPending
    ? t("settings.status.loading")
    : connection.isError
      ? t("settings.status.error")
      : isConfigured
        ? t("settings.status.configured")
        : t("settings.status.unconfigured");
  const statusColor = connection.isError
    ? theme.colors.statusDanger
    : isConfigured
      ? theme.colors.statusSuccess
      : theme.colors.statusWarning;

  const presetOptions = useMemo(() => {
    if (!hasPresets || !connection.data) {
      return [{ label: t("settings.preset.emptyOption"), value: "" }];
    }
    return connection.data.presets.map((preset) => ({
      label: `${preset.name} (${preset.format === "gemini" ? "Gemini" : "OpenAI"})`,
      value: preset.id,
    }));
  }, [hasPresets, connection.data, t]);

  const effectiveStatus: StatusMessage | null = connection.isPending
    ? { kind: "neutral", text: t("settings.status.loading") }
    : connection.isError
      ? { kind: "err", text: t("settings.connection.readError") }
      : statusMsg && statusMsg.kind !== "neutral"
        ? statusMsg
        : null;
  const effectiveStatusColor =
    effectiveStatus?.kind === "err"
      ? theme.colors.statusDanger
      : effectiveStatus?.kind === "ok"
        ? theme.colors.statusSuccess
        : effectiveStatus?.kind === "warn"
          ? theme.colors.statusWarning
          : theme.colors.foregroundMuted;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      {settings.status === "loading" ? (
        <Loading />
      ) : (
        <SettingsSection title={t("settings.section.translation")}>
          <SettingsCard>
            <SettingsSwitch
              label={t("settings.enabled.label")}
              hint={t("settings.enabled.hint")}
              value={settings.status === "ready" && settings.values.enabled}
              disabled={settingsDisabled}
              onValueChange={(enabled) => {
                void saveSettings({ enabled });
              }}
            />
            <SettingsSelect
              label={t("settings.mode.label")}
              hint={t("settings.mode.hint")}
              value={settings.status === "ready" ? settings.values.translationMode : "manual"}
              options={[
                { label: t("settings.mode.manual"), value: "manual" },
                { label: t("settings.mode.automatic"), value: "automatic" },
              ]}
              disabled={settingsDisabled}
              onValueChange={(translationMode) => {
                void saveSettings({ translationMode });
              }}
            />
            <SettingsRow
              label={t("settings.targetLanguage.label")}
              hint={t("settings.targetLanguage.hint")}
            >
              <TextInput
                style={styles.textInput}
                value={language}
                onChangeText={setLanguage}
                editable={!settingsDisabled}
                placeholder={t("settings.targetLanguage.placeholder")}
                placeholderTextColor={theme.colors.foregroundMuted}
                returnKeyType="done"
                onSubmitEditing={() => {
                  void commitTargetLanguage();
                }}
                onBlur={() => {
                  void commitTargetLanguage();
                }}
              />
            </SettingsRow>
            {settings.saveError && (
              <Text style={styles.error}>
                {localizeServerError(settings.saveError, uiLanguage)}
              </Text>
            )}
            {settings.status !== "ready" && (
              <SettingsAction
                label={t("settings.unavailable.label")}
                hint={t("settings.unavailable.hint")}
                actionLabel={t("settings.unavailable.action")}
                onPress={() => {
                  void settings.reset();
                }}
                disabled={settings.saving}
              />
            )}
            {settings.saveError && (
              <SettingsAction
                label={t("settings.reload.label")}
                actionLabel={t("settings.reload.action")}
                onPress={() => {
                  void settings.reload();
                }}
                disabled={settings.saving}
              />
            )}
          </SettingsCard>
        </SettingsSection>
      )}

      <SettingsSection
        title={t("settings.section.connection")}
        trailing={
          <View style={styles.badge}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        }
      >
        <SettingsCard>
          <View style={styles.presetHeaderRow}>
            <View style={styles.presetSelectWrap}>
              <SettingsSelect
                key={`preset-select-${selectEpoch}`}
                label={t("settings.preset.activeLabel")}
                value={hasPresets ? connection.data?.activePresetId ?? "" : ""}
                disabled={selectDisabled}
                options={presetOptions}
                onValueChange={(nextId) => {
                  void handleSelectPreset(nextId);
                }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={topButtonDisabled}
              onPress={topButtonIsRevert ? handleRevertOrCancel : handleStartCreate}
              style={[
                styles.button,
                !topButtonIsRevert && styles.buttonPrimary,
                topButtonDisabled && styles.buttonDisabled,
              ]}
            >
              <Text style={[styles.buttonText, !topButtonIsRevert && styles.buttonTextPrimary]}>
                {isCreate
                  ? t("settings.preset.cancelCreateAction")
                  : isDirty
                    ? t("settings.preset.revertAction")
                    : t("settings.preset.addAction")}
              </Text>
            </Pressable>
          </View>

          <View style={styles.presetNameWrap}>
            <SettingsInput
              key={`name-${formEpoch}`}
              label=""
              disabled={fieldsDisabled}
              initialValue={fieldsDisabled ? "" : draft.name}
              onChangeText={(name) => {
                setDraft((prev) => ({ ...prev, name }));
                if (statusMsg?.kind === "err" || statusMsg?.kind === "warn") {
                  setStatusMsg({ kind: "neutral", text: t("settings.preset.statusEditing") });
                }
              }}
            />
            <View pointerEvents="none" style={styles.presetNameOverlay}>
              <Text style={styles.presetNameTitle}>{t("settings.preset.nameLabel")}</Text>
              {showModePill && (
                <View style={[styles.modePill, isCreate && styles.modePillCreate]}>
                  <Text style={[styles.modePillText, isCreate && styles.modePillTextCreate]}>
                    {isCreate
                      ? t("settings.preset.modeCreatePill")
                      : t("settings.preset.modeEditPill")}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <SettingsSelect
            label={t("settings.format.label")}
            value={draft.format}
            disabled={fieldsDisabled}
            options={[
              { label: t("settings.format.gemini"), value: "gemini" },
              { label: t("settings.format.openai"), value: "openai" },
            ]}
            onValueChange={(format) => {
              handleFormatChange(format);
            }}
          />

          <SettingsInput
            key={`base-${formEpoch}`}
            label={t("settings.baseUrl.label")}
            disabled={fieldsDisabled}
            initialValue={fieldsDisabled ? "" : draft.baseUrl}
            placeholder={
              draft.format === "gemini"
                ? "https://.../v1beta"
                : "https://.../v1"
            }
            hint={
              draft.format === "gemini"
                ? t("settings.baseUrl.hintGemini")
                : t("settings.baseUrl.hintOpenai")
            }
            onChangeText={(baseUrl) => {
              setDraft((prev) => ({ ...prev, baseUrl }));
              setStatusMsg({ kind: "neutral", text: t("settings.preset.statusEditing") });
            }}
          />


          <SettingsInput
            key={`model-${formEpoch}`}
            label={t("settings.model.label")}
            disabled={fieldsDisabled}
            initialValue={fieldsDisabled ? "" : draft.model}
            placeholder={
              draft.format === "gemini"
                ? FORMAT_DEFAULTS.gemini.model
                : t("settings.model.placeholderOpenai")
            }
            onChangeText={(model) => {
              setDraft((prev) => ({ ...prev, model }));
              if (statusMsg?.kind === "err" || statusMsg?.kind === "warn") {
                setStatusMsg({ kind: "neutral", text: t("settings.preset.statusEditing") });
              }
            }}
          />

          <SettingsInput
            key={`key-${keyEpoch}`}
            label={t("settings.apiKey.label")}
            secureTextEntry
            initialValue={draft.keyInput}
            disabled={fieldsDisabled}
            placeholder={
              isCreate
                ? t("settings.apiKey.placeholderEmpty")
                : targetChanged
                  ? t("settings.apiKey.placeholderChanged")
                  : activePreset?.hasApiKey
                    ? t("settings.apiKey.placeholderSaved")
                    : t("settings.apiKey.placeholderEmpty")
            }
            onChangeText={(keyInput) => {
              setDraft((prev) => ({ ...prev, keyInput }));
              if (statusMsg?.kind === "err" || statusMsg?.kind === "warn") {
                setStatusMsg({ kind: "neutral", text: t("settings.preset.statusEditing") });
              }
            }}
          />

          <View style={[styles.subbar, { justifyContent: "space-between" }]}>
            <Pressable
              accessibilityRole="button"
              disabled={fieldsDisabled}
              onPress={() => {
                void handleTestConnection();
              }}
              style={[styles.button, fieldsDisabled && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>
                {testing
                  ? t("settings.preset.testingAction")
                  : t("settings.preset.testAction")}
              </Text>
            </Pressable>

            <View style={styles.buttonGroup}>

              <Pressable
                accessibilityRole="button"
                disabled={deleteDisabled}
                onPress={() => {
                  void handleDeletePreset();
                }}
                style={[styles.button, styles.buttonDanger, deleteDisabled && styles.buttonDisabled]}
              >
                <Text style={[styles.buttonText, styles.buttonTextDanger]}>
                  {t("settings.preset.deleteAction")}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={saveDisabled}
                onPress={() => {
                  void handleSave();
                }}
                style={[styles.button, styles.buttonPrimary, saveDisabled && styles.buttonDisabled]}
              >
                <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
                  {saving
                    ? t("settings.preset.savingAction")
                    : isCreate
                      ? t("settings.preset.saveCreateAction")
                      : t("settings.preset.saveEditAction")}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.statusBar}>
            {effectiveStatus ? (
              <Text accessibilityLiveRegion="polite" style={[styles.statusText, { color: effectiveStatusColor }]}>
                {effectiveStatus.text}
              </Text>
            ) : null}
          </View>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.section.maintenance")}>
        <SettingsCard>
          <SettingsAction
            label={t("settings.cache.label")}
            actionLabel={
              clearing
                ? t("settings.cache.clearingAction")
                : t("settings.cache.clearAction")
            }
            disabled={clearing}
            onPress={() => {
              void clearCache();
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDetails }}
            accessibilityLabel={t("settings.details.title")}
            onPress={() => setShowDetails((value) => !value)}
            style={styles.disclosureHeader}
          >
            <Text style={styles.disclosureTitle}>{t("settings.details.title")}</Text>
            <Icon
              name={showDetails ? "ChevronUp" : "ChevronDown"}
              size={16}
              color={theme.colors.foregroundMuted}
            />
          </Pressable>
          {showDetails && (
            <View style={styles.detailsBox}>
              <Text style={styles.detailItem}>{t("settings.details.scope")}</Text>
              <Text style={styles.detailItem}>{t("settings.details.storage")}</Text>
              <Text style={styles.detailItem}>{t("settings.details.limits")}</Text>
            </View>
          )}
        </SettingsCard>
      </SettingsSection>
    </ScrollView>
  );
}
