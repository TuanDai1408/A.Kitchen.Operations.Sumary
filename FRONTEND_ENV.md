# Hướng Dẫn Cấu Hình Frontend A.Kitchen sang Supabase Backend

Chuyển backend từ Google Apps Script sang Supabase Edge Functions **chỉ cần đổi duy nhất 1 dòng** trong file `script.js`:

### 1. Thay đổi trong `script.js` (dòng 5–8)

Tìm dòng:
```javascript
const API_URL = 'https://script.google.com/macros/s/AKfycbxXcbL4E-Cd61jvIQSK05zX4aq3-SCwKWm3o-De7hX5SkvDDA6PfYMu9O3gGONWJ_tiNg/exec';
```

Thay bằng:
```javascript
const API_URL = 'https://<project-ref>.supabase.co/functions/v1/api';
```

*(Thay `<project-ref>` bằng Reference ID của dự án Supabase của bạn)*

> **Lưu ý**: Giữ nguyên `const API_TOKEN = 'TRANTUANDAISIBAFOOD';` vì Edge Function đã cấu hình so khớp với token này.

---

### 2. Triển khai Supabase Edge Function

1. **Khởi tạo và liên kết dự án Supabase**:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```

2. **Chạy Migration tạo cơ sở dữ liệu**:
   ```bash
   npx supabase db push
   # hoặc chạy trực tiếp nội dung file supabase/migrations/01_schema.sql trong Supabase SQL Editor
   ```

3. **Cấu hình Environment Secrets cho Edge Function**:
   ```bash
   npx supabase secrets set API_TOKEN=TRANTUANDAISIBAFOOD
   # SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY tự động có sẵn trong môi trường Supabase Edge Functions
   ```

4. **Deploy Edge Function**:
   ```bash
   npx supabase functions deploy api --no-verify-jwt
   ```
   *(Cờ `--no-verify-jwt` là bắt buộc vì hàm tự kiểm tra token `API_TOKEN` từ request của frontend).*
