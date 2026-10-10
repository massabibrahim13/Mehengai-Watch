// Light / dark theme: follows the system setting until the visitor picks one with the toggle; that choice is
// remembered in this browser.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
const KEY = "mw-theme";

function savedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null; // storage blocked (private mode etc.)
  }
}

const systemTheme = (): Theme => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export const initialTheme = (): Theme => savedTheme() ?? systemTheme();

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || initialTheme());

  // Switch the attribute *before* React re-renders: charts read their colours from CSS variables while
  // rendering, so they'd otherwise pick up the old theme's colours.
  const apply = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    setTheme(t);
  };

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => !savedTheme() && apply(systemTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* not critical: the choice just won't be remembered */
    }
    apply(next);
  };
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
