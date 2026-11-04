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

export function TranslationSettingsScreen(props: PluginSurfaceProps) {
  return <SettingsForm key={props.host.id} {...props} />;
}

function SettingsForm({ theme, layout, host }: PluginSurfaceProps) {
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
        toast.error(settings.saveError ?? "保存设置失败，请重试");
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
      setSaveError(result.error);
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
      setSaveError("API Key 不能为空白字符");
      return;
    }
    if ((targetChanged && connection.data.hasApiKey && !keyInput.trim()) || (keyClearedByTargetChange && !keyInput.trim())) {
      setSaveError("更改接口格式或 Base URL 后，请重新输入 API Key");
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
      await applySavedConnection(result, "连接已保存");
    } catch {
      setSaveError("保存连接失败，请检查宿主连接后重试");
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
      await applySavedConnection(result, "已删除保存的密钥");
    } catch {
      setSaveError("删除密钥失败，请检查宿主连接后重试");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function reloadConnection() {
    if (saving) return;
    const result = await connection.refetch();
    if (result.isError || !result.data) {
      toast.error("读取连接失败，请检查宿主连接");
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
      toast.show(`已清理 ${result.cleared} 条缓存记录`, { variant: "success" });
    } catch {
      toast.error("清理缓存失败，请重试");
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
    ? "读取中"
    : connection.isError
      ? "读取失败"
      : isConfigured
        ? "已配置"
        : "待配置";
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
        <SettingsSection title="翻译设置">
          <SettingsCard>
            <SettingsSwitch
              label="启用思考翻译"
              hint="在时间线中将思考过程翻译为目标语言"
              value={settings.status === "ready" && settings.values.enabled}
              disabled={settingsDisabled}
              onValueChange={(enabled) => {
                void saveSettings({ enabled });
              }}
            />
            <SettingsSelect
              label="翻译方式"
              hint="手动模式仅翻译点击的思考块；自动模式翻译已加载的完整思考"
              value={settings.status === "ready" ? settings.values.translationMode : "manual"}
              options={[
                { label: "手动点击", value: "manual" },
                { label: "自动翻译", value: "automatic" },
              ]}
              disabled={settingsDisabled}
              onValueChange={(translationMode) => {
                void saveSettings({ translationMode });
              }}
            />
            <SettingsInput
              key={settings.status === "ready" ? settings.revision : "language"}
              label="目标语言"
              initialValue={settings.status === "ready" ? settings.values.targetLanguage : language}
              onChangeText={setLanguage}
              disabled={settingsDisabled}
              placeholder="简体中文、English、日本語…"
            />
            {languageChanged && (
              <SettingsAction
                label="保存目标语言"
                actionLabel="保存语言"
                disabled={settingsDisabled || !trimmedLanguage}
                onPress={() => {
                  void saveSettings({ targetLanguage: trimmedLanguage });
                }}
              />
            )}
            {settings.saveError && <Text style={styles.error}>{settings.saveError}</Text>}
            {settings.status !== "ready" && (
              <SettingsAction
                label="设置不可用"
                hint="恢复默认翻译设置"
                actionLabel="恢复默认"
                onPress={() => {
                  void settings.reset();
                }}
                disabled={settings.saving}
              />
            )}
            {settings.saveError && (
              <SettingsAction
                label="重新读取设置"
                actionLabel="重新加载"
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
        title="接口连接"
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
            <Text style={styles.error}>读取连接配置失败，请检查宿主连接</Text>
          )}
          <SettingsSelect
            label="接口格式"
            value={form.format}
            disabled={formDisabled}
            options={[
              { label: "Google Gemini", value: "gemini" },
              { label: "OpenAI 兼容", value: "openai" },
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
            label="Base URL"
            disabled={formDisabled}
            initialValue={form.baseUrl}
            placeholder={
              form.format === "gemini"
                ? DEFAULT_CONNECTION.baseUrl
                : "https://api.example.com/v1"
            }
            hint={
              form.format === "gemini"
                ? "填写至 /v1beta"
                : "自动追加 /chat/completions"
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
            label="模型 ID"
            disabled={formDisabled}
            initialValue={form.model}
            placeholder={
              form.format === "gemini" ? DEFAULT_CONNECTION.model : "输入模型 ID"
            }
            onChangeText={(model) => edit({ model })}
          />
          <SettingsInput
            key={`key-${keyEpoch}`}
            label="API Key"
            secureTextEntry
            initialValue=""
            disabled={formDisabled}
            placeholder={
              targetChanged
                ? "接口已更改，请重新输入 API Key"
                : connection.data?.hasApiKey
                  ? "已保存（留空保留，输入则替换）"
                  : "输入 API Key"
            }
            hint={
              targetChanged
                ? "更改接口格式或地址后需重新提供密钥"
                : connection.data?.hasApiKey
                  ? undefined
                  : "仅保存在本机插件数据目录"
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
            label="保存连接"
            hint={dirty ? "保存后将更新连接并清空旧译文缓存" : undefined}
            actionLabel={saving ? "保存中..." : "保存连接"}
            disabled={formDisabled || !dirty}
            onPress={() => {
              void handleSaveConnection();
            }}
          />
          {(dirty || Boolean(saveError) || connection.isError) && (
            <SettingsAction
              label={dirty ? "放弃未保存更改" : "重新读取连接"}
              actionLabel="重新加载"
              disabled={saving || connection.isFetching}
              onPress={() => {
                void reloadConnection();
              }}
            />
          )}
          {Boolean(connection.data?.hasApiKey) && !dirty && (
            <SettingsAction
              label="删除已保存密钥"
              actionLabel="删除密钥"
              disabled={formDisabled}
              onPress={() => {
                void handleDeleteKey();
              }}
            />
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="维护与说明">
        <SettingsCard>
          <SettingsAction
            label="翻译缓存"
            hint="清空内存译文缓存并取消排队中的任务"
            actionLabel={clearing ? "清理中..." : "清理缓存"}
            disabled={clearing}
            onPress={() => {
              void clearCache();
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDetails }}
            accessibilityLabel="说明与限制"
            onPress={() => setShowDetails((value) => !value)}
            style={styles.disclosureHeader}
          >
            <Text style={styles.disclosureTitle}>说明与限制</Text>
            <Icon
              name={showDetails ? "ChevronUp" : "ChevronDown"}
              size={16}
              color={theme.colors.foregroundMuted}
            />
          </Pressable>
          {showDetails && (
            <View style={styles.detailsBox}>
              <Text style={styles.detailItem}>
                • 请求范围：仅将当前思考文本与目标语言发送至所选接口，保存连接时不发送测试请求。
              </Text>
              <Text style={styles.detailItem}>
                • 本机存储：API Key 保存在本机 PASEO_HOME/plugin-data/paseo-think-what/connection.json（未加密文件），客户端仅同步无密钥状态。
              </Text>
              <Text style={styles.detailItem}>
                • 运行限制：单条上限 200,000 字符（超 12,000 字符按段串行翻译）；单并发队列上限 64，内存缓存最多 128 条（30 分钟过期）。
              </Text>
            </View>
          )}
        </SettingsCard>
      </SettingsSection>
    </ScrollView>
  );
}
