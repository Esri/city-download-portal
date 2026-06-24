import { join } from "node:path";
import { copyFileSync } from "node:fs";
import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,
  basename: "/city-download-portal/",
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
  buildEnd(args) {
    if (!args.viteConfig.isProduction) return;
    // When deploying to GitHub Pages, if you navigate from / to another
    // route and refresh the tab, it will show the default GH Pages 404
    // page. This happens because GH Pages is not configured to send all
    // traffic to the index.html where we can load our client-side JS.
    // To fix this, we can create a 404.html file that contains the same
    // content as index.html. This way, when the user refreshes the page,
    // GH Pages will serve our 404.html and everything will work as
    // expected.
    const clientBuildPath = join(
      args.reactRouterConfig.buildDirectory,
      "client",
    );
    copyFileSync(
      join(clientBuildPath, "index.html"),
      join(clientBuildPath, "404.html"),
    );
  },
} satisfies Config;
