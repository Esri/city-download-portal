import { resolve } from "path";
import { reactRouter } from "@react-router/dev/vite";
import { UserConfig, defineConfig, normalizePath } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig(() => {
  const base = "/city-download-portal/";
  const calciteAssetsPath = normalizePath(
    resolve(
      "node_modules",
      "@esri",
      "calcite-components",
      "dist",
      "cdn",
      "assets",
    ),
  );

  return {
    base,
    resolve: {
      alias: {
        "~": normalizePath(resolve("app")),
      },
    },
    ssr: {
      noExternal: [
        /@esri\/calcite-components/,
        /@esri\/calcite-components-react/,
        /@stencil\/core/,
      ],
    },
    optimizeDeps: {
      exclude: [
        "@esri/calcite-components",
        "@esri/calcite-components-react",
        "@arcgis/core",
      ],
    },
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: `${calciteAssetsPath}/**/*`,
            dest: "assets",
            rename: { stripBase: 6 },
          },
        ],
      }),
      reactRouter(),
    ],
    define: {
      BASE_PATH: JSON.stringify(base),
    },
  } satisfies UserConfig;
});
