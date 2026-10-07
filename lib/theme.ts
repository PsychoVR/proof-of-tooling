export type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "theme";
/** Browser chrome colour (the `--bg` token) per theme. */
export const THEME_COLORS: Record<Theme, string> = { dark: "#0f1514", light: "#f2f4f3" };

export function parseTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : DEFAULT_THEME;
}

/**
 * Inline script for the `<head>`: runs before the first paint and applies the saved theme, or the
 * default when nothing valid is saved or storage is blocked. It also writes the `theme-color` and
 * `color-scheme` metas itself: React treats head metas as resources and would duplicate them on hydration. Keep it in step with `applyTheme`.
 */
export const THEME_INIT_SCRIPT = `(function(){var t=${JSON.stringify(DEFAULT_THEME)};try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==="light"||s==="dark")t=s}catch(e){}var c=${JSON.stringify(THEME_COLORS)};var d=document.documentElement;d.setAttribute("data-theme",t);var h=document.head;[["theme-color",c[t]],["color-scheme",t]].forEach(function(p){var m=h.querySelector('meta[name="'+p[0]+'"]');if(!m){m=document.createElement("meta");m.name=p[0];h.appendChild(m)}m.content=p[1]});})()`;

/** Applies a theme to the page and remembers it. Storage may be blocked: the choice then lasts for the visit. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode or blocked storage */
  }
}
