import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";

export function TranslationSidebarItem({
  currentScreen,
  openScreen,
}: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Languages"
      label="思考翻译"
      active={currentScreen?.screenId === "translation"}
      onPress={() => openScreen({ screenId: "translation" })}
    />
  );
}
