import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as api from './server-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: true }));

// Handle API requests
async function handleApiRequest(req, res) {
  let action = req.query.action;
  let token = req.query.token;
  let payload = null;

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
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
      case 'getDataVersion':
        data = await api.getDataVersion();
        break;
      case 'getDashboardData':
        data = await api.getDashboardData();
        break;
      case 'getRevenueRawData':
      case 'getRevenueFoodCostData':
        data = await api.getRevenueRawData();
        break;
      case 'getKeHoachData':
        data = await api.getKeHoachData(req.query.filters || payload?.filters);
        break;
      case 'getWarehouseDashboardData':
        data = await api.getWarehouseDashboardData();
        break;
      case 'getNutritionDashboardData':
        data = await api.getNutritionDashboardData();
        break;
      case 'exportIncidents':
        data = {
          ok: true,
          name: (payload?.tenFile || "AK_SuCo_VanHanh") + ".json",
          downloadUrl: "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload?.rows || []))
        };
        break;
      case 'exportKeHoach':
        data = {
          ok: true,
          data: Buffer.from(JSON.stringify(payload?.rows || [], null, 2)).toString('base64'),
          name: (payload?.tenFile || "AK_SoSanhKeHoach") + ".json",
          mimeType: "application/json"
        };
        break;
      default:
        return res.status(404).json({ status: "error", message: `Unknown action: ${action}` });
    }
    return res.json({ status: "ok", data });
  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}

app.all('/api', handleApiRequest);
app.all('/functions/v1/api', handleApiRequest);

// Serve static assets from the current directory
app.use(express.static(__dirname));

// Fallback to index.html for SPA/client-side navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
