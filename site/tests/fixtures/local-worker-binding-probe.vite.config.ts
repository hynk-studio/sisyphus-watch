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
        d1_databases: [
          {
            binding: "DB",
            database_name: "site-creator-d1-probe",
            database_id: "00000000-0000-4000-8000-000000000000",
          },
        ],
        ...buildLocalWorkerRuntimeBindings(
          process.env.SISYPHUS_LIVE_ENABLED,
          process.env.SISYPHUS_OPERATOR_LIVE_ENABLED,
        ),
      },
    }),
  ],
});
