// =========================================================================
// Vercel Serverless Function handler for /api
// =========================================================================

import * as api from "../server-api.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let action = req.query.action;
  let token = req.query.token;
  let payload = null;

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch {}
    }
    action = body?.action || action;
    token = body?.token || token;
    payload = body?.payload || body;
  }

  const EXPECTED_TOKEN = process.env.API_TOKEN || "TRANTUANDAISIBAFOOD";
  if (!token || token.trim() !== EXPECTED_TOKEN.trim()) {
    return res.status(401).json({ status: "error", message: "Unauthorized: Invalid API token" });
  }

  try {
    let data;
    switch (action) {
      case "getDataVersion":
        data = await api.getDataVersion();
        break;
      case "getDashboardData":
        data = await api.getDashboardData();
        break;
      case "getRevenueRawData":
      case "getRevenueFoodCostData":
        data = await api.getRevenueRawData();
        break;
      case "getKeHoachData":
        data = await api.getKeHoachData(req.query.filters || payload?.filters);
        break;
      case "getWarehouseDashboardData":
        data = await api.getWarehouseDashboardData();
        break;
      case "getNutritionDashboardData":
        data = await api.getNutritionDashboardData();
        break;
      case "exportIncidents":
        data = {
          ok: true,
          name: (payload?.tenFile || "AK_SuCo_VanHanh") + ".json",
          downloadUrl: "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload?.rows || []))
        };
        break;
      case "exportKeHoach":
        data = {
          ok: true,
          data: Buffer.from(JSON.stringify(payload?.rows || [], null, 2)).toString("base64"),
          name: (payload?.tenFile || "AK_SoSanhKeHoach") + ".json",
          mimeType: "application/json"
        };
        break;
      default:
        return res.status(404).json({ status: "error", message: `Unknown action: ${action}` });
    }
    return res.json({ status: "ok", data });
  } catch (err) {
    console.error("Vercel API Error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}
