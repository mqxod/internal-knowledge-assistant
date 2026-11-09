import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    "scripts/bootstrap-admin": "src/scripts/bootstrap-admin.ts",
    "scripts/seed-demo": "src/scripts/seed-demo.ts",
  },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (it ships TypeScript sources); keep npm deps external.
  noExternal: ["@ika/shared"],
});
