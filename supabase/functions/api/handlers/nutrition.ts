// =========================================================================
// A.KITCHEN DASHBOARD - NUTRITION (DINH DƯỠNG SUẤT ĂN) HANDLER
// Action: getNutritionDashboardData
// =========================================================================

import { supabase } from "../lib/db.ts";

export async function handleGetNutritionDashboardData(): Promise<any> {
  const [nutriRes, menuRes] = await Promise.all([
    supabase
      .from("dinhduong_100g")
      .select("*")
      .order("ten_mon", { ascending: true }),

    supabase
      .from("menu_dinhduong")
      .select("*")
      .order("id", { ascending: true }),
  ]);

  if (nutriRes.error) {
    throw new Error(`Lỗi truy vấn dinhduong_100g: ${nutriRes.error.message}`);
  }

  const rawNutri = nutriRes.data || [];
  const rawMenu = menuRes.data || [];

  // Tạo map tên món -> nhóm món
  const catMap: Record<string, string> = {};
  const nutriDb = rawNutri.map((n: any) => {
    const name = n.ten_mon || n.name;
    const category = n.loai_mon || n.category || "Món mặn";
    catMap[name] = category;

    return {
      name,
      category,
      kcal: Number(n.kcal_100g !== undefined ? n.kcal_100g : (n.kcal || 0)),
      protein: Number(n.protein_100g !== undefined ? n.protein_100g : (n.protein || 0)),
      fat: Number(n.fat_100g !== undefined ? n.fat_100g : (n.fat || 0)),
      carb: Number(n.carb_100g !== undefined ? n.carb_100g : (n.carb || 0)),
      fiber: Number(n.chat_xo_100g !== undefined ? n.chat_xo_100g : (n.fiber || 0)),
    };
  });

  // Gom menu_dinhduong theo (thu, ca, ten_san_pham)
  const mealMap = new Map<string, { dayLabel: string; ca: string; dishLabel: string; components: any[] }>();

  rawMenu.forEach((m: any) => {
    const dayLabel = m.thu || m.day_label || "Thứ Hai";
    const ca = m.ca || "Trưa";
    const dishLabel = m.ten_san_pham || m.dish_label || "Suất ăn";
    const key = `${dayLabel}|${ca}|${dishLabel}`;

    if (!mealMap.has(key)) {
      mealMap.set(key, {
        dayLabel,
        ca,
        dishLabel,
        components: [],
      });
    }

    const meal = mealMap.get(key)!;
    const name = m.thanh_phan || m.name || "";
    if (name) {
      meal.components.push({
        name,
        category: catMap[name] || "Món mặn",
        qty: Number(m.khoi_luong_g !== undefined ? m.khoi_luong_g : (m.qty || 100)),
      });
    }
  });

  const weekPlan = Array.from(mealMap.values());

  return {
    success: true,
    weekPlan,
    nutriDb,
  };
}
