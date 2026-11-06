import type { ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "./lib/theme";
import { Segmented, useT } from "./ui";
import { useTheme } from "./useTheme";

export function ThemePicker({ full, showSystem = true }: { full?: boolean; showSystem?: boolean }) {
  const t = useT();
  const theme = useTheme();
  const options: [ThemePreference, string, ReactNode][] = [
    ["light", t("Light"), <Sun size={20} className="mx-auto" aria-hidden />],
    ["dark", t("Dark"), <Moon size={20} className="mx-auto" aria-hidden />],
  ];
  if (showSystem)
    options.push(["system", t("System"), <Monitor size={20} className="mx-auto" aria-hidden />]);
  return (
    <Segmented
      full={full}
      label={t("Theme")}
      value={showSystem ? theme.preference : theme.resolved}
      onChange={theme.setPreference}
      options={options}
    />
  );
}
