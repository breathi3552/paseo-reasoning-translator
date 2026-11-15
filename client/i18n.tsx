import { createContext, useContext, useMemo } from "react";

export type SupportedLanguage = "zh" | "en";

export const I18nLanguageContext = createContext<SupportedLanguage | null>(null);

export type TranslationParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export const translations = {
  zh: {
    "entry.settingsTitle": "思考翻译设置",
    "entry.screenTitle": "思考翻译",
    "entry.commandTitle": "打开思考翻译设置",

    "settings.section.translation": "翻译设置",
    "settings.enabled.label": "启用思考翻译",
    "settings.enabled.hint": "在时间线中将思考过程翻译为目标语言",
    "settings.mode.label": "翻译方式",
    "settings.mode.hint": "手动模式仅翻译点击的思考块；自动模式翻译已加载的完整思考",
    "settings.mode.manual": "手动点击",
    "settings.mode.automatic": "自动翻译",
    "settings.targetLanguage.label": "目标语言",
    "settings.targetLanguage.hint": "修改后失焦或按回车自动保存",
    "settings.targetLanguage.placeholder": "简体中文、English、日本語…",
    "settings.saveFailedToast": "保存设置失败，请重试",
    "settings.unavailable.label": "设置不可用",
    "settings.unavailable.hint": "恢复默认翻译设置",
    "settings.unavailable.action": "恢复默认",
    "settings.reload.label": "重新读取设置",
    "settings.reload.action": "重新加载",

    "settings.section.connection": "接口连接",
    "settings.status.loading": "读取中",
    "settings.status.error": "读取失败",
    "settings.status.configured": "已配置",
    "settings.status.unconfigured": "待配置",
    "settings.connection.readError": "读取连接配置失败，请检查宿主连接",
    "settings.preset.activeLabel": "当前激活预设",
    "settings.preset.emptyOption": "暂无可用预设",
    "settings.preset.addAction": "+ 新增预设",
    "settings.preset.modeCreatePill": "新建预设",
    "settings.preset.modeEditPill": "编辑中",
    "settings.preset.modeEmptyDesc": "请点击「+ 新增预设」创建模型连接",
    "settings.preset.nameLabel": "预设名称",
    "settings.format.label": "API 格式",
    "settings.format.gemini": "Google Gemini",
    "settings.format.openai": "OpenAI 兼容",
    "settings.baseUrl.label": "Base URL",
    "settings.baseUrl.hintGemini": "填写至 /v1beta",
    "settings.baseUrl.hintOpenai": "填写完整基础地址（含版本如 /v1），自动追加 /chat/completions",
    "settings.model.label": "模型 ID",
    "settings.model.placeholderOpenai": "输入模型 ID",
    "settings.apiKey.label": "API Key",
    "settings.apiKey.placeholderChanged": "接口已更改，请重新输入 API Key",
    "settings.apiKey.placeholderSaved": "已保存（留空保留，输入则替换）",
    "settings.apiKey.placeholderEmpty": "输入 API Key",
    "settings.apiKey.errorBlank": "API Key 不能为空白字符",
    "settings.apiKey.errorRequired": "请输入 API Key（完整配置后才允许保存）",
    "settings.apiKey.errorTargetChanged": "更改接口格式或 Base URL 后，请重新输入 API Key",
    "settings.preset.cancelCreateAction": "取消新建",
    "settings.preset.revertAction": "还原修改",
    "settings.preset.testAction": "测试连接",
    "settings.preset.testingAction": "测试中...",
    "settings.preset.deleteAction": "删除预设",
    "settings.preset.saveCreateAction": "保存新预设",
    "settings.preset.saveEditAction": "保存修改",
    "settings.preset.savingAction": "保存中...",
    "settings.preset.dirtySwitchBlocked": "当前表单有未保存更改，请先「保存修改」或「还原修改」后再切换预设。",
    "settings.preset.switchedToast": "已切换激活预设：{name}",
    "settings.preset.createdToast": "已新增并激活预设",
    "settings.preset.updatedToast": "预设修改已保存",
    "settings.preset.deletedToast": "已删除预设",
    "settings.preset.testSuccessToast": "测试连接成功",
    "settings.preset.testSuccessStatus": "测试连接通过：接口可正常响应翻译请求",
    "settings.preset.testFailedPrefix": "无法测试：{reason}",
    "settings.preset.testRequestFailed": "测试连接失败，请检查宿主连接后重试",
    "settings.preset.errorNameRequired": "请填写预设名称",
    "settings.preset.errorBaseUrlRequired": "请填写 Base URL",
    "settings.preset.errorModelRequired": "请填写模型 ID",
    "settings.preset.saveFailed": "保存预设失败，请检查宿主连接后重试",
    "settings.preset.deleteFailed": "删除预设失败，请检查宿主连接后重试",
    "settings.preset.switchFailed": "切换预设失败，请检查宿主连接后重试",

    "settings.section.maintenance": "维护与说明",
    "settings.cache.label": "翻译缓存",
    "settings.cache.clearingAction": "清理中...",
    "settings.cache.clearAction": "清理缓存",
    "settings.cache.clearedToast": "已清理 {count} 条缓存记录",
    "settings.cache.clearFailedToast": "清理缓存失败，请重试",
    "settings.details.title": "说明与限制",
    "settings.details.scope": "• 请求范围：仅将当前思考文本与目标语言发送至所选接口；保存预设时不发送请求，仅在点击「测试连接」或执行翻译时发起。",
    "settings.details.storage": "• 本机存储：各预设与 API Key 保存在本机 PASEO_HOME/plugin-data/paseo-reasoning-translator/connection.json（未加密文件），客户端仅同步无密钥状态。",
    "settings.details.limits": "• 运行限制：单条上限 200,000 字符（超 12,000 字符按段串行翻译）；单并发队列上限 64，内存缓存最多 128 条（30 分钟过期）。",
    "timeline.title": "Thinking",
    "timeline.expandLabel": "展开思考内容",
    "timeline.collapseLabel": "折叠思考内容",
    "timeline.badge.original": "原文",
    "timeline.badge.streaming": "思考中...",
    "timeline.badge.overLimit": "超限",
    "timeline.badge.disabled": "未开启",
    "timeline.badge.unconfigured": "未配置",
    "timeline.badge.submitting": "提交中...",
    "timeline.badge.submitFailed": "提交失败",
    "timeline.badge.pollFailed": "查询失败",
    "timeline.badge.running": "翻译中...",
    "timeline.badge.queued": "排队中...",
    "timeline.badge.error": "失败",
    "timeline.badge.pending": "待翻译",

    "timeline.reason.disabled": "翻译已在设置中关闭",
    "timeline.reason.connection_required": "翻译连接未配置",
    "timeline.reason.connection_changed": "翻译连接已更新",
    "timeline.reason.empty_text": "思考文本为空",
    "timeline.reason.queue_full": "翻译排队已满（等待队列上限 64，翻译并发 1）",
    "timeline.reason.job_expired": "任务已过期，请重试",
    "timeline.reason.settings_changed": "设置已更新",
    "timeline.reason.skipped": "已跳过",

    "timeline.action.showTranslation": "显示译文",
    "timeline.action.showOriginal": "显示原文",
    "timeline.action.retranslate": "重新翻译",
    "timeline.action.retranslateLabel": "重新翻译此思考块",
    "timeline.action.retranslateHint": "发起新的模型请求，可能产生额外费用",
    "timeline.action.translate": "翻译",
    "timeline.action.resumePoll": "继续查询",
    "timeline.action.translateLabel": "翻译此思考块",
    "timeline.action.retry": "重试",
    "timeline.action.retryLabel": "重试翻译",

    "timeline.error.overLimitTitle": "思考文本超出上限 ({length} / {limit} 字符)",
    "timeline.error.overLimitMessage": "文本长度已超过单次翻译最大上限（{limit} 字符）。在源思考文本改变或缩短前不可翻译，重试无效。",
    "timeline.error.submitFailedTitle": "提交翻译任务失败（网络或服务异常）",
    "timeline.error.pollFailedTitle": "查询翻译进度失败（网络中断或连接断开）",
    "timeline.error.jobFailedTitle": "翻译执行失败",
    "timeline.error.unknownError": "翻译过程中出现未知错误",
    "timeline.error.configChangedTitle": "翻译设置或连接已变化",
    "timeline.error.configChangedMessage": "旧任务已取消。确认当前连接后，可手动重新翻译此块。",
    "timeline.error.queueFullTitle": "翻译排队已满",
    "timeline.error.queueFullMessage": "当前等待队列已达到 64 个任务上限（翻译并发为 1），请稍候点击「重试」。",
    "timeline.error.jobExpiredTitle": "翻译任务已过期",
    "timeline.error.jobExpiredMessage": "后台任务已过期清理，可点击「重试」重新提交。",
    "timeline.error.skippedTitle": "翻译已跳过",
    "timeline.error.separator": "：",

    "server.connection.saveFailed": "保存本机连接失败，请重试",
    "server.connection.invalidUrl": "Base URL 格式无效",
    "server.connection.invalidUrlProtocol": "Base URL 必须为 HTTPS（本机 loopback 可用 HTTP），且不能含账号、query 或 fragment",
    "server.connection.invalidModel": "模型 ID 无效；Gemini 请填写模型 ID，不要填写路径",
    "server.connection.readFailed": "无法读取本机连接文件，请检查文件权限和连接配置",
    "server.connection.invalidFields": "连接字段格式无效，请检查输入",
    "server.connection.conflict": "连接配置已更新（保存冲突），请重新加载后再保存",
    "server.connection.reenterKey": "更改接口格式或 Base URL 后必须重新输入 API key",
    "server.connection.enterKey": "请输入 API key",
    "server.connection.invalidApiKey": "API key 必须为不含空白的可打印 ASCII 字符",
    "server.connection.invalidPresetName": "预设名称无效，请填写 1 至 80 个字符且不含控制字符",
    "server.connection.maxPresets": "预设数量已达上限（最多 50 个）",
    "server.connection.presetNotFound": "预设不存在，请重新加载后再试",
    "server.connection.incompleteFields": "请填写完整的 Base URL 和模型 ID",
    "server.connection.writeFailed": "保存本机连接文件失败，请检查磁盘与文件权限",
    "server.connection.testInvalid": "测试连接失败，请检查输入",
    "server.connection.testFailed": "测试连接失败，请检查网络与连接配置",
    "server.http.invalidResponse": "模型接口返回错误或无效响应",
    "server.http.missingChoices": "OpenAI 兼容接口响应缺少 choices 数组",
    "server.http.openaiTruncated": "翻译响应被截断（length），请检查模型输出上限后手动重试",
    "server.http.openaiRefused": "模型拒绝翻译或内容被安全策略拦截",
    "server.http.openaiInvalidMessage": "接口未返回最终 assistant 文本，或返回了不支持的工具调用",
    "server.http.geminiBlocked": "Gemini 请求被安全策略拦截",
    "server.http.geminiTruncated": "Gemini 响应被截断（MAX_TOKENS），请检查模型输出上限后手动重试",
    "server.http.geminiInvalidCandidate": "Gemini 未返回完整译文，可能被拒绝、拦截或响应格式异常",
    "server.http.geminiInvalidParts": "Gemini 返回了不支持的非文本内容或工具调用",
    "server.http.emptyTranslation": "接口未返回可用译文；推理内容不会作为译文显示",
    "server.http.translationTooLong": "译文超过安全长度上限",
    "server.http.status401": "API key 无效或已过期（HTTP 401）",
    "server.http.status403": "API key 没有访问该模型的权限（HTTP 403）",
    "server.http.status404": "接口地址或模型 ID 不存在（HTTP 404）",
    "server.http.status429": "接口限流或额度不足（HTTP 429），请稍后手动重试",
    "server.http.status5xx": "模型接口暂时不可用（HTTP 5xx），请稍后手动重试",
    "server.http.statusOther": "翻译 HTTP 请求失败（状态 {status}）",
    "server.http.timeout": "翻译 HTTP 请求超时，请手动重试",
    "server.http.cancelled": "翻译 HTTP 请求已取消",
    "server.http.incompleteConnection": "翻译连接未配置完整，请填写 Base URL、模型 ID 和 API key",
    "server.http.emptyBody": "模型接口返回空响应体",
    "server.http.responseTooLarge": "模型响应体超过安全大小上限",
    "server.http.invalidJson": "模型接口返回的响应不是有效 JSON",
    "server.http.networkError": "无法连接翻译接口或读取响应，请检查网络与连接设置后手动重试",
    "server.http.stopped": "翻译 HTTP 模块已停止",

    "server.service.sourceTooLong": "思考文本超过 200,000 字符上限，原文仍可查看。",
    "server.service.prepareFailed": "无法准备翻译，请检查插件设置与本机连接配置",
    "server.service.translateFailed": "翻译失败，请检查连接后手动重试；原文已保留",
  },
  en: {
    "entry.settingsTitle": "Thinking Translation Settings",
    "entry.screenTitle": "Thinking Translation",
    "entry.commandTitle": "Open Thinking Translation Settings",

    "settings.section.translation": "Translation Settings",
    "settings.enabled.label": "Enable thinking translation",
    "settings.enabled.hint": "Translate reasoning blocks into the target language in the timeline",
    "settings.mode.label": "Translation mode",
    "settings.mode.hint": "Manual mode translates only clicked blocks; automatic mode translates completed reasoning",
    "settings.mode.manual": "Manual click",
    "settings.mode.automatic": "Automatic",
    "settings.targetLanguage.label": "Target language",
    "settings.targetLanguage.hint": "Auto-saves on blur or Enter",
    "settings.targetLanguage.placeholder": "简体中文, English, 日本語…",
    "settings.saveFailedToast": "Failed to save settings. Please retry.",
    "settings.unavailable.label": "Settings unavailable",
    "settings.unavailable.hint": "Reset translation settings to defaults",
    "settings.unavailable.action": "Reset defaults",
    "settings.reload.label": "Reload settings",
    "settings.reload.action": "Reload",

    "settings.section.connection": "API Connection",
    "settings.status.loading": "Loading",
    "settings.status.error": "Load failed",
    "settings.status.configured": "Configured",
    "settings.status.unconfigured": "Unconfigured",
    "settings.connection.readError": "Failed to load connection configuration. Check host connection.",
    "settings.preset.activeLabel": "Active preset",
    "settings.preset.emptyOption": "No presets available",
    "settings.preset.addAction": "+ Add preset",
    "settings.preset.modeCreatePill": "New Preset",
    "settings.preset.modeEditPill": "Editing",
    "settings.preset.modeEmptyDesc": "Click \"+ Add preset\" above to create a connection",
    "settings.preset.nameLabel": "Preset name",
    "settings.format.label": "API format",
    "settings.format.gemini": "Google Gemini",
    "settings.format.openai": "OpenAI-compatible",
    "settings.baseUrl.label": "Base URL",
    "settings.baseUrl.hintGemini": "Enter up to /v1beta",
    "settings.baseUrl.hintOpenai": "Include version path (e.g. /v1); appends /chat/completions",
    "settings.model.label": "Model ID",
    "settings.model.placeholderOpenai": "Enter model ID",
    "settings.apiKey.label": "API Key",
    "settings.apiKey.placeholderChanged": "Endpoint changed; re-enter API Key",
    "settings.apiKey.placeholderSaved": "Saved (leave blank to keep, or enter to replace)",
    "settings.apiKey.placeholderEmpty": "Enter API Key",
    "settings.apiKey.errorBlank": "API Key cannot be whitespace only",
    "settings.apiKey.errorRequired": "Enter an API Key (all fields are required)",
    "settings.apiKey.errorTargetChanged": "Re-enter API Key after changing API format or Base URL",
    "settings.preset.cancelCreateAction": "Cancel",
    "settings.preset.revertAction": "Revert",
    "settings.preset.testAction": "Test",
    "settings.preset.testingAction": "Testing...",
    "settings.preset.deleteAction": "Delete",
    "settings.preset.saveCreateAction": "Save preset",
    "settings.preset.saveEditAction": "Save changes",
    "settings.preset.savingAction": "Saving...",
    "settings.preset.dirtySwitchBlocked": "Unsaved changes in current preset. Save or revert before switching.",
    "settings.preset.switchedToast": "Activated preset: {name}",
    "settings.preset.createdToast": "Preset created and activated",
    "settings.preset.updatedToast": "Preset changes saved",
    "settings.preset.deletedToast": "Preset deleted",
    "settings.preset.testSuccessToast": "Connection test succeeded",
    "settings.preset.testSuccessStatus": "Connection test passed: endpoint responded successfully",
    "settings.preset.testFailedPrefix": "Test failed: {reason}",
    "settings.preset.testRequestFailed": "Connection test failed. Check host connection and retry.",
    "settings.preset.errorNameRequired": "Enter a preset name",
    "settings.preset.errorBaseUrlRequired": "Enter a Base URL",
    "settings.preset.errorModelRequired": "Enter a model ID",
    "settings.preset.saveFailed": "Failed to save preset. Check host connection and retry.",
    "settings.preset.deleteFailed": "Failed to delete preset. Check host connection and retry.",
    "settings.preset.switchFailed": "Failed to switch preset. Check host connection and retry.",

    "settings.section.maintenance": "Maintenance & Notes",
    "settings.cache.label": "Translation cache",
    "settings.cache.clearingAction": "Clearing...",
    "settings.cache.clearAction": "Clear cache",
    "settings.cache.clearedToast": "Cleared {count} cached entries",
    "settings.cache.clearFailedToast": "Failed to clear cache. Please retry.",
    "settings.details.title": "Notes & Limits",
    "settings.details.scope": "• Request scope: Sends only visible reasoning text and target language to the selected endpoint. Saving a preset sends no request; only clicking Test or translating does.",
    "settings.details.storage": "• Local storage: Presets and API Keys are stored in PASEO_HOME/plugin-data/paseo-reasoning-translator/connection.json (unencrypted file); clients sync only key-free metadata.",
    "settings.details.limits": "• Runtime limits: Up to 200,000 chars per block (split into 12,000-char chunks serially); concurrency 1, queue limit 64, up to 128 cached results (30-min TTL).",
    "timeline.title": "Thinking",
    "timeline.expandLabel": "Expand thinking content",
    "timeline.collapseLabel": "Collapse thinking content",
    "timeline.badge.original": "Original",
    "timeline.badge.streaming": "Thinking...",
    "timeline.badge.overLimit": "Over limit",
    "timeline.badge.disabled": "Disabled",
    "timeline.badge.unconfigured": "Unconfigured",
    "timeline.badge.submitting": "Submitting...",
    "timeline.badge.submitFailed": "Submit failed",
    "timeline.badge.pollFailed": "Query failed",
    "timeline.badge.running": "Translating...",
    "timeline.badge.queued": "Queued...",
    "timeline.badge.error": "Failed",
    "timeline.badge.pending": "Pending",

    "timeline.reason.disabled": "Translation is disabled in settings",
    "timeline.reason.connection_required": "Translation connection is not configured",
    "timeline.reason.connection_changed": "Translation connection was updated",
    "timeline.reason.empty_text": "Thinking text is empty",
    "timeline.reason.queue_full": "Translation queue is full (queue limit 64, concurrency 1)",
    "timeline.reason.job_expired": "Job expired. Please retry.",
    "timeline.reason.settings_changed": "Settings were updated",
    "timeline.reason.skipped": "Skipped",

    "timeline.action.showTranslation": "Show translation",
    "timeline.action.showOriginal": "Show original",
    "timeline.action.retranslate": "Retranslate",
    "timeline.action.retranslateLabel": "Retranslate this thinking block",
    "timeline.action.retranslateHint": "Sends a new model request and may incur additional cost",
    "timeline.action.translate": "Translate",
    "timeline.action.resumePoll": "Resume query",
    "timeline.action.translateLabel": "Translate this thinking block",
    "timeline.action.retry": "Retry",
    "timeline.action.retryLabel": "Retry translation",

    "timeline.error.overLimitTitle": "Thinking text exceeds limit ({length} / {limit} chars)",
    "timeline.error.overLimitMessage": "Text exceeds the maximum translation limit ({limit} chars). Cannot translate until source text changes or shortens.",
    "timeline.error.submitFailedTitle": "Failed to submit translation job (network or service error)",
    "timeline.error.pollFailedTitle": "Failed to query translation progress (network interrupted or disconnected)",
    "timeline.error.jobFailedTitle": "Translation failed",
    "timeline.error.unknownError": "An unknown error occurred during translation",
    "timeline.error.configChangedTitle": "Translation settings or connection changed",
    "timeline.error.configChangedMessage": "Previous job was cancelled. Confirm the current connection and retranslate this block manually.",
    "timeline.error.queueFullTitle": "Translation queue is full",
    "timeline.error.queueFullMessage": "The waiting queue has reached the limit of 64 jobs (concurrency 1). Please click Retry later.",
    "timeline.error.jobExpiredTitle": "Translation job expired",
    "timeline.error.jobExpiredMessage": "Background job expired and was cleaned up. Click Retry to resubmit.",
    "timeline.error.skippedTitle": "Translation skipped",
    "timeline.error.separator": ": ",

    "server.connection.saveFailed": "Failed to save local connection. Please retry.",
    "server.connection.invalidUrl": "Invalid Base URL format",
    "server.connection.invalidUrlProtocol": "Base URL must use HTTPS (or HTTP for local loopback) and cannot include credentials, query, or fragment",
    "server.connection.invalidModel": "Invalid Model ID; for Gemini, enter the model ID without a path",
    "server.connection.readFailed": "Unable to read local connection file. Check file permissions and connection configuration.",
    "server.connection.invalidFields": "Invalid connection field format. Please check your input.",
    "server.connection.conflict": "Connection configuration was updated (save conflict). Reload before saving.",
    "server.connection.reenterKey": "Must re-enter API key after changing API format or Base URL",
    "server.connection.enterKey": "Please enter an API key",
    "server.connection.invalidApiKey": "API key must contain only printable non-whitespace ASCII characters",
    "server.connection.invalidPresetName": "Invalid preset name; enter 1 to 80 characters without control characters",
    "server.connection.maxPresets": "Preset limit reached (maximum 50 presets)",
    "server.connection.presetNotFound": "Preset does not exist. Reload and retry.",
    "server.connection.incompleteFields": "Enter a complete Base URL and Model ID",
    "server.connection.writeFailed": "Failed to write local connection file. Check disk space and file permissions.",
    "server.connection.testInvalid": "Connection test failed. Please check your input.",
    "server.connection.testFailed": "Connection test failed. Check network and connection settings.",
    "server.http.invalidResponse": "Model endpoint returned an error or invalid response",
    "server.http.missingChoices": "OpenAI-compatible response is missing the choices array",
    "server.http.openaiTruncated": "Translation response was truncated (length). Check model output token limit and retry manually.",
    "server.http.openaiRefused": "Model refused translation or content was blocked by safety policy",
    "server.http.openaiInvalidMessage": "Endpoint did not return final assistant text, or returned unsupported tool calls",
    "server.http.geminiBlocked": "Gemini request was blocked by safety policy",
    "server.http.geminiTruncated": "Gemini response was truncated (MAX_TOKENS). Check model output token limit and retry manually.",
    "server.http.geminiInvalidCandidate": "Gemini did not return a complete translation (refused, blocked, or malformed response)",
    "server.http.geminiInvalidParts": "Gemini returned unsupported non-text content or tool calls",
    "server.http.emptyTranslation": "Endpoint returned no usable translation; reasoning content is never shown as translation",
    "server.http.translationTooLong": "Translated text exceeds safety length limit",
    "server.http.status401": "API key is invalid or expired (HTTP 401)",
    "server.http.status403": "API key does not have permission to access this model (HTTP 403)",
    "server.http.status404": "Endpoint URL or Model ID does not exist (HTTP 404)",
    "server.http.status429": "Rate limited or quota exceeded (HTTP 429). Please retry manually later.",
    "server.http.status5xx": "Model endpoint is temporarily unavailable (HTTP 5xx). Please retry manually later.",
    "server.http.statusOther": "Translation HTTP request failed (status {status})",
    "server.http.timeout": "Translation HTTP request timed out. Please retry manually.",
    "server.http.cancelled": "Translation HTTP request was cancelled",
    "server.http.incompleteConnection": "Translation connection is incomplete. Enter Base URL, Model ID, and API key.",
    "server.http.emptyBody": "Model endpoint returned an empty response body",
    "server.http.responseTooLarge": "Model response body exceeds safety size limit",
    "server.http.invalidJson": "Model endpoint response is not valid JSON",
    "server.http.networkError": "Unable to connect to translation endpoint or read response. Check network and connection settings, then retry manually.",
    "server.http.stopped": "Translation HTTP module has stopped",

    "server.service.sourceTooLong": "Reasoning is longer than 200,000 characters. Original text is still available.",
    "server.service.prepareFailed": "Unable to prepare translation. Check plugin settings and local connection configuration.",
    "server.service.translateFailed": "Translation failed. Check connection and retry manually; original text is preserved.",
  },
} as const;

