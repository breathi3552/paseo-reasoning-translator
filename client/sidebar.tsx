import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useI18n } from "./i18n";

export function TranslationSidebarItem(props: PluginSidebarItemProps) {
  const { currentScreen, openScreen } = props;
  const { t } = useI18n(props);
  return (
    <SidebarRow
      icon="Languages"
      label={t("entry.screenTitle")}
      active={currentScreen?.screenId === "translation"}
      onPress={() => openScreen({ screenId: "translation" })}
    />
  );
}
