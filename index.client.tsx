import type { PluginClientContext } from "@getpaseo/plugin/client";
import { REASONING_KIND, REASONING_VERSION, reasoningDataSchema } from "./shared/timeline";
import { TranslatedReasoning } from "./client/timeline";
import { TranslationSettingsScreen } from "./client/settings";
import { TranslationSidebarItem } from "./client/sidebar";

export default function contribute(client: PluginClientContext) {
  // 1. Timeline Transformer: Intercept built-in reasoning timeline items
  client.addTimelineTransformer({
    id: "think-what-reasoning-transformer",
    query: { itemType: "reasoning" },
    transform({ item, phase }) {
      return {
        items: [
          {
            type: "plugin",
            kind: REASONING_KIND,
            version: REASONING_VERSION,
            data: {
              text: item.text,
              phase,
            },
          },
        ],
      };
    },
  });

  // 2. Timeline Renderer: Draw translated reasoning
  client.addTimelineRenderer({
    kind: REASONING_KIND,
    version: REASONING_VERSION,
    schema: reasoningDataSchema,
    Component: TranslatedReasoning,
  });

  // 3. Settings Screen (Settings -> Plugins -> paseo-think-what)
  client.addSettingsScreen({
    id: "translation",
    title: "思考翻译设置",
    icon: "Languages",
    Component: TranslationSettingsScreen,
  });

  // 4. Standalone Screen (for sidebar / direct openScreen navigation)
  client.addScreen({
    id: "translation",
    title: "思考翻译",
    Component: TranslationSettingsScreen,
  });

  // 5. Sidebar Header Item
  client.addSidebarHeaderItem({
    id: "translation-sidebar",
    title: "思考翻译",
    Component: TranslationSidebarItem,
  });

  // 6. Command Center Item (⌘K / Ctrl+K)
  client.addCommandCenterItem({
    id: "translation-settings-command",
    title: "打开思考翻译设置",
    icon: "Languages",
    keywords: ["translation", "think", "reasoning", "思考", "翻译"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings("translation");
    },
  });

  return () => {};
}