export type TranslationKey = keyof typeof translations.zh;

const serverMessageToKey: Readonly<Record<string, TranslationKey>> = {
  "保存本机连接失败，请重试": "server.connection.saveFailed",
  "Base URL 格式无效": "server.connection.invalidUrl",
  "Base URL 必须为 HTTPS（本机 loopback 可用 HTTP），且不能含账号、query 或 fragment":
    "server.connection.invalidUrlProtocol",
  "模型 ID 无效；Gemini 请填写模型 ID，不要填写路径": "server.connection.invalidModel",
  "无法读取本机连接文件，请检查文件权限和连接配置": "server.connection.readFailed",
  "连接字段格式无效，请检查输入": "server.connection.invalidFields",
  "连接配置已更新（保存冲突），请重新加载后再保存": "server.connection.conflict",
  "更改接口格式或 Base URL 后必须重新输入 API key": "server.connection.reenterKey",
  "请输入 API key": "server.connection.enterKey",
  "API key 必须为不含空白的可打印 ASCII 字符": "server.connection.invalidApiKey",
  "预设名称无效，请填写 1 至 80 个字符且不含控制字符": "server.connection.invalidPresetName",
  "预设数量已达上限（最多 50 个）": "server.connection.maxPresets",
  "预设不存在，请重新加载后再试": "server.connection.presetNotFound",
  "请填写完整的 Base URL 和模型 ID": "server.connection.incompleteFields",
  "保存本机连接文件失败，请检查磁盘与文件权限": "server.connection.writeFailed",
  "测试连接失败，请检查输入": "server.connection.testInvalid",
  "测试连接失败，请检查网络与连接配置": "server.connection.testFailed",

  "模型接口返回错误或无效响应": "server.http.invalidResponse",
  "OpenAI 兼容接口响应缺少 choices 数组": "server.http.missingChoices",
  "翻译响应被截断（length），请检查模型输出上限后手动重试": "server.http.openaiTruncated",
  "模型拒绝翻译或内容被安全策略拦截": "server.http.openaiRefused",
  "接口未返回最终 assistant 文本，或返回了不支持的工具调用": "server.http.openaiInvalidMessage",
  "Gemini 请求被安全策略拦截": "server.http.geminiBlocked",
  "Gemini 响应被截断（MAX_TOKENS），请检查模型输出上限后手动重试": "server.http.geminiTruncated",
  "Gemini 未返回完整译文，可能被拒绝、拦截或响应格式异常": "server.http.geminiInvalidCandidate",
  "Gemini 返回了不支持的非文本内容或工具调用": "server.http.geminiInvalidParts",
  "接口未返回可用译文；推理内容不会作为译文显示": "server.http.emptyTranslation",
  "译文超过安全长度上限": "server.http.translationTooLong",
  "API key 无效或已过期（HTTP 401）": "server.http.status401",
  "API key 没有访问该模型的权限（HTTP 403）": "server.http.status403",
  "接口地址或模型 ID 不存在（HTTP 404）": "server.http.status404",
  "接口限流或额度不足（HTTP 429），请稍后手动重试": "server.http.status429",
  "模型接口暂时不可用（HTTP 5xx），请稍后手动重试": "server.http.status5xx",
  "翻译 HTTP 请求超时，请手动重试": "server.http.timeout",
  "翻译 HTTP 请求已取消": "server.http.cancelled",
  "翻译连接未配置完整，请填写 Base URL、模型 ID 和 API key": "server.http.incompleteConnection",
  "模型接口返回空响应体": "server.http.emptyBody",
  "模型响应体超过安全大小上限": "server.http.responseTooLarge",
  "模型接口返回的响应不是有效 JSON": "server.http.invalidJson",
  "无法连接翻译接口或读取响应，请检查网络与连接设置后手动重试": "server.http.networkError",
  "翻译 HTTP 模块已停止": "server.http.stopped",

  "Reasoning is longer than 200,000 characters. Original text is still available.":
    "server.service.sourceTooLong",
  "无法准备翻译，请检查插件设置与本机连接配置": "server.service.prepareFailed",
  "翻译失败，请检查连接后手动重试；原文已保留": "server.service.translateFailed",
};

