import { reactLibraryPreset } from "@anvilkit/vitest-config/react-library";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  reactLibraryPreset,
  defineConfig({
    test: {
      name: "@anvilkit/collab-ui",
      setupFiles: [
        "@anvilkit/vitest-config/setup/jest-dom",
        "./src/__tests__/setup.ts",
      ],
    },
  }),
);
