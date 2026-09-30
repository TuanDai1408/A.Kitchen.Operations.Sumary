# A.Kitchen Operations Dashboard — Backend Supabase & Static Web

Hệ thống Dashboard Vận hành, Doanh thu, Food Cost, Quản lý kho và Dinh dưỡng của **A.Kitchen (Tân Long Group)** chạy trên nền tảng **Supabase PostgreSQL & Edge Functions**, giao diện web tĩnh sẵn sàng triển khai lên **Vercel**.

---

## 🚀 Hướng Dẫn Triển Khai Nhanh (100% Qua Trình Duyệt Web, Không Cần Máy Local)

### Bước 1: Đưa Toàn Bộ Code Lên GitHub

1. Tạo một repository mới trên GitHub (ví dụ: `akitchen-dashboard`).
2. Tải toàn bộ file trong thư mục này lên GitHub:
   - Cách 1: Kéo thả trực tiếp file/thư mục qua nút **"Add file" > "Upload files"** trên giao diện web của GitHub.
   - Cách 2: Sử dụng GitHub Desktop hoặc Git command line nếu quen thuộc.

---

### Bước 2: Cấu Hình GitHub Secrets Để Tự Động Deploy Edge Function

Vào repository của bạn trên GitHub:
1. Bấm vào tab **Settings** > chọn **Secrets and variables** > **Actions**.
2. Bấm nút **New repository secret** và thêm 4 biến sau:

| Tên Secret | Giá trị | Nơi lấy / Mô tả |
|---|---|---|
| `SUPABASE_PROJECT_ID` | `alqcojnxshfylheovdgw` | Mã Reference ID của dự án Supabase |
| `API_TOKEN` | `TRANTUANDAISIBAFOOD` | Mã token bảo mật gọi API giữa Frontend & Backend |
| `SUPABASE_SERVICE_ROLE_KEY` | *(Service role key từ Supabase)* | Vào Supabase Dashboard: **Project Settings > API > Project API keys > service_role (secret)** |
| `SUPABASE_ACCESS_TOKEN` | *(Personal Access Token)* | Vào Supabase: [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) > **Generate new token** |

3. Sau khi thêm 4 secrets trên:
   - Vào tab **Actions** trên GitHub.
   - Chọn workflow **"Deploy Supabase Edge Function"**.
   - Bấm nút **Run workflow** > Edge Function `api` sẽ được tự động build và deploy lên Supabase!

---

### Bước 3: Triển Khai Frontend Lên Vercel

1. Đăng nhập vào [vercel.com](https://vercel.com).
2. Bấm nút **"Add New..."** > chọn **"Project"**.
3. Chọn repository GitHub bạn vừa tạo ở Bước 1.
4. Ở phần **Framework Preset**, giữ nguyên hoặc chọn **Other**.
5. Bấm nút **Deploy**.
6. Sau ~20 giây, Vercel sẽ cấp cho bạn một đường dẫn (URL) trực tuyến để xem Dashboard ngay lập tức!

---

## 📁 Cấu Trúc Dự Án

```
├── index.html                   # Giao diện chính Dashboard (Báo cáo, Doanh thu, Kho, Dinh dưỡng)
├── script.js                    # Logic hiển thị, bộ lọc, Chart.js & callAPI
├── style.css                    # Toàn bộ CSS phong cách A.Kitchen
├── auth-guard.js                # Kiểm soát đăng nhập
├── vercel.json                  # Cấu hình hosting tĩnh trên Vercel
├── .github/
│   └── workflows/
│       └── deploy-supabase.yml  # Tự động deploy Supabase Edge Function bằng GitHub Actions
└── supabase/
    ├── migrations/
    │   └── 01_schema.sql        # Cấu trúc 14 bảng PostgreSQL + Index + Trigger
    └── functions/
        └── api/
            ├── index.ts         # Router chính (GET / POST + CORS)
            ├── auth.ts          # Xác thực token TRANTUANDAISIBAFOOD & envelope JSON
            ├── handlers/
            │   ├── dashboard.ts # getDataVersion, getDashboardData (Báo cáo vận hành)
            │   ├── revenue.ts   # getRevenueRawData, getRevenueFoodCostData (Doanh thu & Tiêu hủy SACN)
            │   ├── kehoach.ts   # getKeHoachData (So sánh thực tế vs kế hoạch)
            │   ├── warehouse.ts # getWarehouseDashboardData (Quản lý kho SLoc)
            │   └── nutrition.ts # getNutritionDashboardData (Dinh dưỡng suất ăn)
            └── lib/
                ├── db.ts        # Supabase Client kết nối bằng Service Role qua Env
                ├── transform.ts # Chuẩn hóa số liệu, heatmap vấn đề & trọng số
                └── nguong.ts    # Hằng số ngưỡng cảnh báo
```

---

## 🔒 Quy Chuẩn Bảo Mật & Contract API

- **Không hardcode Secret Key**: Khóa `service_role` chỉ được truyền qua biến môi trường của Edge Function.
- **Contract Envelope**: Mọi API trả về đúng chuẩn:
  ```json
  {
    "status": "ok",
    "data": { ... }
  }
  ```
- **Tốc độ phản hồi**: Tối ưu hóa truy vấn song song (`Promise.all`), cache `Cache-Control` ngắn cho các báo cáo lớn và Index trên các cột ngày, site, billing_date.
