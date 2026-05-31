/**
 * 应用配置中心
 *
 * 通过 VITE_EXTENSION 环境变量区分两种运行模式：
 * - Web 模式 (VITE_EXTENSION !== "true")：沿用 Vite 代理 + 相对路径
 * - 扩展模式 (VITE_EXTENSION === "true")：直连本地后端 localhost:3001
 */

export const IS_EXTENSION = import.meta.env.VITE_EXTENSION === "true";

/** REST API 基础地址。扩展模式需绝对 URL，Web 模式用空字符串走 Vite 代理。 */
export const API_BASE_URL: string = IS_EXTENSION ? "http://localhost:3001" : "";

/** WebSocket 连接地址 */
export const WS_URL: string = (() => {
  if (IS_EXTENSION) {
    return "ws://localhost:3001/ws";
  }
  // Web 模式：沿用原有逻辑
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (import.meta.env.DEV) {
    return `ws://${location.hostname}:${location.port}/ws`;
  }
  return `ws://${location.hostname}:${import.meta.env.VITE_WS_PORT || "3001"}`;
})();

