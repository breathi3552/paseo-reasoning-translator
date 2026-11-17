import { defineTranslations, useTranslation } from "@getpaseo/plugin/client";

export const messages = defineTranslations({
  resources: {
    en: {
      entry: {
        settingsTitle: "Thinking Translation Settings",
        screenTitle: "Thinking Translation",
        commandTitle: "Open Thinking Translation Settings",
      },
      settings: {
        section: {
          translation: "Translation Settings",
          connection: "API Connection",
          maintenance: "Maintenance & Notes",
        },
        enabled: {
          label: "Enable thinking translation",
          hint: "Translate reasoning blocks into the target language in the timeline",
        },
        mode: {
          label: "Translation mode",
          hint: "Manual mode translates only clicked blocks; automatic mode translates completed reasoning",
          manual: "Manual click",
          automatic: "Automatic",
        },
        targetLanguage: {
          label: "Target language",
          hint: "Auto-saves on blur or Enter",
          placeholder: "简体中文, English, 日本語…",
        },
        concurrency: {
          label: "Concurrency",
          hint: "Max parallel translation requests (1–20, default 5); auto-saves on blur or Enter",
          placeholder: "5",
        },
        saveFailedToast: "Failed to save settings. Please retry.",
        unavailable: {
          label: "Settings unavailable",
          hint: "Reset translation settings to defaults",
          action: "Reset defaults",
        },
        reload: {
          label: "Reload settings",
          action: "Reload",
        },
        status: {
          loading: "Loading",
          error: "Load failed",
          configured: "Configured",
          unconfigured: "Unconfigured",
        },
        connection: {
          readError: "Failed to load connection configuration. Check host connection.",
        },
        preset: {
          activeLabel: "Active preset",
          emptyOption: "No presets available",
          addAction: "+ Add preset",
          modeCreatePill: "New Preset",
          modeEditPill: "Editing",
          modeEmptyDesc: "Click \"+ Add preset\" above to create a connection",
          nameLabel: "Preset name",
          cancelCreateAction: "Cancel",
          revertAction: "Revert",
          testAction: "Test",
          testingAction: "Testing...",
          deleteAction: "Delete",
          saveCreateAction: "Save preset",
          saveEditAction: "Save changes",
          savingAction: "Saving...",
          dirtySwitchBlocked: "Unsaved changes in current preset. Save or revert before switching.",
          switchedToast: "Activated preset: {{name}}",
          createdToast: "Preset created and activated",
          updatedToast: "Preset changes saved",
          deletedToast: "Preset deleted",
          testSuccessToast: "Connection test succeeded",
          testSuccessStatus: "Connection test passed: endpoint responded successfully",
          testFailedPrefix: "Test failed: {{reason}}",
          testRequestFailed: "Connection test failed. Check host connection and retry.",
          errorNameRequired: "Enter a preset name",
          errorBaseUrlRequired: "Enter a Base URL",
          errorModelRequired: "Enter a model ID",
          saveFailed: "Failed to save preset. Check host connection and retry.",
          deleteFailed: "Failed to delete preset. Check host connection and retry.",
          switchFailed: "Failed to switch preset. Check host connection and retry.",
        },
        format: {
          label: "API format",
          gemini: "Google Gemini",
          openai: "OpenAI-compatible",
        },
        baseUrl: {
          label: "Base URL",
          hintGemini: "Enter up to /v1beta",
          hintOpenai: "Include version path (e.g. /v1); appends /chat/completions",
        },
        model: {
          label: "Model ID",
          placeholderOpenai: "Enter model ID",
        },
        apiKey: {
          label: "API Key",
          placeholderChanged: "Endpoint changed; re-enter API Key",
          placeholderSaved: "Saved (leave blank to keep, or enter to replace)",
          placeholderEmpty: "Enter API Key",
          errorBlank: "API Key cannot be whitespace only",
          errorRequired: "Enter an API Key (all fields are required)",
          errorTargetChanged: "Re-enter API Key after changing API format or Base URL",
        },
        cache: {
          label: "Translation cache",
          clearingAction: "Clearing...",
          clearAction: "Clear cache",
          clearedToast: "Cleared {{count}} cached entries",
          clearFailedToast: "Failed to clear cache. Please retry.",
        },
        details: {
          title: "Notes & Limits",
          scope: "• Request scope: Sends only visible reasoning text and target language to the selected endpoint. Saving a preset sends no request; only clicking Test or translating does.",
          storage: "• Local storage: Presets and API Keys are stored in PASEO_HOME/plugin-data/paseo-reasoning-translator/connection.json (unencrypted file); clients sync only key-free metadata.",
          limits: "• Runtime limits: Up to 200,000 chars per block (split into 12,000-char chunks serially); configurable concurrency (default 5), queue limit 64, up to 128 cached results (30-min TTL).",
        },
      },
      timeline: {
        title: "Thinking",
        expandLabel: "Expand thinking content",
        collapseLabel: "Collapse thinking content",
        badge: {
          original: "Original",
          streaming: "Thinking...",
          overLimit: "Over limit",
          disabled: "Disabled",
          unconfigured: "Unconfigured",
          submitting: "Submitting...",
          submitFailed: "Submit failed",
          pollFailed: "Query failed",
          running: "Translating...",
          queued: "Queued...",
          error: "Failed",
          pending: "Pending",
        },
        reason: {
          disabled: "Translation is disabled in settings",
          connection_required: "Translation connection is not configured",
          connection_changed: "Translation connection was updated",
          empty_text: "Thinking text is empty",
          queue_full: "Translation queue is full (queue limit 64)",
          job_expired: "Job expired. Please retry.",
          settings_changed: "Settings were updated",
          skipped: "Skipped",
        },
        action: {
          showTranslation: "Show translation",
          showOriginal: "Show original",
          retranslate: "Retranslate",
          retranslateLabel: "Retranslate this thinking block",
          retranslateHint: "Sends a new model request and may incur additional cost",
          translate: "Translate",
          resumePoll: "Resume query",
          translateLabel: "Translate this thinking block",
          retry: "Retry",
          retryLabel: "Retry translation",
        },
        error: {
          overLimitTitle: "Thinking text exceeds limit ({{length}} / {{limit}} chars)",
          overLimitMessage: "Text exceeds the maximum translation limit ({{limit}} chars). Cannot translate until source text changes or shortens.",
          submitFailedTitle: "Failed to submit translation job (network or service error)",
          pollFailedTitle: "Failed to query translation progress (network interrupted or disconnected)",
          jobFailedTitle: "Translation failed",
          unknownError: "An unknown error occurred during translation",
          configChangedTitle: "Translation settings or connection changed",
          configChangedMessage: "Previous job was cancelled. Confirm the current connection and retranslate this block manually.",
          queueFullTitle: "Translation queue is full",
          queueFullMessage: "The waiting queue has reached the limit of 64 jobs. Please click Retry later.",
          jobExpiredTitle: "Translation job expired",
          jobExpiredMessage: "Background job expired and was cleaned up. Click Retry to resubmit.",
          skippedTitle: "Translation skipped",
          separator: ": ",
        },
      },
      server: {
        connection: {
          saveFailed: "Failed to save local connection. Please retry.",
          invalidUrl: "Invalid Base URL format",
          invalidUrlProtocol: "Base URL must use HTTPS (or HTTP for local loopback) and cannot include credentials, query, or fragment",
          invalidModel: "Invalid Model ID; for Gemini, enter the model ID without a path",
          readFailed: "Unable to read local connection file. Check file permissions and connection configuration.",
          invalidFields: "Invalid connection field format. Please check your input.",
          conflict: "Connection configuration was updated (save conflict). Reload before saving.",
          reenterKey: "Must re-enter API key after changing API format or Base URL",
          enterKey: "Please enter an API key",
          invalidApiKey: "API key must contain only printable non-whitespace ASCII characters",
          invalidPresetName: "Invalid preset name; enter 1 to 80 characters without control characters",
          maxPresets: "Preset limit reached (maximum 50 presets)",
          presetNotFound: "Preset does not exist. Reload and retry.",
          incompleteFields: "Enter a complete Base URL and Model ID",
          writeFailed: "Failed to write local connection file. Check disk space and file permissions.",
          testInvalid: "Connection test failed. Please check your input.",
          testFailed: "Connection test failed. Check network and connection settings.",
        },
        http: {
          invalidResponse: "Model endpoint returned an error or invalid response",
          missingChoices: "OpenAI-compatible response is missing the choices array",
          openaiTruncated: "Translation response was truncated (length). Check model output token limit and retry manually.",
          openaiRefused: "Model refused translation or content was blocked by safety policy",
          openaiInvalidMessage: "Endpoint did not return final assistant text, or returned unsupported tool calls",
          geminiBlocked: "Gemini request was blocked by safety policy",
          geminiTruncated: "Gemini response was truncated (MAX_TOKENS). Check model output token limit and retry manually.",
          geminiInvalidCandidate: "Gemini did not return a complete translation (refused, blocked, or malformed response)",
          geminiInvalidParts: "Gemini returned unsupported non-text content or tool calls",
          emptyTranslation: "Endpoint returned no usable translation; reasoning content is never shown as translation",
          translationTooLong: "Translated text exceeds safety length limit",
          status401: "API key is invalid or expired (HTTP 401)",
          status403: "API key does not have permission to access this model (HTTP 403)",
          status404: "Endpoint URL or Model ID does not exist (HTTP 404)",
          status429: "Rate limited or quota exceeded (HTTP 429). Please retry manually later.",
          status5xx: "Model endpoint is temporarily unavailable (HTTP 5xx). Please retry manually later.",
          statusOther: "Translation HTTP request failed (status {{status}})",
          timeout: "Translation HTTP request timed out. Please retry manually.",
          cancelled: "Translation HTTP request was cancelled",
          incompleteConnection: "Translation connection is incomplete. Enter Base URL, Model ID, and API key.",
          emptyBody: "Model endpoint returned an empty response body",
          responseTooLarge: "Model response body exceeds safety size limit",
          invalidJson: "Model endpoint response is not valid JSON",
          networkError: "Unable to connect to translation endpoint or read response. Check network and connection settings, then retry manually.",
          stopped: "Translation HTTP module has stopped",
        },
        service: {
          sourceTooLong: "Reasoning is longer than 200,000 characters. Original text is still available.",
          prepareFailed: "Unable to prepare translation. Check plugin settings and local connection configuration.",
          translateFailed: "Translation failed. Check connection and retry manually; original text is preserved.",
        },
      },
    },
    zh: {
      entry: {
        settingsTitle: "思考翻译设置",
        screenTitle: "思考翻译",
        commandTitle: "打开思考翻译设置",
      },
      settings: {
        section: {
          translation: "翻译设置",
          connection: "接口连接",
          maintenance: "维护与说明",
        },
        enabled: {
          label: "启用思考翻译",
          hint: "在时间线中将思考过程翻译为目标语言",
        },
        mode: {
          label: "翻译方式",
          hint: "手动模式仅翻译点击的思考块；自动模式翻译已加载的完整思考",
          manual: "手动点击",
          automatic: "自动翻译",
        },
        targetLanguage: {
          label: "目标语言",
          hint: "修改后失焦或按回车自动保存",
          placeholder: "简体中文、English、日本語…",
        },
        concurrency: {
          label: "翻译并发数",
          hint: "同时进行的翻译请求上限（1–20，默认 5）；修改后失焦或按回车自动保存",
          placeholder: "5",
        },
        saveFailedToast: "保存设置失败，请重试",
        unavailable: {
          label: "设置不可用",
          hint: "恢复默认翻译设置",
          action: "恢复默认",
        },
        reload: {
          label: "重新读取设置",
          action: "重新加载",
        },
        status: {
          loading: "读取中",
          error: "读取失败",
          configured: "已配置",
          unconfigured: "待配置",
        },
        connection: {
          readError: "读取连接配置失败，请检查宿主连接",
        },
        preset: {
          activeLabel: "当前激活预设",
          emptyOption: "暂无可用预设",
          addAction: "+ 新增预设",
          modeCreatePill: "新建预设",
          modeEditPill: "编辑中",
          modeEmptyDesc: "请点击「+ 新增预设」创建模型连接",
          nameLabel: "预设名称",
          cancelCreateAction: "取消新建",
          revertAction: "还原修改",
          testAction: "测试连接",
          testingAction: "测试中...",
          deleteAction: "删除预设",
          saveCreateAction: "保存新预设",
          saveEditAction: "保存修改",
          savingAction: "保存中...",
          dirtySwitchBlocked: "当前表单有未保存更改，请先「保存修改」或「还原修改」后再切换预设。",
          switchedToast: "已切换激活预设：{{name}}",
          createdToast: "已新增并激活预设",
          updatedToast: "预设修改已保存",
          deletedToast: "已删除预设",
          testSuccessToast: "测试连接成功",
          testSuccessStatus: "测试连接通过：接口可正常响应翻译请求",
          testFailedPrefix: "无法测试：{{reason}}",
          testRequestFailed: "测试连接失败，请检查宿主连接后重试",
          errorNameRequired: "请填写预设名称",
          errorBaseUrlRequired: "请填写 Base URL",
          errorModelRequired: "请填写模型 ID",
          saveFailed: "保存预设失败，请检查宿主连接后重试",
          deleteFailed: "删除预设失败，请检查宿主连接后重试",
          switchFailed: "切换预设失败，请检查宿主连接后重试",
        },
        format: {
          label: "API 格式",
          gemini: "Google Gemini",
          openai: "OpenAI 兼容",
        },
        baseUrl: {
          label: "Base URL",
          hintGemini: "填写至 /v1beta",
          hintOpenai: "填写完整基础地址（含版本如 /v1），自动追加 /chat/completions",
        },
        model: {
          label: "模型 ID",
          placeholderOpenai: "输入模型 ID",
        },
        apiKey: {
          label: "API Key",
          placeholderChanged: "接口已更改，请重新输入 API Key",
          placeholderSaved: "已保存（留空保留，输入则替换）",
          placeholderEmpty: "输入 API Key",
          errorBlank: "API Key 不能为空白字符",
          errorRequired: "请输入 API Key（完整配置后才允许保存）",
          errorTargetChanged: "更改接口格式或 Base URL 后，请重新输入 API Key",
        },
        cache: {
          label: "翻译缓存",
          clearingAction: "清理中...",
          clearAction: "清理缓存",
          clearedToast: "已清理 {{count}} 条缓存记录",
          clearFailedToast: "清理缓存失败，请重试",
        },
        details: {
          title: "说明与限制",
          scope: "• 请求范围：仅将当前思考文本与目标语言发送至所选接口；保存预设时不发送请求，仅在点击「测试连接」或执行翻译时发起。",
          storage: "• 本机存储：各预设与 API Key 保存在本机 PASEO_HOME/plugin-data/paseo-reasoning-translator/connection.json（未加密文件），客户端仅同步无密钥状态。",
          limits: "• 运行限制：单条上限 200,000 字符（超 12,000 字符按段串行翻译）；并发数可配置（默认 5），队列上限 64，内存缓存最多 128 条（30 分钟过期）。",
        },
      },
      timeline: {
        title: "Thinking",
        expandLabel: "展开思考内容",
        collapseLabel: "折叠思考内容",
        badge: {
          original: "原文",
          streaming: "思考中...",
          overLimit: "超限",
          disabled: "未开启",
          unconfigured: "未配置",
          submitting: "提交中...",
          submitFailed: "提交失败",
          pollFailed: "查询失败",
          running: "翻译中...",
          queued: "排队中...",
          error: "失败",
          pending: "待翻译",
        },
        reason: {
          disabled: "翻译已在设置中关闭",
          connection_required: "翻译连接未配置",
          connection_changed: "翻译连接已更新",
          empty_text: "思考文本为空",
          queue_full: "翻译排队已满（等待队列上限 64）",
          job_expired: "任务已过期，请重试",
          settings_changed: "设置已更新",
          skipped: "已跳过",
        },
        action: {
          showTranslation: "显示译文",
          showOriginal: "显示原文",
          retranslate: "重新翻译",
          retranslateLabel: "重新翻译此思考块",
          retranslateHint: "发起新的模型请求，可能产生额外费用",
          translate: "翻译",
          resumePoll: "继续查询",
          translateLabel: "翻译此思考块",
          retry: "重试",
          retryLabel: "重试翻译",
        },
        error: {
          overLimitTitle: "思考文本超出上限 ({{length}} / {{limit}} 字符)",
          overLimitMessage: "文本长度已超过单次翻译最大上限（{{limit}} 字符）。在源思考文本改变或缩短前不可翻译，重试无效。",
          submitFailedTitle: "提交翻译任务失败（网络或服务异常）",
          pollFailedTitle: "查询翻译进度失败（网络中断或连接断开）",
          jobFailedTitle: "翻译执行失败",
          unknownError: "翻译过程中出现未知错误",
          configChangedTitle: "翻译设置或连接已变化",
          configChangedMessage: "旧任务已取消。确认当前连接后，可手动重新翻译此块。",
          queueFullTitle: "翻译排队已满",
          queueFullMessage: "当前等待队列已达到 64 个任务上限，请稍候点击「重试」。",
          jobExpiredTitle: "翻译任务已过期",
          jobExpiredMessage: "后台任务已过期清理，可点击「重试」重新提交。",
          skippedTitle: "翻译已跳过",
          separator: "：",
        },
      },
      server: {
        connection: {
          saveFailed: "保存本机连接失败，请重试",
          invalidUrl: "Base URL 格式无效",
          invalidUrlProtocol: "Base URL 必须为 HTTPS（本机 loopback 可用 HTTP），且不能含账号、query 或 fragment",
          invalidModel: "模型 ID 无效；Gemini 请填写模型 ID，不要填写路径",
          readFailed: "无法读取本机连接文件，请检查文件权限和连接配置",
          invalidFields: "连接字段格式无效，请检查输入",
          conflict: "连接配置已更新（保存冲突），请重新加载后再保存",
          reenterKey: "更改接口格式或 Base URL 后必须重新输入 API key",
          enterKey: "请输入 API key",
          invalidApiKey: "API key 必须为不含空白的可打印 ASCII 字符",
          invalidPresetName: "预设名称无效，请填写 1 至 80 个字符且不含控制字符",
          maxPresets: "预设数量已达上限（最多 50 个）",
          presetNotFound: "预设不存在，请重新加载后再试",
          incompleteFields: "请填写完整的 Base URL 和模型 ID",
          writeFailed: "保存本机连接文件失败，请检查磁盘与文件权限",
          testInvalid: "测试连接失败，请检查输入",
          testFailed: "测试连接失败，请检查网络与连接配置",
        },
        http: {
          invalidResponse: "模型接口返回错误或无效响应",
          missingChoices: "OpenAI 兼容接口响应缺少 choices 数组",
          openaiTruncated: "翻译响应被截断（length），请检查模型输出上限后手动重试",
          openaiRefused: "模型拒绝翻译或内容被安全策略拦截",
          openaiInvalidMessage: "接口未返回最终 assistant 文本，或返回了不支持的工具调用",
          geminiBlocked: "Gemini 请求被安全策略拦截",
          geminiTruncated: "Gemini 响应被截断（MAX_TOKENS），请检查模型输出上限后手动重试",
          geminiInvalidCandidate: "Gemini 未返回完整译文，可能被拒绝、拦截或响应格式异常",
          geminiInvalidParts: "Gemini 返回了不支持的非文本内容或工具调用",
          emptyTranslation: "接口未返回可用译文；推理内容不会作为译文显示",
          translationTooLong: "译文超过安全长度上限",
          status401: "API key 无效或已过期（HTTP 401）",
          status403: "API key 没有访问该模型的权限（HTTP 403）",
          status404: "接口地址或模型 ID 不存在（HTTP 404）",
          status429: "接口限流或额度不足（HTTP 429），请稍后手动重试",
          status5xx: "模型接口暂时不可用（HTTP 5xx），请稍后手动重试",
          statusOther: "翻译 HTTP 请求失败（状态 {{status}}）",
          timeout: "翻译 HTTP 请求超时，请手动重试",
          cancelled: "翻译 HTTP 请求已取消",
          incompleteConnection: "翻译连接未配置完整，请填写 Base URL、模型 ID 和 API key",
          emptyBody: "模型接口返回空响应体",
          responseTooLarge: "模型响应体超过安全大小上限",
          invalidJson: "模型接口返回的响应不是有效 JSON",
          networkError: "无法连接翻译接口或读取响应，请检查网络与连接设置后手动重试",
          stopped: "翻译 HTTP 模块已停止",
        },
        service: {
          sourceTooLong: "思考文本超过 200,000 字符上限，原文仍可查看。",
          prepareFailed: "无法准备翻译，请检查插件设置与本机连接配置",
          translateFailed: "翻译失败，请检查连接后手动重试；原文已保留",
        },
      },
    },
  },
});

