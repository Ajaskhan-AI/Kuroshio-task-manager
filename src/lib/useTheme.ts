import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";

function effectiveTheme(): Theme {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark" || t === "light") return t;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(effectiveTheme);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme:dark)");
    if (!mq) return;
    const onChange = () => setTheme(effectiveTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("kuro-theme", next);
    } catch {
      /* storage unavailable */
    }
    setTheme(next);
  }, []);

  return { icon: theme === "dark" ? "☀️" : "🌙", toggle };
}
