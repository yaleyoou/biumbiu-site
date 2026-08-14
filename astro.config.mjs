import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import expressiveCode from "astro-expressive-code";

export default defineConfig({
  site: "https://biumbiu.com",
  output: "static",
  integrations: [
    sitemap({
      // 工具页与标签聚合页不进入 sitemap：它们对搜索引擎没有独立内容价值。
      filter: (page) =>
        !page.includes("/search/")
        && !page.includes("/tags/")
        && !page.includes("/404")
    }),
    expressiveCode({
      // One dark + one light theme: Expressive Code emits both and switches via
      // prefers-color-scheme, plus the [data-code-theme] override used by the toggle.
      themes: ["github-dark", "github-light"],
      themeCssSelector: (theme) => `[data-code-theme='${theme.name}']`,
      useDarkModeMediaQuery: true,
      useThemedSelectionColors: true,
      defaultProps: {
        // Plain terminal blocks render without the window chrome.
        showLineNumbers: false
      },
      styleOverrides: {
        borderRadius: "6px",
        borderWidth: "1px",
        codeFontFamily: "var(--mono)",
        uiFontFamily: "var(--sans)",
        codeFontSize: "0.82rem",
        codeLineHeight: "1.7",
        codePaddingBlock: "0.9rem",
        codePaddingInline: "1.1rem",
        // Frames sit on the page background, code area slightly recessed.
        borderColor: ["rgba(167, 201, 184, 0.16)", "rgba(43, 61, 52, 0.16)"],
        codeBackground: ["#0d1512", "#f3f5f2"],
        frames: {
          shadowColor: "transparent",
          editorBackground: ["#0a100e", "#ecefe9"],
          editorActiveTabBackground: ["#0d1512", "#f3f5f2"],
          editorActiveTabBorderColor: "transparent",
          editorActiveTabIndicatorTopColor: ["#b9ff43", "#4d8a00"],
          editorActiveTabIndicatorBottomColor: "transparent",
          terminalTitlebarBackground: ["#0a100e", "#ecefe9"],
          terminalTitlebarDotsForeground: ["rgba(237, 244, 239, 0.4)", "rgba(27, 42, 34, 0.35)"]
        }
      }
    })
  ],
  image: {
    // Markdown images use Astro's responsive srcset generation by default.
    // Component images opt out when they provide their own Picture widths.
    layout: "constrained",
    responsiveStyles: true
  },
  devToolbar: {
    enabled: false
  },
  build: {
    format: "directory"
  }
});
