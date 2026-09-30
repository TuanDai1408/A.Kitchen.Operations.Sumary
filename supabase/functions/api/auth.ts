// =========================================================================
// A.KITCHEN DASHBOARD - AUTHENTICATION & CORS
// =========================================================================

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function getEnv(key: string): string {
  // @ts-ignore: Deno global
  if (typeof Deno !== "undefined" && Deno.env) {
    // @ts-ignore: Deno global
    return Deno.env.get(key) || "";
  }
  // @ts-ignore: Node process
  if (typeof process !== "undefined" && process.env) {
    // @ts-ignore: Node process
    return process.env[key] || "";
  }
  return "";
}

const EXPECTED_TOKEN = getEnv("API_TOKEN") || "TRANTUANDAISIBAFOOD";

/**
 * Kiểm tra token gửi từ client so với API_TOKEN cấu hình
 */
export function verifyToken(providedToken?: string | null): boolean {
  if (!providedToken) return false;
  return providedToken.trim() === EXPECTED_TOKEN.trim();
}

/**
 * Tạo standard JSON response theo format envelope của Dashboard
 */
export function jsonResponse(data: any, status = 200, customHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...customHeaders,
    },
  });
}

/**
 * Phản hồi lỗi chuẩn
 */
export function errorResponse(message: string, status = 400) {
  return jsonResponse({
    status: "error",
    message,
    ok: false,
    success: false,
  }, status);
}