export type TranslationKey =
  | "entry.settingsTitle"
  | "entry.screenTitle"
  | "entry.commandTitle"
  | "settings.section.translation"
  | "settings.section.connection"
  | "settings.section.maintenance"
  | "settings.enabled.label"
  | "settings.enabled.hint"
  | "settings.mode.label"
  | "settings.mode.hint"
  | "settings.mode.manual"
  | "settings.mode.automatic"
  | "settings.targetLanguage.label"
  | "settings.targetLanguage.hint"
  | "settings.targetLanguage.placeholder"
  | "settings.saveFailedToast"
  | "settings.unavailable.label"
  | "settings.unavailable.hint"
  | "settings.unavailable.action"
  | "settings.reload.label"
  | "settings.reload.action"
  | "settings.status.loading"
  | "settings.status.error"
  | "settings.status.configured"
  | "settings.status.unconfigured"
  | "settings.connection.readError"
  | "settings.preset.activeLabel"
  | "settings.preset.emptyOption"
  | "settings.preset.addAction"
  | "settings.preset.modeCreatePill"
  | "settings.preset.modeEditPill"
  | "settings.preset.modeEmptyDesc"
  | "settings.preset.nameLabel"
  | "settings.preset.cancelCreateAction"
  | "settings.preset.revertAction"
  | "settings.preset.testAction"
  | "settings.preset.testingAction"
  | "settings.preset.deleteAction"
  | "settings.preset.saveCreateAction"
  | "settings.preset.saveEditAction"
  | "settings.preset.savingAction"
  | "settings.preset.dirtySwitchBlocked"
  | "settings.preset.switchedToast"
  | "settings.preset.createdToast"
  | "settings.preset.updatedToast"
  | "settings.preset.deletedToast"
  | "settings.preset.testSuccessToast"
  | "settings.preset.testSuccessStatus"
  | "settings.preset.testFailedPrefix"
  | "settings.preset.testRequestFailed"
  | "settings.preset.errorNameRequired"
  | "settings.preset.errorBaseUrlRequired"
  | "settings.preset.errorModelRequired"
  | "settings.preset.saveFailed"
  | "settings.preset.deleteFailed"
  | "settings.preset.switchFailed"
  | "settings.format.label"
  | "settings.format.gemini"
  | "settings.format.openai"
  | "settings.baseUrl.label"
  | "settings.baseUrl.hintGemini"
  | "settings.baseUrl.hintOpenai"
  | "settings.model.label"
  | "settings.model.placeholderOpenai"
  | "settings.apiKey.label"
  | "settings.apiKey.placeholderChanged"
  | "settings.apiKey.placeholderSaved"
  | "settings.apiKey.placeholderEmpty"
  | "settings.apiKey.errorBlank"
  | "settings.apiKey.errorRequired"
  | "settings.apiKey.errorTargetChanged"
  | "settings.cache.label"
  | "settings.cache.clearingAction"
  | "settings.cache.clearAction"
  | "settings.cache.clearedToast"
  | "settings.cache.clearFailedToast"
  | "settings.details.title"
  | "settings.details.scope"
  | "settings.details.storage"
  | "settings.details.limits"
  | "timeline.title"
  | "timeline.expandLabel"
  | "timeline.collapseLabel"
  | "timeline.badge.original"
  | "timeline.badge.streaming"
  | "timeline.badge.overLimit"
  | "timeline.badge.disabled"
  | "timeline.badge.unconfigured"
  | "timeline.badge.submitting"
  | "timeline.badge.submitFailed"
  | "timeline.badge.pollFailed"
  | "timeline.badge.running"
  | "timeline.badge.queued"
  | "timeline.badge.error"
  | "timeline.badge.pending"
  | "timeline.reason.disabled"
  | "timeline.reason.connection_required"
  | "timeline.reason.connection_changed"
  | "timeline.reason.empty_text"
  | "timeline.reason.queue_full"
  | "timeline.reason.job_expired"
  | "timeline.reason.settings_changed"
  | "timeline.reason.skipped"
  | "timeline.action.showTranslation"
  | "timeline.action.showOriginal"
  | "timeline.action.retranslate"
  | "timeline.action.retranslateLabel"
  | "timeline.action.retranslateHint"
  | "timeline.action.translate"
  | "timeline.action.resumePoll"
  | "timeline.action.translateLabel"
  | "timeline.action.retry"
  | "timeline.action.retryLabel"
  | "timeline.error.overLimitTitle"
  | "timeline.error.overLimitMessage"
  | "timeline.error.submitFailedTitle"
  | "timeline.error.pollFailedTitle"
  | "timeline.error.jobFailedTitle"
  | "timeline.error.unknownError"
  | "timeline.error.configChangedTitle"
  | "timeline.error.configChangedMessage"
  | "timeline.error.queueFullTitle"
  | "timeline.error.queueFullMessage"
  | "timeline.error.jobExpiredTitle"
  | "timeline.error.jobExpiredMessage"
  | "timeline.error.skippedTitle"
  | "timeline.error.separator"
  | "server.connection.saveFailed"
  | "server.connection.invalidUrl"
  | "server.connection.invalidUrlProtocol"
  | "server.connection.invalidModel"
  | "server.connection.readFailed"
  | "server.connection.invalidFields"
  | "server.connection.conflict"
  | "server.connection.reenterKey"
  | "server.connection.enterKey"
  | "server.connection.invalidApiKey"
  | "server.connection.invalidPresetName"
  | "server.connection.maxPresets"
  | "server.connection.presetNotFound"
  | "server.connection.incompleteFields"
  | "server.connection.writeFailed"
  | "server.connection.testInvalid"
  | "server.connection.testFailed"
  | "server.http.invalidResponse"
  | "server.http.missingChoices"
  | "server.http.openaiTruncated"
  | "server.http.openaiRefused"
  | "server.http.openaiInvalidMessage"
  | "server.http.geminiBlocked"
  | "server.http.geminiTruncated"
  | "server.http.geminiInvalidCandidate"
  | "server.http.geminiInvalidParts"
  | "server.http.emptyTranslation"
  | "server.http.translationTooLong"
  | "server.http.status401"
  | "server.http.status403"
  | "server.http.status404"
  | "server.http.status429"
  | "server.http.status5xx"
  | "server.http.statusOther"
  | "server.http.timeout"
  | "server.http.cancelled"
  | "server.http.incompleteConnection"
  | "server.http.emptyBody"
  | "server.http.responseTooLarge"
  | "server.http.invalidJson"
  | "server.http.networkError"
  | "server.http.stopped"
  | "server.service.sourceTooLong"
  | "server.service.prepareFailed"
  | "server.service.translateFailed";

export type TranslateFn = ReturnType<typeof useTranslation<typeof messages.resources.en>>["t"];

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
  t: TranslateFn,
): string {
  if (!message) return "";
  const key = serverMessageToKey[message];
  if (key) {
    return t(
      key as Exclude<
        TranslationKey,
        | "settings.preset.switchedToast"
        | "settings.preset.testFailedPrefix"
        | "settings.cache.clearedToast"
        | "timeline.error.overLimitTitle"
        | "timeline.error.overLimitMessage"
        | "server.http.statusOther"
      >,
    );
  }
  const statusMatch = /^翻译 HTTP 请求失败（状态 (\d+)）$/.exec(message);
  if (statusMatch) {
    return t("server.http.statusOther", { status: statusMatch[1] });
  }
  return message;
}

export function useI18n() {
  return useTranslation(messages);
}
