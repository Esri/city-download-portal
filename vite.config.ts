import { resolve } from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { UserConfig, defineConfig, normalizePath } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ isSsrBuild }) => {
  const base = "/city-download-portal/";

  return {
    base,
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
      reactRouter(),
      tsconfigPaths(),
      !isSsrBuild && viteStaticCopy({
        targets: [
          {
            src: normalizePath(resolve(
              "node_modules",
              "@esri",
              "calcite-components",
              "dist",
              "cdn",
              "assets",
            )),
            dest: ".",
          },
        ],
      }),
    ],
    define: {
      BASE_PATH: JSON.stringify(base),
    },
  } satisfies UserConfig;
});
