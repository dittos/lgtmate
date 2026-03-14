import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLightTheme = theme === "light";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className="border-border/80 bg-background/80 p-0 text-foreground shadow-sm backdrop-blur-sm hover:bg-muted"
      onClick={toggleTheme}
      aria-label={`Switch to ${isLightTheme ? "dark" : "light"} mode`}
    >
      {isLightTheme ? (
        <Moon className="size-4" aria-hidden="true" />
      ) : (
        <Sun className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}
