import axios from "axios";
import RPCClient from "@alicloud/pop-core";

function getCredentials() {
  return {
    accessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || "",
    secretKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || "",
    appKey: process.env.ALIBABA_NLS_APP_KEY || "",
  };
}

/**
 * 使用阿里云 NLS 文件识别 API
 */
export async function speechToText(audioBuffer: Buffer, format = "wav"): Promise<string> {
  const { accessKey, secretKey, appKey } = getCredentials();
  if (!accessKey || !secretKey || !appKey) {
    console.warn("[ASR] Alibaba Cloud credentials not set, returning mock text");
    return mockAsr();
  }

  try {
    // 1. 通过阿里云 POP SDK 获取 Token（自动 HMAC-SHA1 签名）
    console.log("[ASR] 步骤1/2: 获取 Token...");
    const token = await getToken(accessKey, secretKey);
    console.log("[ASR] ✅ Token acquired");

    // 2. 调用一句话识别 API
    console.log(`[ASR] 步骤2/2: 发送音频 (${audioBuffer.length} bytes, format=${format})...`);
    const text = await fileRecognition(audioBuffer, token, appKey, format);

    if (!text || text.trim() === "") {
      console.warn("[ASR] ⚠️ 识别结果为空（可能是静音或无有效语音）");
      return "[未检测到语音，请重新说一次]";
    }

    console.log(`[ASR] ✅ 识别成功: "${text}"`);
    return text;
  } catch (error: any) {
    console.error("[ASR] ❌ 识别失败:", error.message);
    // 返回错误信息给用户，而不是 Mock 数据
    return `[语音识别失败: ${error.message}]`;
  }
}

/** 通过阿里云 POP SDK 获取 NLS Token */
async function getToken(accessKey: string, secretKey: string): Promise<string> {
  const client = new RPCClient({
    accessKeyId: accessKey,
    accessKeySecret: secretKey,
    endpoint: "https://nls-meta.cn-shanghai.aliyuncs.com",
    apiVersion: "2019-02-28",
  });

  const response: any = await client.request("CreateToken", {}, { method: "POST" });

  const token = response?.Token?.Id;
  if (!token) {
    console.error("[ASR] Token response:", JSON.stringify(response));
    throw new Error("Failed to get NLS token: no Token.Id in response");
  }
  return token;
}

/** 阿里云 NLS 一句话识别 */
async function fileRecognition(
  audioBuffer: Buffer,
  token: string,
  appKey: string,
  format: string
): Promise<string> {
  try {
    const response = await axios.post(
      "https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr",
      audioBuffer,
      {
        headers: {
          "X-NLS-Token": token,
          "Content-Type": "application/octet-stream",
        },
        params: {
          appkey: appKey,        // ← appkey 必须在 query params 里
          format,
          sample_rate: 16000,
          enable_intermediate_result: false,
          enable_punctuation_prediction: true,
          enable_inverse_text_normalization: true,
        },
        timeout: 30000,
        validateStatus: () => true, // 自己处理错误
      }
    );

    if (response.status !== 200) {
      const errMsg = typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);
      console.error(`[ASR] HTTP ${response.status}, body: ${errMsg.substring(0, 300)}`);
      throw new Error(`ASR HTTP ${response.status}: ${errMsg.substring(0, 100)}`);
    }

    const result = response.data?.result;
    if (!result) {
      console.error("[ASR] No result in response:", JSON.stringify(response.data).substring(0, 200));
      throw new Error("No ASR result in response");
    }

    return result;
  } catch (error: any) {
    if (error.message?.startsWith("ASR HTTP")) throw error;
    console.error("[ASR] Request failed:", error.message);
    throw error;
  }
}

let mockCallCount = 0;

function mockAsr(): string {
  const mockTexts = [
    "明天下午三点开会",
    "下周二上午十点和张总见面",
    "后天全天团建活动",
    "今天晚上八点健身",
  ];
  const text = mockTexts[mockCallCount % mockTexts.length];
  mockCallCount++;
  return text;
}
