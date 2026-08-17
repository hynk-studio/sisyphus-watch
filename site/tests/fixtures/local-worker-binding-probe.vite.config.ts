import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";

import { buildLocalWorkerRuntimeBindings } from "../../build/local-worker-bindings";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      inspectorPort: false,
      persistState: false,
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: {
        main: "./tests/fixtures/local-worker-binding-probe.ts",
        compatibility_flags: ["nodejs_compat"],
        ...buildLocalWorkerRuntimeBindings(
          process.env.SISYPHUS_LIVE_ENABLED,
        ),
      },
    }),
  ],
});
