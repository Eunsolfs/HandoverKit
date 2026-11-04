import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    copy: [{ from: "../../packages/db/src/migrations", to: "dist" }],
    // Jimp 0.22 是 CJS，内部使用 __dirname；bundle 成 ESM 后与顶层 await 冲突，
    // 统一定义为 ESM 等价物，避免 Node 报 ERR_AMBIGUOUS_MODULE_SYNTAX。
    define: {
      __dirname: "import.meta.dirname",
      __filename: "import.meta.filename",
    },
    deps: { alwaysBundle: [/./u] },
    entry: ["src/index.ts", "src/migrate.ts"],
  },
});
