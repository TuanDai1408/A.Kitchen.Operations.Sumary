// =========================================================================
// A.KITCHEN DASHBOARD - SUPABASE EDGE FUNCTION MAIN ROUTER
// Entry point: supabase functions deploy api --no-verify-jwt
// =========================================================================

// @ts-ignore: Deno runtime import
import { corsHeaders, verifyToken, jsonResponse, errorResponse } from "./auth.ts";
import { supabase } from "./lib/db.ts";
import { handleGetDataVersion, handleGetDashboardData } from "./handlers/dashboard.ts";
import { handleGetRevenueRawData, handleGetRevenueFoodCostData } from "./handlers/revenue.ts";
import { handleGetKeHoachData } from "./handlers/kehoach.ts";
import { handleGetWarehouseDashboardData } from "./handlers/warehouse.ts";
import { handleGetNutritionDashboardData } from "./handlers/nutrition.ts";

/**
 * Log access không chặn luồng chính (Fire and forget)
 */
function logAccess(action: string, token: string, params: any, req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";
    const userAgent = req.headers.get("user-agent") || "";
    supabase
      .from("access_log")
      .insert({
        action,
        token_used: token ? token.substring(0, 4) + "***" : "none",
        params,
        ip,
        user_agent: userAgent,
      })
      .then(() => {})
      .catch(() => {});
  } catch {
    // Không ném lỗi nếu logging thất bại
  }
}

// @ts-ignore: Deno.serve entry
Deno.serve(async (req: Request) => {
  // 1. Xử lý preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // 2. Parse Action & Token từ GET hoặc POST
  let action = url.searchParams.get("action") || "";
  let token = url.searchParams.get("token") || "";
  let bodyPayload: any = null;

  if (req.method === "POST") {
    try {
      const text = await req.text();
      if (text) {
        try {
          const jsonBody = JSON.parse(text);
          action = jsonBody.action || action;
          token = jsonBody.token || token;
          bodyPayload = jsonBody.payload || jsonBody;
        } catch {
          // Body không phải JSON
        }
      }
    } catch {
      // Bỏ qua lỗi đọc body
    }
  }

  // 3. Kiểm tra Token
  if (!verifyToken(token)) {
    return errorResponse("Unauthorized: Token không hợp lệ hoặc thiếu token", 401);
  }

  // Ghi log access
  logAccess(action, token, bodyPayload || Object.fromEntries(url.searchParams.entries()), req);

  // 4. Định tuyến theo Action
  try {
    let result: any = null;
    let cacheSeconds = 0;

    switch (action) {
      case "getDataVersion":
        result = await handleGetDataVersion();
        cacheSeconds = 5;
        break;

      case "getDashboardData":
        result = await handleGetDashboardData();
        cacheSeconds = 15;
        break;

      case "getRevenueRawData":
        result = await handleGetRevenueRawData();
        cacheSeconds = 30;
        break;

      case "getRevenueFoodCostData":
        result = await handleGetRevenueFoodCostData();
        cacheSeconds = 30;
        break;

      case "getKeHoachData": {
        const filters = url.searchParams.get("filters") || bodyPayload?.filters;
        result = await handleGetKeHoachData(filters);
        cacheSeconds = 30;
        break;
      }

      case "getWarehouseDashboardData":
        result = await handleGetWarehouseDashboardData();
        cacheSeconds = 30;
        break;

      case "getNutritionDashboardData":
        result = await handleGetNutritionDashboardData();
        cacheSeconds = 60;
        break;

      case "exportIncidents": {
        // Xuất danh sách sự cố
        result = {
          ok: true,
          name: (bodyPayload?.tenFile || "AK_SuCo_VanHanh") + ".json",
          downloadUrl: "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bodyPayload?.rows || [])),
        };
        break;
      }

      case "exportKeHoach": {
        // Xuất kế hoạch
        const rows = bodyPayload?.rows || [];
        const jsonStr = JSON.stringify(rows, null, 2);
        const base64Data = btoa(unescape(encodeURIComponent(jsonStr)));
        result = {
          ok: true,
          data: base64Data,
          name: (bodyPayload?.tenFile || "AK_SoSanhKeHoach") + ".json",
          mimeType: "application/json",
        };
        break;
      }

      default:
        return errorResponse(`Action không được hỗ trợ: "${action}"`, 404);
    }

    const headers: Record<string, string> = {};
    if (cacheSeconds > 0 && req.method === "GET") {
      headers["Cache-Control"] = `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`;
    }

    // Đóng gói response theo contract của Dashboard:
    // { status: 'ok', data: { ... } }
    return jsonResponse({
      status: "ok",
      data: result,
    }, 200, headers);

  } catch (err: any) {
    console.error(`Lỗi thực thi action ${action}:`, err);
    return errorResponse(err.message || "Lỗi máy chủ nội bộ", 500);
  }
});
