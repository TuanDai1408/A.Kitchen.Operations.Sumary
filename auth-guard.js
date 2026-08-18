/**
 * =========================================================
 * AUTH GUARD — Đoạn code thêm vào ĐẦU script.js của mỗi Dashboard con
 * =========================================================
 * 
 * CÁCH DÙNG:
 *   1. Copy toàn bộ nội dung file này
 *   2. Paste vào ĐẦU file script.js của dashboard (trước mọi code khác)
 *   3. Sửa 2 hằng số: PORTAL_URL và DASHBOARD_NAME
 *   4. Đảm bảo code load dữ liệu chính được gọi BÊN TRONG hàm startDashboard()
 *
 * LUỒNG HOẠT ĐỘNG:
 *   - Đọc token + email từ URL query params (?token=...&email=...)
 *   - Nếu thiếu → redirect về Portal
 *   - Gọi API verifyDashboardAccess (POST lên Gatekeeper API)
 *   - Nếu valid = false → hiện thông báo lỗi, redirect về Portal sau 4 giây
 *   - Nếu valid = true → lưu vào sessionStorage, gọi startDashboard()
 *   - Khi reload (F5): đọc từ sessionStorage, verify lại → không mất phiên
 * =========================================================
 */

// ===== CẤU HÌNH — SỬA CHO TỪNG DASHBOARD =====
const PORTAL_URL = 'https://a-kitchen-dashboard-portal.vercel.app'; // ← URL portal
const GATEKEEPER_API_URL = 'https://script.google.com/macros/s/AKfycbx4rzDP4ore6ucJaTsGTs5-JKWH6500lB3fS4KPUCinnGTkq5ExrEaiXpUZFv7L8dsN/exec'; // ← URL Gatekeeper API
const DASHBOARD_NAME = 'A.Kitchen • Dashboard Vận Hành'; // ← Tên khớp với sheet Permissions
const AUTH_SESSION_KEY = 'dashboard_auth';

// ===== AUTH GUARD — Chạy tự động khi load trang =====
(async function authGuard() {
  try {
    // Bước 1: Đọc token + email từ URL hoặc sessionStorage
    const urlParams = new URLSearchParams(window.location.search);
    let token = urlParams.get('token');
    let email = urlParams.get('email');

    // Nếu có trong URL → lưu vào sessionStorage (để F5 không mất)
    if (token && email) {
      sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ token, email }));
      // Xóa query params khỏi URL (cho sạch, không lộ token trên thanh địa chỉ)
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    } else {
      // Thử đọc từ sessionStorage (trường hợp user reload trang)
      const stored = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        token = parsed.token;
        email = parsed.email;
      }
    }

    // Bước 2: Nếu không có token hoặc email → redirect về Portal
    if (!token || !email) {
      console.log('Auth Guard: Thiếu token/email → redirect về Portal');
      window.location.href = PORTAL_URL;
      return;
    }

    // Bước 3: Gọi API verify quyền truy cập
    const res = await fetch(GATEKEEPER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'verifyDashboardAccess',
        sessionToken: token,
        dashboardName: DASHBOARD_NAME
      })
    });
    const result = await res.json();

    // Bước 4: Xử lý kết quả
    if (!result.valid) {
      console.log('Auth Guard: Không có quyền -', result.reason);
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      _showAccessDenied(result.reason || 'Bạn không có quyền truy cập dashboard này.');
      return;
    }

    // Bước 5: Xác thực thành công → tiếp tục load dashboard
    console.log('Auth Guard: Xác thực thành công cho', email);
    
    // Gọi hàm khởi động dashboard chính (định nghĩa trong code gốc của dashboard)
    if (typeof startDashboard === 'function') {
      startDashboard();
    } else if (typeof loadAllData === 'function') {
      loadAllData();
    } else if (typeof loadData === 'function') {
      loadData();
    } else {
      console.log('Auth Guard: Không tìm thấy hàm khởi động dashboard. Kiểm tra lại code.');
    }

  } catch (err) {
    console.log('Auth Guard error:', err);
    _showAccessDenied('Lỗi xác thực: ' + err.message);
  }
})();

// Hiện thông báo không có quyền + redirect về Portal
function _showAccessDenied(message) {
  // Tạo overlay che toàn bộ trang
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:system-ui,sans-serif;';
  overlay.innerHTML = `
    <div style="text-align:center;max-width:400px;padding:40px;">
      <div style="font-size:3rem;margin-bottom:16px;">🔒</div>
      <h2 style="color:#1F2A22;font-size:1.3rem;margin-bottom:12px;">Không có quyền truy cập</h2>
      <p style="color:#5a5a5a;font-size:.9rem;line-height:1.6;margin-bottom:24px;">${message}</p>
      <p style="color:#8a8a8a;font-size:.8rem;">Đang chuyển về Cổng Dashboard trong <span id="_authCountdown">4</span> giây...</p>
      <a href="${PORTAL_URL}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#25402F;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:.85rem;">← Về Cổng Dashboard</a>
    </div>
  `;
  document.body.appendChild(overlay);

  // Countdown redirect
  let sec = 4;
  const countEl = overlay.querySelector('#_authCountdown');
  const timer = setInterval(function() {
    sec--;
    if (countEl) countEl.textContent = sec;
    if (sec <= 0) {
      clearInterval(timer);
      window.location.href = PORTAL_URL;
    }
  }, 1000);
}
