import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Icon,
  Loading,
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  DEFAULT_CONNECTION,
  connectionQueryKey,
  isConnectionConfigured,
  type ConnectionFields,
  type ConnectionMetadata,
  type SaveConnectionInput,
} from "../shared/connection";
import { clearTranslationCache, saveConnection } from "../shared/rpc";
import { translationSettings, type TranslationSettings } from "../shared/settings";
import { useConnection } from "./connection";
import { localizeServerError, useI18n } from "./i18n";

export function TranslationSettingsScreen(props: PluginSurfaceProps) {
  return <SettingsForm key={props.host.id} {...props} />;
}

function SettingsForm(props: PluginSurfaceProps) {
  const { theme, layout, host } = props;
  const { t, language: uiLanguage } = useI18n(props);
  const settings = useSettings(translationSettings);
  const connection = useConnection(host.id);
  const saveRpc = useRpc(saveConnection);
  const clearRpc = useRpc(clearTranslationCache);
  const queries = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState<ConnectionFields & { revision: string }>({
    ...DEFAULT_CONNECTION,
    revision: "unconfigured",
  });
  const [dirty, setDirty] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyClearedByTargetChange, setKeyClearedByTargetChange] = useState(false);
  const [keyEpoch, setKeyEpoch] = useState(0);
  const [formEpoch, setFormEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string|null>(null);
  const saveLock = useRef(false);

  const settingsLock = useRef(false);
  const [language, setLanguage] = useState("");
  const [clearing, setClearing] = useState(false);
  const clearLock = useRef(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (connection.data && !dirty) {
      const { format, baseUrl, model, revision } = connection.data;
      setForm({ format, baseUrl, model, revision });
      setFormEpoch((value) => value + 1);
    }
  }, [connection.data, dirty]);

  useEffect(() => {
    if (settings.status === "ready") {
      setLanguage(settings.values.targetLanguage);
    }
  }, [settings.status, settings.status === "ready" ? settings.values.targetLanguage : ""]);

  const edit = (patch: Partial<ConnectionFields>) => {
    setForm((value) => ({ ...value, ...patch }));
    setDirty(true);
    if (saveError) setSaveError(null);
  };

  const clearKeyInput = () => {
    setKeyInput("");
    setKeyEpoch((value) => value + 1);
  };

  const normalizedBaseUrl = form.baseUrl.trim().replace(/\/+$/, "");
  const targetChanged = Boolean(
    connection.data &&
      (form.format !== connection.data.format || normalizedBaseUrl !== connection.data.baseUrl),
  );

  async function saveSettings(patch: Partial<TranslationSettings>) {
    if (settings.status !== "ready" || settings.saving || settingsLock.current) return;
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

  async function applySavedConnection(
    result: { status: "saved"; connection: ConnectionMetadata } | { status: "conflict" | "invalid" | "error"; error: string },
    successMessage: string,
  ) {
    if (result.status !== "saved") {
      setSaveError(localizeServerError(result.error, uiLanguage));
      return;
    }
    queries.setQueryData(connectionQueryKey(host.id), result.connection);
    const { format, baseUrl, model, revision } = result.connection;
    setForm({ format, baseUrl, model, revision });
    setDirty(false);
    setKeyClearedByTargetChange(false);
    clearKeyInput();
    setFormEpoch((value) => value + 1);
    void queries.invalidateQueries({ queryKey: connectionQueryKey(host.id) });
    toast.show(successMessage, { variant: "success" });
  }

  async function handleSaveConnection() {
    if (saveLock.current || connection.status !== "success") return;
    if (keyInput.length > 0 && !keyInput.trim()) {
      setSaveError(t("settings.apiKey.errorBlank"));
      return;
    }
    if ((targetChanged && connection.data.hasApiKey && !keyInput.trim()) || (keyClearedByTargetChange && !keyInput.trim())) {
      setSaveError(t("settings.apiKey.errorTargetChanged"));
      return;
    }
    const key: SaveConnectionInput["key"] = keyInput.trim()
      ? { action: "replace", value: keyInput }
      : { action: "keep" };
    saveLock.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveRpc({
        format: form.format,
        baseUrl: form.baseUrl,
        model: form.model,
        expectedRevision: form.revision,
        key,
      });
      await applySavedConnection(result, t("settings.connection.savedToast"));
    } catch {
      setSaveError(t("settings.connection.saveFailed"));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function handleDeleteKey() {
    if (saveLock.current || connection.status !== "success" || !connection.data.hasApiKey) return;
    saveLock.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveRpc({
        format: form.format,
        baseUrl: form.baseUrl,
        model: form.model,
        expectedRevision: form.revision,
        key: { action: "delete" },
      });
      await applySavedConnection(result, t("settings.connection.keyDeletedToast"));
    } catch {
      setSaveError(t("settings.connection.deleteKeyFailed"));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function reloadConnection() {
    if (saving) return;
    const result = await connection.refetch();
    if (result.isError || !result.data) {
      toast.error(t("settings.connection.readErrorToast"));
      return;
    }
    const { format, baseUrl, model, revision } = result.data;
    setForm({ format, baseUrl, model, revision });
    setDirty(false);
    setSaveError(null);
    setKeyClearedByTargetChange(false);
    clearKeyInput();
    setFormEpoch((value) => value + 1);
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
  const formDisabled = saving || connection.status !== "success";
  const trimmedLanguage = language.trim();
  const languageChanged =
    settings.status === "ready" && trimmedLanguage !== settings.values.targetLanguage;

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
            <SettingsInput
              key={settings.status === "ready" ? settings.revision : "language"}
              label={t("settings.targetLanguage.label")}
              initialValue={settings.status === "ready" ? settings.values.targetLanguage : language}
              onChangeText={setLanguage}
              disabled={settingsDisabled}
              placeholder={t("settings.targetLanguage.placeholder")}
            />
            {languageChanged && (
              <SettingsAction
                label={t("settings.targetLanguage.saveLabel")}
                actionLabel={t("settings.targetLanguage.saveAction")}
                disabled={settingsDisabled || !trimmedLanguage}
                onPress={() => {
                  void saveSettings({ targetLanguage: trimmedLanguage });
                }}
              />
            )}
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
          {connection.isPending && <Loading />}
          {connection.isError && (
            <Text style={styles.error}>{t("settings.connection.readError")}</Text>
          )}
          <SettingsSelect
            label={t("settings.format.label")}
            value={form.format}
            disabled={formDisabled}
            options={[
              { label: t("settings.format.gemini"), value: "gemini" },
              { label: t("settings.format.openai"), value: "openai" },
            ]}
            onValueChange={(format) => {
              edit({
                format,
                baseUrl: format === "gemini" ? DEFAULT_CONNECTION.baseUrl : "",
                model: format === "gemini" ? DEFAULT_CONNECTION.model : "",
              });
              if (keyInput) setKeyClearedByTargetChange(true);
              clearKeyInput();
              setFormEpoch((value) => value + 1);
            }}
          />
          <SettingsInput
            key={`base-${formEpoch}`}
            label={t("settings.baseUrl.label")}
            disabled={formDisabled}
            initialValue={form.baseUrl}
            placeholder={
              form.format === "gemini"
                ? DEFAULT_CONNECTION.baseUrl
                : "https://api.example.com/v1"
            }
            hint={
              form.format === "gemini"
                ? t("settings.baseUrl.hintGemini")
                : t("settings.baseUrl.hintOpenai")
            }
            onChangeText={(baseUrl) => {
              edit({ baseUrl });
              if (keyInput) {
                setKeyClearedByTargetChange(true);
                clearKeyInput();
              }
            }}
          />
          <SettingsInput
            key={`model-${formEpoch}`}
            label={t("settings.model.label")}
            disabled={formDisabled}
            initialValue={form.model}
            placeholder={
              form.format === "gemini"
                ? DEFAULT_CONNECTION.model
                : t("settings.model.placeholderOpenai")
            }
            onChangeText={(model) => edit({ model })}
          />
          <SettingsInput
            key={`key-${keyEpoch}`}
            label={t("settings.apiKey.label")}
            secureTextEntry
            initialValue=""
            disabled={formDisabled}
            placeholder={
              targetChanged
                ? t("settings.apiKey.placeholderChanged")
                : connection.data?.hasApiKey
                  ? t("settings.apiKey.placeholderSaved")
                  : t("settings.apiKey.placeholderEmpty")
            }
            hint={
              targetChanged
                ? t("settings.apiKey.hintChanged")
                : connection.data?.hasApiKey
                  ? undefined
                  : t("settings.apiKey.hintEmpty")
            }
            onChangeText={(value) => {
              setKeyInput(value);
              setKeyClearedByTargetChange(false);
              setDirty(true);
              if (saveError) setSaveError(null);
            }}
          />
          {saveError && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {saveError}
            </Text>
          )}
          <SettingsAction
            label={t("settings.connection.saveLabel")}
            hint={dirty ? t("settings.connection.saveHint") : undefined}
            actionLabel={
              saving
                ? t("settings.connection.savingAction")
                : t("settings.connection.saveAction")
            }
            disabled={formDisabled || !dirty}
            onPress={() => {
              void handleSaveConnection();
            }}
          />
          {(dirty || Boolean(saveError) || connection.isError) && (
            <SettingsAction
              label={
                dirty
                  ? t("settings.connection.discardLabel")
                  : t("settings.connection.reloadLabel")
              }
              actionLabel={t("settings.connection.reloadAction")}
              disabled={saving || connection.isFetching}
              onPress={() => {
                void reloadConnection();
              }}
            />
          )}
          {Boolean(connection.data?.hasApiKey) && !dirty && (
            <SettingsAction
              label={t("settings.connection.deleteKeyLabel")}
              actionLabel={t("settings.connection.deleteKeyAction")}
              disabled={formDisabled}
              onPress={() => {
                void handleDeleteKey();
              }}
            />
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.section.maintenance")}>
        <SettingsCard>
          <SettingsAction
            label={t("settings.cache.label")}
            hint={t("settings.cache.hint")}
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
