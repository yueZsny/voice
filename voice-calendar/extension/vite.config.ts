import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { copyFileSync, cpSync, existsSync, mkdirSync, renameSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionDir = __dirname;
const clientDir = resolve(__dirname, "../client");

/**
 * 复制扩展静态资源到构建输出目录
 */
function copyExtensionAssets(): any {
  return {
    name: "copy-extension-assets",
    closeBundle() {
      const outDir = resolve(extensionDir, "dist");
      // 复制 manifest.json
      copyFileSync(
        resolve(extensionDir, "manifest.json"),
        resolve(outDir, "manifest.json")
      );
      // 复制 icons/
      const iconsSrc = resolve(extensionDir, "icons");
      const iconsDest = resolve(outDir, "icons");
      if (existsSync(iconsSrc)) {
        mkdirSync(iconsDest, { recursive: true });
        cpSync(iconsSrc, iconsDest, { recursive: true });
      }
      // 复制 service-worker.js
      copyFileSync(
        resolve(extensionDir, "service-worker.js"),
        resolve(outDir, "service-worker.js")
      );
      // 复制录音标签页文件
      copyFileSync(
        resolve(extensionDir, "record.html"),
        resolve(outDir, "record.html")
      );
      copyFileSync(
        resolve(extensionDir, "record.js"),
        resolve(outDir, "record.js")
      );
      // 重命名 extension-popup.html → index.html（manifest 期望）
      const htmlSrc = resolve(outDir, "extension-popup.html");
      const htmlDest = resolve(outDir, "index.html");
      if (existsSync(htmlSrc)) {
        renameSync(htmlSrc, htmlDest);
      }
      console.log("✅ [扩展] 静态资源已复制到 dist/");
    },
  };
}

export default defineConfig({
  root: clientDir, // 指向 client/ 目录，确保 import 路径正确
  base: "./", // 关键：所有资源路径相对化，适配 chrome-extension:// 协议
  plugins: [react(), copyExtensionAssets()],
  define: {
    "import.meta.env.VITE_EXTENSION": JSON.stringify("true"),
  },
  build: {
    outDir: resolve(extensionDir, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(clientDir, "extension-popup.html"),
    },
  },
  resolve: {
    alias: {
      "@": resolve(clientDir, "src"),
    },
  },
});
