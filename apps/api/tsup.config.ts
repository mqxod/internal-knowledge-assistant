import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    // Vercel Functions entry (default-exports the Express app). See vercel.json.
    vercel: "src/vercel.ts",
    "scripts/bootstrap-admin": "src/scripts/bootstrap-admin.ts",
    "scripts/seed-demo": "src/scripts/seed-demo.ts",
    "scripts/reindex-vectors": "src/scripts/reindex-vectors.ts",
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
