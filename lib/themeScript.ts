/** Shared with lib/client/theme.ts — keep the key in sync. Plain module: the server layout imports it. */
const KEY = 'pact-theme'

/**
 * Runs in <head> before first paint. Kept tiny and dependency-free; mirrors `apply`.
 * If anything throws, the page falls back to the dark theme defined on :root.
 */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('${KEY}');var t=(p==='light'||p==='dark')?p:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t;}catch(e){}})();`