export function localizeServerError(
  message: string | null | undefined,
  language: SupportedLanguage,
): string {
  if (!message) return "";
  const key = serverMessageToKey[message];
  if (key) return t(key, language);
  const statusMatch = /^翻译 HTTP 请求失败（状态 (\d+)）$/.exec(message);
  if (statusMatch) {
    return t("server.http.statusOther", language, { status: statusMatch[1] });
  }
  return message;
}

export function normalizeLanguage(locale?: string | null): SupportedLanguage {
  if (!locale) return "en";
  return locale.trim().toLowerCase().startsWith("zh") ? "zh" : "en";
}

export interface DetectLanguageOptions {
  locale?: string;
  language?: string;
  host?: {
    id?: string;
    label?: string;
    locale?: string;
    language?: string;
  };
}

interface EnvironmentGlobals {
  localStorage?: {
    getItem(key: string): string | null;
  };
  document?: {
    documentElement?: {
      lang?: string;
    };
  };
  navigator?: {
    language?: string;
    languages?: readonly string[];
  };
  i18n?: {
    language?: string;
  };
}

const env = globalThis as typeof globalThis & EnvironmentGlobals;

export function detectPaseoLanguage(
  hostProps?: DetectLanguageOptions,
): SupportedLanguage {
  const propLocale =
    hostProps?.locale ??
    hostProps?.language ??
    hostProps?.host?.locale ??
    hostProps?.host?.language;
  if (propLocale && propLocale !== "system") {
    return normalizeLanguage(propLocale);
  }

  if (env.localStorage) {
    try {
      const raw = env.localStorage.getItem("@paseo:app-settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.language && parsed.language !== "system") {
          return normalizeLanguage(parsed.language);
        }
      }
    } catch {}
  }

  // Match Paseo's web system-language source before page/Intl defaults.
  const navLocale = env.navigator?.languages?.[0] || env.navigator?.language;
  if (navLocale) {
    return normalizeLanguage(navLocale);
  }

  const docLang = env.document?.documentElement?.lang;
  if (docLang) {
    return normalizeLanguage(docLang);
  }

  const i18nLang = env.i18n?.language;
  if (i18nLang) {
    return normalizeLanguage(i18nLang);
  }

  const intlLocale =
    typeof Intl?.DateTimeFormat === "function"
      ? Intl.DateTimeFormat().resolvedOptions().locale
      : undefined;
  if (intlLocale) {
    return normalizeLanguage(intlLocale);
  }

  return "en";
}

export function getLanguage(
  hostProps?: DetectLanguageOptions,
): SupportedLanguage {
  return detectPaseoLanguage(hostProps);
}

export function formatString(
  template: string,
  params?: TranslationParams,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] != null ? String(params[key]) : match;
  });
}

export function t(
  key: TranslationKey,
  langOrParams?: SupportedLanguage | TranslationParams,
  params?: TranslationParams,
): string {
  let lang: SupportedLanguage;
  let finalParams: TranslationParams | undefined;

  if (typeof langOrParams === "string") {
    lang = langOrParams;
    finalParams = params;
  } else {
    lang = detectPaseoLanguage();
    finalParams = langOrParams;
  }

  const dict = translations[lang] ?? translations.en;
  const raw = dict[key] ?? translations.en[key] ?? key;
  return formatString(raw, finalParams);
}

export interface I18nContextValue {
  language: SupportedLanguage;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export function useI18n(hostProps?: DetectLanguageOptions): I18nContextValue {
  const inheritedLanguage = useContext(I18nLanguageContext);
  const hostLocale =
    hostProps?.locale ??
    hostProps?.language ??
    hostProps?.host?.locale ??
    hostProps?.host?.language;
  const detected = detectPaseoLanguage(hostProps);
  const language = hostLocale ? detected : (inheritedLanguage ?? detected);
  const tBound = useMemo(
    () => (key: TranslationKey, params?: TranslationParams) =>
      t(key, language, params),
    [language],
  );

  return {
    language,
    t: tBound,
  };
}
