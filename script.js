/* =========================================================================
   API CONFIGURATION
   Thay thế URL và TOKEN bằng giá trị thật từ Apps Script Web App
   ========================================================================= */
//const API_URL = 'https://script.google.com/macros/s/AKfycbx6v9BuTauEhRuA3HGWtZhbfxdC3zX3kCSHyU1ACaTO-Lf7es8LR1zPiqHj7a_-1OGg2g/exec';
//const API_URL = 'https://script.google.com/macros/s/AKfycbyzOmnfiG6Tt0AoEkJo5qq3Hg7UYrpVeEZnt5m7kE4aKiWdFE1yHOXN-eRWelnxjEtsUw/exec';
const API_URL = 'https://script.google.com/macros/s/AKfycbxXcbL4E-Cd61jvIQSK05zX4aq3-SCwKWm3o-De7hX5SkvDDA6PfYMu9O3gGONWJ_tiNg/exec';
const API_TOKEN = 'TRANTUANDAISIBAFOOD';

// Professional donut chart palette - high contrast, accessible
const DONUT_PALETTE = ['#2563EB', '#DC2626', '#16A34A', '#F59E0B', '#7C3AED', '#EC4899', '#0891B2', '#84CC16', '#F97316', '#6366F1'];

async function callAPI(action, extraParams) {
  try {
    let url = `${API_URL}?action=${encodeURIComponent(action)}&token=${encodeURIComponent(API_TOKEN)}`;
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        if (value !== null && value !== undefined) {
          url += `&${encodeURIComponent(key)}=${encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : value)}`;
        }
      }
    }
    const response = await fetch(url);
    const json = await response.json();
    if (json.status === 'error') throw new Error(json.message || 'API error');
    return json.data;
  } catch (err) {
    console.log('API call failed:', action, err);
    throw err;
  }
}

async function callPostAPI(action, payload) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: action, token: API_TOKEN, payload: payload })
    });
    const json = await response.json();
    if (json.status === 'error') throw new Error(json.message || 'API error');
    return json.data;
  } catch (err) {
    console.log('POST API call failed:', action, err);
    throw err;
  }
}

/* =========================================================================
   STATE & CONSTANT
   ========================================================================= */
var RAW = [];            // toàn bộ dòng từ sheet Report
var SITES = [];          // danh sách tên site
var DATES = [];          // danh sách ngày có dữ liệu
var NGUONG = { thatThoatPct:2, vangPct:15, phutTre:30 };
var TAB = 'overview';
var SEL_SITE = '';       // site đang xem ở tab chi tiết
var CHARTS = {};         // instance Chart.js theo id canvas
var VERSION = '';        // dấu hiệu dữ liệu mới
var NGUOI = [];          // danh sách người báo cáo (cho dropdown)
var F = { from:'', to:'', sites:[], nguoi:'', q:'' };
// var UI = { lineMode:'total', rankMetric:'tre', incLoai:'', incMucDo:'', expanded:'' };
var UI = { lineMode:'total', rankMetric:'thatthoat', incLoai:'', incMucDo:'', expanded:'' };

/* ---- STATE RIÊNG CHO TAB DOANH THU & FOOD COST ---- */
var REV = null;                 // payload từ getRevenueFoodCostData()
var REV_LOADING = false;
var REV_INIT = false;           // đã nạp dropdown filter lần đầu chưa
var RF = { from:'', to:'', sites:[], kenh:'', nhomSP:'', nvkd:'', khachHang:'' };
var REV_RAW = null;   // payload từ getRevenueRawData (rows + dims + opex + huy)
//var RUI = { drillSite:'', mixDim:'nhomSP', trendMetric:'net', periodGran:'month' };
var RUI = { drillSite:'', mixDim:'nhomSP', trendMetric:'net', periodGran:'month', barDim:'khachHang' };
// barDim: 'khachHang' (default) | 'site'

/* ---- STATE RIÊNG CHO TAB SO SÁNH KẾ HOẠCH ---- */
var KH = null;                  // payload từ getKeHoachData()
var KH_LOADING = false;
var KH_INIT = false;            // đã nạp dropdown site lần đầu chưa
var PF = { gran:'month', nPeriods:24, site:'' };   // site='' nghĩa là cộng dồn tất cả
// var KHUI = { metric:'DoanhThu' };
var KHUI = { metric:'DoanhThu', expanded:{}, duAnOpen:false, thamSoOpen:false };
var C = { brand:'#7A1F2B', dark:'#5E141E', light:'#9B3543', gold:'#C9A227', orange:'#D98C4A', gray:'#9AA0A6' };
var PALETTE = [C.brand, C.gold, C.light, C.dark, C.orange, C.gray];
var MUCDO_COLOR = { 'Thấp':'#16A34A', 'Trung bình':'#C9A227', 'Cao':'#EA580C',
                    'Nghiêm trọng':'#7A1F2B', 'Chưa phân loại':'#9AA0A6' };
var MUCDO_RANK  = { 'Thấp':1, 'Trung bình':2, 'Cao':3, 'Nghiêm trọng':4, 'Chưa phân loại':0 };
var LOAI_SU_CO  = ['Thiết bị','Nhân sự','NVL','Khiếu nại','Chi phí','Giao trễ'];

// Thang màu heatmap 4 bậc. Màu bão hòa đủ để phân biệt rõ khi nhìn nhanh,
// mỗi bậc có viền đậm hơn nền để ô không bị "trôi" vào nền trắng.
var HEAT = [
  { ten:'Bình thường',  moc:'0đ',   bg:'#86E0A6', bd:'#3FA968', fg:'#14532D' },
  { ten:'Cần lưu ý',    moc:'1-2đ', bg:'#FFD84D', bd:'#D4A017', fg:'#713F12' },
  { ten:'Có vấn đề',    moc:'3-5đ', bg:'#FF9147', bd:'#D9631A', fg:'#7C2D12' },
  { ten:'Nghiêm trọng', moc:'≥6đ',  bg:'#E0384B', bd:'#A81026', fg:'#FFFFFF' }
];

/* ---------- ICON (SVG inline, không phụ thuộc CDN) ---------- */
var IC = {
  meal:'M3 2v7a3 3 0 006 0V2M6 12v10M15 2c-1.5 2-1.5 5 0 7 1 1.3 2 1.7 2 3v10',
  clock:'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  trash:'M3 6h18M8 6V4h8v2M5 6l1 15h12l1-15M10 11v6M14 11v6',
  percent:'M19 5L5 19M6.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  userx:'M15 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M8.5 3a4 4 0 100 8 4 4 0 000-8zM17 8l5 5M22 8l-5 5',
  smile:'M12 3a9 9 0 100 18 9 9 0 000-18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  wallet:'M19 7V5a2 2 0 00-2-2H5a2 2 0 000 4h15a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5M16 13h.01',
  line:'M3 3v18h18M7 15l4-5 4 3 5-7',
  bars:'M3 3v18h18M7 16v-5M12 16V8M17 16v-3',
  stack:'M3 3v18h18M7 17v-4M7 13V9M12 17v-6M12 11V7M17 17v-3M17 14v-4',
  warn:'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  grid:'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',
  siren:'M7 18v-6a5 5 0 0110 0v6M5 21h14M12 2v2M4.9 6.1l1.4 1.4M19.1 6.1l-1.4 1.4',
  user:'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z',
  table:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
  bulb:'M9 18h6M10 22h4M8 14a6 6 0 118 0c-1 1-1.5 2-1.5 3h-5C9.5 16 9 15 8 14z',
  image:'M3 3h18v18H3zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5L5 21',
  up:'M22 7l-8.5 8.5-4-4L2 19M16 7h6v6',
  down:'M22 17l-8.5-8.5-4 4L2 5M16 17h6v-6',
  msg:'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z M12 7v4M12 14h.01'
};
function svg(p, sz, col){
  sz = sz || 16;
  return '<svg viewBox="0 0 24 24" width="'+sz+'" height="'+sz+'" fill="none" stroke="'+(col||'currentColor')+
    '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
    p.split('M').filter(function(s){return s;}).map(function(s){return '<path d="M'+s+'"/>';}).join('')+'</svg>';
}

/* ---------- FORMAT ---------- */
/** "yyyy-MM-dd HH:mm:ss" hoặc ISO → "07/08/2026 11:48:22" */
function fmtUpdatedAt(s){
  if (!s) return '—';
  var str = String(s).trim();
  // yyyy-MM-dd HH:mm:ss | yyyy-MM-ddTHH:mm:ss
  var m = str.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return m[3]+'/'+m[2]+'/'+m[1]+' '+m[4]+':'+m[5]+(m[6]?':'+m[6]:'');
  // đã dạng dd/MM/yyyy ...
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) return str;
  return str;
}

function liveLabel(updatedAt){
  return 'Dữ liệu được cập nhật lúc ' + fmtUpdatedAt(updatedAt);
}

function fmt(n){ return (Math.round(n||0)).toLocaleString('vi-VN'); }
function fmtVND(n){ return fmt(n)+'₫'; }
function pct(a,b){ return b>0 ? (a/b)*100 : 0; }
function r1(n){ return Math.round(n*10)/10; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function dm(d){ return String(d||'').slice(5); }   // yyyy-MM-dd -> MM-dd

// Cộng/trừ ngày trên chuỗi yyyy-MM-dd.
// Dùng Date.UTC để tránh lệch 1 ngày: new Date("...T00:00:00") là giờ local,
// khi .toISOString() sẽ bị trừ đi offset (+07 của VN) và nhảy về ngày trước.
function addDays(s, n){
  var p = String(s).split('-');
  var d = new Date(Date.UTC(+p[0], +p[1]-1, +p[2]));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0,10);
}

function toast(msg){
  var t=document.getElementById('toast'); t.textContent=msg; t.classList.add('on');
  clearTimeout(t._h); t._h=setTimeout(function(){t.classList.remove('on');},2200);
}

/* =========================================================================
   TOOLTIP TOÀN CỤC
   Một thẻ #akTip position:fixed gắn ở body -> không bị overflow của bảng cắt.
   Tự lật hướng (trên/dưới/trái/phải) và kẹp lại khi sát mép màn hình.
   ========================================================================= */
var TIP_GAP = 10;   // khoảng cách từ tooltip tới phần tử

function tipShow(el){
  var txt = el.getAttribute('data-tip');
  if (!txt) return;
  var tip = document.getElementById('akTip');
  tip.textContent = txt;
  tip.className = 'on';                 // hiện trước để đo được kích thước thật

  var r  = el.getBoundingClientRect();
  var tw = tip.offsetWidth, th = tip.offsetHeight;
  var vw = window.innerWidth, vh = window.innerHeight;

  // Ưu tiên đặt phía trên; không đủ chỗ thì xuống dưới; vẫn chật thì sang cạnh
  var pos, top, left;
  if (r.top - th - TIP_GAP >= 4){
    pos = 'pos-top';    top = r.top - th - TIP_GAP;
  } else if (r.bottom + th + TIP_GAP <= vh - 4){
    pos = 'pos-bottom'; top = r.bottom + TIP_GAP;
  } else if (r.left - tw - TIP_GAP >= 4){
    pos = 'pos-left';   top = r.top + r.height/2 - th/2; left = r.left - tw - TIP_GAP;
  } else {
    pos = 'pos-right';  top = r.top + r.height/2 - th/2; left = r.right + TIP_GAP;
  }

  if (left === undefined) left = r.left + r.width/2 - tw/2;   // canh giữa theo chiều ngang

  // Kẹp trong vùng nhìn thấy
  var maxL = vw - tw - 6, maxT = vh - th - 6;
  var clampedL = Math.max(6, Math.min(left, maxL));
  top = Math.max(6, Math.min(top, maxT));

  // Mũi nhọn phải trỏ đúng vào phần tử dù tooltip đã bị kẹp lệch
  if (pos === 'pos-top' || pos === 'pos-bottom'){
    var ax = r.left + r.width/2 - clampedL;
    tip.style.setProperty('--ax', Math.max(9, Math.min(ax, tw - 9)) + 'px');
  } else {
    tip.style.removeProperty('--ax');
  }

  tip.className = 'on ' + pos;
  tip.style.left = clampedL + 'px';
  tip.style.top  = top + 'px';
}

function tipHide(){
  var tip = document.getElementById('akTip');
  if (tip) tip.className = '';
}

// Gắn 1 lần ở document: hoạt động cho cả nội dung render lại sau này
function initTooltip(){
  document.addEventListener('mouseover', function(e){
    var el = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (el) tipShow(el);
  });
  document.addEventListener('mouseout', function(e){
    var el = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (el) tipHide();
  });
  // Cuộn/đổi cỡ cửa sổ thì ẩn đi, tránh tooltip lơ lửng sai vị trí
  window.addEventListener('scroll', tipHide, true);
  window.addEventListener('resize', tipHide);
}

/* =========================================================================
   LỌC & TỔNG HỢP (chạy phía client -> đổi bộ lọc là thấy ngay)
   ========================================================================= */
function applyFilter(rows){
  var q = (F.q||'').trim().toLowerCase();
  return rows.filter(function(r){
    if (F.from && r.ngayBaoCao < F.from) return false;
    if (F.to   && r.ngayBaoCao > F.to)   return false;
    if (F.sites.length && F.sites.indexOf(r.tenSite) < 0) return false;
    if (F.nguoi && r.nguoiBaoCao !== F.nguoi) return false;
    // Ô tìm kiếm giờ chỉ soát trong nội dung đề xuất/kiến nghị
    if (q && String(r.deXuat||'').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}

// Kỳ trước: cùng độ dài, liền kề phía trước -> dùng để tính % thay đổi
function prevPeriod(rows){
  if (!F.from || !F.to) return [];
  var days = Math.round((new Date(F.to) - new Date(F.from))/86400000) + 1;
  var pTo = addDays(F.from, -1), pFrom = addDays(pTo, -(days-1));
  return rows.filter(function(r){
    if (r.ngayBaoCao < pFrom || r.ngayBaoCao > pTo) return false;
    if (F.sites.length && F.sites.indexOf(r.tenSite) < 0) return false;
    if (F.nguoi && r.nguoiBaoCao !== F.nguoi) return false;   // giữ cùng điều kiện để so sánh đúng
    return true;
  });
}

function agg(rows){
  var a = { tongSuat:0,sang:0,trua:0,chieu:0,nv:0,huy:0,soGiaoTre:0,thatThoat:0,
            coMat:0,vang:0,kn:0,khen:0,dem:0, siteCP:{} };
  rows.forEach(function(r){
    a.tongSuat+=r.tongSuat; a.sang+=r.suatSang; a.trua+=r.suatTrua; a.chieu+=r.suatChieu;
    a.nv+=r.suatNhanVien; a.huy+=r.suatHuy;
    if (r.giaoTre) a.soGiaoTre++;
    a.thatThoat+=r.soThatThoat; a.coMat+=r.nsCoMat; a.vang+=r.nsVang;
    a.kn+=r.soKhieuNai; a.khen+=r.soKhenNgoi; a.dem++;
    if (r.coChiPhiNgoai) a.siteCP[r.tenSite]=1;
  });
  a.soSiteCP = Object.keys(a.siteCP).length;
  return a;
}

// Gom sự cố của 1 dòng thành nhiều bản ghi phẳng
function incidentsOf(r){
  var out = [];
  if (r.suCoThietBi)  out.push({loai:'Thiết bị',  mucDo:'Cao',          chiTiet:r.suCoThietBi});
  if (r.suCoNhanSu)   out.push({loai:'Nhân sự',   mucDo:'Trung bình',   chiTiet:r.suCoNhanSu});
  if (r.nvlBatThuong) out.push({loai:'NVL',       mucDo:'Trung bình',   chiTiet:r.tinhTrangNVL});
  if (r.soKhieuNai>0) out.push({loai:'Khiếu nại', mucDo:normMucDo(r.mucDoNghiemTrong),
                                chiTiet:(r.phanLoaiKN?r.phanLoaiKN+' – ':'')+
                                        (r.chiTietYKien||('Số lượng: '+r.soKhieuNai))});
  if (r.coChiPhiNgoai)out.push({loai:'Chi phí',   mucDo:'Trung bình',
                                chiTiet:r.lyDoChiPhi+(r.soTienChiPhi?' ('+fmtVND(r.soTienChiPhi)+')':'')});
  if (r.giaoTre)      out.push({loai:'Giao trễ',  mucDo:r.phutTre>NGUONG.phutTre?'Cao':'Thấp',
                                chiTiet:'Trễ '+(r.phutTre||'')+(r.phutTre?'\' ':'')+(r.lyDoTre||r.gioGiaoRaw)});
  return out.map(function(o,i){
    o.id=r.id+'-'+i; o.tenSite=r.tenSite; o.ngay=r.ngayBaoCao; o.nguoiBaoCao=r.nguoiBaoCao; return o;
  });
}

function siteListNow(){ return F.sites.length ? F.sites.slice() : SITES.slice(); }

/* ---------- Chart.js helper ---------- */
function destroyChart(id){ if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; } }
function ctxOf(id){ var el=document.getElementById(id); return el ? el.getContext('2d') : null; }

// Style tooltip dùng chung: nền tối, chữ rõ, canh trái, không dính con trỏ
var TIP_STYLE = {
  enabled:true,
  backgroundColor:'rgba(38,38,38,.94)',
  titleColor:'#fff', titleFont:{size:12.5, weight:'700'}, titleMarginBottom:7,
  bodyColor:'#F0F0F0', bodyFont:{size:12}, bodySpacing:5,
  padding:{top:10,right:13,bottom:10,left:11},
  cornerRadius:7, displayColors:true, boxWidth:9, boxHeight:9, boxPadding:5,
  usePointStyle:true, borderColor:'rgba(201,162,39,.35)', borderWidth:1,
  caretSize:6, caretPadding:8
};

var BASE_OPT = {
  responsive:true, maintainAspectRatio:false,
  // 'index' + intersect:false => trỏ vào bất kỳ đâu theo chiều dọc là hiện
  // tooltip của cả cột ngày đó, không cần trúng chính xác điểm
  interaction:{ mode:'index', intersect:false, axis:'x' },
  hover:{ mode:'index', intersect:false },
  plugins:{
    legend:{ labels:{ font:{size:11}, boxWidth:12, usePointStyle:true, padding:14 } },
    tooltip: TIP_STYLE
  },
  layout:{ padding:{ top:4, right:8, bottom:0, left:0 } },
  scales:{ x:{ ticks:{font:{size:10}}, grid:{display:false} },
           y:{ ticks:{font:{size:10}}, grid:{color:'#F0F0F0'}, beginAtZero:true } }
};

function cloneOpt(extra){
  var o = JSON.parse(JSON.stringify(BASE_OPT));
  if (extra) Object.keys(extra).forEach(function(k){ o[k] = extra[k]; });
  return o;
}

// Vẽ đường dọc mảnh tại vị trí hover -> dễ đối chiếu ngày trên trục X
var crosshair = {
  id:'akCrosshair',
  afterDraw:function(chart){
    // Chỉ vẽ crosshair cho chart có trục Y dọc (line/bar dọc).
    // Doughnut/pie hoặc bar ngang không có scales.y -> bỏ qua để tránh lỗi.
    var ya = chart.scales && chart.scales.y;
    if (!ya || chart.options.indexAxis === 'y') return;
    var act = chart.tooltip && chart.tooltip.getActiveElements
      ? chart.tooltip.getActiveElements() : [];
    if (!act.length) return;
    var x = act[0].element.x;
    var c = chart.ctx;
    c.save();
    c.beginPath();
    c.moveTo(x, ya.top); c.lineTo(x, ya.bottom);
    c.lineWidth = 1; c.strokeStyle = 'rgba(122,31,43,.28)';
    c.setLineDash([4,3]); c.stroke();
    c.restore();
  }
};
if (typeof Chart !== 'undefined' && Chart.register) Chart.register(crosshair);

/* =========================================================================
   TAB 1 - TỔNG QUAN
   ========================================================================= */
function kpiCard(icon, label, value, sub, delta, deltaGood, accent){
  accent = accent || C.brand;
  var dHtml = '';
  if (delta !== null && delta !== undefined && !isNaN(delta) && delta !== 0){
    var up = delta > 0;
    var good = (up === deltaGood);
    dHtml = '<div class="kpi-d '+(good?'up':'down')+'">'+svg(up?IC.up:IC.down,13)+
            Math.abs(delta)+'% <span style="color:#B0B0B0;font-weight:400">so kỳ trước</span></div>';
  }
  return '<div class="kpi" style="border-left-color:'+accent+'">'+
      '<div class="kpi-top"><div>'+
        '<div class="kpi-lb">'+esc(label)+'</div>'+
        '<div class="kpi-v">'+value+'</div>'+
        (sub?'<div class="kpi-sub">'+esc(sub)+'</div>':'')+
      '</div>'+
      '<div class="kpi-ic" style="background:'+accent+'14;color:'+accent+'">'+svg(icon,19)+'</div>'+
    '</div>'+dHtml+'</div>';
}

function cardHead(icon, title, right){
  return '<div class="card-t"><h3>'+svg(icon,15,C.brand)+esc(title)+'</h3>'+(right||'')+'</div>';
}

function renderOverview(){
  var rows = applyFilter(RAW);
  var prev = prevPeriod(RAW);
  var a = agg(rows), p = agg(prev);
  var sl = siteListNow();

  // ---- KPI: tính tỷ lệ theo đúng định nghĩa nghiệp vụ ----
  var dungGio  = r1(100 - pct(a.soGiaoTre, a.dem));            // % giao đúng giờ
  var pDungGio = r1(100 - pct(p.soGiaoTre, p.dem));
  var ttPct    = r1(pct(a.thatThoat, a.tongSuat));             // % thất thoát / sản lượng
  var pTtPct   = r1(pct(p.thatThoat, p.tongSuat));
  var vangPct  = r1(pct(a.vang, a.coMat + a.vang));            // % vắng mặt
  var pVangPct = r1(pct(p.vang, p.coMat + p.vang));
  // Tỷ lệ khiếu nại = số NGÀY có khiếu nại / tổng số NGÀY có báo cáo (giao dịch)
  var ngayKN = function(rs){
    var coKN = {}, tong = {};
    rs.forEach(function(r){
      if (!r.ngayBaoCao) return;
      tong[r.ngayBaoCao] = 1;
      if (coPhanAnh(r)) coKN[r.ngayBaoCao] = 1;
    });
    return { co: Object.keys(coKN).length, tong: Object.keys(tong).length };
  };
  var knNow = ngayKN(rows), knPrev = ngayKN(prev);
  var knPct  = r1(pct(knNow.co, knNow.tong));                 // % ngày có khiếu nại
  var pKnPct = r1(pct(knPrev.co, knPrev.tong));
  var d = function(c, pr){ return pr > 0 ? r1(((c - pr)/pr)*100) : null; };

  var html = '<div class="fade">';

  html += '<div class="grid g6">'+
    kpiCard(IC.meal,  'Tổng suất ăn đã xuất', fmt(a.tongSuat), a.dem+' lượt báo cáo', d(a.tongSuat,p.tongSuat), true,  C.brand)+
    kpiCard(IC.clock, 'Tỷ lệ giao đúng giờ',  dungGio+'%',     a.soGiaoTre+' lượt trễ', d(dungGio,pDungGio),    true,  C.gold)+
    kpiCard(IC.trash, 'Suất dư / thất thoát', fmt(a.thatThoat),ttPct+'% trên sản lượng', d(ttPct,pTtPct),       false, C.light)+
    kpiCard(IC.userx, 'Tỷ lệ vắng mặt NS',    vangPct+'%',     a.vang+' lượt vắng',     d(vangPct,pVangPct),    false, C.dark)+
    kpiCard(IC.msg,   'Tỷ lệ khiếu nại',      knPct+'%',       knNow.co+' ngày có KN / '+knNow.tong+' ngày báo cáo', d(knPct,pKnPct), false, C.light)+
    kpiCard(IC.wallet,'Site phát sinh chi phí', a.soSiteCP+'/'+sl.length, 'ngoài kế hoạch', null, false, C.brand)+
  '</div>';

  // ---- Charts ----
  html += '<div class="grid g2" style="margin-top:13px">';

  html += '<div class="card">'+cardHead(IC.line,'Tổng suất ăn theo ngày',
      '<div class="tg" id="tgLine">'+
        '<button data-v="total" class="'+(UI.lineMode==='total'?'on':'')+'">Toàn hệ thống</button>'+
        '<button data-v="bySite" class="'+(UI.lineMode==='bySite'?'on':'')+'">Theo site</button>'+
      '</div>')+
    '<div class="cbox"><canvas id="chLine"></canvas></div></div>';

  html += '<div class="card">'+cardHead(IC.stack,'Cơ cấu suất ăn theo site','')+
    '<div class="cbox"><canvas id="chStruct"></canvas></div></div>';

  html += '<div class="card">'+cardHead(IC.bars,'Xếp hạng site',
      '<div class="tg" id="tgRank">'+
        '<button data-v="tre" class="'+(UI.rankMetric==='tre'?'on':'')+'">% giao trễ</button>'+
        '<button data-v="thatthoat" class="'+(UI.rankMetric==='thatthoat'?'on':'')+'">% thất thoát</button>'+
      '</div>')+
    '<div class="cbox"><canvas id="chRank"></canvas></div></div>';

  html += '<div class="card">'+cardHead(IC.msg,'Khiếu nại theo phân loại & mức độ','')+
    '<div class="cbox" id="knBox"><canvas id="chKN"></canvas></div></div>';

  html += '</div>';

  // ---- Heatmap + Alert ----
  html += '<div class="card" style="margin-top:13px">'+cardHead(IC.grid,'Bảng trạng thái vận hành (Site × Ngày)','')+
    '<div class="lg">'+
      HEAT.map(function(x,i){
        return '<span><i style="background:'+x.bg+';border:1px solid '+x.bd+'"></i>'+x.ten+
               ' <span style="color:#C4C4C4">'+x.moc+'</span></span>';
      }).join('')+
      '<span><i style="background:#FBFBFB;border:1px dashed #DDD"></i>Chưa báo cáo</span>'+
      '<span style="color:#B8B8B8;margin-left:auto">hover để xem lý do • bấm để mở chi tiết site</span>'+
    '</div>'+
    '<div class="tw">'+heatmapHtml(rows, sl)+'</div></div>';

  html += alertTableHtml(rows);
  html += '</div>';

  document.getElementById('tab-overview').innerHTML = html;

  drawLine(rows, sl);
  drawStruct(rows, sl);
  drawRank(rows, sl);
  drawKN(rows);
  bindOverviewEvents(rows, sl);
}

function heatmapHtml(rows, sl){
  var dates = uniqSorted(rows.map(function(r){return r.ngayBaoCao;}));
  if (!dates.length || !sl.length) return '<div class="empty">Không có dữ liệu trong kỳ</div>';
  var map = {};
  rows.forEach(function(r){ map[r.tenSite+'|'+r.ngayBaoCao] = r; });

  var h = '<table class="hm"><thead><tr><th class="site-c">Site</th>';
  dates.forEach(function(dt){ h += '<th>'+dm(dt)+'</th>'; });
  h += '</tr></thead><tbody>';
  sl.forEach(function(s){
    h += '<tr><td class="site-c">'+esc(s)+'</td>';
    dates.forEach(function(dt){
      var r = map[s+'|'+dt];
      if (!r){
        h += '<td><span class="cell cell-none" '+
             'data-tip="'+esc(s)+' • '+dt+'&#10;Chưa có báo cáo"></span></td>';
        return;
      }
      // Liệt kê vấn đề kèm nội dung site ghi + điểm cộng tương ứng
      var v = [];
      if (r.suCoThietBi)   v.push('• Thiết bị: '+r.suCoThietBi+'  (+3)');
      if (r.soKhieuNai>0)  v.push('• Khiếu nại: '+r.soKhieuNai+' — '+
                                  normMucDo(r.mucDoNghiemTrong)+
                                  '  (+'+knDiem(r.mucDoNghiemTrong)+')');
      if (r.suCoNhanSu)    v.push('• Nhân sự: '+r.suCoNhanSu+'  (+2)');
      if (r.giaoTre)       v.push('• Giao trễ'+(r.phutTre?' '+r.phutTre+' phút':'')+
                                  '  (+'+(r.phutTre>NGUONG.phutTre?2:1)+')');
      if (r.soThatThoat>0){
        var ttp = pct(r.soThatThoat, r.tongSuat);
        v.push('• Thất thoát: '+fmt(r.soThatThoat)+' suất ('+r1(ttp)+'%)'+
               (ttp>NGUONG.thatThoatPct ? '  (+2)' : ''));
      }
      if (r.nvlBatThuong)  v.push('• NVL: '+r.tinhTrangNVL+'  (+1)');
      if (r.coChiPhiNgoai) v.push('• Chi phí: '+fmtVND(r.soTienChiPhi)+'  (+1)');

      var lv = HEAT[r.mucDoVanDe] || HEAT[0];
      // Tooltip: bậc + tổng điểm, rồi liệt kê vấn đề. Điểm cộng của từng loại đã
      // được ghép vào từng dòng ở trên nên không lặp lại dòng "Cộng điểm" nữa.
      var tip = s+' • '+r.ngayBaoCao+'\n'+
                lv.ten.toUpperCase()+
                (r.diemVanDe ? ' — '+r.diemVanDe+' điểm' : '')+'\n'+
                'Tổng suất: '+fmt(r.tongSuat)+' suất'+
                (v.length ? '\n\n'+v.join('\n') : '\n\nKhông ghi nhận vấn đề nào');

      // Bậc nghiêm trọng in thêm dấu ! để nhận ra kể cả khi in đen trắng
      h += '<td><button class="cell hm-c" data-site="'+esc(s)+
           '" data-tip="'+esc(tip).replace(/\n/g,'&#10;')+
           '" style="background:'+lv.bg+';border:1px solid '+lv.bd+';color:'+lv.fg+'">'+
           (r.mucDoVanDe===3 ? '!' : '')+'</button></td>';
    });
    h += '</tr>';
  });
  return h+'</tbody></table>';
}

function alertTableHtml(rows){
  var al = rows.filter(function(r){
    return (MUCDO_RANK[normMucDo(r.mucDoNghiemTrong)]||0) >= 3 || r.coChiPhiNgoai || r.suCoThietBi ||
           pct(r.soThatThoat, r.tongSuat) > NGUONG.thatThoatPct;
  }).sort(function(x,y){ return (y.dauThoiGian||y.ngayBaoCao).localeCompare(x.dauThoiGian||x.ngayBaoCao); });

  var h = '<div class="card" style="margin-top:13px">'+
    cardHead(IC.siren,'Cảnh báo nhanh',
      '<span class="tag" style="background:#7A1F2B18;color:#7A1F2B">'+al.length+' cảnh báo</span>');

  if (!al.length) return h+'<div class="empty">Không có cảnh báo trong kỳ</div></div>';

  h += '<div class="tw" style="max-height:330px"><table><thead><tr>'+
    '<th>Ngày</th><th>Site</th><th>Vấn đề</th><th>Chi tiết</th><th></th></tr></thead><tbody>';
  al.forEach(function(r){
    var tags = [];
    var mdN = normMucDo(r.mucDoNghiemTrong);
    if ((MUCDO_RANK[mdN]||0) >= 3)
      tags.push(['Khiếu nại '+mdN, MUCDO_COLOR[mdN]||C.brand]);
    if (r.suCoThietBi) tags.push(['Sự cố thiết bị','#EA580C']);
    if (pct(r.soThatThoat,r.tongSuat) > NGUONG.thatThoatPct) tags.push(['Thất thoát cao',C.gold]);
    if (r.coChiPhiNgoai) tags.push(['Chi phí phát sinh',C.brand]);

    var ct = r.suCoThietBi || r.chiTietYKien || r.lyDoChiPhi || r.nguyenNhanThatThoat || '';
    h += '<tr class="hov go-site" data-site="'+esc(r.tenSite)+'">'+
      '<td style="color:#8A8A8A;white-space:nowrap">'+esc(r.ngayBaoCao)+'</td>'+
      '<td style="font-weight:600;white-space:nowrap">'+esc(r.tenSite)+'</td>'+
      '<td>'+tags.map(function(t){
        return '<span class="tag" style="background:'+t[1]+'18;color:'+t[1]+';margin:1px 2px">'+esc(t[0])+'</span>';
      }).join('')+'</td>'+
      '<td style="color:#777;max-width:360px">'+esc(ct)+'</td>'+
      '<td style="color:#C5C5C5">›</td></tr>';
  });
  return h+'</tbody></table></div></div>';
}

// Điểm cộng của khiếu nại theo mức độ - khớp TRONG_SO trong Code.gs
function knDiem(mucDo){
  var m = normMucDo(mucDo);
  if (m === 'Nghiêm trọng') return 4;
  if (m === 'Cao') return 3;
  return 1;
}

function uniqSorted(arr){
  var o = {}; arr.forEach(function(v){ if (v) o[v]=1; });
  return Object.keys(o).sort();
}

/* ---------- VẼ CHART ---------- */
function drawLine(rows, sl){
  destroyChart('chLine');
  var ctx = ctxOf('chLine'); if (!ctx) return;
  var dates = uniqSorted(rows.map(function(r){return r.ngayBaoCao;}));
  var ds;
  if (UI.lineMode === 'total'){
    ds = [{ label:'Toàn hệ thống', borderColor:C.brand, backgroundColor:'rgba(122,31,43,.08)',
            borderWidth:2.5, tension:.32, fill:true,
            pointRadius:0, pointHoverRadius:5,
            pointBackgroundColor:C.brand, pointBorderColor:'#fff', pointBorderWidth:2,
            data: dates.map(function(dt){
              return rows.filter(function(r){return r.ngayBaoCao===dt;})
                         .reduce(function(s,r){return s+r.tongSuat;},0); }) }];
  } else {
    ds = sl.map(function(s,i){
      var col = PALETTE[i%PALETTE.length];
      return { label:s, borderColor:col, borderWidth:1.9, tension:.3, fill:false,
               pointRadius:0, pointHoverRadius:5,
               pointBackgroundColor:col, pointBorderColor:'#fff', pointBorderWidth:2,
               data: dates.map(function(dt){
                 return rows.filter(function(r){return r.ngayBaoCao===dt && r.tenSite===s;})
                            .reduce(function(sum,r){return sum+r.tongSuat;},0); }) };
    });
  }

  var o = cloneOpt();
  // Tooltip: tiêu đề là ngày đầy đủ, các site sắp theo sản lượng giảm dần,
  // kèm dòng tổng ở cuối để đối chiếu nhanh
  o.plugins.tooltip.callbacks = {
    title: function(items){ return 'Ngày ' + dates[items[0].dataIndex]; },
    label: function(it){ return '  ' + it.dataset.label + ': ' + fmt(it.parsed.y) + ' suất'; },
    footer: function(items){
      if (items.length < 2) return '';
      var t = items.reduce(function(s,i){ return s + (i.parsed.y||0); }, 0);
      return 'Tổng: ' + fmt(t) + ' suất';
    }
  };
  o.plugins.tooltip.itemSort = function(a,b){ return b.parsed.y - a.parsed.y; };
  o.plugins.tooltip.footerColor = '#C9A227';
  o.plugins.tooltip.footerFont = { size:11.5, weight:'700' };
  o.plugins.tooltip.footerMarginTop = 7;

  CHARTS.chLine = new Chart(ctx, { type:'line',
    data:{ labels:dates.map(dm), datasets:ds }, options:o });
}

function drawStruct(rows, sl){
  destroyChart('chStruct');
  var ctx = ctxOf('chStruct'); if (!ctx) return;
  var keys = [['Sáng','suatSang'],['Trưa','suatTrua'],['Chiều','suatChieu'],
              ['Nhân viên','suatNhanVien'],['Hủy','suatHuy']];
  var ds = keys.map(function(k,i){
    return { label:k[0], backgroundColor:PALETTE[i%PALETTE.length], stack:'a', borderRadius:2,
             data: sl.map(function(s){
               return rows.filter(function(r){return r.tenSite===s;})
                          .reduce(function(sum,r){return sum+r[k[1]];},0); }) };
  });
  var o = cloneOpt();
  o.scales.x.stacked = true; o.scales.y.stacked = true;
  // Stacked bar: thêm % trên tổng của site để thấy ngay cơ cấu bữa
  o.plugins.tooltip.callbacks = {
    title: function(items){ return items[0].label; },
    label: function(it){
      var tot = 0;
      it.chart.data.datasets.forEach(function(d){ tot += (d.data[it.dataIndex]||0); });
      var p = tot > 0 ? ' (' + r1(it.parsed.y/tot*100) + '%)' : '';
      return '  ' + it.dataset.label + ': ' + fmt(it.parsed.y) + p;
    },
    footer: function(items){
      var tot = 0;
      items[0].chart.data.datasets.forEach(function(d){ tot += (d.data[items[0].dataIndex]||0); });
      return 'Tổng: ' + fmt(tot) + ' suất';
    }
  };
  o.plugins.tooltip.footerColor = '#C9A227';
  o.plugins.tooltip.footerFont = { size:11.5, weight:'700' };
  o.plugins.tooltip.footerMarginTop = 7;
  CHARTS.chStruct = new Chart(ctx, { type:'bar', data:{ labels:sl, datasets:ds }, options:o });
}

function drawRank(rows, sl){
  destroyChart('chRank');
  var ctx = ctxOf('chRank'); if (!ctx) return;
  var data = sl.map(function(s){
    var sr = rows.filter(function(r){return r.tenSite===s;});
    var soTre = sr.filter(function(r){return r.giaoTre;}).length;
    var ttSuat = sr.reduce(function(a,r){return a+r.soThatThoat;},0);
    var tongSuat = sr.reduce(function(a,r){return a+r.tongSuat;},0);
    return { site:s, tre:r1(pct(soTre, sr.length)), thatthoat:r1(pct(ttSuat, tongSuat)),
             soTre:soTre, soNgay:sr.length, tt:ttSuat, tong:tongSuat };  // số liệu thô cho tooltip
  }).sort(function(a,b){ return b[UI.rankMetric]-a[UI.rankMetric]; });

  var lim = UI.rankMetric==='tre' ? 20 : NGUONG.thatThoatPct;
  var o = cloneOpt({ indexAxis:'y' });
  o.plugins.legend.display = false;
  o.scales.x.grid = { color:'#F0F0F0' }; o.scales.x.beginAtZero = true;
  o.scales.x.ticks.callback = function(v){ return v + '%'; };
  // Bar ngang: trục chỉ mục là Y nên interaction phải đổi sang trục y
  o.interaction = { mode:'index', intersect:false, axis:'y' };
  o.hover = { mode:'index', intersect:false, axis:'y' };
  o.plugins.tooltip.callbacks = {
    title: function(items){ return items[0].label; },
    label: function(it){
      var d = data[it.dataIndex];
      var nhan = UI.rankMetric==='tre' ? 'Tỷ lệ giao trễ' : 'Tỷ lệ thất thoát';
      var extra = UI.rankMetric==='tre'
        ? d.soTre + '/' + d.soNgay + ' ngày giao trễ'
        : fmt(d.tt) + '/' + fmt(d.tong) + ' suất';
      return ['  ' + nhan + ': ' + it.parsed.x + '%', '  ' + extra,
              '  Ngưỡng cảnh báo: ' + lim + '%'];
    }
  };
  CHARTS.chRank = new Chart(ctx, { type:'bar',
    data:{ labels:data.map(function(d){return d.site;}),
           datasets:[{ data:data.map(function(d){return d[UI.rankMetric];}), borderRadius:3,
             backgroundColor:data.map(function(d){ return d[UI.rankMetric] > lim ? C.brand : C.gold; }) }] },
    options:o });
}

// Chuẩn hóa mức độ nghiêm trọng về 1 trong 4 bậc.
// Sheet thật hay ghi "cao", "Rất nghiêm trọng", "TB", "Nhẹ"... nên cần map mềm,
// giá trị lạ/để trống -> "Chưa phân loại" để vẫn được đếm vào chart.
function normMucDo(s){
  var t = String(s||'').toLowerCase().trim();
  if (!t) return 'Chưa phân loại';
  if (/nghiêm trọng|nghiem trong|critical|khẩn/.test(t)) return 'Nghiêm trọng';
  if (/^cao|cao$|high|nặng|nang/.test(t))                return 'Cao';
  if (/trung bình|trung binh|^tb$|medium|vừa|vua/.test(t))return 'Trung bình';
  if (/thấp|thap|low|nhẹ|nhe|nhỏ|nho/.test(t))           return 'Thấp';
  return 'Chưa phân loại';
}

// Một dòng được coi là CÓ PHẢN ÁNH nếu: số khiếu nại > 0, HOẶC nhân viên đã ghi
// phân loại / mức độ / chi tiết ý kiến (thực tế nhiều dòng để số lượng = 0 nhưng
// vẫn mô tả phản ánh -> phải đếm để chart không bị trống).
function coPhanAnh(r){
  return r.soKhieuNai > 0 ||
         (r.phanLoaiKN && r.phanLoaiKN.trim() !== '') ||
         (r.mucDoNghiemTrong && r.mucDoNghiemTrong.trim() !== '') ||
         (r.chiTietYKien && r.chiTietYKien.trim() !== '');
}
// Số phản ánh của 1 dòng: ưu tiên số lượng khai báo; nếu = 0 mà có mô tả -> tính là 1.
function soPhanAnh(r){
  if (r.soKhieuNai > 0) return r.soKhieuNai;
  return coPhanAnh(r) ? 1 : 0;
}

function drawKN(rows){
  destroyChart('chKN');
  var box = document.getElementById('knBox');

  // Lấy mọi dòng có phản ánh (kể cả khi ô "số lượng khiếu nại" để trống/0).
  var coKN = rows.filter(coPhanAnh);

  if (!coKN.length){
    if (box) box.innerHTML = '<div class="empty">Không có phản ánh / khiếu nại trong kỳ</div>';
    return;
  }

  var m = {}, mdSet = {};
  coKN.forEach(function(r){
    var pl = r.phanLoaiKN || 'Chưa phân loại';
    var md = normMucDo(r.mucDoNghiemTrong);
    var n  = soPhanAnh(r);
    if (!m[pl]) m[pl] = {};
    m[pl][md] = (m[pl][md]||0) + n;
    mdSet[md] = 1;
  });

  // Sắp xếp phân loại theo tổng số khiếu nại giảm dần
  var labels = Object.keys(m).sort(function(a,b){
    var sa = 0, sb = 0;
    Object.keys(m[a]).forEach(function(k){ sa += m[a][k]; });
    Object.keys(m[b]).forEach(function(k){ sb += m[b][k]; });
    return sb - sa;
  });

  // Chỉ vẽ dataset của mức độ thực sự xuất hiện -> legend gọn, không có cột 0
  var ORDER = ['Thấp','Trung bình','Cao','Nghiêm trọng','Chưa phân loại'];
  var mds = ORDER.filter(function(md){ return mdSet[md]; });

  var ctx = ctxOf('chKN'); if (!ctx) return;
  var ds = mds.map(function(md){
    return { label:md, backgroundColor:MUCDO_COLOR[md]||C.gray, stack:'a', borderRadius:2,
             data: labels.map(function(l){ return m[l][md]||0; }) };
  });
  var o = cloneOpt();
  o.scales.x.stacked = true;
  o.scales.y.stacked = true;
  o.scales.y.ticks.precision = 0;      // số khiếu nại là số nguyên
  // Chỉ hiện mức độ thực sự có số > 0 để tooltip không đầy dòng "0"
  o.plugins.tooltip.callbacks = {
    title: function(items){ return items[0].label; },
    label: function(it){
      if (!it.parsed.y) return null;
      return '  ' + it.dataset.label + ': ' + fmt(it.parsed.y) + ' phản ánh';
    },
    footer: function(items){
      var tot = 0;
      items[0].chart.data.datasets.forEach(function(d){ tot += (d.data[items[0].dataIndex]||0); });
      return 'Tổng: ' + fmt(tot) + ' phản ánh';
    }
  };
  o.plugins.tooltip.footerColor = '#C9A227';
  o.plugins.tooltip.footerFont = { size:11.5, weight:'700' };
  o.plugins.tooltip.footerMarginTop = 7;
  CHARTS.chKN = new Chart(ctx, { type:'bar', data:{ labels:labels, datasets:ds }, options:o });
}

function bindOverviewEvents(rows, sl){
  var tl = document.getElementById('tgLine');
  if (tl) tl.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    UI.lineMode = b.dataset.v;
    tl.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x===b); });
    drawLine(rows, sl);
  });
  var tr = document.getElementById('tgRank');
  if (tr) tr.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    UI.rankMetric = b.dataset.v;
    tr.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x===b); });
    drawRank(rows, sl);
  });
  document.getElementById('tab-overview').addEventListener('click', function(e){
    var t = e.target.closest('.hm-c, .go-site');
    if (t && t.dataset.site){ SEL_SITE = t.dataset.site; switchTab('site'); }
  });
}

/* =========================================================================
   TAB 2 - CHI TIẾT SITE (drill-down)
   ========================================================================= */
function renderSite(){
  var all = applyFilter(RAW);
  var sl = siteListNow();
  if (!sl.length){
    document.getElementById('tab-site').innerHTML = '<div class="card"><div class="empty">Không có site nào trong bộ lọc</div></div>';
    return;
  }
  if (!SEL_SITE || sl.indexOf(SEL_SITE) < 0) SEL_SITE = sl[0];

  var rows = all.filter(function(r){ return r.tenSite === SEL_SITE; })
                .sort(function(a,b){ return a.ngayBaoCao.localeCompare(b.ngayBaoCao); });
  var a = agg(rows);
  var last = rows[rows.length-1];
  var soSuCo = rows.reduce(function(s,r){ return s + incidentsOf(r).length; }, 0);
  var treGio = r1(pct(a.soGiaoTre, a.dem));

  var html = '<div class="fade">';

  // chọn site
  html += '<div style="display:flex;align-items:center;gap:11px;margin-bottom:13px">'+
    svg(IC.table,17,C.brand)+
    '<select id="selSite" style="border:1px solid #D6D6D6;border-radius:8px;padding:8px 12px;font-size:13.5px;'+
    'font-weight:600;font-family:inherit;outline:none">'+
    sl.map(function(s){ return '<option value="'+esc(s)+'"'+(s===SEL_SITE?' selected':'')+'>'+esc(s)+'</option>'; }).join('')+
    '</select><span style="color:#A5A5A5;font-size:12.5px">'+rows.length+' ngày có báo cáo</span></div>';

  // card nhanh
  html += '<div class="grid g4">'+
    kpiCard(IC.user, 'Người báo cáo gần nhất', esc(last?last.nguoiBaoCao:'—'),
            last?('Cập nhật '+last.ngayBaoCao):'', null, true, C.brand)+
    kpiCard(IC.meal, 'Tổng suất kỳ này', fmt(a.tongSuat), a.dem+' ngày', null, true, C.gold)+
    kpiCard(IC.clock,'Tỷ lệ giao trễ', treGio+'%', a.soGiaoTre+' lượt trễ', null, false, C.light)+
    kpiCard(IC.warn, 'Số sự cố ghi nhận', soSuCo, 'trong kỳ', null, false, C.dark)+
  '</div>';

  // line chart riêng site
  html += '<div class="card" style="margin-top:13px">'+
    cardHead(IC.line,'Sản lượng theo ngày – '+SEL_SITE,'')+
    '<div class="cbox"><canvas id="chSite"></canvas></div></div>';

  // bảng chi tiết
  // Mốc để vẽ data bar cột Thất thoát: lấy % thất thoát lớn nhất trong kỳ.
  // Dùng % (không dùng số tuyệt đối) để ngày sản lượng thấp không bị đánh giá nhẹ đi.
  var maxTtPct = 0;
  rows.forEach(function(r){
    var p = pct(r.soThatThoat, r.tongSuat);
    if (p > maxTtPct) maxTtPct = p;
  });
  var maxSang  = Math.max.apply(null, rows.map(function(r){ return r.suatSang;  }).concat(0));
  var maxTrua  = Math.max.apply(null, rows.map(function(r){ return r.suatTrua;  }).concat(0));
  var maxChieu = Math.max.apply(null, rows.map(function(r){ return r.suatChieu; }).concat(0));
  var maxTong  = Math.max.apply(null, rows.map(function(r){ return r.tongSuat;  }).concat(0));

  html += '<div class="card" style="margin-top:13px">'+cardHead(IC.table,'Chi tiết báo cáo từng ngày',
    '<span style="font-size:11px;color:#B0B0B0">thanh màu = % thất thoát trên tổng suất • bấm vào dòng để mở rộng</span>')+
    '<div class="tw"><table><thead><tr>'+
    // '<th></th><th>Ngày</th><th class="num">Sáng</th><th class="num">Trưa</th><th class="num">Chiều</th>'+
    '<th></th><th>Ngày</th><th class="num" style="min-width:110px">Sáng</th>'+
    '<th class="num" style="min-width:110px">Trưa</th>'+
    '<th class="num" style="min-width:110px">Chiều</th>'+
    '<th class="num">NV</th><th class="num">Hủy</th><th class="num">Tổng</th><th class="ctr">Giao</th>'+
    '<th class="num" style="min-width:118px">Thất thoát</th><th class="ctr">KN</th><th class="ctr">Khen</th>'+
    '</tr></thead><tbody>';

  // rows.slice().reverse().forEach(function(r){
  //   var op = UI.expanded === r.id;
  //   html += '<tr class="hov row-x" data-id="'+esc(r.id)+'">'+
  //     '<td style="color:#C0C0C0">'+(op?'▾':'▸')+'</td>'+
  //     '<td style="font-weight:600;white-space:nowrap">'+esc(r.ngayBaoCao)+'</td>'+
  //     // Trước:
  //     // '<td class="num">'+fmt(r.suatSang)+'</td><td class="num">'+fmt(r.suatTrua)+'</td>'+
  //     // '<td class="num">'+fmt(r.suatChieu)+'</td><td class="num">'+fmt(r.suatNhanVien)+'</td>'+
  //     // '<td class="num" style="color:#AAA">'+fmt(r.suatHuy)+'</td>'+
  //     // '<td class="num bold-brand">'+fmt(r.tongSuat)+'</td>'+
  //     // Sau:
  //     '<td class="num">'+dataBarNum(r.suatSang, maxSang, C.gold)+'</td>'+
  //     '<td class="num">'+dataBarNum(r.suatTrua, maxTrua, C.gold)+'</td>'+
  //     '<td class="num">'+dataBarNum(r.suatChieu, maxChieu, C.gold)+'</td>'+
  //     '<td class="num">'+fmt(r.suatNhanVien)+'</td>'+
  //     '<td class="num" style="color:#AAA">'+fmt(r.suatHuy)+'</td>'+
  //     '<td class="num bold-brand">'+dataBarNum(r.tongSuat, maxTong, C.brand)+'</td>'+
  //     '<td class="ctr">'+(r.giaoTre
  //       ? '<span class="tag" style="background:#EA580C18;color:#EA580C">Trễ'+(r.phutTre?' '+r.phutTre+"'":'')+'</span>'
  //       : '<span class="tag" style="background:#16A34A18;color:#16A34A">Đúng giờ</span>')+'</td>'+
  //     '<td class="num">'+dataBarTT(r, maxTtPct)+'</td>'+
  //     '<td class="ctr">'+(r.soKhieuNai||'—')+'</td><td class="ctr">'+(r.soKhenNgoi||'—')+'</td></tr>';

  //   if (op){
  //     var det = [
  //       ['Lý do giao trễ', r.lyDoTre || r.gioGiaoRaw],
  //       ['Tình trạng NVL', r.tinhTrangNVL],
  //       ['Sự cố thiết bị', r.suCoThietBi],
  //       ['Nguyên nhân dư/thất thoát', r.nguyenNhanThatThoat],
  //       ['Sự cố nhân sự', r.suCoNhanSu],
  //       ['NS có mặt / vắng / tăng ca', r.nsCoMat+' / '+r.nsVang+' / '+r.nsTangCa],
  //       ['Phân loại khiếu nại', r.phanLoaiKN ? r.phanLoaiKN+(r.mucDoNghiemTrong?' ('+r.mucDoNghiemTrong+')':'') : ''],
  //       ['Chi tiết ý kiến khách hàng', r.chiTietYKien],
  //       ['Chi phí phát sinh', r.coChiPhiNgoai ? (fmtVND(r.soTienChiPhi)+' – '+r.lyDoChiPhi) : ''],
  //       ['Đề xuất / kiến nghị', r.deXuat],
  //       ['Người báo cáo', r.nguoiBaoCao]
  //     ];
  //     html += '<tr style="background:#FCF7F8"><td colspan="12" style="padding:12px 20px">'+
  //       '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:6px 26px;font-size:12px">'+
  //       det.map(function(x){
  //         return '<div><span style="color:#A0A0A0">'+esc(x[0])+': </span>'+
  //                '<span style="font-weight:600;color:#555">'+esc(x[1]||'—')+'</span></div>';
  //       }).join('')+'</div></td></tr>';
  //   }
  // });

  rows.slice().reverse().forEach(function(r){
    var op = UI.expanded === r.id;
    html += '<tr class="hov row-x" data-id="'+esc(r.id)+'">'+
      '<td style="color:#C0C0C0; text-align:center; width:30px;">'+(op?'▾':'▸')+'</td>'+
      '<td style="font-weight:600;white-space:nowrap">'+esc(r.ngayBaoCao)+'</td>'+
      '<td class="num">'+dataBarNum(r.suatSang, maxSang, C.gold)+'</td>'+
      '<td class="num">'+dataBarNum(r.suatTrua, maxTrua, C.gold)+'</td>'+
      '<td class="num">'+dataBarNum(r.suatChieu, maxChieu, C.gold)+'</td>'+
      '<td class="num">'+fmt(r.suatNhanVien)+'</td>'+
      '<td class="num" style="color:#AAA">'+fmt(r.suatHuy)+'</td>'+
      '<td class="num bold-brand">'+dataBarNum(r.tongSuat, maxTong, C.brand)+'</td>'+
      '<td class="ctr">'+(r.giaoTre
        ? '<span class="tag" style="background:#EA580C18;color:#EA580C">Trễ'+(r.phutTre?' '+r.phutTre+"'":'')+'</span>'
        : '<span class="tag" style="background:#16A34A18;color:#16A34A">Đúng giờ</span>')+'</td>'+
      '<td class="num">'+dataBarTT(r, maxTtPct)+'</td>'+
      '<td class="ctr">'+(r.soKhieuNai||'—')+'</td><td class="ctr">'+(r.soKhenNgoi||'—')+'</td></tr>';

    if (op){
      var det = [
        ['Lý do giao trễ', r.lyDoTre || r.gioGiaoRaw],
        ['Tình trạng NVL', r.tinhTrangNVL],
        ['Sự cố thiết bị', r.suCoThietBi],
        ['Nguyên nhân dư/thất thoát', r.nguyenNhanThatThoat],
        ['Sự cố nhân sự', r.suCoNhanSu],
        ['NS có mặt / vắng / tăng ca', r.nsCoMat+' / '+r.nsVang+' / '+r.nsTangCa],
        ['Phân loại khiếu nại', r.phanLoaiKN ? r.phanLoaiKN+(r.mucDoNghiemTrong?' ('+r.mucDoNghiemTrong+')':'') : ''],
        ['Chi tiết ý kiến khách hàng', r.chiTietYKien],
        ['Chi phí phát sinh', r.coChiPhiNgoai ? (fmtVND(r.soTienChiPhi)+' – '+r.lyDoChiPhi) : ''],
        ['Đề xuất / kiến nghị', r.deXuat],
        ['Người báo cáo', r.nguoiBaoCao]
      ];
      // Sử dụng class 'detail-row' và 'detail-grid' đã định nghĩa CSS ở trên để tránh đè giao diện
      html += '<tr class="detail-row"><td colspan="12">'+
        '<div class="detail-grid">'+
        det.map(function(x){
          return '<div class="detail-item">'+
                 '<span class="detail-label">'+esc(x[0])+'</span>'+
                 '<span class="detail-value">'+esc(x[1]||'—')+'</span>'+
                 '</div>';
        }).join('')+'</div></td></tr>';
    }
  });


  if (!rows.length) html += '<tr><td colspan="12"><div class="empty">Site này chưa có báo cáo trong kỳ</div></td></tr>';
  html += '</tbody></table></div></div>';

  // gallery + đề xuất
  html += '<div class="grid g2" style="margin-top:13px">';
  var imgs = [];
  rows.forEach(function(r){ (r.hinhAnh||[]).forEach(function(u){ imgs.push({u:u, d:r.ngayBaoCao}); }); });
  html += '<div class="card">'+cardHead(IC.image,'Hình ảnh món ăn / khu bếp','')+
    (imgs.length
      ? '<div class="gal">'+imgs.map(function(im){
          return '<button class="zoom" data-u="'+esc(im.u)+'"><img src="'+esc(im.u)+
                 '" loading="lazy" alt=""><span>'+dm(im.d)+'</span></button>'; }).join('')+'</div>'
      : '<div class="empty">Chưa có hình ảnh trong kỳ</div>')+'</div>';

  var sugs = rows.slice().reverse().filter(function(r){ return r.deXuat; });
  html += '<div class="card">'+cardHead(IC.bulb,'Đề xuất / kiến nghị từ site','')+
    (sugs.length
      ? '<div style="max-height:340px;overflow:auto">'+sugs.map(function(r){
          return '<div class="sug"><div class="d">'+dm(r.ngayBaoCao)+'</div><div>'+esc(r.deXuat)+
                 '<div class="who">— '+esc(r.nguoiBaoCao)+'</div></div></div>'; }).join('')+'</div>'
      : '<div class="empty">Không có đề xuất trong kỳ</div>')+'</div>';
  html += '</div></div>';

  document.getElementById('tab-site').innerHTML = html;

  // line chart site
  destroyChart('chSite');
  var ctx = ctxOf('chSite');
  if (ctx){
    var so = cloneOpt();
    // Tooltip site: kèm ngày đầy đủ, tỷ lệ thất thoát và tình trạng giao hàng
    so.plugins.tooltip.callbacks = {
      title: function(items){
      var ngay = rows[items[0].dataIndex].ngayBaoCao;
      var p = String(ngay).split('-');
      var d = new Date(Date.UTC(+p[0], +p[1]-1, +p[2]));
      var thu = ['Chủ Nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'][d.getUTCDay()];
      return 'Ngày ' + ngay + ' (' + thu + ')';
    },
      label: function(it){ return '  ' + it.dataset.label + ': ' + fmt(it.parsed.y) + ' suất'; },
      afterBody: function(items){
        var r = rows[items[0].dataIndex];
        var out = [];
        out.push('── Chi tiết suất ──');
        out.push('Sáng: ' + fmt(r.suatSang) + '  •  Trưa: ' + fmt(r.suatTrua) + '  •  Chiều: ' + fmt(r.suatChieu));
        out.push('NV: ' + fmt(r.suatNhanVien) + '  •  Hủy: ' + fmt(r.suatHuy));
        out.push(r.giaoTre ? ('Giao trễ' + (r.phutTre ? ' ' + r.phutTre + ' phút' : '')) : 'Giao đúng giờ');
        if (r.soKhieuNai > 0) out.push('Khiếu nại: ' + r.soKhieuNai);
        return out;
      }
    };
    // Trục trái: Tổng suất | Trục phải: Suất NV + Suất hủy
    so.scales.y = {
      position: 'left',
      beginAtZero: true,
      ticks: { font: { size: 10 } },
      grid: { color: '#F0F0F0' },
      title: { display: true, text: 'Tổng suất', font: { size: 10 }, color: '#9A9A9A' }
    };
    so.scales.y1 = {
      position: 'right',
      beginAtZero: true,
      ticks: { font: { size: 10 }, color: C.light },
      grid: { drawOnChartArea: false },
      title: { display: true, text: 'NV / Hủy', font: { size: 10 }, color: C.light }
    };

    CHARTS.chSite = new Chart(ctx, { type:'line',
      data:{ labels: rows.map(function(r){return dm(r.ngayBaoCao);}), datasets:[
        { label:'Tổng suất', borderColor:C.brand, backgroundColor:'rgba(122,31,43,.18)',
          borderWidth:2.5, tension:.32, fill:true, yAxisID:'y',
          pointRadius:0, pointHoverRadius:5, pointBackgroundColor:C.brand,
          pointBorderColor:'#fff', pointBorderWidth:2,
          data: rows.map(function(r){return r.tongSuat;}) },
        { label:'Suất NV', borderColor:C.light, backgroundColor:'rgba(155,53,67,.12)',
          borderWidth:2, tension:.3, fill:true, yAxisID:'y1',
          pointRadius:0, pointHoverRadius:5, pointBackgroundColor:C.light,
          pointBorderColor:'#fff', pointBorderWidth:2, borderDash:[5, 4],
          data: rows.map(function(r){return r.suatNhanVien;}) },
        { label:'Suất hủy', borderColor:C.gold, backgroundColor:'rgba(201,162,39,.16)',
          borderWidth:2, tension:.3, fill:true, yAxisID:'y1',
          pointRadius:0, pointHoverRadius:5, pointBackgroundColor:C.gold,
          pointBorderColor:'#fff', pointBorderWidth:2,
          data: rows.map(function(r){return r.suatHuy;}) }
      ]}, options:so });
  }

  document.getElementById('selSite').addEventListener('change', function(){
    SEL_SITE = this.value; UI.expanded = ''; renderSite();
  });
  // document.getElementById('tab-site').addEventListener('click', function(e){
  //   var rx = e.target.closest('.row-x');
  //   if (rx){ UI.expanded = (UI.expanded === rx.dataset.id) ? '' : rx.dataset.id; renderSite(); return; }
  //   var z = e.target.closest('.zoom');
  //   if (z){ openLightbox(z.dataset.u); }
  // });
  document.getElementById('tab-site').addEventListener('click', function(e){
    var rx = e.target.closest('.row-x');
    if (rx){ 
      var id = rx.dataset.id;
      UI.expanded = (UI.expanded === id) ? '' : id; 
      renderSite(); 
      return; 
    }
    var z = e.target.closest('.zoom');
    if (z){ 
      openLightbox(z.dataset.u); 
    }
  });
}

// Data bar cột Thất thoát: độ dài theo % thất thoát so với ngày cao nhất trong kỳ,
// màu theo ngưỡng cảnh báo (vượt ngưỡng -> đỏ mận, còn lại -> vàng gold)
function dataBarTT(r, maxPct){
  if (!r.soThatThoat) return '<span style="color:#C8C8C8">—</span>';

  var p = pct(r.soThatThoat, r.tongSuat);
  var vuot = p > NGUONG.thatThoatPct;
  var col = vuot ? C.brand : C.gold;
  // Tối thiểu 6% để giá trị nhỏ vẫn nhìn thấy được thanh
  var w = maxPct > 0 ? Math.max(6, (p / maxPct) * 100) : 6;

  var tip = 'Thất thoát: '+fmt(r.soThatThoat)+' / '+fmt(r.tongSuat)+' suất\n'+
            'Tỷ lệ: '+r1(p)+'%  (ngưỡng '+NGUONG.thatThoatPct+'%)'+
            (r.nguyenNhanThatThoat ? '\nNguyên nhân: '+r.nguyenNhanThatThoat : '');

  return '<span class="dbar" data-tip="'+esc(tip).replace(/\n/g,'&#10;')+'">'+
      '<span class="dbar-p">'+r1(p)+'%</span>'+
      '<span class="dbar-track">'+
        '<span class="dbar-fill" style="width:'+w.toFixed(1)+'%;background:'+col+
        (vuot?'':'99')+'"></span>'+
      '</span>'+
      '<span class="dbar-v" style="color:'+col+'">'+fmt(r.soThatThoat)+'</span>'+
    '</span>';
}
// Data bar dùng chung cho các cột số lượng (Sáng/Trưa/Chiều/Tổng...)
// value: giá trị của ô hiện tại; maxVal: giá trị lớn nhất trong cột (toàn kỳ)
// color: màu thanh (mặc định dùng brand)
function dataBarNum(value, maxVal, color){
  if (!value) return '<span style="color:#C8C8C8">0</span>';
  color = color || C.brand;
  var w = maxVal > 0 ? Math.max(4, (value / maxVal) * 100) : 4;
  return '<span class="dbar">'+
      '<span class="dbar-track">'+
        '<span class="dbar-fill" style="width:'+w.toFixed(1)+'%;background:'+color+'"></span>'+
      '</span>'+
      '<span class="dbar-v">'+fmt(value)+'</span>'+
    '</span>';
}

function openLightbox(u){
  document.getElementById('lbImg').src = u;
  document.getElementById('lightbox').classList.add('open');
}

/* =========================================================================
   TAB 3 - SỰ CỐ & ADHOC
   ========================================================================= */
function currentIncidents(){
  var rows = applyFilter(RAW);
  var all = [];
  rows.forEach(function(r){ all = all.concat(incidentsOf(r)); });
  return all.filter(function(i){
    if (UI.incLoai && i.loai !== UI.incLoai) return false;
    if (UI.incMucDo && i.mucDo !== UI.incMucDo) return false;
    return true;
  }).sort(function(a,b){
    return b.ngay.localeCompare(a.ngay) || ((MUCDO_RANK[b.mucDo]||0)-(MUCDO_RANK[a.mucDo]||0));
  });
}

function renderIncident(){
  var rows = applyFilter(RAW);
  var allInc = [];
  rows.forEach(function(r){ allInc = allInc.concat(incidentsOf(r)); });
  var list = currentIncidents();

  var html = '<div class="fade"><div class="card">';
  html += '<div class="card-t"><h3>'+svg(IC.warn,15,C.brand)+'Tổng hợp sự cố toàn hệ thống</h3>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'+
      '<select id="fLoai" style="border:1px solid #D6D6D6;border-radius:8px;padding:6px 10px;font-size:12.5px;font-family:inherit">'+
        '<option value="">Tất cả loại</option>'+
        LOAI_SU_CO.map(function(l){ return '<option'+(UI.incLoai===l?' selected':'')+'>'+l+'</option>'; }).join('')+
      '</select>'+
      '<select id="fMucDo" style="border:1px solid #D6D6D6;border-radius:8px;padding:6px 10px;font-size:12.5px;font-family:inherit">'+
        '<option value="">Mọi mức độ</option>'+
        ['Thấp','Trung bình','Cao','Nghiêm trọng','Chưa phân loại'].map(function(m){
          return '<option'+(UI.incMucDo===m?' selected':'')+'>'+m+'</option>'; }).join('')+
      '</select>'+
      '<button class="btn btn-out" id="btnCopy">⧉ Copy bảng</button>'+
      '<button class="btn btn-out" id="btnCsv">↓ CSV</button>'+
      '<button class="btn btn-fill" id="btnXlsx">↓ Excel</button>'+
    '</div></div>';

  html += '<div class="chips">'+LOAI_SU_CO.map(function(l){
    var n = allInc.filter(function(i){ return i.loai===l; }).length;
    return '<span class="chip">'+l+': <b>'+n+'</b></span>';
  }).join('')+'</div>';

  if (!list.length){
    html += '<div class="empty">Không có sự cố phù hợp bộ lọc</div>';
  } else {
    html += '<div class="tw" style="max-height:560px"><table><thead><tr>'+
      '<th>Ngày</th><th>Site</th><th>Loại</th><th>Mức độ</th><th>Chi tiết</th><th>Người báo cáo</th>'+
      '</tr></thead><tbody>';
    list.forEach(function(i){
      var mc = MUCDO_COLOR[i.mucDo] || '#9AA0A6';
      html += '<tr class="hov go-site2" data-site="'+esc(i.tenSite)+'">'+
        '<td style="color:#8A8A8A;white-space:nowrap">'+esc(i.ngay)+'</td>'+
        '<td style="font-weight:600;white-space:nowrap">'+esc(i.tenSite)+'</td>'+
        '<td><span class="tag" style="background:#7A1F2B18;color:#7A1F2B">'+esc(i.loai)+'</span></td>'+
        '<td><span class="tag" style="background:'+mc+'18;color:'+mc+'">'+esc(i.mucDo||'—')+'</span></td>'+
        '<td style="color:#666;max-width:430px">'+esc(i.chiTiet)+'</td>'+
        '<td style="color:#8A8A8A;white-space:nowrap">'+esc(i.nguoiBaoCao)+'</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="font-size:11.5px;color:#B0B0B0;margin-top:9px">Tổng: '+list.length+' sự cố</div>';
  }
  html += '</div></div>';

  document.getElementById('tab-incident').innerHTML = html;
  bindIncidentEvents();
}

function bindIncidentEvents(){
  document.getElementById('fLoai').addEventListener('change', function(){ UI.incLoai=this.value; renderIncident(); });
  document.getElementById('fMucDo').addEventListener('change', function(){ UI.incMucDo=this.value; renderIncident(); });

  document.getElementById('btnCopy').addEventListener('click', function(){
    var txt = currentIncidents().map(function(i){
      return [i.ngay,i.tenSite,i.loai,i.mucDo,i.chiTiet,i.nguoiBaoCao].join('\t');
    }).join('\n');
    copyText('Ngày\tSite\tLoại\tMức độ\tChi tiết\tNgười báo cáo\n'+txt);
  });

  document.getElementById('btnCsv').addEventListener('click', function(){
    var list = currentIncidents();
    var head = ['Ngày','Site','Loại sự cố','Mức độ','Chi tiết','Người báo cáo'];
    var q = function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
    // BOM \uFEFF để Excel đọc đúng UTF-8 tiếng Việt
    var csv = '\uFEFF'+[head.join(',')].concat(list.map(function(i){
      return [i.ngay,i.tenSite,i.loai,i.mucDo,i.chiTiet,i.nguoiBaoCao].map(q).join(',');
    })).join('\n');
    var a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download = 'AK_SuCo_'+new Date().toISOString().slice(0,10)+'.csv';
    a.click();
    toast('Đã tải file CSV');
  });

  document.getElementById('btnXlsx').addEventListener('click', function(){
    var btn = this;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang tạo...';
    callPostAPI('exportIncidents', {rows: currentIncidents(), tenFile: 'AK_SuCo_VanHanh'})
      .then(function(res){
        btn.disabled = false; btn.innerHTML = '↓ Excel';
        if (res && res.ok){ window.open(res.downloadUrl, '_blank'); toast('Đã tạo '+res.name); }
      })
      .catch(function(e){
        btn.disabled = false; btn.innerHTML = '↓ Excel';
        toast('Lỗi xuất Excel: '+(e&&e.message?e.message:e));
      });
  });

  document.getElementById('tab-incident').addEventListener('click', function(e){
    var t = e.target.closest('.go-site2');
    if (t && t.dataset.site){ SEL_SITE = t.dataset.site; switchTab('site'); }
  });
}

function copyText(txt){
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ toast('Đã copy bảng vào clipboard'); },
      function(){ fallbackCopy(txt); });
  } else fallbackCopy(txt);
}
function fallbackCopy(txt){
  var ta = document.createElement('textarea');
  ta.value = txt; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Đã copy bảng'); } catch(e){ toast('Không copy được'); }
  document.body.removeChild(ta);
}

/* =========================================================================
   TAB 4 - DOANH THU & FOOD COST
   Toàn bộ công thức đã tính ở Code.gs, phần này chỉ render + vẽ chart.
   ========================================================================= */

/* ---------- FORMAT TIỀN GỌN (tỷ / triệu) ---------- */
function fmtMoney(n){
  n = n || 0;
  var abs = Math.abs(n);
  if (abs >= 1e9) return (n/1e9).toFixed(2).replace('.',',')+' tỷ';
  if (abs >= 1e6) return (n/1e6).toFixed(1).replace('.',',')+' tr';
  return fmt(n)+'₫';
}
function fmtPct(n){ return (Math.round((n||0)*100)/100).toFixed(2).replace('.',',')+'%'; }

/* Badge so sánh giá trị thực tế với ngưỡng định mức */
function thrBadge(actual, limit, unit, lowerIsBetter){
  if (lowerIsBetter === undefined) lowerIsBetter = true;
  var diff = actual - limit;
  var ok = lowerIsBetter ? (actual <= limit) : (actual >= limit);
  var cls = ok ? 'thr-ok' : 'thr-bad';
  var sign = diff > 0 ? 'vượt ' : 'thấp hơn ';
  var txt = ok
    ? 'trong định mức '+limit.toFixed(2).replace('.',',')+unit
    : sign+Math.abs(diff).toFixed(2).replace('.',',')+' điểm '+unit+' so định mức';
  return '<div class="thr '+cls+'">'+(ok?'✓ ':'▲ ')+txt+'</div>';
}

/* Gauge food cost % so với dải mục tiêu ngành SACN */
function fcGauge(pctVal, min, max){
  // Quy đổi sang vị trí trên thanh 0..60% (dải hiển thị)
  var scale = 60;
  var pos = Math.max(0, Math.min(100, (pctVal/scale)*100));
  return '<div class="gauge">'+
    '<div class="gauge-track"><div class="gauge-mark" style="left:calc('+pos.toFixed(1)+'% - 1.5px)"></div></div>'+
    '<div class="gauge-lb"><span>0%</span><span>Mục tiêu '+min+'–'+max+'%</span><span>'+scale+'%</span></div>'+
  '</div>';
}

/* Class màu cho ô food cost % trong bảng */
function fcCls(p, ng){
  if (p <= ng.foodCostMin) return 'fc-ok';
  if (p <= ng.foodCostMax) return 'fc-mid';
  return 'fc-hi';
}
function computeAndDrawRevenue() {
  if (!REV_RAW || !REV_RAW.rows) return;

  var f = RF;
  var cur = rev_filterRows(REV_RAW.rows, f);
  var pr = rev_prevRange(f.from, f.to);
  var prev = pr
    ? rev_filterRows(REV_RAW.rows, {
        from: pr.from, to: pr.to, sites: f.sites,
        kenh: f.kenh, nhomSP: f.nhomSP, nvkd: f.nvkd, khachHang: f.khachHang
      })
    : [];

  var aCur = rev_agg(); cur.forEach(function (r) { rev_push(aCur, r); });
  var aPrev = rev_agg(); prev.forEach(function (r) { rev_push(aPrev, r); });
  var kpi = rev_finalize(aCur);
  var kpiPrev = rev_finalize(aPrev);

  // OPEX (giống backend: khớp site + tháng trong khoảng)
  var opexItems = REV_RAW.opexItems || [];
  var opexAmt = 0, opexMatched = 0;
  var months = {};
  if (f.from && f.to) {
    var d = new Date(f.from + 'T00:00:00'), end = new Date(f.to + 'T00:00:00');
    while (d <= end) {
      months[d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')] = 1;
      d.setMonth(d.getMonth() + 1); d.setDate(1);
    }
  }
  var siteList = (f.sites && f.sites.length) ? f.sites : null;
  opexItems.forEach(function (it) {
    var per = String(it.period || 'ALL');
    var siteOk = (it.site === 'ALL') || !siteList || siteList.indexOf(it.site) >= 0;
    var periodOk = (per === 'ALL') || !f.from || months[per];
    if (siteOk && periodOk) { opexAmt += it.amount; opexMatched++; }
  });
  kpi.opex = opexAmt;
  kpi.hasOpex = opexMatched > 0 && opexAmt > 0;
  kpi.ebitda = kpi.hasOpex ? (kpi.grossProfit - opexAmt) : null;
  kpi.ebitdaPct = (kpi.hasOpex && kpi.netRevenue > 0)
    ? ((kpi.grossProfit - opexAmt) / kpi.netRevenue) * 100 : null;

  // Hủy từ Report (đã có sẵn trong REV_RAW.huyReport)
  // var huy = REV_RAW.huyReport || { total: { suatHuy: 0, tongSuat: 0, pct: 0 }, bySite: {} };
  // Hủy từ Report — TÍNH LẠI CÓ LỌC theo ngày/site mỗi lần filter đổi,
  // thay vì dùng REV_RAW.huyReport (số liệu tổng cố định, không ăn filter).
  var huy = rev_huyFromReport(REV_RAW.huyRows, f);
  // Có thể lọc thêm bySite theo RF.sites nếu cần chính xác hơn
  kpi.huyReportPct = huy.total.pct;
  kpi.huySuatHuy = huy.total.suatHuy;
  kpi.huyTongSuat = huy.total.tongSuat;
  kpi.huyHasReport = huy.total.tongSuat > 0;
  if (kpi.huyHasReport) kpi.huyQtyPct = huy.total.pct;

  var dayset = {};
  cur.forEach(function (r) { if (r.ngay) dayset[r.ngay] = 1; });
  kpi.operatingDays = Object.keys(dayset).length;
  kpi.netPerDay = kpi.operatingDays > 0 ? kpi.netRevenue / kpi.operatingDays : 0;

  var bySite = rev_groupBy(cur, function (r) { return r.site; }, 'netRevenue');
  // gắn huy theo site nếu cần (giống backend)
  bySite.forEach(function (s) {
    var h = (huy.bySite && huy.bySite[s.key]) || null;
    if (h) { s.huyReportPct = h.pct; s.huyQtyPct = h.pct; }
  });

  var byNhom = rev_groupBy(cur, function (r) { return r.nhomSP; }, 'netRevenue');
  var byKenh = rev_groupBy(cur, function (r) { return r.kenhBanHang; }, 'netRevenue');
  var byNVKD = rev_groupBy(cur, function (r) { return r.nvKinhDoanh; }, 'netRevenue');
  var byKH = rev_groupBy(cur, function (r) { return r.tenKH; }, 'netRevenue');
  var byLyDo = rev_groupBy(
    cur.filter(function (r) { return r.isReturn; }),
    function (r) { return r.lyDoTraHang || '(Không ghi lý do)'; },
    'returnValue'
  );
  var byDate = rev_groupBy(cur, function (r) { return r.ngay; });
  byDate.sort(function (a, b) { return a.key < b.key ? -1 : 1; });

  // ===== THÊM MỚI: dữ liệu cho chart "So sánh theo kỳ" =====
  // Dùng TOÀN BỘ rows (chỉ áp filter site/kênh/nhóm/NVKD/KH, KHÔNG lọc ngày)
  // giống hệt cách backend làm trong getRevenueFoodCostData, để thấy xu hướng dài hạn.
  var allNoDate = rev_filterRows(REV_RAW.rows, {
    sites: f.sites, kenh: f.kenh, nhomSP: f.nhomSP, nvkd: f.nvkd, khachHang: f.khachHang
  });
  var periodCompare = {
    day:     rev_groupByPeriod(allNoDate, 'day'),
    week:    rev_groupByPeriod(allNoDate, 'week'),
    month:   rev_groupByPeriod(allNoDate, 'month'),
    quarter: rev_groupByPeriod(allNoDate, 'quarter'),
    year:    rev_groupByPeriod(allNoDate, 'year')
  };

  // ===== THÊM MỚI: dữ liệu cho "Chi tiết theo cửa hàng / site" =====
  var siteDetail = rev_buildSiteDetail(REV_RAW.dims, cur, f, opexItems, huy);

  // Gán vào REV đúng shape mà drawRevenue đang dùng
  REV = {
    ok: true,
    dims: REV_RAW.dims,
    kpi: kpi,
    kpiPrev: kpiPrev,
    byDate: byDate,
    periodCompare: periodCompare,   // ← MỚI
    bySite: bySite,
    byNhomSP: byNhom,
    byKenh: byKenh,
    byNVKD: byNVKD,
    byKhachHang: byKH.slice(0, 50),
    byLyDoTraHang: byLyDo,
    siteDetail: siteDetail,         // ← MỚI
    opexItems: opexItems,
    nguong: REV_RAW.nguong,
    updatedAt: REV_RAW.updatedAt,
    totalLines: REV_RAW.totalLines,
    filteredLines: cur.length,
    prevRange: pr
  };

  if (TAB === 'revenue') drawRevenue();
}
//   var byDate = rev_groupBy(cur, function (r) { return r.ngay; });
//   byDate.sort(function (a, b) { return a.key < b.key ? -1 : 1; });

//   // Gán vào REV đúng shape mà drawRevenue đang dùng
//   REV = {
//     ok: true,
//     dims: REV_RAW.dims,
//     kpi: kpi,
//     kpiPrev: kpiPrev,
//     byDate: byDate,
//     bySite: bySite,
//     byNhomSP: byNhom,
//     byKenh: byKenh,
//     byNVKD: byNVKD,
//     byKhachHang: byKH.slice(0, 50),
//     byLyDoTraHang: byLyDo,
//     opexItems: opexItems,
//     nguong: REV_RAW.nguong,
//     updatedAt: REV_RAW.updatedAt,
//     totalLines: REV_RAW.totalLines,
//     filteredLines: cur.length,
//     prevRange: pr
//     // periodCompare / siteDetail: bổ sung nếu chart/drill-down đang dùng
//   };

//   if (TAB === 'revenue') drawRevenue();
// }

/* ---------- NẠP DỮ LIỆU TỪ BACKEND ---------- */
function loadRevenue(opts) {
  opts = opts || {};
  if (REV_LOADING) return;
  // Đã có raw và không force → chỉ vẽ lại theo filter hiện tại
  if (REV_RAW && !opts.force) {
    computeAndDrawRevenue();
    return;
  }

  REV_LOADING = true;
  var box = document.getElementById('tab-revenue');
  if (!opts.silent && box) {
    box.innerHTML = '<div class="card"><div class="empty">Đang tải dữ liệu doanh thu...</div></div>';
  }

  callAPI('getRevenueRawData')   // ← không gửi filters
    .then(function (res) {
      REV_LOADING = false;
      if (res && res.updatedAt) {
        document.getElementById('updAt').textContent = fmtUpdatedAt(res.updatedAt);
        setLive(true, liveLabel(res.updatedAt));
      }
      if (!res || !res.ok) {
        if (box) box.innerHTML = '<div class="card"><div class="empty">' +
          esc((res && res.message) || 'Không đọc được dữ liệu doanh thu') + '</div></div>';
        return;
      }
      if (res.empty) {
        if (box) box.innerHTML = '<div class="card"><div class="empty">' + esc(res.message) + '</div></div>';
        return;
      }

      REV_RAW = res;
      if (!REV_INIT) {
        // Gán dims vào object giả để buildRevFilters dùng như cũ
        REV = { dims: res.dims, updatedAt: res.updatedAt };
        buildRevFilters();
        REV_INIT = true;
      }
      computeAndDrawRevenue();
    })
    .catch(function (err) {
      REV_LOADING = false;
      if (box) box.innerHTML = '<div class="card"><div class="empty">Lỗi tải: ' +
        esc(String(err && err.message ? err.message : err)) + '</div></div>';
    });
}

// function loadRevenue(opts){
//   opts = opts || {};
//   if (REV_LOADING) return;
//   REV_LOADING = true;
//   var box = document.getElementById('tab-revenue');
//   if (!opts.silent && box) {
//     box.innerHTML = '<div class="card"><div class="empty">Đang tải dữ liệu doanh thu từ Transactions...</div></div>';
//   }

//   callAPI('getRevenueFoodCostData', {filters: JSON.stringify(RF)})
//     .then(function(res){
//       REV_LOADING = false;
//       if (res && res.updatedAt) {
//         document.getElementById('updAt').textContent = fmtUpdatedAt(res.updatedAt);
//         setLive(true, liveLabel(res.updatedAt));
//       }
//       if (!res || !res.ok){
//         if (box) box.innerHTML = '<div class="card"><div class="empty">'+
//           esc((res && res.message) || 'Không đọc được dữ liệu doanh thu')+'</div></div>';
//         return;
//       }
//       if (res.empty){
//         if (box) box.innerHTML = '<div class="card"><div class="empty">'+esc(res.message)+'</div></div>';
//         return;
//       }
//       try {
//         REV = res;
//         if (!REV_INIT){ buildRevFilters(); REV_INIT = true; }
//         if (TAB === 'revenue') drawRevenue();
//       } catch (e) {
//         console.error('Lỗi render tab doanh thu:', e);
//         if (box) box.innerHTML = '<div class="card"><div class="empty">'+
//           'Lỗi hiển thị dữ liệu doanh thu: '+esc(String(e && e.message ? e.message : e))+
//           '</div></div>';
//       }
//     })
//     .catch(function(err){
//       REV_LOADING = false;
//       if (box) box.innerHTML = '<div class="card"><div class="empty">'+
//         'Lỗi tải dữ liệu từ server: '+esc(String(err && err.message ? err.message : err))+
//         '</div></div>';
//     });
// }

// function renderRevenue(){
//   if (!REV){ loadRevenue(); return; }
//   drawRevenue();
// }
function renderRevenue(){
  if (!REV_RAW){ loadRevenue(); return; }
  computeAndDrawRevenue();
}

/* ---------- DỰNG DROPDOWN BỘ LỌC (chạy 1 lần sau khi có dims) ---------- */
function buildRevFilters(){
  var d = REV.dims || {};
  // Chống undefined nếu backend chưa trả đủ field (ví dụ chưa deploy bản mới)
  d.sites = d.sites || []; d.kenh = d.kenh || []; d.nhomSP = d.nhomSP || [];
  d.nvkd = d.nvkd || []; d.khachHang = d.khachHang || []; d.dates = d.dates || [];

  // Mặc định: 30 ngày gần nhất có dữ liệu
  if (!RF.from && d.dates.length){
    var last = d.dates[d.dates.length-1];
    var i = Math.max(0, d.dates.length - 30);
    RF.to = last; RF.from = d.dates[i];
  }
  document.getElementById('rFrom').value = RF.from;
  document.getElementById('rTo').value = RF.to;
  if (d.dates.length){
    ['rFrom','rTo'].forEach(function(id){
      var el = document.getElementById(id);
      el.min = d.dates[0]; el.max = d.dates[d.dates.length-1];
    });
  }

  document.getElementById('rMsList').innerHTML = d.sites.map(function(s){
    return '<label><input type="checkbox" value="'+esc(s)+'"'+
           (RF.sites.indexOf(s)>=0?' checked':'')+'> '+esc(s)+'</label>';
  }).join('');
  updateRevMsLabel();

  var fill = function(id, arr, cur, allLabel){
    document.getElementById(id).innerHTML =
      '<option value="">'+allLabel+'</option>'+
      arr.map(function(v){
        return '<option value="'+esc(v)+'"'+(cur===v?' selected':'')+'>'+esc(v)+'</option>';
      }).join('');
  };
  fill('rKenh', d.kenh,   RF.kenh,   'Tất cả kênh');
  fill('rNhom', d.nhomSP, RF.nhomSP, 'Tất cả nhóm');
  fill('rNVKD', d.nvkd,   RF.nvkd,   'Tất cả NVKD');
  fill('rKH',   d.khachHang || [], RF.khachHang, 'Tất cả khách hàng');
}

function updateRevMsLabel(){
  var n = RF.sites.length;
  document.getElementById('rMsLabel').textContent =
    n === 0 ? 'Tất cả cửa hàng' : (n === 1 ? RF.sites[0] : n+' cửa hàng đã chọn');
}

/* ---------- RENDER CHÍNH TAB DOANH THU ---------- */
function rev_filterRows(rows, f) {
  f = f || RF;
  var from = f.from || '', to = f.to || '';
  var sites = (f.sites && f.sites.length) ? f.sites : null;
  return rows.filter(function (r) {
    if (from && r.ngay < from) return false;
    if (to && r.ngay > to) return false;
    if (sites && sites.indexOf(r.site) < 0) return false;
    if (f.kenh && r.kenhBanHang !== f.kenh) return false;
    if (f.nhomSP && r.nhomSP !== f.nhomSP) return false;
    if (f.nvkd && r.nvKinhDoanh !== f.nvkd) return false;
    if (f.khachHang && r.tenKH !== f.khachHang) return false;
    return true;
  });
}

function rev_prevRange(from, to) {
  if (!from || !to) return null;
  var d1 = new Date(from + 'T00:00:00');
  var d2 = new Date(to + 'T00:00:00');
  var days = Math.round((d2 - d1) / 86400000) + 1;
  var pTo = new Date(d1.getTime() - 86400000);
  var pFrom = new Date(pTo.getTime() - (days - 1) * 86400000);
  function fmt(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  return { from: fmt(pFrom), to: fmt(pTo) };
}

// Port tối thiểu logic agg từ backend (giống revenue_agg_ / push_ / finalize_)
function rev_agg() {
  return {
    grossRevenue: 0, discount: 0, returnValue: 0, returnQty: 0, salesQty: 0,
    qtyPHA: 0, qtyKG: 0, qtyCHY: 0, netPHA: 0, netKG: 0, netCHY: 0,
    foodCost: 0, invoices: {}, lines: 0
  };
}
function rev_push(a, r) {
  if (r.isReturn) {
    a.returnValue += r.thanhTien;
    a.returnQty += r.soLuong;
  } else {
    a.grossRevenue += r.thanhTien;
    a.discount += (r.ckTruocThue || 0);
    a.salesQty += r.soLuong;
    a.foodCost += r.giaVon;
    if (r.soHoaDon) a.invoices[r.soHoaDon] = 1;
    var u = String(r.dvt || '').trim().toUpperCase();
    var lineNet = r.thanhTien - (r.ckTruocThue || 0);
    if (u === 'PHA') { a.qtyPHA += r.soLuong; a.netPHA += lineNet; }
    else if (u === 'KG') { a.qtyKG += r.soLuong; a.netKG += lineNet; }
    else if (u === 'CHY') { a.qtyCHY += r.soLuong; a.netCHY += lineNet; }
  }
  a.lines++;
}
function rev_finalize(a) {
  var net = a.grossRevenue - a.discount - a.returnValue;
  var gp = net - a.foodCost;
  return {
    grossRevenue: a.grossRevenue,
    discount: a.discount,
    returnValue: a.returnValue,
    returnQty: a.returnQty,
    salesQty: a.salesQty,
    qtyPHA: a.qtyPHA, qtyKG: a.qtyKG, qtyCHY: a.qtyCHY,
    netRevenue: net,
    foodCost: a.foodCost,
    foodCostPct: net > 0 ? (a.foodCost / net) * 100 : 0,
    grossProfit: gp,
    grossMarginPct: net > 0 ? (gp / net) * 100 : 0,
    huyQtyPct: (a.salesQty + a.returnQty) > 0 ? (a.returnQty / (a.salesQty + a.returnQty)) * 100 : 0,
    huyValuePct: a.grossRevenue > 0 ? (a.returnValue / a.grossRevenue) * 100 : 0,
    asp: a.qtyPHA > 0 ? a.netPHA / a.qtyPHA : 0,
    aspKG: a.qtyKG > 0 ? a.netKG / a.qtyKG : 0,
    aspCHY: a.qtyCHY > 0 ? a.netCHY / a.qtyCHY : 0,
    invoiceCount: Object.keys(a.invoices).length,
    lines: a.lines
  };
}

function rev_groupBy(rows, keyFn, sortKey, limit) {
  var map = {};
  rows.forEach(function (r) {
    var k = keyFn(r);
    if (k === '' || k == null) return;
    if (!map[k]) map[k] = rev_agg();
    rev_push(map[k], r);
  });
  var out = Object.keys(map).map(function (k) {
    var m = rev_finalize(map[k]);
    m.key = k;
    return m;
  });
  if (sortKey) out.sort(function (a, b) { return (b[sortKey] || 0) - (a[sortKey] || 0); });
  return limit ? out.slice(0, limit) : out;
}
/* ---- Bổ sung cho chart "So sánh theo kỳ" + drill-down "Chi tiết theo site" ---- */

function rev_periodKey(ngay, gran) {
  var m = String(ngay || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  var y = +m[1], mo = +m[2], da = +m[3];
  if (gran === 'day')   return { key: ngay, label: m[3] + '/' + m[2] };
  if (gran === 'month') return { key: y + '-' + String(mo).padStart(2, '0'), label: 'T' + mo + '/' + y };
  if (gran === 'quarter') {
    var q = Math.floor((mo - 1) / 3) + 1;
    return { key: y + '-Q' + q, label: 'Q' + q + '/' + y };
  }
  if (gran === 'year') return { key: String(y), label: String(y) };
  if (gran === 'week') {
    var d = new Date(Date.UTC(y, mo - 1, da));
    var dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    var firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    var week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    var wy = d.getUTCFullYear();
    return { key: wy + '-W' + String(week).padStart(2, '0'), label: 'Tuần ' + week + '/' + wy };
  }
  return null;
}

function rev_groupByPeriod(rows, gran) {
  var map = {}, labelOf = {};
  rows.forEach(function (r) {
    var pk = rev_periodKey(r.ngay, gran);
    if (!pk) return;
    if (!map[pk.key]) { map[pk.key] = rev_agg(); labelOf[pk.key] = pk.label; }
    rev_push(map[pk.key], r);
  });
  return Object.keys(map).sort().map(function (k) {
    var m = rev_finalize(map[k]);
    return {
      key: k, label: labelOf[k],
      netRevenue: m.netRevenue, grossProfit: m.grossProfit,
      foodCost: m.foodCost, foodCostPct: m.foodCostPct, grossMarginPct: m.grossMarginPct
    };
  });
}

// Port từ revenue_resolveOpex_ trong Code.gs — tính OPEX áp dụng cho 1 phạm vi site+kỳ
function rev_resolveOpex(opexItems, f, siteList) {
  if (!opexItems || !opexItems.length) return { amount: 0, matched: 0 };
  var months = {};
  if (f && f.from && f.to) {
    var d = new Date(f.from + 'T00:00:00'), end = new Date(f.to + 'T00:00:00');
    while (d <= end) {
      months[d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')] = 1;
      d.setMonth(d.getMonth() + 1); d.setDate(1);
    }
  }
  var noRange = !(f && f.from && f.to);
  var total = 0, matched = 0;
  opexItems.forEach(function (it) {
    var per = it.period || 'ALL';
    var siteOk = (it.site === 'ALL') || (siteList && siteList.indexOf(it.site) >= 0) || (!siteList || !siteList.length);
    var periodOk = (per === 'ALL') || noRange || months[per];
    if (siteOk && periodOk) { total += it.amount; matched++; }
  });
  return { amount: total, matched: matched };
}

// Port từ revenue_matchHuySite_ trong Code.gs
function rev_matchHuySite(huyReport, siteName) {
  if (huyReport.bySite[siteName]) return huyReport.bySite[siteName];
  var norm = function (s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
  var target = norm(siteName);
  var keys = Object.keys(huyReport.bySite);
  for (var i = 0; i < keys.length; i++) {
    if (norm(keys[i]) === target) return huyReport.bySite[keys[i]];
  }
  return null;
}

// Tính tỷ lệ suất hủy CÓ LỌC theo ngày/site, từ dữ liệu thô huyRows.
// Port lại logic của revenue_huyFromReport_(f) trong Code.gs nhưng chạy client-side
// để card/bảng/chart suất hủy ăn theo filter giống mọi KPI khác.
function rev_huyFromReport(huyRows, f) {
  var out = { total: { suatHuy: 0, tongSuat: 0, pct: 0 }, bySite: {} };
  if (!huyRows || !huyRows.length) return out;

  var from = (f && f.from) || '', to = (f && f.to) || '';
  var sites = (f && f.sites && f.sites.length) ? f.sites : null;

  huyRows.forEach(function (r) {
    if (from && r.ngay < from) return;
    if (to && r.ngay > to) return;
    if (sites && sites.indexOf(r.tenSite) < 0) return;

    out.total.suatHuy += r.suatHuy;
    out.total.tongSuat += r.tongSuat;

    var key = r.tenSite;
    if (!out.bySite[key]) out.bySite[key] = { suatHuy: 0, tongSuat: 0, pct: 0, chiTiet: [] };
    out.bySite[key].suatHuy += r.suatHuy;
    out.bySite[key].tongSuat += r.tongSuat;
    if (r.suatHuy > 0) {
      out.bySite[key].chiTiet.push({
        ngay: r.ngay, suatHuy: r.suatHuy, tongSuat: r.tongSuat,
        pct: r.tongSuat > 0 ? (r.suatHuy / r.tongSuat) * 100 : 0,
        nguoiBaoCao: r.nguoiBaoCao || ''
      });
    }
  });

  out.total.pct = out.total.tongSuat > 0 ? (out.total.suatHuy / out.total.tongSuat) * 100 : 0;
  Object.keys(out.bySite).forEach(function (k) {
    var s = out.bySite[k];
    s.pct = s.tongSuat > 0 ? (s.suatHuy / s.tongSuat) * 100 : 0;
    s.chiTiet.sort(function (a, b) { return a.ngay < b.ngay ? 1 : -1; });
  });
  return out;
}

// Port từ khối build siteDetail trong getRevenueFoodCostData (Code.gs)
function rev_buildSiteDetail(dims, cur, f, opexItems, huyReport) {
  var siteDetail = {};
  (dims.sites || []).forEach(function (s) {
    var rs = cur.filter(function (r) { return r.site === s; });
    if (!rs.length) return;
    var a = rev_agg(); rs.forEach(function (r) { rev_push(a, r); });
    var m = rev_finalize(a);

    var opexSite = rev_resolveOpex(opexItems, f, [s]);
    m.opex = opexSite.amount;
    m.hasOpex = opexSite.matched > 0 && opexSite.amount > 0;
    m.ebitda = m.hasOpex ? (m.grossProfit - opexSite.amount) : null;

    var hSite = rev_matchHuySite(huyReport, s);
    var huyChiTiet = [];
    if (hSite) {
      m.huyReportPct = hSite.pct;
      m.huySuatHuy = hSite.suatHuy;
      m.huyTongSuat = hSite.tongSuat;
      m.huyHasReport = true;
      m.huyQtyPct = hSite.pct;
      huyChiTiet = (hSite.chiTiet || []).slice().sort(function (a, b) { return a.ngay < b.ngay ? 1 : -1; });
    } else {
      m.huyHasReport = false;
    }

    var ds = {}; rs.forEach(function (r) { if (r.ngay) ds[r.ngay] = 1; });
    m.operatingDays = Object.keys(ds).length;
    m.netPerDay = m.operatingDays > 0 ? m.netRevenue / m.operatingDays : 0;

    siteDetail[s] = {
      kpi: m,
      huyChiTiet: huyChiTiet,
      byKhachHang: rev_groupBy(rs, function (r) { return r.tenKH; }, 'netRevenue', 50),
      topSanPham: rev_groupBy(rs, function (r) { return r.tenSP; }, 'netRevenue', 20),
      topFoodCost: rev_groupBy(rs, function (r) { return r.tenSP; }, 'foodCostPct', 100)
        .filter(function (x) { return x.netRevenue > 0 && x.foodCostPct > 0; })
        .sort(function (a, b) { return b.foodCostPct - a.foodCostPct; })
        .slice(0, 15),
      byNhomSP: rev_groupBy(rs, function (r) { return r.nhomSP; }, 'netRevenue'),
      byDate: (function () {
        var d = rev_groupBy(rs, function (r) { return r.ngay; });
        d.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
        return d;
      })(),
      returns: rs.filter(function (r) { return r.isReturn; }).map(function (r) {
        return {
          ngay: r.ngay, soHoaDon: r.soHoaDon, tenKH: r.tenKH, tenSP: r.tenSP,
          soLuong: r.soLuong, thanhTien: r.thanhTien,
          lyDo: r.lyDoTraHang || '(Không ghi lý do)', soBillingGoc: r.soBillingGoc
        };
      }).slice(0, 200)
    };
  });
  return siteDetail;
}

function drawRevenue(){
  var k = REV.kpi, p = REV.kpiPrev, ng = REV.nguong;
  var d = function(cur, prev){ return prev > 0 ? r1(((cur-prev)/prev)*100) : null; };

  var html = '<div class="fade">';

  /* ===== KHỐI 1: KPI TỔNG QUAN (mục 5.1) ===== */
  html += '<div class="grid g6">';

  html += kpiCard(IC.wallet, 'Doanh thu thuần', fmtMoney(k.grossRevenue),
    k.invoiceCount+' hóa đơn • '+fmt(k.qtyPHA || 0)+' suất (PHA)',
    d(k.grossRevenue, p.grossRevenue), true, C.brand);

  // Food cost % - kèm gauge so dải mục tiêu 30-40%
  html += '<div class="kpi" style="border-left-color:'+C.gold+'">'+
    '<div class="kpi-top"><div>'+
      '<div class="kpi-lb">Food cost %</div>'+
      '<div class="kpi-v">'+fmtPct(k.foodCostPct)+'</div>'+
      '<div class="kpi-sub">giá vốn '+fmtMoney(k.foodCost)+'</div>'+
    '</div>'+
    // '<div class="kpi-ic" style="background:'+C.gold+'14;color:'+C.gold+'">'+svg(IC.trash,19)+'</div>'+
    '<div class="kpi-ic" style="background:'+C.gold+'14;color:'+C.gold+'">'+svg(IC.percent,19)+'</div>'+
    '</div>'+
    fcGauge(k.foodCostPct, ng.foodCostMin, ng.foodCostMax)+
  '</div>';

  // html += kpiCard(IC.bars, 'Lãi gộp', fmtMoney(k.grossProfit),
  //   'biên '+fmtPct(k.grossMarginPct),
  //   d(k.grossProfit, p.grossProfit), true,
  //   k.grossProfit >= 0 ? '#16A34A' : '#C0342C');

  html += kpiCard(IC.bars, 'Lãi gộp', fmtPct(k.grossMarginPct),
    fmtMoney(k.grossProfit)+' Doanh thu thuần - Giá vốn',
    d(k.grossProfit, p.grossProfit), true,
    k.grossProfit >= 0 ? '#16A34A' : '#C0342C');

  // Tỷ lệ hủy - LẤY TỪ SHEET REPORT (cột "Số suất hủy") + so ngưỡng 1.50%
  var huyColor = k.huyQtyPct <= ng.huyPct ? '#16A34A' : '#C0342C';
  var huySub = k.huyHasReport
    ? fmt(k.huySuatHuy)+' / '+fmt(k.huyTongSuat)+' suất (Report)'
    : 'Report chưa có dữ liệu • billing: '+fmtPct(k.huyValuePct);
  html += '<div class="kpi" style="border-left-color:'+huyColor+'">'+
    '<div class="kpi-top"><div>'+
      '<div class="kpi-lb">Tỷ lệ suất hủy</div>'+
      '<div class="kpi-v">'+fmtPct(k.huyQtyPct)+'</div>'+
      '<div class="kpi-sub">'+huySub+'</div>'+
    '</div>'+
    '<div class="kpi-ic" style="background:'+huyColor+'14;color:'+huyColor+'">'+svg(IC.trash,19)+'</div>'+
    '</div>'+
    thrBadge(k.huyQtyPct, ng.huyPct, '%', true)+
  '</div>';

  // EBITDA ước tính - chỉ hiện số khi đã nhập OPEX
  // html += '<div class="kpi" style="border-left-color:'+C.light+'">'+
  //   '<div class="kpi-top"><div>'+
  //     '<div class="kpi-lb">EBITDA ước tính</div>'+
  //     '<div class="kpi-v" style="'+(k.hasOpex?'':'font-size:15px;color:#B0B0B0')+'">'+
  //       (k.hasOpex ? fmtMoney(k.ebitda) : 'Chưa đủ dữ liệu OPEX')+'</div>'+
  //     (k.hasOpex
  //       ? '<div class="kpi-sub">OPEX '+fmtMoney(k.opex)+' • biên '+fmtPct(k.ebitdaPct)+'</div>'
  //       : '<div class="kpi-sub">nhập OPEX vào sheet OPEX_Input</div>')+
  //   '</div>'+

  html += '<div class="kpi" style="border-left-color:'+C.light+'">'+
    '<div class="kpi-top"><div>'+
      '<div class="kpi-lb">EBITDA ước tính</div>'+
      '<div class="kpi-v" style="'+(k.hasOpex?'':'font-size:15px;color:#B0B0B0')+'">'+
        (k.hasOpex ? fmtPct(k.ebitdaPct) : 'Chưa đủ dữ liệu OPEX')+'</div>'+
      (k.hasOpex
        ? '<div class="kpi-sub">'+fmtMoney(k.ebitda)+' • OPEX '+fmtMoney(k.opex)+'</div>'
        : '<div class="kpi-sub">nhập OPEX vào sheet OPEX_Input</div>')+
    '</div>'+  
    '<div class="kpi-ic" style="background:'+C.light+'14;color:'+C.light+'">'+svg(IC.wallet,19)+'</div>'+
    '</div>'+
    '<div class="kpi-warn">Ước tính = Lãi gộp − OPEX (sheet OPEX_Input). Chưa gồm chi phí tài chính, thuế.</div>'+
  '</div>';

  // Card thứ 6 của hàng 1: DT thuần / ngày vận hành
  html += kpiCard(IC.line, 'DT thuần / ngày vận hành', fmtMoney(k.netPerDay),
    k.operatingDays+' ngày có phát sinh', null, true, C.brand);

  html += '</div>';

  /* ===== KHỐI 2: SỐ LƯỢNG THEO ĐVT + ASP ===== */
  html += '<div class="grid g6" style="margin-top:13px">';


  // Chỉ đếm dòng ĐVT = PHA
  // Số lượng theo ĐVT
  html += kpiCard(IC.meal, 'Số suất ăn', fmt(k.qtyPHA || 0),
    'ĐVT = PHA', d(k.qtyPHA || 0, p.qtyPHA || 0), true, C.brand);

  html += kpiCard(IC.stack, 'Khối lượng đơn hàng (BTP)', fmt(k.qtyKG || 0),
    'ĐVT = KG', d(k.qtyKG || 0, p.qtyKG || 0), true, C.gold);

  html += kpiCard(IC.clock, 'Số lần vận chuyển', fmt(k.qtyCHY || 0),
    'ĐVT = CHY', d(k.qtyCHY || 0, p.qtyCHY || 0), true, C.light);

  // Đơn giá TB theo từng ĐVT
  html += kpiCard(IC.meal, 'Đơn giá TB / Suất (PHA)', fmtMoney(k.asp),
    fmt(k.qtyPHA)+' suất PHA', d(k.asp, p.asp), true, C.gold);

  if (k.aspKG > 0) {
    html += kpiCard(IC.stack, 'Đơn giá TB / KG', fmtMoney(k.aspKG),
      fmt(k.qtyKG)+' KG', d(k.aspKG, p.aspKG || 0), true, C.light);
  }

  if (k.aspCHY > 0) {
    html += kpiCard(IC.clock, 'Đơn giá TB / CHY', fmtMoney(k.aspCHY),
      fmt(k.qtyCHY)+' chuyến', d(k.aspCHY, p.aspCHY || 0), true, C.dark);
  }

  html += '</div>';


  /* OPEX đọc từ sheet OPEX_Input (người dùng tự nhập trực tiếp vào sheet) */
  html += '<div class="card" style="margin-top:13px">'+
    cardHead(IC.wallet,'Chi phí vận hành (OPEX) — nhập trực tiếp vào sheet OPEX_Input','')+
    '<div class="opex-note" style="margin-bottom:'+((REV.opexItems && REV.opexItems.length)?'11px':'0')+'">'+
      'Nhập OPEX theo cột <b>Site</b> (hoặc <b>ALL</b>) · <b>Ky</b> (yyyy-MM hoặc <b>ALL</b>) · <b>SoTien</b> trong sheet '+
      '<b>OPEX_Input</b>. Bao gồm lương, thuê mặt bằng, điện nước, khấu hao... '+
      'Nếu chưa nhập, EBITDA hiển thị "Chưa đủ dữ liệu OPEX".'+
    '</div>'+
    (REV.opexItems && REV.opexItems.length
      ? '<div class="tw"><table><thead><tr>'+
        '<th>Cửa hàng</th><th>Kỳ</th><th class="num">Số tiền</th><th>Cập nhật lúc</th>'+
        '</tr></thead><tbody>'+
        REV.opexItems.map(function(o){
          return '<tr><td>'+esc(o.site)+'</td><td>'+esc(o.period)+'</td>'+
                 '<td class="num">'+fmt(o.amount)+'₫</td><td style="color:#A0A0A0">'+esc(o.updatedAt)+'</td></tr>';
        }).join('')+'</tbody></table></div>'
      : '<div class="empty" style="padding:14px 0">Sheet OPEX_Input chưa có dữ liệu</div>')+
  '</div>';

  /* ===== KHỐI 4: CHARTS TỔNG QUAN (mục 5.2) ===== */
  html += '<div class="grid g2" style="margin-top:13px">';

  html += '<div class="card">'+cardHead(IC.line,'Doanh thu thuần & Food cost % theo ngày',
      '<div class="tg" id="rTgTrend">'+
        '<button data-v="net" class="'+(RUI.trendMetric==='net'?'on':'')+'">DT thuần</button>'+
        '<button data-v="gp" class="'+(RUI.trendMetric==='gp'?'on':'')+'">Lãi gộp</button>'+
      '</div>')+
    '<div class="cbox"><canvas id="chRevTrend"></canvas></div></div>';

  html += '<div class="card">'+cardHead(IC.bars,
      'Doanh thu thuần & Lãi gộp theo '+(RUI.barDim==='site'?'cửa hàng':'khách hàng'),
      '<div class="tg" id="rTgBarDim">'+
        '<button data-v="khachHang" class="'+(RUI.barDim==='khachHang'?'on':'')+'">Khách hàng</button>'+
        '<button data-v="site" class="'+(RUI.barDim==='site'?'on':'')+'">Cửa hàng</button>'+
      '</div>')+
    '<div class="cbox"><canvas id="chRevSite"></canvas></div></div>';

  html += '<div class="card">'+cardHead(IC.stack,'Cơ cấu doanh thu',
      '<div class="tg" id="rTgMix">'+
        '<button data-v="nhomSP" class="'+(RUI.mixDim==='nhomSP'?'on':'')+'">Nhóm SP</button>'+
        '<button data-v="nganhHang" class="'+(RUI.mixDim==='nganhHang'?'on':'')+'">Ngành hàng</button>'+
      '</div>')+
    '<div class="cbox"><canvas id="chRevMix"></canvas></div></div>';

  html += '<div class="card">'+cardHead(IC.stack,'Doanh thu theo kênh bán hàng','')+
    '<div class="cbox"><canvas id="chRevKenh"></canvas></div></div>';

  html += '<div class="card">'+cardHead(IC.trash,'Tỷ lệ hủy hàng theo cửa hàng (ngưỡng '+
      ng.huyPct.toFixed(2).replace('.',',')+'%)','')+
    '<div class="cbox"><canvas id="chRevHuy"></canvas></div></div>';

  html += '<div class="card">'+cardHead(IC.line,'Food cost % theo nhóm sản phẩm','')+
    '<div class="cbox"><canvas id="chRevFcNhom"></canvas></div></div>';

  html += '</div>';

  /* ===== KHỐI 4B: SO SÁNH THEO KỲ (ngày/tuần/tháng/quý/năm) ===== */
  html += '<div class="card" style="margin-top:13px">'+
    cardHead(IC.line,'So sánh Doanh thu • Lãi gộp • Food cost % theo kỳ',
      '<div class="tg" id="rTgPeriod">'+
        '<button data-v="day" class="'+(RUI.periodGran==='day'?'on':'')+'">Ngày</button>'+
        '<button data-v="week" class="'+(RUI.periodGran==='week'?'on':'')+'">Tuần</button>'+
        '<button data-v="month" class="'+(RUI.periodGran==='month'?'on':'')+'">Tháng</button>'+
        '<button data-v="quarter" class="'+(RUI.periodGran==='quarter'?'on':'')+'">Quý</button>'+
        '<button data-v="year" class="'+(RUI.periodGran==='year'?'on':'')+'">Năm</button>'+
      '</div>')+
    '<div class="cbox tall"><canvas id="chRevPeriod"></canvas></div>'+
    '<div style="font-size:11px;color:#A8A8A8;margin-top:6px">'+
      'Cột = Doanh thu thuần & Lãi gộp (trục trái) · Đường = Food cost % (trục phải). '+
      'Dùng toàn bộ dữ liệu theo bộ lọc (site/kênh/nhóm/NVKD/KH), không giới hạn khoảng ngày.'+
    '</div></div>';

  /* ===== KHỐI 5: BẢNG XẾP HẠNG CỬA HÀNG ===== */
  html += '<div class="card" style="margin-top:13px">'+
    cardHead(IC.grid,'Hiệu quả theo cửa hàng — bấm để xem chi tiết','')+
    '<div class="tw">'+revSiteTableHtml(REV.bySite, ng)+'</div></div>';

  /* ===== KHỐI 6: LÝ DO TRẢ HÀNG (mục 6.8) ===== */
  if (REV.byLyDoTraHang.length){
    html += '<div class="card" style="margin-top:13px">'+
      cardHead(IC.msg,'Phân tích nguyên nhân hủy / trả hàng','')+
      '<div class="tw"><table><thead><tr>'+
        '<th>Lý do trả hàng</th><th class="num">Số lượng</th>'+
        '<th class="num">Giá trị</th><th class="num">% trên tổng hủy</th>'+
      '</tr></thead><tbody>'+
      (function(){
        var tot = REV.byLyDoTraHang.reduce(function(s,x){ return s+x.returnValue; },0);
        return REV.byLyDoTraHang.map(function(x){
          return '<tr><td><b>'+esc(x.key)+'</b></td>'+
            '<td class="num">'+fmt(x.returnQty)+'</td>'+
            '<td class="num">'+fmt(x.returnValue)+'₫</td>'+
            '<td class="num">'+fmtPct(tot>0?(x.returnValue/tot)*100:0)+'</td></tr>';
        }).join('');
      })()+
      '</tbody></table></div></div>';
  }

  /* ===== KHỐI 7: DRILL-DOWN THEO CỬA HÀNG (mục 5.3) ===== */
  html += '<div class="card" style="margin-top:13px">'+
    cardHead(IC.grid,'Chi tiết theo cửa hàng / site','')+
    '<div class="chips" id="rChips">'+
      REV.bySite.map(function(s){
        return '<button class="chip'+(RUI.drillSite===s.key?' on':'')+'" data-site="'+esc(s.key)+'">'+
               esc(s.key)+'</button>';
      }).join('')+
    '</div>'+
    '<div id="rDrill" style="margin-top:14px"></div>'+
  '</div>';

  /* Doanh thu theo NVKD (mục 6.6) */
  if (REV.byNVKD.length > 1){
    html += '<div class="card" style="margin-top:13px">'+
      cardHead(IC.user,'Doanh thu & lãi gộp theo nhân viên kinh doanh','')+
      '<div class="tw"><table><thead><tr>'+
        '<th>Nhân viên kinh doanh</th><th class="num">DT thuần</th>'+
        '<th class="num">Lãi gộp</th><th class="num">Food cost %</th>'+
        '<th class="num">Biên gộp %</th><th class="num">Số HĐ</th>'+
      '</tr></thead><tbody>'+
      REV.byNVKD.map(function(x){
        return '<tr><td><b>'+esc(x.key)+'</b></td>'+
          '<td class="num">'+fmt(x.netRevenue)+'₫</td>'+
          '<td class="num">'+fmt(x.grossProfit)+'₫</td>'+
          '<td class="num '+fcCls(x.foodCostPct,ng)+'">'+fmtPct(x.foodCostPct)+'</td>'+
          '<td class="num">'+fmtPct(x.grossMarginPct)+'</td>'+
          '<td class="num">'+fmt(x.invoiceCount)+'</td></tr>';
      }).join('')+
      '</tbody></table></div></div>';
  }

  html += '<div style="margin-top:11px;font-size:11px;color:#A8A8A8">'+
    'Dữ liệu từ sheet <b>Transactions</b> • '+fmt(REV.filteredLines)+'/'+fmt(REV.totalLines)+
    ' dòng theo bộ lọc • cập nhật '+esc(REV.updatedAt)+
    (REV.prevRange ? ' • so sánh kỳ trước: '+REV.prevRange.from+' → '+REV.prevRange.to : '')+
  '</div>';

  html += '</div>';

  document.getElementById('tab-revenue').innerHTML = html;

  // Bọc riêng từng chart: 1 chart lỗi không được kéo sập các chart còn lại
  // + không được chặn bindRevenueEvents (nếu chặn -> nút Lưu OPEX/chip chết).
  var safe = function(name, fn){
    try { fn(); }
    catch(e){ console.error('Lỗi vẽ '+name+':', e); }
  };
  safe('trend',  drawRevTrend);
  safe('site',   drawRevSite);
  safe('mix',    drawRevMix);
  safe('kenh',   drawRevKenh);
  safe('huy',    drawRevHuy);
  safe('fcNhom', drawRevFcNhom);
  safe('period', drawRevPeriod);
  if (RUI.drillSite) safe('drill', function(){ renderRevDrill(RUI.drillSite); });
  bindRevenueEvents();   // luôn chạy để các nút/chip hoạt động
}

/* Bảng xếp hạng hiệu quả cửa hàng */
function revSiteTableHtml(list, ng){
  if (!list.length) return '<div class="empty">Không có dữ liệu trong kỳ</div>';
  var maxNet = Math.max.apply(null, list.map(function(x){ return x.netRevenue; }));

  var h = '<table><thead><tr>'+
    '<th>Cửa hàng / Site</th><th class="num">DT thuần</th><th class="num">Giá vốn</th>'+
    '<th class="num">Food cost %</th><th class="num">Lãi gộp</th><th class="num">Biên gộp %</th>'+
    '<th class="num">Suất hủy % (Report)</th><th class="num">Đơn giá TB</th><th class="num">ĐVT</th><th class="num">DT/ngày</th>'+
    '</tr></thead><tbody>';

  list.forEach(function(x){
    var w = maxNet>0 ? (x.netRevenue/maxNet)*100 : 0;
    var hasHuy = (x.huyReportPct !== null && x.huyReportPct !== undefined);
    var huyOk = x.huyQtyPct <= ng.huyPct;
    // ASP theo ĐVT chính của site (PHA > KG > CHY)
    var aspVal = x.aspSite || x.asp || 0;
    var aspUnit = x.aspDvt || 'PHA';
    h += '<tr class="hov" data-site="'+esc(x.key)+'">'+
      '<td><b>'+esc(x.key)+'</b></td>'+
      '<td class="num"><div class="dbar"><div class="dbar-track">'+
        '<div class="dbar-fill" style="width:'+w.toFixed(1)+'%;background:'+C.brand+'22"></div>'+
        '</div><span>'+fmtMoney(x.netRevenue)+'</span></div></td>'+
      '<td class="num">'+fmtMoney(x.foodCost)+'</td>'+
      '<td class="num '+fcCls(x.foodCostPct,ng)+'">'+fmtPct(x.foodCostPct)+'</td>'+
      '<td class="num" style="color:'+(x.grossProfit>=0?'#15803D':'#C0342C')+';font-weight:600">'+
        fmtMoney(x.grossProfit)+'</td>'+
      '<td class="num">'+fmtPct(x.grossMarginPct)+'</td>'+
      '<td class="num" style="color:'+(hasHuy?(huyOk?'#15803D':'#C0342C'):'#B0B0B0')+';font-weight:600">'+
        (hasHuy ? fmtPct(x.huyQtyPct) : '—')+'</td>'+
      '<td class="num">'+fmt(aspVal)+'₫</td>'+
      '<td class="ctr" style="font-size:11px;color:#999">'+esc(aspUnit)+'</td>'+
      '<td class="num">'+fmtMoney(x.netPerDay || 0)+'</td>'+
    '</tr>';
  });
  return h+'</tbody></table>';
}



/* ---------- CHARTS TAB DOANH THU ---------- */

// Line 2 trục: DT thuần (hoặc lãi gộp) + Food cost % (mục 5.2 & 6.5)
function drawRevTrend(){
  destroyChart('chRevTrend');
  var ctx = ctxOf('chRevTrend'); if (!ctx) return;
  var data = REV.byDate;
  if (!data.length) return;

  var isNet = RUI.trendMetric === 'net';
  var o = cloneOpt();
  o.scales = {
    x:{ ticks:{font:{size:10}}, grid:{display:false} },
    y:{ position:'left', beginAtZero:true, grid:{color:'#F0F0F0'},
        ticks:{font:{size:10}, callback:function(v){ return fmtMoney(v); }},
        title:{display:true, text:isNet?'DT thuần':'Lãi gộp', font:{size:10}, color:'#9A9A9A'} },
    y1:{ position:'right', beginAtZero:true, grid:{display:false},
         ticks:{font:{size:10}, callback:function(v){ return v+'%'; }},
         title:{display:true, text:'Food cost %', font:{size:10}, color:C.gold} }
  };
  o.plugins.tooltip.callbacks = {
    label:function(c){
      var isPctLine = c.dataset.yAxisID === 'y1';
      return c.dataset.label+': '+(isPctLine ? fmtPct(c.parsed.y) : fmt(c.parsed.y)+'₫');
    }
  };

  CHARTS.chRevTrend = new Chart(ctx, {
    type:'bar',
    data:{
      labels: data.map(function(x){ return dm(x.key); }),
      datasets:[
        { type:'bar', yAxisID:'y', order:2,
          label: isNet ? 'DT thuần' : 'Lãi gộp',
          data: data.map(function(x){ return isNet ? x.netRevenue : x.grossProfit; }),
          backgroundColor: C.brand+'CC', borderRadius:3, barPercentage:.72 },
        { type:'line', yAxisID:'y1', order:1, label:'Food cost %',
          data: data.map(function(x){ return r1(x.foodCostPct); }),
          borderColor: C.gold, backgroundColor:'transparent', borderWidth:2.2,
          tension:.3, pointRadius:2.5, pointBackgroundColor:C.gold }
      ]
    },
    options:o
  });
}
/** Ưu tiên REV.byKhachHang từ server; không có thì gộp từ siteDetail */
function revByKhachHangData(){
  if (REV.byKhachHang && REV.byKhachHang.length) return REV.byKhachHang;
  var map = {};
  var sd = REV.siteDetail || {};
  Object.keys(sd).forEach(function(site){
    var list = (sd[site] && sd[site].byKhachHang) ? sd[site].byKhachHang : [];
    list.forEach(function(x){
      var k = x.key || '(Không tên)';
      if (!map[k]) map[k] = { key:k, netRevenue:0, grossProfit:0, cogs:0, foodCostPct:0 };
      map[k].netRevenue  += x.netRevenue  || 0;
      map[k].grossProfit += x.grossProfit || 0;
      map[k].cogs        += x.cogs        || 0;
    });
  });
  return Object.keys(map).map(function(k){ return map[k]; })
    .sort(function(a,b){ return (b.netRevenue||0) - (a.netRevenue||0); });
}


// Bar ghép: DT thuần vs Lãi gộp theo site
// Bar ngang: DT thuần vs Lãi gộp — default khách hàng, toggle cửa hàng
function drawRevSite(){
  destroyChart('chRevSite');
  var ctx = ctxOf('chRevSite'); if (!ctx) return;

  var isSite = RUI.barDim === 'site';
  var data = isSite
    ? (REV.bySite || []).slice(0, 12)
    : revByKhachHangData().slice(0, 12);
  if (!data.length) return;

  var o = cloneOpt({ indexAxis:'y' });
  o.interaction = { mode:'index', intersect:false, axis:'y' };
  o.hover = { mode:'index', intersect:false, axis:'y' };
  o.scales = {
    x:{ beginAtZero:true, grid:{color:'#F0F0F0'},
        ticks:{font:{size:10}, callback:function(v){ return fmtMoney(v); }} },
    y:{ grid:{display:false}, ticks:{font:{size:10}} }
  };
  o.plugins.tooltip.callbacks = {
    title: function(items){
      if (!items || !items.length) return '';
      var i = items[0].dataIndex;
      var row = data[i];
      return (row && (row.key || row.site)) ? String(row.key || row.site) : '';
    },
    label: function(c){
      return '  ' + c.dataset.label + ': ' + fmt(c.parsed.x) + '₫';
    }
  };

  CHARTS.chRevSite = new Chart(ctx, {
    type:'bar',
    data:{
      labels: data.map(function(x){
        var lb = x.key || x.site || '';
        return lb.length > 28 ? lb.slice(0, 26) + '…' : lb;
      }),
      datasets:[
        { label:'DT thuần', data:data.map(function(x){ return x.netRevenue; }),
          backgroundColor: C.brand+'CC', borderRadius:4 },
        { label:'Lãi gộp', data:data.map(function(x){ return x.grossProfit; }),
          backgroundColor: C.gold+'CC', borderRadius:4 }
      ]
    },
    options:o
  });
}

// Cơ cấu doanh thu theo nhóm SP / ngành hàng
function drawRevMix(){
  destroyChart('chRevMix');
  var ctx = ctxOf('chRevMix'); if (!ctx) return;
  var src = RUI.mixDim === 'nhomSP' ? REV.byNhomSP : REV.byNganhHang;
  var data = src.slice(0, 8);
  if (!data.length) return;

  var o = cloneOpt();
  o.interaction = { mode:'nearest', intersect:true };
  o.plugins.legend = { position:'right', labels:{ font:{size:10.5}, boxWidth:11,
                       usePointStyle:true, padding:9 } };
  var total = data.reduce(function(s,x){ return s+x.netRevenue; },0);
  o.plugins.tooltip.callbacks = {
    label:function(c){
      var v = c.parsed;
      return c.label+': '+fmt(v)+'₫ ('+fmtPct(total>0?(v/total)*100:0)+')';
    }
  };
  delete o.scales;

  CHARTS.chRevMix = new Chart(ctx, {
    type:'doughnut',
    data:{
      labels: data.map(function(x){ return x.key; }),
      datasets:[{ data:data.map(function(x){ return x.netRevenue; }),
        backgroundColor:data.map(function(x,i){ return DONUT_PALETTE[i%DONUT_PALETTE.length]; }),
        borderWidth:2, borderColor:'#fff' }]
    },
    options:o
  });
}

// Doanh thu theo kênh bán hàng
function drawRevKenh(){
  destroyChart('chRevKenh');
  var ctx = ctxOf('chRevKenh'); if (!ctx) return;
  var data = REV.byKenh.slice(0, 10);
  if (!data.length) return;

  var o = cloneOpt();
  o.plugins.legend = { display:false };
  o.scales.y.ticks.callback = function(v){ return fmtMoney(v); };
  o.plugins.tooltip.callbacks = {
    label:function(c){
      var x = data[c.dataIndex];
      return ['DT thuần: '+fmt(x.netRevenue)+'₫',
              'Lãi gộp: '+fmt(x.grossProfit)+'₫',
              'Food cost: '+fmtPct(x.foodCostPct)];
    }
  };

  CHARTS.chRevKenh = new Chart(ctx, {
    type:'bar',
    data:{
      labels: data.map(function(x){ return x.key; }),
      datasets:[{ data:data.map(function(x){ return x.netRevenue; }),
        backgroundColor:C.dark+'CC', borderRadius:3, barPercentage:.68 }]
    },
    options:o
  });
}

// Tỷ lệ hủy theo site + đường ngưỡng 1.50% (mục 5.2)
function drawRevHuy(){
  destroyChart('chRevHuy');
  var ctx = ctxOf('chRevHuy'); if (!ctx) return;
  var ng = REV.nguong;
  // Chỉ lấy site có dữ liệu hủy từ Report (huyReportPct != null)
  var data = REV.bySite.slice()
    .filter(function(x){ return x.huyReportPct !== null && x.huyReportPct !== undefined; })
    .sort(function(a,b){ return b.huyQtyPct - a.huyQtyPct; })
    .slice(0, 12);
  if (!data.length){
    var el = document.getElementById('chRevHuy');
    if (el && el.parentNode) el.parentNode.innerHTML =
      '<div class="empty">Sheet Report chưa có dữ liệu suất hủy cho các cửa hàng trong kỳ này</div>';
    return;
  }

  var o = cloneOpt();
  o.plugins.legend = { display:false };
  o.scales.y.ticks.callback = function(v){ return v+'%'; };
  o.plugins.tooltip.callbacks = {
    label:function(c){
      var x = data[c.dataIndex];
      var over = x.huyQtyPct - ng.huyPct;
      return ['Tỷ lệ suất hủy: '+fmtPct(x.huyReportPct),
              fmt(x.huySuatHuy||0)+' / '+fmt(x.huyTongSuat||0)+' suất (Report)',
              over > 0 ? '▲ Vượt '+fmtPct(over)+' so định mức' : '✓ Trong định mức'];
    }
  };

  // Plugin vẽ đường ngưỡng nằm ngang
  var thrLine = {
    id:'akThrLine',
    afterDatasetsDraw:function(chart){
      var y = chart.scales.y, c = chart.ctx;
      var yPos = y.getPixelForValue(ng.huyPct);
      if (isNaN(yPos)) return;
      c.save();
      c.beginPath();
      c.moveTo(chart.chartArea.left, yPos);
      c.lineTo(chart.chartArea.right, yPos);
      c.lineWidth = 1.6; c.strokeStyle = '#C0342C';
      c.setLineDash([6,4]); c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#C0342C';
      c.font = 'bold 10px Segoe UI';
      c.textAlign = 'right';
      c.fillText('Định mức '+ng.huyPct.toFixed(2).replace('.',',')+'%',
                 chart.chartArea.right - 4, yPos - 5);
      c.restore();
    }
  };

  CHARTS.chRevHuy = new Chart(ctx, {
    type:'bar',
    data:{
      labels: data.map(function(x){ return x.key; }),
      datasets:[{ data:data.map(function(x){ return r1(x.huyQtyPct); }), borderRadius:3,
        barPercentage:.68,
        backgroundColor:data.map(function(x){
          return x.huyQtyPct <= ng.huyPct ? '#16A34ACC' : '#C0342CCC';
        }) }]
    },
    options:o,
    plugins:[thrLine]
  });
}

// Food cost % theo nhóm SP + dải mục tiêu (mục 6.4)
function drawRevFcNhom(){
  destroyChart('chRevFcNhom');
  var ctx = ctxOf('chRevFcNhom'); if (!ctx) return;
  var ng = REV.nguong;
  var FC_MARKS = { ok:58, warn:62, bad:65 };   // ← thêm dòng này, thay cho ng.foodCostMin/Max
  var data = REV.byNhomSP.slice()
    .filter(function(x){ return x.netRevenue > 0; })
    .sort(function(a,b){ return b.foodCostPct - a.foodCostPct; })
    .slice(0, 12);
  if (!data.length) return;

  var o = cloneOpt({ indexAxis:'y' });
  // Bar NGANG: trục index là Y -> đổi interaction sang trục y để hover đúng cột.
  o.interaction = { mode:'index', intersect:false, axis:'y' };
  o.hover = { mode:'index', intersect:false, axis:'y' };
  o.plugins.legend = { display:false };
  o.scales = {
    x:{ beginAtZero:true, grid:{color:'#F0F0F0'},
        ticks:{font:{size:10}, callback:function(v){ return v+'%'; }} },
    y:{ grid:{display:false}, ticks:{font:{size:10}} }
  };
  // o.plugins.tooltip.callbacks = {
  //   label:function(c){
  //     var x = data[c.dataIndex];
  //     return ['Food cost: '+fmtPct(x.foodCostPct),
  //             'DT thuần: '+fmt(x.netRevenue)+'₫',
  //             'Lãi gộp: '+fmt(x.grossProfit)+'₫',
  //             x.foodCostPct > ng.foodCostMax ? '▲ Trên mục tiêu '+ng.foodCostMax+'%'
  //               : (x.foodCostPct < ng.foodCostMin ? '✓ Dưới mục tiêu' : '~ Trong dải mục tiêu')];
  //   }
  // };
  o.plugins.tooltip.callbacks = {
  label:function(c){
    var x = data[c.dataIndex];
    var trangThai;
    if (x.foodCostPct <= FC_MARKS.ok)        trangThai = '✓ An toàn (≤'+FC_MARKS.ok+'%)';
    else if (x.foodCostPct <= FC_MARKS.warn) trangThai = '~ Cần lưu ý ('+FC_MARKS.ok+'-'+FC_MARKS.warn+'%)';
    else if (x.foodCostPct <= FC_MARKS.bad)  trangThai = '▲ Cảnh báo ('+FC_MARKS.warn+'-'+FC_MARKS.bad+'%)';
    else                                      trangThai = '✕ Vượt ngưỡng (>'+FC_MARKS.bad+'%)';
    return ['Food cost: '+fmtPct(x.foodCostPct),
            'DT thuần: '+fmt(x.netRevenue)+'₫',
            'Lãi gộp: '+fmt(x.grossProfit)+'₫',
            trangThai];
  }
  };

  // Vẽ 2 đường mốc biên dải mục tiêu
  // var bandLine = {
  //   id:'akFcBand',
  //   afterDatasetsDraw:function(chart){
  //     var x = chart.scales.x, c = chart.ctx;
  //     [[ng.foodCostMin,'#16A34A'],[ng.foodCostMax,'#C0342C']].forEach(function(pair){
  //       var xp = x.getPixelForValue(pair[0]);
  //       if (isNaN(xp)) return;
  //       c.save();
  //       c.beginPath();
  //       c.moveTo(xp, chart.chartArea.top); c.lineTo(xp, chart.chartArea.bottom);
  //       c.lineWidth = 1.4; c.strokeStyle = pair[1];
  //       c.setLineDash([5,4]); c.stroke();
  //       c.setLineDash([]);
  //       c.fillStyle = pair[1]; c.font = 'bold 9.5px Segoe UI'; c.textAlign = 'center';
  //       c.fillText(pair[0]+'%', xp, chart.chartArea.top - 2);
  //       c.restore();
  //     });
  //   }
  // };
  // Vẽ 3 đường mốc cảnh báo food cost
  // var bandLine = {
  //   id:'akFcBand',
  //   afterDatasetsDraw:function(chart){
  //     o.scales = {
  //       x:{ beginAtZero:true, grid:{color:'#F0F0F0'}, suggestedMax:70,   // ← thêm dòng này
  //           ticks:{font:{size:10}, callback:function(v){ return v+'%'; }} },
  //       y:{ grid:{display:false}, ticks:{font:{size:10}} }
  //     };
  //     //Scale
  //     var x = chart.scales.x, c = chart.ctx;
  //     [[58,'#16A34A'],[62,'#C9A227'],[65,'#C0342C']].forEach(function(pair){
  //       var xp = x.getPixelForValue(pair[0]);
  //       if (isNaN(xp)) return;
  //       c.save();
  //       c.beginPath();
  //       c.moveTo(xp, chart.chartArea.top); c.lineTo(xp, chart.chartArea.bottom);
  //       c.lineWidth = 1.4; c.strokeStyle = pair[1];
  //       c.setLineDash([5,4]); c.stroke();
  //       c.setLineDash([]);
  //       c.fillStyle = pair[1]; c.font = 'bold 9.5px Segoe UI'; c.textAlign = 'center';
  //       c.fillText(pair[0]+'%', xp, chart.chartArea.top - 2);
  //       c.restore();
  //     });
  //   }
  // };
  var bandLine = {
  id:'akFcBand',
  afterDatasetsDraw:function(chart){
    o.scales = {
        x:{ beginAtZero:true, grid:{color:'#F0F0F0'}, suggestedMax:70,   // ← thêm dòng này
            ticks:{font:{size:10}, callback:function(v){ return v+'%'; }} },
        y:{ grid:{display:false}, ticks:{font:{size:10}} }
      };
      //Scale
    var x = chart.scales.x, c = chart.ctx;
    [[FC_MARKS.ok,'#16A34A'],[FC_MARKS.warn,'#C9A227'],[FC_MARKS.bad,'#EA580C']].forEach(function(pair){
      var xp = x.getPixelForValue(pair[0]);
      if (isNaN(xp)) return;
      c.save();
      c.beginPath();
      c.moveTo(xp, chart.chartArea.top); c.lineTo(xp, chart.chartArea.bottom);
      c.lineWidth = 1.4; c.strokeStyle = pair[1];
      c.setLineDash([5,4]); c.stroke();
      c.setLineDash([]);
      c.fillStyle = pair[1]; c.font = 'bold 9.5px Segoe UI'; c.textAlign = 'center';
      c.fillText(pair[0]+'%', xp, chart.chartArea.top - 2);
      c.restore();
    });
  }
  };

  CHARTS.chRevFcNhom = new Chart(ctx, {
    type:'bar',
    data:{
      labels: data.map(function(x){ return x.key; }),
      datasets:[{ data:data.map(function(x){ return r1(x.foodCostPct); }), borderRadius:3,
        backgroundColor:data.map(function(x){
          // if (x.foodCostPct <= ng.foodCostMin) return '#16A34ACC';
          // if (x.foodCostPct <= ng.foodCostMax) return C.gold+'CC';
          // return '#C0342CCC';
          if (x.foodCostPct <= FC_MARKS.ok)   return '#16A34ACC';   // xanh: an toàn
          if (x.foodCostPct <= FC_MARKS.warn) return C.gold+'CC';   // vàng: cần lưu ý
          if (x.foodCostPct <= FC_MARKS.bad)  return '#EA580CCC';   // cam: cảnh báo
          return '#C0342CCC';                                       // đỏ: vượt ngưỡng
        }) }]
    },
    options:o,
    plugins:[bandLine]
  });
}

// Chart so sánh theo kỳ (ngày/tuần/tháng/quý/năm): cột DT thuần + Lãi gộp, đường Food cost %
function drawRevPeriod(){
  destroyChart('chRevPeriod');
  var ctx = ctxOf('chRevPeriod'); if (!ctx) return;
  var pc = REV.periodCompare || {};
  var data = pc[RUI.periodGran] || [];
  if (!data.length){
    var el = document.getElementById('chRevPeriod');
    if (el && el.parentNode) el.parentNode.innerHTML =
      '<div class="empty">Không có dữ liệu để so sánh theo kỳ</div>';
    return;
  }
  // Với ngày/tuần dữ liệu có thể rất dài -> lấy tối đa 30 kỳ gần nhất cho dễ nhìn
  var maxBars = (RUI.periodGran === 'day') ? 30 : (RUI.periodGran === 'week' ? 26 : 40);
  if (data.length > maxBars) data = data.slice(data.length - maxBars);

  var o = cloneOpt();
  o.scales = {
    x:{ ticks:{font:{size:10}, maxRotation:0, autoSkip:true}, grid:{display:false} },
    y:{ position:'left', beginAtZero:true, grid:{color:'#F0F0F0'},
        ticks:{font:{size:10}, callback:function(v){ return fmtMoney(v); }},
        title:{display:true, text:'DT thuần / Lãi gộp', font:{size:10}, color:'#9A9A9A'} },
    y1:{ position:'right', beginAtZero:true, grid:{display:false},
         ticks:{font:{size:10}, callback:function(v){ return v+'%'; }},
         title:{display:true, text:'Food cost %', font:{size:10}, color:C.gold} }
  };
  o.plugins.tooltip.callbacks = {
    label:function(c){
      if (c.dataset.yAxisID === 'y1') return c.dataset.label+': '+fmtPct(c.parsed.y);
      return c.dataset.label+': '+fmt(c.parsed.y)+'₫';
    }
  };

  CHARTS.chRevPeriod = new Chart(ctx, {
    type:'bar',
    data:{
      labels: data.map(function(x){ return x.label; }),
      datasets:[
        { type:'bar', yAxisID:'y', order:3, label:'DT thuần',
          data:data.map(function(x){ return x.netRevenue; }),
          backgroundColor:C.brand+'CC', borderRadius:3, barPercentage:.8, categoryPercentage:.7 },
        { type:'bar', yAxisID:'y', order:2, label:'Lãi gộp',
          data:data.map(function(x){ return x.grossProfit; }),
          backgroundColor:C.gold+'CC', borderRadius:3, barPercentage:.8, categoryPercentage:.7 },
        { type:'line', yAxisID:'y1', order:1, label:'Food cost %',
          data:data.map(function(x){ return r1(x.foodCostPct); }),
          borderColor:'#1D4ED8', backgroundColor:'transparent', borderWidth:2.2,
          tension:.3, pointRadius:2.5, pointBackgroundColor:'#1D4ED8' }
      ]
    },
    options:o
  });
}

/* ---------- DRILL-DOWN CHI TIẾT 1 CỬA HÀNG (mục 5.3) ---------- */
function renderRevDrill(site){
  var box = document.getElementById('rDrill');
  if (!box) return;
  var sd = REV.siteDetail[site];
  if (!sd){ box.innerHTML = '<div class="empty">Cửa hàng này không có dữ liệu trong kỳ</div>'; return; }

  var k = sd.kpi, ng = REV.nguong;
  var h = '';

  /* KPI riêng của site */
  h += '<div class="grid g6">'+
    kpiCard(IC.wallet,'DT thuần', fmtMoney(k.netRevenue), k.invoiceCount+' hóa đơn', null, true, C.brand)+
    // kpiCard(IC.trash,'Food cost %', fmtPct(k.foodCostPct), fmtMoney(k.foodCost), null, false,
    //   k.foodCostPct <= ng.foodCostMax ? '#16A34A' : '#C0342C')+
    kpiCard(IC.percent,'Food cost %', fmtPct(k.foodCostPct), fmtMoney(k.foodCost), null, false,
      k.foodCostPct <= ng.foodCostMax ? '#16A34A' : '#C0342C')+
    kpiCard(IC.bars,'Lãi gộp', fmtMoney(k.grossProfit), 'biên '+fmtPct(k.grossMarginPct), null, true,
      k.grossProfit >= 0 ? '#16A34A' : '#C0342C')+
    '<div class="kpi" style="border-left-color:'+(k.huyQtyPct<=ng.huyPct?'#16A34A':'#C0342C')+'">'+
      '<div class="kpi-top"><div><div class="kpi-lb">Tỷ lệ suất hủy</div>'+
      '<div class="kpi-v">'+fmtPct(k.huyQtyPct)+'</div>'+
      '<div class="kpi-sub">'+(k.huyHasReport
        ? fmt(k.huySuatHuy)+'/'+fmt(k.huyTongSuat)+' suất (Report)'
        : 'Report chưa có dữ liệu')+'</div></div></div>'+
      thrBadge(k.huyQtyPct, ng.huyPct, '%', true)+'</div>'+
    kpiCard(IC.meal,'ASP', fmt(k.asp)+'₫', fmt(k.salesQty)+' suất', null, true, C.gold)+
    kpiCard(IC.wallet,'EBITDA ước tính',
      k.hasOpex ? fmtMoney(k.ebitda) : '—',
      k.hasOpex ? 'OPEX '+fmtMoney(k.opex) : 'chưa nhập OPEX cho site', null, true, C.light)+
  '</div>';

  /* Bảng khách hàng - đánh giá mức độ tập trung */
  var totNet = k.netRevenue;
  h += '<div class="grid g2" style="margin-top:13px">';

  h += '<div class="card" style="box-shadow:none;border-color:#EFEFEF">'+
    cardHead(IC.smile,'Doanh thu theo khách hàng','')+
    '<div class="tw" style="max-height:330px"><table><thead><tr>'+
      '<th>Khách hàng</th><th class="num">DT thuần</th><th class="num">%</th>'+
      '<th class="num">Food cost %</th><th class="num">Lãi gộp</th>'+
    '</tr></thead><tbody>'+
    sd.byKhachHang.map(function(x){
      return '<tr><td>'+esc(x.key)+'</td>'+
        '<td class="num">'+fmtMoney(x.netRevenue)+'</td>'+
        '<td class="num">'+fmtPct(totNet>0?(x.netRevenue/totNet)*100:0)+'</td>'+
        '<td class="num '+fcCls(x.foodCostPct,ng)+'">'+fmtPct(x.foodCostPct)+'</td>'+
        '<td class="num" style="color:'+(x.grossProfit>=0?'#15803D':'#C0342C')+'">'+
          fmtMoney(x.grossProfit)+'</td></tr>';
    }).join('')+
    '</tbody></table></div></div>';

  h += '<div class="card" style="box-shadow:none;border-color:#EFEFEF">'+
    cardHead(IC.meal,'Top sản phẩm theo doanh thu','')+
    '<div class="tw" style="max-height:330px"><table><thead><tr>'+
      '<th>Sản phẩm</th><th class="num">SL</th><th class="num">DT thuần</th>'+
      '<th class="num">Food cost %</th>'+
    '</tr></thead><tbody>'+
    sd.topSanPham.map(function(x){
      return '<tr><td>'+esc(x.key)+'</td>'+
        '<td class="num">'+fmt(x.salesQty)+'</td>'+
        '<td class="num">'+fmtMoney(x.netRevenue)+'</td>'+
        '<td class="num '+fcCls(x.foodCostPct,ng)+'">'+fmtPct(x.foodCostPct)+'</td></tr>';
    }).join('')+
    '</tbody></table></div></div>';

  h += '</div>';

  /* Sản phẩm ăn mòn biên lợi nhuận */
  if (sd.topFoodCost.length){
    h += '<div class="card" style="margin-top:13px;box-shadow:none;border-color:#EFEFEF">'+
      cardHead(IC.trash,'Sản phẩm có food cost % cao nhất','')+
      '<div class="tw"><table><thead><tr>'+
        '<th>Sản phẩm</th><th class="num">Food cost %</th><th class="num">DT thuần</th>'+
        '<th class="num">Giá vốn</th><th class="num">Lãi gộp</th><th class="num">SL</th>'+
      '</tr></thead><tbody>'+
      sd.topFoodCost.map(function(x){
        return '<tr><td>'+esc(x.key)+'</td>'+
          '<td class="num '+fcCls(x.foodCostPct,ng)+'">'+fmtPct(x.foodCostPct)+'</td>'+
          '<td class="num">'+fmtMoney(x.netRevenue)+'</td>'+
          '<td class="num">'+fmtMoney(x.foodCost)+'</td>'+
          '<td class="num" style="color:'+(x.grossProfit>=0?'#15803D':'#C0342C')+'">'+
            fmtMoney(x.grossProfit)+'</td>'+
          '<td class="num">'+fmt(x.salesQty)+'</td></tr>';
      }).join('')+
      '</tbody></table></div>'+
      '<div style="margin-top:8px;font-size:11px;color:#A08000">'+
        //'Lưu ý: food cost % bất thường cao (>60%) hoặc âm thường là dấu hiệu nhập sai giá vốn trong master data.'+
      '</div></div>';
  }

  /* Chi tiết suất hủy theo ngày - lấy từ sheet REPORT (cột "Số suất hủy") */
  var huyCt = sd.huyChiTiet || [];
  if (huyCt.length){
    h += '<div class="card" style="margin-top:13px;box-shadow:none;border-color:#EFEFEF">'+
      cardHead(IC.trash,'Chi tiết suất hủy theo ngày ('+huyCt.length+' ngày có hủy — nguồn: sheet Report)','')+
      '<div class="tw" style="max-height:320px"><table><thead><tr>'+
        '<th>Ngày</th><th class="num">Số suất hủy</th><th class="num">Tổng suất</th>'+
        '<th class="num">Tỷ lệ hủy</th><th>So định mức '+ng.huyPct.toFixed(2).replace('.',',')+'%</th>'+
        '<th>Người báo cáo</th>'+
      '</tr></thead><tbody>'+
      huyCt.map(function(x){
        var ok = x.pct <= ng.huyPct;
        return '<tr><td>'+esc(x.ngay)+'</td>'+
          '<td class="num" style="font-weight:600">'+fmt(x.suatHuy)+'</td>'+
          '<td class="num">'+fmt(x.tongSuat)+'</td>'+
          '<td class="num '+(ok?'fc-ok':'fc-hi')+'">'+fmtPct(x.pct)+'</td>'+
          '<td style="color:'+(ok?'#15803D':'#C0342C')+';font-weight:600">'+
            (ok?'✓ trong định mức':'▲ vượt '+fmtPct(x.pct-ng.huyPct))+'</td>'+
          '<td style="color:#A0A0A0">'+esc(x.nguoiBaoCao||'—')+'</td></tr>';
      }).join('')+
      '</tbody></table></div>'+
      '<div style="margin-top:8px;font-size:11px;color:#A8A8A8">'+
        'Tổng kỳ: '+fmt(sd.kpi.huySuatHuy||0)+' suất hủy / '+fmt(sd.kpi.huyTongSuat||0)+
        ' suất = '+fmtPct(sd.kpi.huyQtyPct)+'</div>'+
    '</div>';
  } else {
    h += '<div class="card" style="margin-top:13px;box-shadow:none;border-color:#EFEFEF">'+
      '<div class="empty">Sheet Report chưa có dữ liệu suất hủy cho cửa hàng này trong kỳ</div></div>';
  }

  box.innerHTML = h;
}

/* ---------- EVENTS TAB DOANH THU ---------- */
function bindRevenueEvents(){
  // Toggle line chart metric
  var tgT = document.getElementById('rTgTrend');
  if (tgT) tgT.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    RUI.trendMetric = b.dataset.v;
    tgT.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x===b); });
    drawRevTrend();
  });

  // Toggle cơ cấu doanh thu
  var tgM = document.getElementById('rTgMix');
  if (tgM) tgM.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    RUI.mixDim = b.dataset.v;
    tgM.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x===b); });
    drawRevMix();
  });
    // Toggle chart: Khách hàng (default) | Cửa hàng
  var tgBar = document.getElementById('rTgBarDim');
  if (tgBar) tgBar.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    RUI.barDim = b.dataset.v;
    tgBar.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x===b); });
    // Đổi tiêu đề card
    var title = tgBar.closest('.card') && tgBar.closest('.card').querySelector('.card-t h3');
    if (title){
      // giữ icon SVG nếu có — chỉ sửa text node cuối
      var txt = 'Doanh thu thuần & Lãi gộp theo ' + (RUI.barDim==='site' ? 'cửa hàng' : 'khách hàng');
      // Cách an toàn: vẽ lại chart là đủ; title cập nhật khi drawRevenue lần sau
    }
    drawRevSite();
  });


  // Toggle kỳ so sánh (ngày/tuần/tháng/quý/năm)
  var tgP = document.getElementById('rTgPeriod');
  if (tgP) tgP.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    RUI.periodGran = b.dataset.v;
    tgP.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x===b); });
    try { drawRevPeriod(); } catch(err){ console.error('Lỗi vẽ period:', err); }
  });

  // Chip chọn site drill-down
  var chips = document.getElementById('rChips');
  if (chips) chips.addEventListener('click', function(e){
    var b = e.target.closest('.chip'); if (!b) return;
    var s = b.dataset.site;
    RUI.drillSite = (RUI.drillSite === s) ? '' : s;
    chips.querySelectorAll('.chip').forEach(function(x){
      x.classList.toggle('on', x.dataset.site === RUI.drillSite);
    });
    if (RUI.drillSite) renderRevDrill(RUI.drillSite);
    else document.getElementById('rDrill').innerHTML = '';
  });

  // Bấm dòng bảng xếp hạng -> mở drill-down site đó
  document.querySelectorAll('#tab-revenue tr.hov[data-site]').forEach(function(tr){
    tr.addEventListener('click', function(){
      RUI.drillSite = tr.dataset.site;
      var chipsEl = document.getElementById('rChips');
      if (chipsEl) chipsEl.querySelectorAll('.chip').forEach(function(x){
        x.classList.toggle('on', x.dataset.site === RUI.drillSite);
      });
      renderRevDrill(RUI.drillSite);
      var d = document.getElementById('rDrill');
      if (d) d.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  });

  // OPEX nhập trực tiếp vào sheet OPEX_Input -> không còn nút Lưu trên UI.
}

/* ---------- BIND BỘ LỌC TAB DOANH THU (gọi 1 lần khi khởi động) ---------- */
function bindRevenueFilters(){
  var reload = function(){ RUI.drillSite = ''; computeAndDrawRevenue(); };

  document.getElementById('rFrom').addEventListener('change', function(){ RF.from = this.value; reload(); });
  document.getElementById('rTo').addEventListener('change',   function(){ RF.to   = this.value; reload(); });
  document.getElementById('rKenh').addEventListener('change', function(){ RF.kenh = this.value; reload(); });
  document.getElementById('rNhom').addEventListener('change', function(){ RF.nhomSP = this.value; reload(); });
  document.getElementById('rNVKD').addEventListener('change', function(){ RF.nvkd = this.value; reload(); });
  document.getElementById('rKH').addEventListener('change',   function(){ RF.khachHang = this.value; reload(); });

  var msBtn = document.getElementById('rMsBtn'), msPop = document.getElementById('rMsPop');
  msBtn.addEventListener('click', function(e){ e.stopPropagation(); msPop.classList.toggle('open'); });
  document.addEventListener('click', function(e){
    if (!document.getElementById('rMsWrap').contains(e.target)) msPop.classList.remove('open');
  });
  msPop.addEventListener('change', function(e){
    if (e.target.type !== 'checkbox') return;
    var v = e.target.value;
    if (e.target.checked){ if (RF.sites.indexOf(v) < 0) RF.sites.push(v); }
    else RF.sites = RF.sites.filter(function(s){ return s !== v; });
    updateRevMsLabel(); reload();
  });
  document.getElementById('rMsAll').addEventListener('click', function(){
    var all = RF.sites.length === 0;
    RF.sites = all && REV ? REV.dims.sites.slice() : [];
    msPop.querySelectorAll('input[type=checkbox]').forEach(function(c){ c.checked = !!all; });
    updateRevMsLabel(); reload();
  });

  document.getElementById('rBtnReset').addEventListener('click', function(){
    RF = { from:'', to:'', sites:[], kenh:'', nhomSP:'', nvkd:'', khachHang:'' };
    RUI.drillSite = ''; REV_INIT = false; REV = null;
    //loadRevenue();
    computeAndDrawRevenue();
  });
  document.getElementById('rBtnRefresh').addEventListener('click', function(){
    refreshAllTabs(true);
  });
}
/* =========================================================================
   TAB 5 - SO SÁNH THEO KỲ vs KẾ HOẠCH
   Toàn bộ số liệu (kế hoạch + thực tế đã ghép) tính sẵn ở kehoach.gs,
   phần này chỉ render + vẽ chart. Tái sử dụng fmt/fmtMoney/fmtPct/esc/svg/IC/C/
   cloneOpt/destroyChart/ctxOf/cardHead/PALETTE đã có sẵn ở các tab trên.
   ========================================================================= */

// 6 chỉ tiêu đúng theo yêu cầu: Doanh thu, Sản lượng, Food cost %, Lãi gộp,
// Tỷ lệ suất hủy %, EBITDA. get(o) nhận vào 1 object đã cộng dồn (xem
// kh_periodAgg/kh_aggAll) và trả {actual, plan} - actual=null nghĩa là
// chưa có số liệu thực tế (ví dụ tháng tương lai hoặc chưa nhập OPEX).
var METRICS_KH = [
  { key:'DoanhThu', label:'Doanh thu', icon:IC.wallet, color:C.brand, higherBetter:true, fmt:fmtMoney,
    get:function(o){ return { actual:o.DoanhThu.actual, plan:o.DoanhThu.plan }; } },
  { key:'SanLuong', label:'Sản lượng', icon:IC.meal, color:C.gold, higherBetter:true, fmt:fmt,
    get:function(o){ return { actual:o.SanLuong.actual, plan:o.SanLuong.plan }; } },
  { key:'FoodCost', label:'Food cost %', icon:IC.percent, color:'#EA580C', higherBetter:false, fmt:fmtPct,
    get:function(o){ return { actual:o.FoodCost.actualPct, plan:o.FoodCost.planPct }; } },
  { key:'LaiGop', label:'Lãi gộp', icon:IC.bars, color:'#16A34A', higherBetter:true, fmt:fmtMoney,
    get:function(o){ return { actual:o.LaiGop.actual, plan:o.LaiGop.plan }; } },
  { key:'Huy', label:'Tỷ lệ suất hủy %', icon:IC.trash, color:'#C0342C', higherBetter:false, fmt:fmtPct,
    get:function(o){ return { actual:o.Huy.actual, plan:o.Huy.plan }; } },
  // ===== THÊM MỚI (ngay trên EBITDA) =====
  { key:'VatTuTieuHao', label:'Giá trị vật tư tiêu hao', icon:IC.stack, color:'#7C3AED', higherBetter:false, fmt:fmtMoney,
    get:function(o){ return { actual:o.VatTuTieuHao.actual, plan:o.VatTuTieuHao.plan }; } },
  // ======================================
  { key:'EBITDA', label:'EBITDA', icon:IC.wallet, color:'#1D4ED8', higherBetter:true, fmt:fmtMoney,
    get:function(o){ return { actual:o.EBITDA.hasActual ? o.EBITDA.actual : null, plan:o.EBITDA.plan }; } }
];

// % đạt kế hoạch: chỉ tiêu càng cao càng tốt -> actual/plan*100;
// càng thấp càng tốt (food cost, suất hủy) -> plan/actual*100 (đảo ngược).
// Trả null khi chưa có actual hoặc plan <=0 (âm/bằng 0 thường gặp ở EBITDA
// giai đoạn đầu -> % sẽ gây hiểu nhầm nên không tính, xem số tuyệt đối ở bảng).
function kh_ach(m, actual, plan){
  if (actual === null || actual === undefined) return null;
  if (!plan || plan <= 0) return null;
  return m.higherBetter ? (actual/plan)*100 : (plan/actual)*100;
}

function kh_selSites(){ return PF.site ? [PF.site] : (KH ? KH.sites : []); }

// Cộng dồn nhiều site trong 1 kỳ hiển thị -> 1 object chuẩn cho METRICS_KH.get()
function kh_periodAgg(per, sites){
  var o = { DoanhThu:{actual:0,plan:0}, SanLuong:{actual:0,plan:0},
            FoodCost:{actualVal:0,planVal:0,actualPct:0,planPct:0},
            LaiGop:{actual:0,plan:0},
            Huy:{actualHuy:0,actualTong:0,actual:0,plan:KH.nguong.huyPct},
            VatTuTieuHao:{actual:0, plan:0},   // ← THÊM DÒNG NÀY
            EBITDA:{actual:0,plan:0,hasActual:false} };
  sites.forEach(function(s){
    var a = per.bySite[s]; if (!a) return;
    o.DoanhThu.actual += a.DoanhThu.actual; o.DoanhThu.plan += a.DoanhThu.plan;
    o.SanLuong.actual += a.SanLuongTong.actual; o.SanLuong.plan += a.SanLuongTong.plan;
    o.FoodCost.actualVal += a.FoodCost.actualVal; o.FoodCost.planVal += a.FoodCost.planVal;
    o.LaiGop.actual += a.LaiGop.actual; o.LaiGop.plan += a.LaiGop.plan;
    o.Huy.actualHuy += a.HuyPct.actualHuy; o.Huy.actualTong += a.HuyPct.actualTong;
    // ← THÊM 2 DÒNG NÀY
    o.VatTuTieuHao.actual += a.VatTuTieuHao ? a.VatTuTieuHao.actual : 0;
    o.VatTuTieuHao.plan   += a.VatTuTieuHao ? a.VatTuTieuHao.plan   : 0;
    if (a.EBITDA.hasActual){ o.EBITDA.actual += a.EBITDA.actual; o.EBITDA.hasActual = true; }
    o.EBITDA.plan += a.EBITDA.plan;
  });
  o.FoodCost.actualPct = o.DoanhThu.actual>0 ? (o.FoodCost.actualVal/o.DoanhThu.actual)*100 : 0;
  o.FoodCost.planPct   = o.DoanhThu.plan>0   ? (o.FoodCost.planVal/o.DoanhThu.plan)*100   : 0;
  o.Huy.actual = o.Huy.actualTong>0 ? (o.Huy.actualHuy/o.Huy.actualTong)*100 : 0;
  return o;
}

// Cộng dồn qua NHIỀU kỳ (dùng cho card KPI tổng - cộng đúng theo tử số/mẫu số
// thay vì lấy trung bình cộng % đơn giản, để food cost% và suất hủy% chính xác)
function kh_aggAll(sites, periods){
  var o = { DoanhThu:{actual:0,plan:0}, SanLuong:{actual:0,plan:0},
            FoodCost:{actualVal:0,planVal:0,actualPct:0,planPct:0},
            LaiGop:{actual:0,plan:0},
            Huy:{actualHuy:0,actualTong:0,actual:0,plan:KH.nguong.huyPct},
            VatTuTieuHao:{actual:0, plan:0},   // ← THÊM DÒNG NÀY
            EBITDA:{actual:0,plan:0,hasActual:false} };
  periods.forEach(function(per){
    var p = kh_periodAgg(per, sites);
    o.DoanhThu.actual+=p.DoanhThu.actual; o.DoanhThu.plan+=p.DoanhThu.plan;
    o.SanLuong.actual+=p.SanLuong.actual; o.SanLuong.plan+=p.SanLuong.plan;
    o.FoodCost.actualVal+=p.FoodCost.actualVal; o.FoodCost.planVal+=p.FoodCost.planVal;
    o.LaiGop.actual+=p.LaiGop.actual; o.LaiGop.plan+=p.LaiGop.plan;
    o.Huy.actualHuy+=p.Huy.actualHuy; o.Huy.actualTong+=p.Huy.actualTong;
    // ← THÊM 2 DÒNG NÀY
    o.VatTuTieuHao.actual += p.VatTuTieuHao ? p.VatTuTieuHao.actual : 0;
    o.VatTuTieuHao.plan   += p.VatTuTieuHao ? p.VatTuTieuHao.plan   : 0;
    if (p.EBITDA.hasActual){ o.EBITDA.actual+=p.EBITDA.actual; o.EBITDA.hasActual=true; }
    o.EBITDA.plan+=p.EBITDA.plan;
  });
  o.FoodCost.actualPct = o.DoanhThu.actual>0 ? (o.FoodCost.actualVal/o.DoanhThu.actual)*100 : 0;
  o.FoodCost.planPct   = o.DoanhThu.plan>0   ? (o.FoodCost.planVal/o.DoanhThu.plan)*100   : 0;
  o.Huy.actual = o.Huy.actualTong>0 ? (o.Huy.actualHuy/o.Huy.actualTong)*100 : 0;
  return o;
}

/* ---------- NẠP DỮ LIỆU TỪ BACKEND ---------- */
function loadKeHoach(){
  if (KH_LOADING) return;
  KH_LOADING = true;
  var box = document.getElementById('tab-kehoach');
  box.innerHTML = '<div class="card"><div class="empty">Đang tải dữ liệu kế hoạch...</div></div>';

  callAPI('getKeHoachData', {filters: JSON.stringify({ gran: PF.gran, nPeriods: PF.nPeriods, sites: PF.site ? [PF.site] : [] })})
    .then(function(res){
      KH_LOADING = false;
      if (res.updatedAt) {
        document.getElementById('updAt').textContent = fmtUpdatedAt(res.updatedAt);
        setLive(true, liveLabel(res.updatedAt));
        }
      if (!res || !res.ok){
        box.innerHTML = '<div class="card"><div class="empty">'+
          esc((res && res.message) || 'Không đọc được dữ liệu kế hoạch')+'</div></div>';
        return;
      }
      if (res.empty){
        box.innerHTML = '<div class="card"><div class="empty">'+esc(res.message)+'</div></div>';
        return;
      }
      try {
        KH = res;
        if (!KH_INIT){ buildKehoachFilters(); KH_INIT = true; }
        drawKehoach();
      } catch (e) {
        console.error('Lỗi render tab kế hoạch:', e);
        box.innerHTML = '<div class="card"><div class="empty">'+
          'Lỗi hiển thị dữ liệu kế hoạch: '+esc(String(e && e.message ? e.message : e))+
          '<br><span style="font-size:11px;color:#999">Mở Console (F12) để xem chi tiết.</span></div></div>';
      }
    })
    .catch(function(err){
      KH_LOADING = false;
      box.innerHTML = '<div class="card"><div class="empty">'+
        'Lỗi tải dữ liệu từ server: '+esc(String(err && err.message ? err.message : err))+'</div></div>';
    });
}

function renderKeHoach(){ if (!KH){ loadKeHoach(); return; } drawKehoach(); }

function buildKehoachFilters(){
  var sel = document.getElementById('pfSite');
  sel.innerHTML = '<option value="">Tất cả site (cộng dồn)</option>'+
    KH.sites.map(function(s){
      return '<option value="'+esc(s)+'"'+(PF.site===s?' selected':'')+'>'+esc(s)+'</option>';
    }).join('');
}

function khInfoItem(label, val){
  return '<div><div style="font-size:10.5px;color:#A0A0A0;font-weight:600">'+esc(label)+'</div>'+
    '<div style="font-size:13px;font-weight:700;color:#444;margin-top:2px">'+
    esc(val==null||val===''?'—':val)+'</div></div>';
}

/* ---------- RENDER CHÍNH TAB KẾ HOẠCH ---------- */
function drawKehoach(){
  var sites = kh_selSites();
  var periods = KH.periods;
  if (!periods.length){
    document.getElementById('tab-kehoach').innerHTML =
      '<div class="card"><div class="empty">Không có kỳ kế hoạch nào phù hợp bộ lọc</div></div>';
    return;
  }

  var html = '<div class="fade">';

  // Thông tin dự án - chỉ hiện khi chọn đúng 1 site cụ thể
  // So khớp mềm tên site với sheet KeHoach_DuAn
  // So khớp mềm tên site với sheet KeHoach_DuAn
  var duAnInfo = null;
  if (PF.site && KH.duAn) {
    duAnInfo = KH.duAn[PF.site] || null;
    if (!duAnInfo) {
      var target = String(PF.site).toLowerCase().replace(/\s+/g,' ').trim();
      Object.keys(KH.duAn).forEach(function(k){
        if (!duAnInfo && String(k).toLowerCase().replace(/\s+/g,' ').trim() === target) {
          duAnInfo = KH.duAn[k];
        }
      });
    }
  }

  // Thông tin dự án + Giả định — mặc định THU GỌN, bấm tiêu đề để mở
  if (duAnInfo){
    var d = duAnInfo;
    var duAnOpen = !!KHUI.duAnOpen;
    html += '<div class="card" id="khDuAnCard">'+
      '<div class="card-t" id="khDuAnToggle" style="cursor:pointer;user-select:none;margin-bottom:'+(duAnOpen?'11px':'0')+'">'+
        '<h3>'+svg(IC.table,15,C.brand)+'Thông tin dự án'+
          '<span style="font-weight:400;color:#B0B0B0;margin-left:8px;font-size:11.5px">'+(duAnOpen?'':'— bấm để xem')+'</span>'+
        '</h3>'+
        '<span style="color:#C0C0C0;font-size:14px;font-weight:700">'+(duAnOpen?'▾':'▸')+'</span>'+
      '</div>'+
      '<div id="khDuAnBody" class="'+(duAnOpen?'':'hide')+'">'+
        '<div class="grid g4" style="gap:10px">'+
          khInfoItem('Tên dự án', d.tenDuAn)+
          khInfoItem('Quản lý dự án', d.quanLy)+
          khInfoItem('Ngày trình', d.ngayTrinh)+
          khInfoItem('Phiên bản kế hoạch', d.version)+
          khInfoItem('Tổng sản lượng 12 tháng (KH)', fmt(d.tongSanLuong12T)+' suất')+
          khInfoItem('Tổng doanh thu 12 tháng (KH)', fmtMoney(d.tongDoanhThu12T))+
          khInfoItem('Biên lãi gộp (KH)', fmtPct(d.grossMarginPct))+
          khInfoItem('EBITDA 12 tháng (KH)', fmtMoney(d.ebitda12T))+
          khInfoItem('Biên EBITDA (KH)', fmtPct(d.ebitdaMarginPct))+
          khInfoItem('Hoàn vốn dự kiến', d.hoanVonThang+' tháng')+
        '</div>'+
      '</div>'+
    '</div>';

    var thamSoList = null;
    if (KH.thamSo) {
      thamSoList = KH.thamSo[PF.site] || null;
      if (!thamSoList) {
        var target2 = String(PF.site).toLowerCase().replace(/\s+/g,' ').trim();
        Object.keys(KH.thamSo).forEach(function(k){
          if (!thamSoList && String(k).toLowerCase().replace(/\s+/g,' ').trim() === target2) {
            thamSoList = KH.thamSo[k];
          }
        });
      }
    }
    if (thamSoList && thamSoList.length){
      var thamSoOpen = !!KHUI.thamSoOpen;
      html += '<div class="card" id="khThamSoCard" style="margin-top:13px">'+
        '<div class="card-t" id="khThamSoToggle" style="cursor:pointer;user-select:none;margin-bottom:'+(thamSoOpen?'11px':'0')+'">'+
          '<h3>'+svg(IC.bulb,15,C.brand)+'Giả định lập kế hoạch'+
            '<span style="font-weight:400;color:#B0B0B0;margin-left:8px;font-size:11.5px">'+(thamSoOpen?'':'— bấm để xem')+'</span>'+
          '</h3>'+
          '<span style="color:#C0C0C0;font-size:14px;font-weight:700">'+(thamSoOpen?'▾':'▸')+'</span>'+
        '</div>'+
        '<div id="khThamSoBody" class="'+(thamSoOpen?'':'hide')+'">'+
          '<div style="font-size:11px;color:#A8A8A8;margin-bottom:8px">Tham chiếu khi số liệu lệch nhiều so với kế hoạch</div>'+
          '<div class="tw"><table><thead><tr><th>Tham số</th><th class="num">Giá trị</th><th>Ghi chú</th></tr></thead><tbody>'+
          thamSoList.map(function(t){
            var gt = t.giaTri, gtDisp;
            if (typeof gt === 'number'){
              gtDisp = (gt !== 0 && Math.abs(gt) < 1) ? (Math.round(gt*10000)/100)+'%' : fmt(gt);
            } else gtDisp = esc(gt);
            return '<tr><td>'+esc(t.thamSo)+'</td><td class="num">'+gtDisp+'</td>'+
                   '<td style="color:#999">'+esc(t.ghiChu||'—')+'</td></tr>';
          }).join('')+
          '</tbody></table></div>'+
        '</div>'+
      '</div>';
    }
  }

  // KPI 6 chỉ tiêu
  html += drawKehoachKPI(sites, periods);

  // Chart chính: thực tế vs kế hoạch theo kỳ, chọn chỉ tiêu bằng chip
  html += '<div class="card">'+cardHead(IC.line,'Thực tế vs Kế hoạch theo kỳ',
      '<div class="chips" id="khMetricChips">'+
        METRICS_KH.map(function(m){
          return '<button class="chip'+(KHUI.metric===m.key?' on':'')+'" data-k="'+m.key+'">'+esc(m.label)+'</button>';
        }).join('')+
      '</div>')+
    '<div class="cbox"><canvas id="chKhMain"></canvas></div></div>';

  // Chart % đạt kế hoạch - tất cả chỉ tiêu cùng lúc
  html += '<div class="card">'+cardHead(IC.bars,'Tỷ lệ đạt kế hoạch (%) theo kỳ — tất cả chỉ tiêu','')+
    '<div class="cbox"><canvas id="chKhAch"></canvas></div>'+
    '<div style="font-size:11px;color:#A8A8A8;margin-top:6px">'+
      'Food cost % và Tỷ lệ suất hủy % càng THẤP càng tốt nên % đạt kế hoạch = Kế hoạch / Thực tế × 100. '+
      'Các chỉ tiêu còn lại = Thực tế / Kế hoạch × 100. Đường mốc là mức đạt đúng 100% kế hoạch. '+
      'Kỳ có Kế hoạch ≤ 0 (thường gặp ở EBITDA giai đoạn đầu) sẽ không hiện % — xem số tuyệt đối ở bảng bên dưới.'+
    '</div></div>';

  // Bảng chi tiết từng kỳ - mặc định thu gọn theo nhóm chỉ tiêu, bấm dòng tiêu đề để mở
  html += '<div class="card">'+cardHead(IC.grid,'Bảng chi tiết Thực tế / Kế hoạch từng kỳ',
      '<div style="display:flex;gap:8px;align-items:center">'+
        '<span style="font-size:11px;color:#B0B0B0">bấm dòng tiêu đề để xem chi tiết</span>'+
        '<button class="btn btn-out" id="khBtnToggleAll">⇕ Mở tất cả</button>'+
        '<button class="btn btn-fill" id="khBtnXlsx">↓ Excel</button>'+
      '</div>')+
    '<div class="tw" id="khDetailWrap">'+kehoachTableHtml(sites, periods)+'</div></div>';

  if (!PF.site){
    html += '<div style="margin-top:9px;font-size:11px;color:#A8A8A8">'+
      'Đang xem cộng dồn '+sites.length+' site. Chọn 1 site cụ thể ở bộ lọc phía trên để xem thông tin dự án và giả định kế hoạch.'+
    '</div>';
  }
  html += '<div style="margin-top:9px;font-size:11px;color:#A8A8A8">'+
    'Nguồn: sheet <b>KeHoach_PL_Thang</b> (kế hoạch) + sheet <b>Report</b> / <b>Transactions</b> / <b>OPEX_Input</b> '+
    '(thực tế) • cập nhật '+esc(KH.updatedAt)+
  '</div>';

  html += '</div>';
  document.getElementById('tab-kehoach').innerHTML = html;

  var safe = function(name, fn){ try{ fn(); } catch(e){ console.error('Lỗi vẽ '+name+':', e); } };
  safe('khMain', drawKhMain);
  safe('khAch', drawKhAch);
  bindKehoachEvents();
}

/* ---------- KPI 6 CHỈ TIÊU ---------- */
function drawKehoachKPI(sites, periods){
  var totalAgg = kh_aggAll(sites, periods);
  var html = '<div class="grid g7">';
  METRICS_KH.forEach(function(m){
    var v = m.get(totalAgg);
    var ach = kh_ach(m, v.actual, v.plan);
    var achCls = ach===null ? 'thr-warn' : (ach>=100 ? 'thr-ok' : (ach>=90 ? 'thr-warn' : 'thr-bad'));
    var barColor = ach===null ? '#D9D9D9' : (ach>=100 ? '#16A34A' : (ach>=90 ? C.gold : '#C0342C'));
    var achClamped = ach===null ? 0 : Math.max(0, Math.min(100, ach));
    var bg = achCls==='thr-ok' ? '#E7F6EC' : (achCls==='thr-bad' ? '#FDECEC' : '#FEF6E0');
    var fg = achCls==='thr-ok' ? '#15803D' : (achCls==='thr-bad' ? '#C0342C' : '#A16207');

    html += '<div class="kpi" style="border-left-color:'+m.color+'">'+
      '<div class="kpi-top"><div>'+
        '<div class="kpi-lb">'+esc(m.label)+'</div>'+
        '<div class="kpi-v">'+(v.actual===null?'—':m.fmt(v.actual))+'</div>'+
        '<div class="kpi-sub">KH: '+m.fmt(v.plan)+'</div>'+
      '</div>'+
      '<div class="kpi-ic" style="background:'+m.color+'14;color:'+m.color+'">'+svg(m.icon,19,m.color)+'</div>'+
      '</div>'+
      '<div class="kh-ach-track"><div class="kh-ach-fill" style="width:'+achClamped+'%;background:'+barColor+'"></div></div>'+
      '<div class="thr" style="margin-top:6px;background:'+bg+';color:'+fg+'">'+
        (ach===null ? 'Chưa đủ dữ liệu để so kế hoạch' : ((ach>=100?'✓ ':'▲ ')+fmtPct(ach)+' kế hoạch'))+
      '</div>'+
    '</div>';
  });
  return html+'</div>';
}

/* ---------- CHART: THỰC TẾ VS KẾ HOẠCH THEO KỲ (1 CHỈ TIÊU) ---------- */
function drawKhMain(){
  destroyChart('chKhMain');
  var ctx = ctxOf('chKhMain'); if (!ctx) return;
  var m = METRICS_KH.filter(function(x){ return x.key===KHUI.metric; })[0];
  var sites = kh_selSites();
  var periods = KH.periods;

  var actualData = [], planData = [];
  periods.forEach(function(per){
    var o = kh_periodAgg(per, sites);
    var v = m.get(o);
    actualData.push(v.actual);
    planData.push(v.plan);
  });

  var o2 = cloneOpt();
  o2.scales.y.ticks.callback = function(v){ return m.fmt(v); };
  o2.plugins.tooltip.callbacks = {
    label:function(c){
      var val = c.parsed.y;
      return c.dataset.label+': '+(val===null||val===undefined?'Chưa có số liệu':m.fmt(val));
    },
    footer:function(items){
      var idx = items[0].dataIndex;
      var ach = kh_ach(m, actualData[idx], planData[idx]);
      return ach===null ? '' : 'Đạt: '+fmtPct(ach)+' kế hoạch';
    }
  };
  o2.plugins.tooltip.footerColor = C.gold;
  o2.plugins.tooltip.footerFont = { size:11.5, weight:'700' };
  o2.plugins.tooltip.footerMarginTop = 7;

  CHARTS.chKhMain = new Chart(ctx, {
    type:'bar',
    data:{
      labels: periods.map(function(p){ return p.label; }),
      datasets:[
        { label:'Kế hoạch', data:planData, backgroundColor:'#D9D9D9', borderRadius:3, barPercentage:.7, categoryPercentage:.6 },
        { label:'Thực tế', data:actualData, backgroundColor:m.color+'CC', borderRadius:3, barPercentage:.7, categoryPercentage:.6 }
      ]
    },
    options:o2
  });
}

/* Đường ngưỡng 100% cho chart tỷ lệ đạt kế hoạch */
var khThr100 = {
  id:'khThr100',
  afterDatasetsDraw:function(chart){
    if (chart.canvas.id !== 'chKhAch') return;
    var y = chart.scales.y, c = chart.ctx;
    var yp = y.getPixelForValue(100);
    if (isNaN(yp)) return;
    c.save(); c.beginPath();
    c.moveTo(chart.chartArea.left, yp); c.lineTo(chart.chartArea.right, yp);
    c.lineWidth = 1.6; c.strokeStyle = '#333'; c.setLineDash([6,4]); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#333'; c.font = 'bold 10px Segoe UI'; c.textAlign = 'right';
    c.fillText('100% kế hoạch', chart.chartArea.right - 4, yp - 5);
    c.restore();
  }
};
if (typeof Chart !== 'undefined' && Chart.register) Chart.register(khThr100);

/* ---------- CHART: % ĐẠT KẾ HOẠCH - TẤT CẢ CHỈ TIÊU ---------- */
function drawKhAch(){
  destroyChart('chKhAch');
  var ctx = ctxOf('chKhAch'); if (!ctx) return;
  var sites = kh_selSites();
  var periods = KH.periods;

  var ds = METRICS_KH.map(function(m){
    return {
      label:m.label, borderColor:m.color, backgroundColor:m.color, borderWidth:2, tension:.3,
      pointRadius:2.5, pointHoverRadius:5, fill:false, spanGaps:true,
      data: periods.map(function(per){
        var o = kh_periodAgg(per, sites);
        var v = m.get(o);
        return kh_ach(m, v.actual, v.plan);
      })
    };
  });

  var o2 = cloneOpt();
  o2.scales.y.ticks.callback = function(v){ return v+'%'; };
  o2.plugins.tooltip.callbacks = {
    label:function(c){
      return c.parsed.y===null ? c.dataset.label+': chưa có số liệu' : c.dataset.label+': '+fmtPct(c.parsed.y);
    }
  };

  CHARTS.chKhAch = new Chart(ctx, {
    type:'line',
    data:{ labels: periods.map(function(p){ return p.label; }), datasets:ds },
    options:o2
  });
}

/* ---------- BẢNG CHI TIẾT ---------- */
/* ---------- BẢNG CHI TIẾT (thu gọn theo nhóm chỉ tiêu, bấm để mở) ---------- */
// Đơn vị hiển thị cho từng chỉ tiêu - dùng cả khi render bảng lẫn khi xuất Excel
var KH_DONVI = { DoanhThu:'đ', SanLuong:'suất', FoodCost:'%', LaiGop:'đ', Huy:'%',VatTuTieuHao:'đ', EBITDA:'đ' };

// Tính 1 dòng chi tiết {actual, plan, diff, ach} cho 1 chỉ tiêu + 1 kỳ - dùng chung
// cho cả việc render bảng và xuất Excel để đảm bảo số liệu luôn khớp nhau.
function kh_rowCalc(m, sites, per){
  var o = kh_periodAgg(per, sites);
  var v = m.get(o);
  var ach = kh_ach(m, v.actual, v.plan);
  var diff = (v.actual===null) ? null : (v.actual - v.plan);
  return { actual:v.actual, plan:v.plan, diff:diff, ach:ach };
}

function kehoachTableHtml(sites, periods){
  var h = '<table><thead><tr><th></th><th>Chỉ tiêu</th><th>Kỳ</th><th class="num">Thực tế</th>'+
    '<th class="num">Kế hoạch</th><th class="num">Chênh lệch</th><th class="ctr">% đạt KH</th></tr></thead><tbody>';
  METRICS_KH.forEach(function(m){
    var open = !!KHUI.expanded[m.key];
    h += '<tr class="grp-hd hov" data-grp="'+m.key+'" style="cursor:pointer">'+
      '<td style="color:#C0C0C0;width:18px">'+(open?'▾':'▸')+'</td>'+
      '<td colspan="6">'+svg(m.icon,12,m.color)+' &nbsp;'+esc(m.label)+
      '<span style="font-weight:400;color:#B0B0B0;margin-left:8px">('+periods.length+' kỳ'+
      (open?'':' — bấm để xem chi tiết')+')</span></td></tr>';

    periods.forEach(function(per){
      var r = kh_rowCalc(m, sites, per);
      var achBg = r.ach===null ? '#FEF6E0' : (r.ach>=100 ? '#E7F6EC' : (r.ach>=90 ? '#FEF6E0' : '#FDECEC'));
      var achFg = r.ach===null ? '#A16207' : (r.ach>=100 ? '#15803D' : (r.ach>=90 ? '#A16207' : '#C0342C'));
      var diffGood = r.diff===null ? null : (m.higherBetter ? r.diff>=0 : r.diff<=0);
      var diffCls = r.diff===null ? '' : (diffGood ? 'fc-ok' : 'fc-hi');
      h += '<tr class="kh-detail-row'+(open?'':' hide')+'" data-grp="'+m.key+'">'+
        '<td></td>'+
        '<td style="color:#999">'+esc(m.label)+'</td>'+
        '<td style="font-weight:600;white-space:nowrap">'+esc(per.label)+'</td>'+
        '<td class="num">'+(r.actual===null?'—':m.fmt(r.actual))+'</td>'+
        '<td class="num">'+m.fmt(r.plan)+'</td>'+
        '<td class="num '+diffCls+'">'+(r.diff===null?'—':((r.diff>=0?'+':'')+m.fmt(r.diff)))+'</td>'+
        '<td class="ctr"><span class="tag" style="background:'+achBg+';color:'+achFg+'">'+
          (r.ach===null?'—':fmtPct(r.ach))+'</span></td>'+
      '</tr>';
    });
  });
  return h+'</tbody></table>';
}

// Gom TOÀN BỘ bảng chi tiết (không phụ thuộc nhóm nào đang mở/đóng trên màn hình)
// thành mảng phẳng để gửi lên backend xuất Excel.
function kh_flattenForExport(sites, periods){
  var rows = [];
  METRICS_KH.forEach(function(m){
    periods.forEach(function(per){
      var r = kh_rowCalc(m, sites, per);
      rows.push({
        metric: m.label,
        donVi: KH_DONVI[m.key] || '',
        ky: per.label,
        actual: r.actual,
        plan: r.plan,
        diff: r.diff,
        achPct: r.ach===null ? null : Math.round(r.ach*100)/100
      });
    });
  });
  return rows;
}

/* ---------- EVENTS ---------- */
/* ---------- EVENTS ---------- */
function bindKehoachEvents(){
  // Toggle Thông tin dự án / Giả định lập kế hoạch (mặc định thu gọn)
  var duAnToggle = document.getElementById('khDuAnToggle');
  if (duAnToggle) duAnToggle.onclick = function(){
    KHUI.duAnOpen = !KHUI.duAnOpen;
    var body = document.getElementById('khDuAnBody');
    var arrow = duAnToggle.querySelector('span:last-child');
    var note = duAnToggle.querySelector('h3 span');
    if (body) body.classList.toggle('hide', !KHUI.duAnOpen);
    if (arrow) arrow.textContent = KHUI.duAnOpen ? '▾' : '▸';
    if (note) note.textContent = KHUI.duAnOpen ? '' : '— bấm để xem';
    duAnToggle.style.marginBottom = KHUI.duAnOpen ? '11px' : '0';
  };

  var thamSoToggle = document.getElementById('khThamSoToggle');
  if (thamSoToggle) thamSoToggle.onclick = function(){
    KHUI.thamSoOpen = !KHUI.thamSoOpen;
    var body = document.getElementById('khThamSoBody');
    var arrow = thamSoToggle.querySelector('span:last-child');
    var note = thamSoToggle.querySelector('h3 span');
    if (body) body.classList.toggle('hide', !KHUI.thamSoOpen);
    if (arrow) arrow.textContent = KHUI.thamSoOpen ? '▾' : '▸';
    if (note) note.textContent = KHUI.thamSoOpen ? '' : '— bấm để xem';
    thamSoToggle.style.marginBottom = KHUI.thamSoOpen ? '11px' : '0';
  };

  var box = document.getElementById('khMetricChips');
  if (box) {
    box.onclick = function(e){
      var b = e.target.closest('button'); if (!b) return;
      KHUI.metric = b.dataset.k;
      box.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x===b); });
      drawKhMain();
    };
  }

  var tab = document.getElementById('tab-kehoach');

  // Dùng onclick (ghi đè) thay vì addEventListener để tránh gắn trùng mỗi lần render
  tab.onclick = function(e){
    // Không xử lý khi bấm nút trong card (Mở tất cả / Excel)
    if (e.target.closest('button')) return;

    var grpRow = e.target.closest('.grp-hd[data-grp]');
    if (!grpRow) return;
    var k = grpRow.dataset.grp;
    var willOpen = !KHUI.expanded[k];
    KHUI.expanded[k] = willOpen;
    var arrowTd = grpRow.querySelector('td');
    if (arrowTd) arrowTd.textContent = willOpen ? '▾' : '▸';
    tab.querySelectorAll('.kh-detail-row[data-grp="'+k+'"]').forEach(function(tr){
      tr.classList.toggle('hide', !willOpen);
    });
    var note = grpRow.querySelector('span');
    if (note){
      var nPer = (KH && KH.periods) ? KH.periods.length : 0;
      note.textContent = '('+nPer+' kỳ'+(willOpen?'':' — bấm để xem chi tiết')+')';
    }
  };

  var btnAll = document.getElementById('khBtnToggleAll');
  if (btnAll) btnAll.onclick = function(){
    var anyClosed = METRICS_KH.some(function(m){ return !KHUI.expanded[m.key]; });
    METRICS_KH.forEach(function(m){ KHUI.expanded[m.key] = anyClosed; });
    btnAll.innerHTML = anyClosed ? '⇕ Thu gọn tất cả' : '⇕ Mở tất cả';
    // CHỈ ghi đè #khDetailWrap — không đụng .tw của bảng tham số dự án
    var wrap = document.getElementById('khDetailWrap');
    if (wrap) wrap.innerHTML = kehoachTableHtml(kh_selSites(), KH.periods);
  };

  var btnXlsx = document.getElementById('khBtnXlsx');
  if (btnXlsx) btnXlsx.onclick = function(){
    btnXlsx.disabled = true; btnXlsx.innerHTML = '<span class="spin"></span> Đang tạo...';
    var rows = kh_flattenForExport(kh_selSites(), KH.periods);
    callPostAPI('exportKeHoach', {rows: rows, tenFile: 'AK_SoSanhKeHoach' + (PF.site ? ('_'+PF.site) : '')})
      .then(function(res){
        btnXlsx.disabled = false; btnXlsx.innerHTML = '↓ Excel';
        if (res && res.ok && res.data){
          try {
            // Decode base64 -> Blob -> ép tải về máy
            var binary = atob(res.data);
            var len = binary.length;
            var bytes = new Uint8Array(len);
            for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
            var blob = new Blob([bytes], {
              type: res.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = res.name || 'AK_SoSanhKeHoach.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
            toast('Đã tải '+res.name);
          } catch (err) {
            toast('Lỗi tạo file tải về: '+(err && err.message ? err.message : err));
          }
        } else {
          toast('Lỗi xuất Excel: '+((res&&res.message)||'không rõ nguyên nhân'));
        }
      })
      .catch(function(e){
        btnXlsx.disabled = false; btnXlsx.innerHTML = '↓ Excel';
        toast('Lỗi xuất Excel: '+(e && e.message ? e.message : e));
      });
  };
}
/* ---------- BIND BỘ LỌC (gọi 1 lần khi khởi động) ---------- */
function bindKehoachFilters(){
  var reload = function(){ KH = null; loadKeHoach(); };

  var tg = document.getElementById('pfGran');
  if (tg) tg.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    PF.gran = b.dataset.v;
    tg.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x===b); });
    reload();
  });

  var selN = document.getElementById('pfN');
  if (selN) selN.addEventListener('change', function(){ PF.nPeriods = +this.value; reload(); });

  var selSite = document.getElementById('pfSite');
  if (selSite) selSite.addEventListener('change', function(){
    PF.site = this.value;
    KHUI.duAnOpen = false;
    KHUI.thamSoOpen = false;
    reload();
  });

  var btn = document.getElementById('pfBtnRefresh');
  if (btn) btn.addEventListener('click', function(){ refreshAllTabs(true); });
}


/* =========================================================================
   TAB SWITCH & RENDER
   ========================================================================= */
// function switchTab(tab){
//   TAB = tab;
//   document.querySelectorAll('#nav button').forEach(function(b){
//     b.classList.toggle('on', b.dataset.tab === tab);
//   });
//   ['overview','site','incident','revenue'].forEach(function(t){
//     document.getElementById('tab-'+t).classList.toggle('hide', t !== tab);
//   });
//   // Tab doanh thu dùng bộ lọc riêng -> đổi filter bar tương ứng
//   var isRev = (tab === 'revenue');
//   document.querySelector('.fbar').classList.toggle('hide', isRev);
//   document.getElementById('fbarRev').classList.toggle('hide', !isRev);
//   renderCurrent();
// }
function switchTab(tab){
  TAB = tab;
  // === THÊM: cập nhật sidebar active ===
  document.querySelectorAll('.sb-item').forEach(function(x){ x.classList.toggle('active', x.dataset.tab === tab); });
  // === HẾT THÊM ===
  document.querySelectorAll('#nav button').forEach(function(b){
    b.classList.toggle('on', b.dataset.tab === tab);
  });
  ['overview','site','incident','revenue','kehoach','quanlykho','dinhduong'].forEach(function(t){
    var el = document.getElementById('tab-'+t);
    if (el) el.classList.toggle('hide', t !== tab);
  });
  // Mỗi tab dùng 1 thanh filter riêng -> chỉ hiện đúng 1 thanh tương ứng.
  // Tab quản lý kho có bộ lọc nằm ngay trong panel nên ẩn cả 3 thanh filter cũ.
  // document.querySelector('.fbar').classList.toggle('hide', tab === 'revenue' || tab === 'kehoach' || tab === 'quanlykho'  || tab === 'dinhduong');
  // document.getElementById('fbarRev').classList.toggle('hide', tab !== 'revenue');
  // document.getElementById('fbarPlan').classList.toggle('hide', tab !== 'kehoach');
  document.querySelector('.fbar').classList.toggle('hide',
      tab === 'revenue' || tab === 'kehoach' || tab === 'quanlykho' || tab === 'dinhduong');
  document.getElementById('fbarRev').classList.toggle('hide', tab !== 'revenue');
  document.getElementById('fbarPlan').classList.toggle('hide', tab !== 'kehoach');
  document.getElementById('fbarKho').classList.toggle('hide', tab !== 'quanlykho');
  document.getElementById('fbarDD').classList.toggle('hide', tab !== 'dinhduong');
  renderCurrent();
}


function renderCurrent(){
  if (TAB === 'revenue'){ renderRevenue(); return; }
  if (TAB === 'kehoach'){ renderKeHoach(); return; }
  if (TAB === 'quanlykho'){ QLK.render(); return; }
  if (TAB === 'dinhduong'){ DD.render(); return; }

  if (!RAW.length){
    document.getElementById('tab-'+TAB).innerHTML =
      '<div class="card"><div class="empty">Chưa có dữ liệu trong sheet Report</div></div>';
    return;
  }
  if (TAB === 'overview') renderOverview();
  else if (TAB === 'site') renderSite();
  else renderIncident();
}

/* =========================================================================
   BỘ LỌC
   ========================================================================= */
function buildSiteFilter(){
  document.getElementById('msList').innerHTML = SITES.map(function(s){
    return '<label><input type="checkbox" value="'+esc(s)+'"'+
           (F.sites.indexOf(s)>=0?' checked':'')+'> '+esc(s)+'</label>';
  }).join('');
  updateMsLabel();
}
function updateMsLabel(){
  var n = F.sites.length;
  document.getElementById('msLabel').textContent =
    n === 0 ? 'Tất cả site' : (n === 1 ? F.sites[0] : n+' site đã chọn');
}

// Dropdown người báo cáo. Chỉ liệt kê người thuộc site đang chọn để tránh
// tình huống chọn ra người không có dòng nào -> dashboard trắng.
function buildNguoiFilter(){
  var el = document.getElementById('fNguoi');
  var ds = NGUOI;
  if (F.sites.length){
    var inSite = {};
    RAW.forEach(function(r){
      if (F.sites.indexOf(r.tenSite) >= 0 && r.nguoiBaoCao) inSite[r.nguoiBaoCao] = 1;
    });
    ds = NGUOI.filter(function(n){ return inSite[n]; });
  }
  // Nếu người đang chọn không còn trong danh sách -> tự bỏ chọn
  if (F.nguoi && ds.indexOf(F.nguoi) < 0) F.nguoi = '';

  el.innerHTML = '<option value="">Tất cả người báo cáo</option>'+
    ds.map(function(n){
      return '<option value="'+esc(n)+'"'+(F.nguoi===n?' selected':'')+'>'+esc(n)+'</option>';
    }).join('');
  el.value = F.nguoi;
}

function setDefaultRange(){
  if (!DATES.length) return;
  var last = DATES[DATES.length-1];
  // Mặc định: từ ngày CŨ NHẤT đến ngày MỚI NHẤT có dữ liệu trong sheet Report
  F.to = last;
  F.from = DATES[0];
  document.getElementById('fFrom').value = F.from;
  document.getElementById('fTo').value = F.to;
  document.getElementById('fFrom').min = DATES[0];
  document.getElementById('fFrom').max = last;
  document.getElementById('fTo').min = DATES[0];
  document.getElementById('fTo').max = last;
}

function bindFilters(){
  document.getElementById('fFrom').addEventListener('change', function(){ F.from=this.value; renderCurrent(); });
  document.getElementById('fTo').addEventListener('change',   function(){ F.to=this.value;   renderCurrent(); });

  document.getElementById('fNguoi').addEventListener('change', function(){
    F.nguoi = this.value; renderCurrent();
  });

  var qEl = document.getElementById('fQ');
  qEl.addEventListener('input', function(){
    clearTimeout(qEl._t);
    qEl._t = setTimeout(function(){ F.q = qEl.value; renderCurrent(); }, 280); // debounce
  });

  var msBtn = document.getElementById('msBtn'), msPop = document.getElementById('msPop');
  msBtn.addEventListener('click', function(e){ e.stopPropagation(); msPop.classList.toggle('open'); });
  document.addEventListener('click', function(e){
    if (!document.getElementById('msWrap').contains(e.target)) msPop.classList.remove('open');
  });
  msPop.addEventListener('change', function(e){
    if (e.target.type !== 'checkbox') return;
    var v = e.target.value;
    if (e.target.checked){ if (F.sites.indexOf(v)<0) F.sites.push(v); }
    else F.sites = F.sites.filter(function(s){ return s!==v; });
    updateMsLabel(); buildNguoiFilter(); renderCurrent();
  });
  document.getElementById('msAll').addEventListener('click', function(){
    F.sites = [];
    msPop.querySelectorAll('input').forEach(function(c){ c.checked=false; });
    updateMsLabel(); buildNguoiFilter(); renderCurrent();
  });

  document.getElementById('btnReset').addEventListener('click', function(){
    F.sites = []; F.nguoi = ''; F.q = ''; document.getElementById('fQ').value = '';
    UI.incLoai=''; UI.incMucDo=''; UI.expanded='';
    setDefaultRange(); buildSiteFilter(); buildNguoiFilter(); renderCurrent();
    toast('Đã đặt lại bộ lọc');
  });

  document.getElementById('btnRefresh').addEventListener('click', function(){ refreshAllTabs(true); });

  document.getElementById('nav').addEventListener('click', function(e){
    var b = e.target.closest('button'); if (b) switchTab(b.dataset.tab);
  });

  document.getElementById('lbX').addEventListener('click', closeLb);
  document.getElementById('lightbox').addEventListener('click', function(e){
    if (e.target.id === 'lightbox') closeLb();
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeLb(); });
}
function closeLb(){ document.getElementById('lightbox').classList.remove('open'); }

/* =========================================================================
   REALTIME
   Poll getDataVersion() mỗi 10s (rất nhẹ). Chỉ tải lại toàn bộ payload
   khi version thay đổi -> dashboard tự cập nhật khi sheet Report có dòng mới.
   ========================================================================= */
var POLL_MS = 10000;
var firstLoad = true;

function setLive(ok, txt){
  document.getElementById('liveDot').classList.toggle('off', !ok);
  document.getElementById('liveTxt').textContent = txt;
}
/** Xóa cache mọi tab để lần render tới buộc gọi server */
function invalidateAllCaches(){
  try { REV_RAW = null; } catch(e){}
  try { REV = null; } catch(e){}
  try { if (typeof RUI !== 'undefined') RUI.drillSite = ''; } catch(e){}
  try { KH = null; } catch(e){}
  try { if (typeof QLK !== 'undefined' && QLK.invalidate) QLK.invalidate(); } catch(e){}
  try { if (typeof DD !== 'undefined' && DD.invalidate) DD.invalidate(); } catch(e){}
}

/**
 * Tải lại dữ liệu TẤT CẢ tab + cập nhật dòng "Dữ liệu được cập nhật lúc ..."
 * Gọi từ mọi nút ⟳ Tải lại / Làm mới
 */
function refreshAllTabs(manual){
  invalidateAllCaches();
  if (manual) setLive(true, 'Đang làm mới...');

  // Report luôn tải nhẹ (poll getDataVersion() mỗi 10s vốn đã dựa vào loadData())
  loadData(!!manual);

  // Các tab còn lại: CHỈ tải ngay nếu đang mở đúng tab đó.
  // invalidateAllCaches() đã xoá REV_RAW/KH/QLK.D/DD.D về null, nên khi người
  // dùng CHUYỂN sang tab đó sau này, renderRevenue()/renderKeHoach()/QLK.render()/
  // DD.render() (đã có sẵn) sẽ tự phát hiện chưa có dữ liệu và tự load lại.
  if (TAB === 'revenue') {
    try { loadRevenue({ silent: !manual, force: true }); } catch(e){}
  }
  if (TAB === 'kehoach') {
    try { loadKeHoach(); } catch(e){}
  }
  if (TAB === 'quanlykho') {
    try { if (typeof QLK !== 'undefined' && QLK.reload) QLK.reload(); } catch(e){}
  }
  if (TAB === 'dinhduong') {
    try { if (typeof DD !== 'undefined' && DD.reload) DD.reload(); } catch(e){}
  }
}
// function refreshAllTabs(manual){
//   invalidateAllCaches();
//   if (manual) setLive(true, 'Đang làm mới...');

//   // 1) Vận hành (Report) — onData sẽ setLive / updAt
//   loadData(!!manual);

//   // 2) Doanh thu (Transactions) — chỉ nạp cache, không đụng tab đang xem
//   try { loadRevenue({ silent: true }); } catch(e){ try { loadRevenue(); } catch(e2){} }

//   // 3) Kế hoạch
//   try { loadKeHoach(); } catch(e){}

//   // 4) Kho + Dinh dưỡng (module)
//   try { if (typeof QLK !== 'undefined' && QLK.reload) QLK.reload(); } catch(e){}
//   try { if (typeof DD !== 'undefined' && DD.reload) DD.reload(); } catch(e){}
// }


function loadData(manual){
  if (manual) { setLive(true, 'Đang làm mới...'); }
  callAPI('getDashboardData').then(onData).catch(function(e){ setLive(false, 'Lỗi kết nối'); showError('Không tải được dữ liệu', e && e.message ? e.message : String(e)); });
}

function onData(res){
  if (!res || !res.ok){
    setLive(false, 'Lỗi dữ liệu');
    showError('Không đọc được sheet dữ liệu',
      (res && res.message) ? res.message : 'Kiểm tra biến SHEET_REPORT trong Code.gs có khớp tên tab không.');
    return;
  }
  document.getElementById('errBox').classList.add('hide');

  RAW = res.rows || [];
  SITES = res.sites || [];
  NGUOI = res.nguoiBaoCao || [];
  DATES = res.dates || [];
  if (res.nguong) NGUONG = res.nguong;
  VERSION = res.version;
  document.getElementById('updAt').textContent = fmtUpdatedAt(res.updatedAt);
  setLive(true, liveLabel(res.updatedAt));

  if (firstLoad){
    setDefaultRange();
    buildSiteFilter();
    buildNguoiFilter();
    firstLoad = false;
  } else {
    // Giữ nguyên bộ lọc người dùng đang chọn, chỉ mở rộng biên ngày nếu có ngày mới
    if (DATES.length){
      var last = DATES[DATES.length-1];
      document.getElementById('fTo').max = last;
      document.getElementById('fFrom').max = last;
      if (F.to && last > F.to && F.to === document.getElementById('fTo').value){
        F.to = last; document.getElementById('fTo').value = last;
      }
    }
    buildSiteFilter();
    buildNguoiFilter();   // có người báo cáo mới thì dropdown tự bổ sung
  }
  // Tab doanh thu đọc sheet Transactions riêng -> không redraw theo version của Report
  renderCurrent();
}

function showError(title, detail){
  var b = document.getElementById('errBox');
  b.className = 'err';
  b.innerHTML = '<h2>'+esc(title)+'</h2><p>'+esc(detail)+'</p>'+
    '<p style="margin-top:9px;color:#999">Mẹo: chạy hàm <b>kiemTraMapCot()</b> trong Apps Script editor '+
    'để xem cột nào chưa map được.</p>';
}

// Vòng lặp kiểm tra version - chỉ tải lại khi dữ liệu thật sự đổi
function startPolling(){
  setInterval(function(){
    callAPI('getDataVersion').then(function(v){
        if (!v) return;
        // Ưu tiên thời điểm dữ liệu; fallback serverTime nếu version API không trả updatedAt
        if (v.updatedAt) setLive(true, liveLabel(v.updatedAt));
          else if (document.getElementById('updAt').textContent)
            setLive(true, 'Dữ liệu được cập nhật lúc ' + document.getElementById('updAt').textContent);
          else setLive(true, liveLabel(v.serverTime));
        if (v.version && v.version !== VERSION){
          VERSION = v.version;
          loadData(false);          // có dữ liệu mới -> nạp lại
        }
      }).catch(function(){ setLive(false, 'Mất kết nối'); });
  }, POLL_MS);
}

/* Refresh CỨNG mỗi phút: tải lại toàn bộ dữ liệu bất kể version có đổi hay không.
   - Tab vận hành: gọi loadData() -> đọc lại sheet Report và vẽ lại.
   - Tab doanh thu: gọi loadRevenue() -> đọc lại sheet Transactions và vẽ lại. */
var HARD_REFRESH_MS = 600000;   // 10 phút (10 × 60 × 1000 ms)
function startHardRefresh(){
  setInterval(function(){
    refreshAllTabs(false);
  }, HARD_REFRESH_MS);
}

/* =========================================================================
   TAB "QUẢN LÝ KHO"  (module độc lập, không đụng biến toàn cục của code cũ)
   - Lazy load: chỉ gọi server lần đầu khi bấm vào tab.
   - Cache dữ liệu ở client -> đổi bộ lọc chỉ tính lại tại chỗ, không gọi lại server.
   - Dùng chung Chart.js (CHARTS/destroyChart/ctxOf) + helper fmt/fmtMoney/esc/svg/toast/IC/C/PALETTE/dm.
   ========================================================================= */
var QLK = (function(){
  var D=null, loading=false, built=false;
  var f={ from:'', to:'', site:'', slocs:[], cats:[] };   // lọc: ngày / site_name / kho con / nhóm hàng
  var view='value';
  var sort={ key:'stock_end_value', dir:-1 };
  var moreOpen=false;   // khối Top NVL & Cảnh báo: mặc định thu gọn
  var STATUS={
    het_hang:{lb:'Hết hàng',bg:'#FDECEC',fg:'#B3161C',bd:'#E0384B'},
    sap_het:{lb:'Sắp hết',bg:'#FFF1E6',fg:'#B4530F',bd:'#EA580C'},
    ton_dong:{lb:'Tồn đọng',bg:'#FEF6E0',fg:'#8A6410',bd:'#C9A227'},
    binh_thuong:{lb:'Bình thường',bg:'#E9F8EF',fg:'#15803D',bd:'#16A34A'}
  };
  function n0(v){ return (v==null||v==='')?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:0}); }
  function n1(v){ return (v==null||v==='')?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:1}); }
  function money(v){ return fmtMoney(v||0); }
  function moneyFull(v){ return (Number(v||0)).toLocaleString('vi-VN')+'₫'; }
  function badge(st){ var s=STATUS[st]||STATUS.binh_thuong;
    return '<span class="qlk-bdg" style="background:'+s.bg+';color:'+s.fg+';border-color:'+s.bd+'">'+s.lb+'</span>'; }

  function injectCss(){
    if(document.getElementById('qlkCss')) return;
    var css=''+
    // '.qlk-fbar{position:sticky;top:0;z-index:15;background:#fff;'+
    //   'border:1px solid var(--line);border-left:3px solid var(--brand);border-radius:12px;'+
    //   'padding:12px 16px;margin-bottom:13px;display:flex;flex-wrap:wrap;gap:13px;align-items:flex-end;'+
    //   'box-shadow:0 1px 3px rgba(0,0,0,.05);min-height:72px;}'+
    '.qlk-fbar{/* khung do CSS global .qlk-fbar */}'+
    '.qlk-fbar .fld label{display:block;font-size:10.5px;font-weight:600;color:var(--muted);margin-bottom:4px;}'+
    '.qlk-fbar input,.qlk-fbar select{border:1px solid #D6D6D6;border-radius:8px;padding:7px 11px;font-size:13px;font-family:inherit;background:#fff;color:var(--text);outline:none;}'+
    '.qlk-fbar input:focus,.qlk-fbar select:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(122,31,43,.1);}'+
    '.qlk-chips{display:flex;flex-wrap:wrap;gap:6px;}'+
    '.qlk-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;}'+
    '.qlk-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;}'+
    '.qlk-grid2{display:grid;grid-template-columns:1fr 1fr;gap:13px;}'+
    '.qlk-mb{margin-bottom:13px;}'+
    '.qlk-bdg{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;border:1px solid;}'+
    '.qlk-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}'+
    '.qlk-tbl th{position:sticky;top:0;background:var(--brand);color:#fff;font-weight:600;font-size:11.5px;padding:8px 9px;text-align:left;white-space:nowrap;}'+
    '.qlk-tbl th.srt{cursor:pointer;}.qlk-tbl th.srt:hover{background:var(--brand-dark);}'+
    '.qlk-tbl td{padding:7px 9px;border-bottom:1px solid #F0F0F0;white-space:nowrap;}'+
    '.qlk-tbl tbody tr:hover{background:#FCF7F8;}'+
    '.qlk-tbl .r{text-align:right;}'+
    '.qlk-scroll{max-height:440px;overflow:auto;border:1px solid var(--line);border-radius:10px;}'+
    '.qlk-pos{color:#15803D;font-weight:600;}.qlk-neg{color:#DC2626;font-weight:600;}'+
    '.qlk-note{font-size:11.5px;color:var(--muted);margin-top:7px;line-height:1.5;}'+
    '.qlk-alert-h{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;margin-bottom:9px;}'+
    '.qlk-empty{padding:22px;text-align:center;color:var(--muted);font-size:13px;}'+
    '.qlk-clk tbody tr{cursor:pointer;}'+
    '.qlk-mini{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;}'+
    '.qlk-mini-sl{background:#EAF0FB;color:#2554B0;}.qlk-mini-mvt{background:#F0F0F0;color:#555;}'+
    '.qlk-sloc-banner{background:#FBF6EE;border:1px solid #EAD9B8;border-radius:10px;padding:10px 14px;font-size:12.5px;color:#6b5320;margin-bottom:12px;line-height:1.6;}'+
    '.qlk-sloc-card{background:#fff;border:1px solid #F0F0F0;border-radius:12px;padding:13px 15px;box-shadow:0 1px 3px rgba(0,0,0,.05);cursor:pointer;transition:.15s;}'+
    '.qlk-sloc-card:hover{box-shadow:0 6px 18px rgba(122,31,43,.12);}'+
    '.qlk-sloc-card.active{outline:2px solid var(--brand);outline-offset:-1px;}'+
    '.qlk-sloc-code{font-size:11px;font-weight:800;letter-spacing:.5px;}'+
    '.qlk-sloc-name{font-size:15px;font-weight:800;color:#2E2E2E;margin:2px 0 9px;}'+
    '.qlk-sloc-row{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;padding:3px 0;border-top:1px dashed #F0F0F0;}'+
    '.qlk-sloc-row span{color:var(--muted);}.qlk-sloc-row b{font-size:13.5px;}'+
    '.qlk-acc-h{width:100%;text-align:left;border:1px solid var(--line);background:#fff;border-radius:12px;padding:13px 16px;'+
      'font-size:13.5px;font-weight:700;color:var(--brand);cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:9px;box-shadow:0 1px 3px rgba(0,0,0,.05);}'+
    '.qlk-acc-h:hover{background:var(--brand-soft);}'+
    '.qlk-acc-h svg{width:15px;height:15px;}'+
    '.qlk-acc-sub{font-size:11.5px;font-weight:600;color:var(--muted);}'+
    '.qlk-acc-b{margin-top:13px;}'+
    '.qlk-ov{position:fixed;inset:0;background:rgba(30,15,18,.55);z-index:100;display:none;align-items:flex-start;justify-content:center;padding:28px 16px;overflow:auto;}'+
    '.qlk-ov.open{display:flex;}'+
    '.qlk-mod{background:#fff;border-radius:14px;max-width:1024px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);}'+
    '.qlk-mod-h{padding:18px 22px;border-bottom:1px solid var(--line);position:relative;}'+
    '.qlk-mod-h h2{color:var(--brand);font-size:19px;font-weight:800;padding-right:30px;}'+
    '.qlk-mod-h .sub{color:var(--muted);font-size:12.5px;margin-top:4px;}'+
    '.qlk-mod-x{position:absolute;top:15px;right:18px;border:0;background:transparent;font-size:23px;line-height:1;color:#aaa;cursor:pointer;}'+
    '.qlk-mod-x:hover{color:var(--brand);}'+
    '.qlk-mod-b{padding:18px 22px 22px;}'+
    '.qlk-mk{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}'+
    '.qlk-mk-c{border-radius:10px;padding:12px 14px;background:#F7F7F8;}'+
    '.qlk-mk-lb{font-size:11px;color:var(--muted);font-weight:600;}'+
    '.qlk-mk-v{font-size:21px;font-weight:800;margin-top:3px;color:#2E2E2E;}'+
    '.qlk-mk-sub{font-size:10.5px;color:#A8A8A8;margin-top:3px;}'+
    '.qlk-mstats{display:flex;flex-wrap:wrap;gap:26px;padding:11px 15px;margin:14px 0;background:#FBF7F8;border:1px solid #F0E6E8;border-radius:10px;font-size:11.5px;color:var(--muted);}'+
    '.qlk-mstats b{display:block;font-size:14px;color:#2E2E2E;margin-top:2px;}'+
    // --- UI polish: Top NVL & Cảnh báo ---
    '.qlk-tbl tbody tr:nth-child(even){background:#FCFAFB;}'+
    '.qlk-tbl tbody tr:hover{background:#F6ECEE;}'+
    '.qlk-tbl td.nm{max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'+
    '.qlk-rk{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;'+
      'border-radius:6px;background:var(--brand-soft);color:var(--brand);font-size:11px;font-weight:800;}'+
    '.qlk-top-tbl tbody tr:nth-child(1) .qlk-rk{background:var(--gold);color:#fff;}'+
    '.qlk-top-tbl tbody tr:nth-child(2) .qlk-rk,.qlk-top-tbl tbody tr:nth-child(3) .qlk-rk{background:var(--brand);color:#fff;}'+
    '.qlk-alert-card{padding:0;overflow:hidden;}'+
    '.qlk-alert-card .qlk-alert-h{padding:12px 14px;margin:0;border-bottom:1px solid #F0F0F0;}'+
    '.qlk-alert-card .qlk-scroll{border:0;border-radius:0;}'+
    '.qlk-alert-h span:first-child{flex:1;}'+
    '@media(max-width:1100px){.qlk-grid4{grid-template-columns:repeat(2,1fr);}.qlk-grid3,.qlk-grid2{grid-template-columns:1fr;}.qlk-mk{grid-template-columns:repeat(2,1fr);}}';
    var st=document.createElement('style'); st.id='qlkCss'; st.textContent=css; document.head.appendChild(st);
  }

  function render(){ injectCss(); if(D){ if(!built) buildSkeleton(); update(); return; } if(loading) return; load(); }
  function load(){ loading=true;
    var box=document.getElementById('tab-quanlykho');
    box.innerHTML='<div class="card"><div class="empty">Đang tải dữ liệu kho...</div></div>';
    var done=false;
    // Watchdog: nếu 45s không có phản hồi -> báo rõ thay vì kẹt "Đang tải"
    var wd=setTimeout(function(){ if(done) return; loading=false;
      box.innerHTML='<div class="err"><h2>Máy chủ không phản hồi (quá 45 giây)</h2>'+
        '<p>Thường do: (1) bản Deploy chưa cập nhật (chưa tạo <b>New version</b>) nên thiếu hàm '+
        'getWarehouseDashboardData; hoặc (2) dữ liệu quá lớn. Chạy <b>QLK_test()</b> trong Apps Script '+
        'editor để kiểm tra hàm chạy được không.</p></div>';
    }, 45000);
    callAPI('getWarehouseDashboardData').then(function(res){ done=true; clearTimeout(wd); onData(res); })
      .catch(function(e){ done=true; clearTimeout(wd); showError(e); });
  }
  function onData(res){ loading=false;
    try {
      if(!res||!res.success){ showError((res&&res.error)||'Không đọc được dữ liệu kho.'); return; }
      D=res; f.from=res.meta.period_from||''; f.to=res.meta.period_to||''; f.slocs=[]; f.cats=[]; f.type=''; f.q='';
      built=false; buildSkeleton(); update();
    } catch(err){ showError('Lỗi hiển thị: '+((err&&err.message)?err.message:err)); }
  }
  function showError(e){ var msg=(e&&e.message)?e.message:String(e);
    document.getElementById('tab-quanlykho').innerHTML='<div class="err"><h2>Không tải được dữ liệu kho</h2><p>'+esc(msg)+'</p>'+
      '<p style="font-size:11.5px;color:#999;margin-top:8px">Kiểm tra tên 3 sheet trong quanlykho.gs: '+
      'Stock_Header / Stock_Transactions / Stock_Price_category có khớp với Google Sheet không.</p></div>'; }

  function buildSkeleton(){
    var m=D.meta;
    // Chip kho con hiển thị TÊN kho (data-sloc vẫn là mã để lọc)
    var slocChips=D.by_sloc.map(function(s){ return '<button class="chip" data-sloc="'+esc(s.sloc)+'" title="'+esc(s.sloc)+'">'+esc(s.name||slocName(s.sloc)||s.sloc)+'</button>'; }).join('');
    var catOpts=D.by_category.map(function(c){ return '<option value="'+esc(c.category)+'">'+esc(c.category)+'</option>'; }).join('');
    var siteOpts=(D.sites||[]).map(function(s){ return '<option value="'+esc(s.name)+'">'+esc(s.name)+'</option>'; }).join('');
    var html=''+
    '<div class="qlk-fbar">'+
      '<div class="fld"><label>Từ ngày</label><input type="date" id="qlkFrom" value="'+esc(f.from)+'"></div>'+
      '<div class="fld"><label>Đến ngày</label><input type="date" id="qlkTo" value="'+esc(f.to)+'"></div>'+
      '<div class="fld"><label>Site</label><select id="qlkSite" style="min-width:190px">'+
        '<option value="">Tất cả site</option>'+siteOpts+'</select></div>'+
      '<div class="fld grow" style="min-width:200px"><label>Kho con (SLoc) — bấm để lọc</label>'+
        '<div class="qlk-chips" id="qlkSlocWrap">'+slocChips+'</div></div>'+
      '<div class="fld"><label>Nhóm hàng (giữ Ctrl chọn nhiều)</label>'+
        '<select id="qlkCatSel" multiple size="1" style="min-width:200px;max-width:260px;height:36px">'+catOpts+'</select></div>'+
      '<div class="fld"><label>Loại vật tư</label>'+
        '<select id="qlkType" style="min-width:180px"><option value="">Tất cả</option>'+
        (D.types||[]).map(function(t){return '<option value="'+esc(t)+'">'+esc(t)+'</option>';}).join('')+
        '</select></div>'+
      '<button class="btn btn-out" id="qlkRefresh">⟳ Tải lại</button>'+
    '</div>'+
    '<div class="qlk-note qlk-mb">Kho <b>'+esc(m.site)+' — '+esc(m.site_name||'')+'</b> • Kỳ '+
      esc(m.period_from)+' → '+esc(m.period_to)+' ('+m.days_in_period+' ngày) • Cập nhật '+esc(m.generated_at)+'</div>'+
    '<div id="qlkSlocInfo" class="qlk-mb"></div>'+
    '<div class="qlk-grid4 qlk-mb" id="qlkKpi"></div>'+
    '<div class="qlk-grid4 qlk-mb" id="qlkKpi2"></div>'+
    '<div class="card qlk-mb"><div class="card-t"><h3>'+svg(IC.line)+' Nhập – Xuất theo thời gian</h3></div>'+
      '<div class="cbox"><canvas id="qlkChDaily"></canvas></div></div>'+
    '<div class="qlk-grid2 qlk-mb">'+
      '<div class="card"><div class="card-t"><h3>'+svg(IC.stack)+' Theo loại chứng từ</h3></div>'+
        '<div class="cbox" style="height:230px"><canvas id="qlkChMvt"></canvas></div>'+
        '<div class="qlk-scroll qlk-mb" style="max-height:200px;margin-top:10px" id="qlkMvtTbl"></div></div>'+
      '<div class="card"><div class="card-t"><h3>'+svg(IC.bars)+' Nhóm hàng theo giá trị xuất (tiêu thụ)</h3></div>'+
        '<div class="cbox" style="height:300px"><canvas id="qlkChCat"></canvas></div></div>'+
    '</div>'+
    '<div class="card qlk-mb"><div class="card-t"><h3>'+svg(IC.grid)+' So sánh theo kho con (SLoc)</h3></div>'+
      '<div class="qlk-grid2"><div class="cbox" style="height:240px"><canvas id="qlkChSloc"></canvas></div>'+
      '<div class="qlk-scroll" style="max-height:240px" id="qlkSlocTbl"></div></div></div>'+
    '<div class="qlk-mb">'+
      '<button class="qlk-acc-h" id="qlkMoreToggle"><span id="qlkMoreIco">▸</span> '+svg(IC.bars)+
        ' Top NVL &amp; Cảnh báo vận hành <span class="qlk-acc-sub">(bấm để xem)</span></button>'+
      '<div class="qlk-acc-b" id="qlkMore" style="display:none">'+
        '<div class="qlk-grid3 qlk-mb" id="qlkTop"></div>'+
        '<div id="qlkAlerts"></div>'+
      '</div>'+
    '</div>'+
    '<div class="card"><div class="card-t"><h3>'+svg(IC.grid)+' Tồn kho &amp; giao dịch theo mã NVL</h3>'+
      '<button class="btn btn-out" id="qlkCsvBtn">⬇ Xuất CSV</button></div>'+
      '<div class="qlk-note" style="margin-top:0;margin-bottom:10px">Bấm vào một dòng để xem chi tiết toàn bộ chứng từ giao dịch của mã đó.</div>'+
      '<div class="qlk-scroll" id="qlkStockBox"></div></div>';
    // 1) Đưa .qlk-fbar lên #fbarKhoIn (full-width như tab khác)
    // 2) Phần còn lại vào #tab-quanlykho
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var fbarEl = tmp.querySelector('.qlk-fbar');
    var khoIn = document.getElementById('fbarKhoIn');
    if (fbarEl && khoIn) {
      khoIn.innerHTML = '';
      khoIn.appendChild(fbarEl);
    }
    document.getElementById('tab-quanlykho').innerHTML = tmp.innerHTML;
    bindEvents();
    built = true;
  }

  function bindEvents(){
    document.getElementById('qlkFrom').addEventListener('change', function(){ f.from=this.value; update(); });
    document.getElementById('qlkTo').addEventListener('change', function(){ f.to=this.value; update(); });
    document.getElementById('qlkSite').addEventListener('change', function(){ f.site=this.value; update(); });
    document.getElementById('qlkCatSel').addEventListener('change', function(){
      f.cats=Array.prototype.slice.call(this.selectedOptions).map(function(o){return o.value;}); update(); });
    document.getElementById('qlkSlocWrap').addEventListener('click', function(e){
      var b=e.target.closest('button'); if(!b) return; toggleSloc(b.dataset.sloc); });
    document.getElementById('qlkSlocInfo').addEventListener('click', function(e){
      var c=e.target.closest('[data-sloc]'); if(!c) return; toggleSloc(c.dataset.sloc); });
    var qlkTypeEl = document.getElementById('qlkType');
    if (qlkTypeEl) qlkTypeEl.addEventListener('change', function(){
      f.type = this.value; update(); });
    document.getElementById('qlkRefresh').addEventListener('click', function(){ refreshAllTabs(true); });
    document.getElementById('qlkMoreToggle').addEventListener('click', function(){
      moreOpen=!moreOpen;
      document.getElementById('qlkMore').style.display = moreOpen?'block':'none';
      document.getElementById('qlkMoreIco').textContent = moreOpen?'▾':'▸';
      this.querySelector('.qlk-acc-sub').textContent = moreOpen?'(bấm để thu gọn)':'(bấm để xem)';
    });
    document.getElementById('qlkCsvBtn').addEventListener('click', exportCsv);
    document.getElementById('qlkStockBox').addEventListener('click', function(e){
      var th=e.target.closest('th.srt');
      if(th){ var k=th.dataset.k; if(sort.key===k) sort.dir*=-1; else { sort.key=k; sort.dir=-1; }
        var F=filtered(); renderStock(F.items, F.tx); return; }
      var tr=e.target.closest('tr[data-code]'); if(tr) openArticleModal(tr.dataset.code);
    });
  }

  function toggleSloc(s){ var i=f.slocs.indexOf(s); if(i>=0) f.slocs.splice(i,1); else f.slocs.push(s); syncSlocUI(); update(); }
  function syncSlocUI(){
    document.querySelectorAll('#qlkSlocWrap [data-sloc]').forEach(function(b){ b.classList.toggle('on', f.slocs.indexOf(b.dataset.sloc)>=0); });
    document.querySelectorAll('#qlkSlocInfo [data-sloc]').forEach(function(b){ b.classList.toggle('active', f.slocs.indexOf(b.dataset.sloc)>=0); });
  }
  function slocName(s){ return (D.sloc_meta && D.sloc_meta[s] && D.sloc_meta[s].name) || ''; }

  function filtered(){
    // 1) Lọc transactions theo đủ chiều: ngày / site / kho con / nhóm hàng / loại vật tư
    var tx=D.transactions.filter(function(t){
      if(f.from && t.date && t.date<f.from) return false;
      if(f.to && t.date && t.date>f.to) return false;
      if(f.site && (t.site_name||'')!==f.site) return false;
      if(f.slocs.length && f.slocs.indexOf(t.sloc)<0) return false;
      if(f.cats.length && f.cats.indexOf(t.category)<0) return false;
      if(f.type && (t.type||'')!==f.type) return false;
      return true; });
    // 2) Nếu có lọc theo Kho con/Ngày (chiều chỉ có ở transactions) -> chỉ giữ những mã
    //    thực sự có giao dịch khớp bộ lọc, để Top NVL / tồn kho / cảnh báo cũng ăn theo SLoc.
    var artSet=null;
    if(f.slocs.length || f.type){ artSet={}; tx.forEach(function(t){ artSet[t.article]=1; }); }
    var it=D.items.filter(function(x){
      if(f.site && (x.site_name||'')!==f.site) return false;
      if(f.cats.length && f.cats.indexOf(x.category)<0) return false;
      if(artSet && !artSet[x.code]) return false;
      return true; });
    return { items:it, tx:tx };
  }

  function update(){ var F=filtered();
    renderSlocInfo(F.tx); renderKpi(F); drawDaily(F.tx); drawMvt(F.tx); renderMvtTbl(F.tx); drawCat(F.items);
    drawSloc(F.tx); renderSlocTbl(F.tx); renderTop(F.items, F.tx); renderAlerts(F.items);
    renderStock(F.items, F.tx); }

  function renderKpi(F){
    var it=F.items, tx=F.tx, stockVal=0, oos=0, dead=0, mis=0;
    it.forEach(function(x){ stockVal+=x.stock_end_value; if(x.status==='het_hang')oos++;
      if(x.status==='ton_dong')dead++; if(x.has_mismatch)mis++; });
    var recVal=0, issVal=0; tx.forEach(function(t){ if(t.qty>=0)recVal+=t.value; else issVal+=Math.abs(t.value); });
    function k(lb,val,sub,color){ return '<div class="kpi" style="border-left-color:'+(color||'var(--brand)')+'">'+
      '<div class="kpi-top"><div class="kpi-lb">'+lb+'</div></div><div class="kpi-v">'+val+'</div>'+
      (sub?'<div class="kpi-sub">'+sub+'</div>':'')+'</div>'; }
    document.getElementById('qlkKpi').innerHTML=
      k('Giá trị tồn kho cuối kỳ',money(stockVal),moneyFull(stockVal))+
      k('Giá trị nhập trong kỳ',money(recVal),moneyFull(recVal),'var(--green)')+
      k('Giá trị xuất trong kỳ',money(issVal),moneyFull(issVal),'var(--orange)')+
      k('Số mã NVL theo dõi',n0(it.length),'mã đang phân tích','var(--gold)');
    document.getElementById('qlkKpi2').innerHTML=
      k('Mã hết hàng',n0(oos),'Tồn cuối ≤ 0','#DC2626')+
      k('Mã tồn đọng (không xuất)',n0(dead),'Chôn vốn trong kỳ','#EA580C')+
      k('Chứng từ phát sinh',n0(tx.length),'dòng giao dịch','var(--brand)')+
      k('Mã lệch số liệu đối chiếu',n0(mis),'Header vs Transactions','#6D28D9');
  }

  function groupDaily(tx){ var map={}; tx.forEach(function(t){ if(!t.date)return;
    if(!map[t.date])map[t.date]={date:t.date,rq:0,iq:0,rv:0,iv:0};
    if(t.qty>=0){map[t.date].rq+=t.qty;map[t.date].rv+=t.value;} else {map[t.date].iq+=Math.abs(t.qty);map[t.date].iv+=Math.abs(t.value);} });
    return Object.keys(map).sort().map(function(k){return map[k];}); }
  function groupMvt(tx){ var map={}; tx.forEach(function(t){ var key=t.mvt||'(khác)';
    if(!map[key])map[key]={mvt:key,label:t.mvt_label,count:0,qty:0,value:0};
    map[key].count++;map[key].qty+=t.qty;map[key].value+=t.value; });
    return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return b.count-a.count;}); }
  function groupSloc(tx){ var map={}; tx.forEach(function(t){ var key=t.sloc||'(không rõ)';
    if(!map[key])map[key]={sloc:key,rq:0,iq:0,rv:0,iv:0};
    if(t.qty>=0){map[key].rq+=t.qty;map[key].rv+=t.value;} else {map[key].iq+=Math.abs(t.qty);map[key].iv+=Math.abs(t.value);} });
    return Object.keys(map).map(function(k){return map[k];}); }
  // value = giá trị XUẤT (tiêu thụ) theo nhóm hàng. Kho BTP thường tồn cuối = 0 nên
  // dùng giá trị xuất mới phản ánh được nhóm nào tiêu tốn nhiều vốn nhất.
  function groupCat(items){ var map={}; items.forEach(function(x){ var key=x.category||'(Chưa phân loại)';
    if(!map[key])map[key]={category:key,value:0,count:0}; map[key].value+=(x.issues_value||0);map[key].count++; });
    return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return b.value-a.value;}); }

  var baseOpt={ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{labels:{font:{size:11},boxWidth:12}}, tooltip:{backgroundColor:'#2E2E2E',padding:10} } };
  function opt(extra){ return Object.assign({}, JSON.parse(JSON.stringify(baseOpt)), extra||{}); }
  function drawDaily(tx){ destroyChart('qlkChDaily'); var ctx=ctxOf('qlkChDaily'); if(!ctx)return;
    var g=groupDaily(tx), byV=(view==='value');
    CHARTS.qlkChDaily=new Chart(ctx,{ data:{ labels:g.map(function(d){return dm(d.date);}), datasets:[
      {type:'bar',label:'Nhập',data:g.map(function(d){return byV?d.rv:d.rq;}),backgroundColor:'rgba(22,163,74,.75)',borderRadius:3},
      {type:'line',label:'Xuất',data:g.map(function(d){return byV?d.iv:d.iq;}),borderColor:C.brand,backgroundColor:'rgba(122,31,43,.08)',tension:.3,fill:true}
    ]}, options:opt({scales:{y:{ticks:{callback:function(v){return byV?money(v):n0(v);}}}}}) }); }
  function drawMvt(tx){ destroyChart('qlkChMvt'); var ctx=ctxOf('qlkChMvt'); if(!ctx)return; var g=groupMvt(tx);
    CHARTS.qlkChMvt=new Chart(ctx,{ type:'doughnut', data:{ labels:g.map(function(d){return d.label;}),
      datasets:[{data:g.map(function(d){return d.count;}),backgroundColor:g.map(function(d,i){return DONUT_PALETTE[i%DONUT_PALETTE.length];})}] },
      options:opt({plugins:{legend:{position:'right',labels:{font:{size:10},boxWidth:11}}}}) }); }
  function drawCat(items){ destroyChart('qlkChCat'); var ctx=ctxOf('qlkChCat'); if(!ctx)return;
    var g=groupCat(items).slice(0,12), byV=(view==='value');
    CHARTS.qlkChCat=new Chart(ctx,{ type:'bar', data:{ labels:g.map(function(d){return d.category;}),
      datasets:[{label:byV?'Giá trị xuất':'Số mã',data:g.map(function(d){return byV?d.value:d.count;}),backgroundColor:C.gold,borderRadius:3}] },
      options:opt({indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{ticks:{callback:function(v){return byV?money(v):n0(v);}}}}}) }); }
  function drawSloc(tx){ destroyChart('qlkChSloc'); var ctx=ctxOf('qlkChSloc'); if(!ctx)return;
    var g=groupSloc(tx), byV=(view==='value');
    CHARTS.qlkChSloc=new Chart(ctx,{ type:'bar', data:{ labels:g.map(function(d){return slocName(d.sloc)||d.sloc;}), datasets:[
      {label:'Nhập',data:g.map(function(d){return byV?d.rv:d.rq;}),backgroundColor:'rgba(22,163,74,.8)',borderRadius:3},
      {label:'Xuất',data:g.map(function(d){return byV?d.iv:d.iq;}),backgroundColor:C.brand,borderRadius:3}
    ]}, options:opt({scales:{y:{ticks:{callback:function(v){return byV?money(v):n0(v);}}}}}) }); }

  function renderMvtTbl(tx){ var g=groupMvt(tx), tot=g.reduce(function(s,d){return s+d.count;},0)||1;
    var h='<table class="qlk-tbl"><thead><tr><th>Loại chứng từ</th><th class="r">Số CT</th><th class="r">Số lượng</th><th class="r">Giá trị</th><th class="r">%</th></tr></thead><tbody>';
    g.forEach(function(d){ h+='<tr><td>'+esc(d.label)+'</td><td class="r">'+n0(d.count)+'</td><td class="r">'+n0(d.qty)+'</td><td class="r">'+money(d.value)+'</td><td class="r">'+n1(d.count/tot*100)+'%</td></tr>'; });
    h+='</tbody></table>'; document.getElementById('qlkMvtTbl').innerHTML=g.length?h:'<div class="qlk-empty">Không có chứng từ</div>'; }
  function renderSlocTbl(tx){ var g=groupSloc(tx), byV=(view==='value');
    var h='<table class="qlk-tbl"><thead><tr><th>Kho con</th><th class="r">Nhập</th><th class="r">Xuất</th></tr></thead><tbody>';
    g.forEach(function(d){ h+='<tr><td><b>'+esc(slocName(d.sloc)||d.sloc)+'</b> <span style="color:#B0B0B0;font-size:11px">'+esc(d.sloc)+'</span></td><td class="r qlk-pos">'+(byV?money(d.rv):n0(d.rq))+'</td><td class="r qlk-neg">'+(byV?money(d.iv):n0(d.iq))+'</td></tr>'; });
    h+='</tbody></table><div class="qlk-note">Tồn kho theo từng kho con không có trong Header (chỉ có tồn tổng theo mã) → chỉ so sánh nhập/xuất.</div>';
    document.getElementById('qlkSlocTbl').innerHTML=g.length?h:'<div class="qlk-empty">Không có dữ liệu</div>'; }

  function miniTop(title,items,valKey,color){
    var arr=items.slice().filter(function(x){return (x[valKey]||0)>0;}).sort(function(a,b){return b[valKey]-a[valKey];}).slice(0,10);
    var h='<div class="card"><div class="card-t"><h3>'+title+'</h3></div><div class="qlk-scroll qlk-top-tbl" style="max-height:340px"><table class="qlk-tbl"><thead><tr><th style="width:30px">#</th><th>Mã</th><th>Tên</th><th class="r">Giá trị</th></tr></thead><tbody>';
    if(!arr.length){ h+='<tr><td colspan="4" class="qlk-empty">Không có dữ liệu</td></tr>'; }
    arr.forEach(function(x,i){ h+='<tr><td><span class="qlk-rk">'+(i+1)+'</span></td><td>'+esc(x.code)+'</td>'+
      '<td class="nm" title="'+esc(x.name)+'">'+esc(x.name)+'</td>'+
      '<td class="r" style="color:'+color+';font-weight:700">'+money(x[valKey])+'</td></tr>'; });
    return h+'</tbody></table></div></div>'; }
  function renderTop(items, tx){
    // Top nhập/xuất tính TỪ transactions đã lọc -> ăn theo SLoc/ngày/site.
    var recv={}, iss={}, nameOf={};
    tx.forEach(function(t){ nameOf[t.article]=t.name;
      if(t.qty>=0) recv[t.article]=(recv[t.article]||0)+t.value;
      else iss[t.article]=(iss[t.article]||0)+Math.abs(t.value); });
    function arr(map){ return Object.keys(map).map(function(a){ return {code:a, name:nameOf[a]||a, value:map[a]}; }); }
    // Top tồn kho lấy từ items (Header không có chiều SLoc) - đã lọc theo mã có GD ở SLoc chọn.
    var ton=items.map(function(x){ return {code:x.code, name:x.name, value:x.stock_end_value}; });
    document.getElementById('qlkTop').innerHTML=
      miniTop(svg(IC.up)+' Top 10 nhập (giá trị)', arr(recv), 'value', '#15803D')+
      miniTop(svg(IC.down)+' Top 10 xuất (giá trị)', arr(iss), 'value', '#EA580C')+
      miniTop(svg(IC.stack)+' Top 10 tồn kho (giá trị)', ton, 'value', C.brand); }

  function renderAlerts(items){
    var risk=items.filter(function(x){return x.status==='het_hang'||x.status==='sap_het';})
      .sort(function(a,b){ var ka=(a.stock_end<=0)?-1e9:(a.days_of_stock==null?1e9:a.days_of_stock);
        var kb=(b.stock_end<=0)?-1e9:(b.days_of_stock==null?1e9:b.days_of_stock); return ka-kb; });
    var riskH='<table class="qlk-tbl"><thead><tr><th>Mã</th><th>Tên</th><th class="r">Tồn cuối</th><th class="r">Tiêu thụ/ngày</th><th class="r">Số ngày đủ dùng</th><th>Trạng thái</th></tr></thead><tbody>';
    risk.forEach(function(x){ riskH+='<tr><td>'+esc(x.code)+'</td><td>'+esc(x.name)+'</td><td class="r">'+n1(x.stock_end)+' '+esc(x.uom)+'</td><td class="r">'+n1(x.consumption_per_day)+'</td><td class="r">'+(x.days_of_stock==null?'—':n1(x.days_of_stock))+'</td><td>'+badge(x.status)+'</td></tr>'; });
    riskH+='</tbody></table>';
    var dead=items.filter(function(x){return x.status==='ton_dong';}).sort(function(a,b){return b.stock_end_value-a.stock_end_value;});
    var deadH='<table class="qlk-tbl"><thead><tr><th>Mã</th><th>Tên</th><th class="r">Tồn cuối</th><th class="r">Giá trị chôn vốn</th></tr></thead><tbody>';
    dead.forEach(function(x){ deadH+='<tr><td>'+esc(x.code)+'</td><td>'+esc(x.name)+'</td><td class="r">'+n1(x.stock_end)+' '+esc(x.uom)+'</td><td class="r" style="color:#EA580C;font-weight:600">'+money(x.stock_end_value)+'</td></tr>'; });
    deadH+='</tbody></table>';
    var mis=items.filter(function(x){return x.has_mismatch;}).sort(function(a,b){return Math.abs(b.reconciliation_diff)-Math.abs(a.reconciliation_diff);});
    var misH='<table class="qlk-tbl"><thead><tr><th>Mã</th><th>Tên</th><th class="r">Đầu+Nhập+Xuất</th><th class="r">Tồn cuối khai báo</th><th class="r">Lệch</th></tr></thead><tbody>';
    mis.forEach(function(x){ var comp=x.stock_begin+x.receipts+x.issues;
      misH+='<tr><td>'+esc(x.code)+'</td><td>'+esc(x.name)+'</td><td class="r">'+n1(comp)+'</td><td class="r">'+n1(x.stock_end)+'</td><td class="r" style="color:#6D28D9;font-weight:700">'+n1(x.reconciliation_diff)+'</td></tr>'; });
    misH+='</tbody></table><div class="qlk-note">Lệch = Tồn cuối khai báo − (Tồn đầu + Σ giao dịch Transactions). Thường do Header chỉ gộp một số loại chứng từ (VD 101, 261), còn Transactions có thêm 601/551/309/Z-series chưa cộng vào → cần kiểm kê đối chiếu.</div>';
    function box(title,inner,count,color){ return '<div class="card qlk-alert-card" style="border-top:3px solid '+color+'">'+
      '<div class="qlk-alert-h" style="color:'+color+'"><span>'+title+'</span>'+
      '<span class="qlk-bdg" style="background:'+color+';border-color:'+color+';color:#fff">'+count+'</span></div>'+
      '<div class="qlk-scroll" style="max-height:320px">'+(count?inner:'<div class="qlk-empty">Không có mã nào</div>')+'</div></div>'; }
    document.getElementById('qlkAlerts').innerHTML='<div class="qlk-grid3">'+
      box('⚠️ Nguy cơ hết hàng',riskH,risk.length,'#EA580C')+
      box('📦 Tồn đọng lâu ngày',deadH,dead.length,'#C9A227')+
      box('🔍 Lệch số liệu cần đối chiếu',misH,mis.length,'#6D28D9')+'</div>';
  }

  function groupSlocFull(tx){ var map={};
    tx.forEach(function(t){ var k=t.sloc||'(không rõ)';
      if(!map[k]) map[k]={sloc:k, tx:0, rv:0, iv:0, arts:{}};
      map[k].tx++; map[k].arts[t.article]=1;
      if(t.qty>=0) map[k].rv+=t.value; else map[k].iv+=Math.abs(t.value); });
    return Object.keys(map).sort().map(function(k){ var o=map[k]; o.sku=Object.keys(o.arts).length; return o; }); }

  function renderSlocInfo(tx){
    var metaKeys = D.sloc_meta ? Object.keys(D.sloc_meta) : [];
    var banner = 'Phân loại kho (SLoc): ' +
      metaKeys.map(function(s){ return '<b>'+esc(s)+'</b> '+esc(slocName(s)); }).join(' · ') +
      '. Chọn SLoc để lọc article/chứng từ theo kho. Bấm dòng bảng dưới để xem chi tiết GD.';
    var g = groupSlocFull(tx); var byKey={}; g.forEach(function(o){ byKey[o.sloc]=o; });
    var cols = metaKeys.length ? metaKeys : g.map(function(o){return o.sloc;});
    var cards = cols.map(function(s,i){
      var o = byKey[s] || {sku:0,tx:0,rv:0,iv:0};
      var color = PALETTE[i % PALETTE.length];
      var active = f.slocs.indexOf(s)>=0;
      return '<div class="qlk-sloc-card'+(active?' active':'')+'" data-sloc="'+esc(s)+'" style="border-top:3px solid '+color+'">'+
        '<div class="qlk-sloc-code" style="color:'+color+'">'+esc(s)+'</div>'+
        '<div class="qlk-sloc-name">'+esc(slocName(s)||s)+'</div>'+
        '<div class="qlk-sloc-row"><span>SKU có GD</span><b>'+n0(o.sku)+'</b></div>'+
        '<div class="qlk-sloc-row"><span>Chứng từ</span><b>'+n0(o.tx)+'</b></div>'+
        '<div class="qlk-sloc-row"><span>GT nhập</span><b class="qlk-pos">'+money(o.rv)+'</b></div>'+
        '<div class="qlk-sloc-row"><span>GT xuất</span><b class="qlk-neg">'+money(o.iv)+'</b></div>'+
      '</div>';
    }).join('');
    document.getElementById('qlkSlocInfo').innerHTML =
      '<div class="qlk-sloc-banner">'+banner+'</div><div class="qlk-grid3">'+cards+'</div>';
  }

  function txCountByArticle(tx){ var m={}; tx.forEach(function(t){ m[t.article]=(m[t.article]||0)+1; }); return m; }

  function renderStock(items, tx){
    var cnt = txCountByArticle(tx||[]);
    var cols=[{k:'code',t:'Mã'},{k:'name',t:'Tên'},{k:'category',t:'Nhóm hàng'},{k:'uom',t:'ĐVT'},
      {k:'stock_begin',t:'Tồn đầu',r:1},{k:'receipts',t:'Nhập',r:1},{k:'issues_abs',t:'Xuất',r:1},
      {k:'stock_end',t:'Tồn cuối',r:1},{k:'price',t:'Đơn giá',r:1},{k:'stock_end_value',t:'Giá trị tồn',r:1},
      {k:'ct',t:'Số CT',r:1},{k:'status',t:'Trạng thái'}];
    var arr=items.slice().map(function(x){ x._ct=cnt[x.code]||0; return x; }).sort(function(a,b){
      var key=(sort.key==='ct')?'_ct':sort.key; var va=a[key],vb=b[key];
      if(typeof va==='string') return sort.dir*String(va).localeCompare(String(vb),'vi'); return sort.dir*((va||0)-(vb||0)); });
    var h='<table class="qlk-tbl qlk-clk"><thead><tr>';
    cols.forEach(function(c){ var ar=(sort.key===c.k)?(sort.dir<0?' ▼':' ▲'):''; h+='<th class="srt'+(c.r?' r':'')+'" data-k="'+c.k+'">'+c.t+ar+'</th>'; });
    h+='</tr></thead><tbody>';
    arr.forEach(function(x){ h+='<tr data-code="'+esc(x.code)+'" title="Bấm để xem chi tiết chứng từ">'+
      '<td><b style="color:var(--brand)">'+esc(x.code)+'</b></td><td>'+esc(x.name)+'</td><td>'+esc(x.category)+'</td><td>'+esc(x.uom)+'</td>'+
      '<td class="r">'+n1(x.stock_begin)+'</td><td class="r qlk-pos">'+n1(x.receipts)+'</td><td class="r qlk-neg">'+n1(x.issues_abs)+'</td>'+
      '<td class="r">'+n1(x.stock_end)+'</td><td class="r">'+n0(x.price)+'</td><td class="r">'+money(x.stock_end_value)+'</td>'+
      '<td class="r">'+n0(x._ct)+'</td><td>'+badge(x.status)+'</td></tr>'; });
    h+='</tbody></table>'; document.getElementById('qlkStockBox').innerHTML=arr.length?h:'<div class="qlk-empty">Không có mã khớp bộ lọc</div>'; }

  function exportCsv(){ var F=filtered(); var items=F.items; if(!items.length){ toast('Không có dữ liệu để xuất'); return; }
    var cnt=txCountByArticle(F.tx);
    var head=['Mã','Tên','Nhóm hàng','ĐVT','Tồn đầu','Nhập','Xuất','Tồn cuối','Đơn giá','Giá trị tồn','Số CT','Trạng thái'], lines=[head.join(',')];
    items.forEach(function(x){ var row=[x.code,x.name,x.category,x.uom,x.stock_begin,x.receipts,x.issues_abs,x.stock_end,x.price,x.stock_end_value,(cnt[x.code]||0),(STATUS[x.status]||{}).lb||'']
      .map(function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }); lines.push(row.join(',')); });
    var blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='AK_QuanLyKho_'+(D.meta.period_from||'')+'_'+(D.meta.period_to||'')+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); toast('Đã xuất '+items.length+' mã ra CSV'); }

  /* ---- POPUP CHI TIẾT CHỨNG TỪ THEO MÃ ---- */
  function ensureModal(){
    if(document.getElementById('qlkModal')) return;
    var ov=document.createElement('div'); ov.id='qlkModal'; ov.className='qlk-ov';
    ov.innerHTML='<div class="qlk-mod"><div class="qlk-mod-h"><button class="qlk-mod-x" id="qlkModX">×</button>'+
      '<h2 id="qlkModTitle"></h2><div class="sub" id="qlkModSub"></div></div>'+
      '<div class="qlk-mod-b" id="qlkModBody"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal(); });
    document.getElementById('qlkModX').addEventListener('click', closeModal);
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeModal(); });
  }
  function closeModal(){ var ov=document.getElementById('qlkModal'); if(ov) ov.classList.remove('open'); }

  function openArticleModal(code){
    ensureModal();
    var it=null; for(var i=0;i<D.items.length;i++){ if(D.items[i].code===code){ it=D.items[i]; break; } }
    if(!it) return;
    var F=filtered(); var tx=F.tx.filter(function(t){ return t.article===code; })
      .sort(function(a,b){ return a.date<b.date?-1:1; });
    var slocSet={}; tx.forEach(function(t){ slocSet[t.sloc]=1; });
    var slocList=Object.keys(slocSet).map(function(s){ return esc(s)+' '+esc(slocName(s)); }).join(', ');
    var endGD = it.computed_end_from_trans;

    document.getElementById('qlkModTitle').innerHTML = esc(it.code)+' — '+esc(it.name);
    document.getElementById('qlkModSub').innerHTML =
      esc(D.meta.site_name||'')+' · '+esc(it.category)+' · Kho: '+(slocList||'—');

    function mk(lb,val,sub,bg,fg){ return '<div class="qlk-mk-c" style="background:'+(bg||'#F7F7F8')+'">'+
      '<div class="qlk-mk-lb">'+lb+'</div><div class="qlk-mk-v"'+(fg?' style="color:'+fg+'"':'')+'>'+val+'</div>'+
      (sub?'<div class="qlk-mk-sub">'+sub+'</div>':'')+'</div>'; }
    var kpis='<div class="qlk-mk">'+
      mk('Tồn đầu', n1(it.stock_begin)+' '+esc(it.uom), 'Theo Header SAP')+
      mk('Tổng nhập', n1(it.receipts)+' '+esc(it.uom), 'GT ~ '+money(it.receipts_value), '#E9F8EF', '#15803D')+
      mk('Tổng xuất', '−'+n1(it.issues_abs)+' '+esc(it.uom), 'GT ~ '+money(it.issues_value), '#FDECEC', '#B3161C')+
      mk('Tồn cuối (từ GD)', n1(endGD)+' '+esc(it.uom), 'Header End: '+n1(it.stock_end)+' '+esc(it.uom),
         it.has_mismatch?'#F3EEFB':'#F7F7F8', it.has_mismatch?'#6D28D9':'')+
    '</div>';

    var stats='<div class="qlk-mstats">'+
      '<div>Đơn giá<b>'+n0(it.price)+'₫</b></div>'+
      '<div>GT nhập<b>'+money(it.receipts_value)+'</b></div>'+
      '<div>GT xuất<b>'+money(it.issues_value)+'</b></div>'+
      '<div>GT tồn (từ GD)<b>'+money(endGD*it.price)+'</b></div>'+
      '<div>Chứng từ<b>'+n0(tx.length)+'</b></div>'+
    '</div>';

    var tbl='<div class="qlk-scroll" style="max-height:340px"><table class="qlk-tbl"><thead><tr>'+
      '<th>SLOC</th><th>KHO</th><th>MVT</th><th>ART. DOC</th><th class="r">ITEM</th><th>NGÀY GD</th>'+
      '<th class="r">SL</th><th>ĐVT</th><th class="r">ĐƠN GIÁ</th><th class="r">THÀNH TIỀN</th></tr></thead><tbody>';
    if(tx.length){
      tx.forEach(function(t){ var cls=t.qty>=0?'qlk-pos':'qlk-neg', sign=t.qty>=0?'':'−';
        tbl+='<tr><td><span class="qlk-mini qlk-mini-sl">'+esc(t.sloc)+'</span></td>'+
          '<td>'+esc(slocName(t.sloc))+'</td>'+
          '<td><span class="qlk-mini qlk-mini-mvt">'+esc(t.mvt)+'</span></td>'+
          '<td>'+esc(t.art_doc)+'</td><td class="r">'+esc(t.item)+'</td><td>'+esc(dmy(t.date))+'</td>'+
          '<td class="r '+cls+'">'+sign+n1(Math.abs(t.qty))+'</td><td>'+esc(t.uom)+'</td>'+
          '<td class="r">'+n0(it.price)+'₫</td><td class="r">'+money(Math.abs(t.qty)*it.price)+'</td></tr>'; });
    } else {
      tbl+='<tr><td colspan="10" class="qlk-empty">Không có chứng từ trong phạm vi bộ lọc</td></tr>';
    }
    tbl+='</tbody></table></div>';

    document.getElementById('qlkModBody').innerHTML = kpis+stats+tbl;
    document.getElementById('qlkModal').classList.add('open');
  }
  function dmy(s){ var p=String(s||'').split('-'); return p.length===3 ? (+p[2])+'/'+(+p[1])+'/'+p[0] : s; }

  return {
    render: render,
    invalidate: function(){ D = null; built = false; },
    reload: function(){ D = null; built = false; render(); }
};
})();


/* =========================================================================
   TAB "DINH DƯỠNG SUẤT ĂN" — MODULE HOÀN CHỈNH (đã fix class dd-lb + injectCss)
   ========================================================================= */
var DD = (function(){
var D=null,loading=false,built=false;
var DAYS=['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];
var CAS=['Sáng','Trưa','Tối'];
var selDays=[],selCas=[],selMealIdx=0,ddCharts={};

function render(){if(D){if(!built)build();renderAll();return;}if(loading)return;load();}
function load(){loading=true;
  document.getElementById('tab-dinhduong').innerHTML='<div class="card"><div class="empty">Đang tải dữ liệu dinh dưỡng...</div></div>';
  callAPI('getNutritionDashboardData').then(onData).catch(function(e){loading=false;
    document.getElementById('tab-dinhduong').innerHTML='<div class="err"><h2>Lỗi</h2><p>'+esc(e&&e.message?e.message:String(e))+'</p></div>';
  });
}
function onData(res){loading=false;
  if(!res||!res.success){document.getElementById('tab-dinhduong').innerHTML='<div class="err"><h2>Lỗi</h2><p>'+esc((res&&res.error)||'')+'</p></div>';return;}
  D=res;var ds={},cs={};D.weekPlan.forEach(function(m){ds[m.dayLabel]=1;cs[m.ca]=1;});
  selDays=Object.keys(ds);selCas=Object.keys(cs);selMealIdx=0;built=false;build();renderAll();
}

// --- Helpers (tái sử dụng esc từ Dashboard) ---
function lookup(n){for(var i=0;i<D.nutriDb.length;i++)if(D.nutriDb[i].name===n)return D.nutriDb[i];return null;}
function calc(c){var info=lookup(c.name);if(!info)return{kcal:0,protein:0,fat:0,carb:0,fiber:0};var f=c.qty/100;return{kcal:info.kcal*f,protein:info.protein*f,fat:info.fat*f,carb:info.carb*f,fiber:info.fiber*f};}
function calcDay(d){var t={kcal:0,protein:0,fat:0,carb:0,fiber:0};d.components.forEach(function(c){var v=calc(c);t.kcal+=v.kcal;t.protein+=v.protein;t.fat+=v.fat;t.carb+=v.carb;t.fiber+=v.fiber;});var s=t.protein*4+t.fat*9+t.carb*4;t.pctP=s>0?(t.protein*4/s)*100:0;t.pctF=s>0?(t.fat*9/s)*100:0;t.pctC=s>0?(t.carb*4/s)*100:0;return t;}
function n1(v){return(Math.round(v*10)/10).toLocaleString('vi-VN');}
function n0(v){return Math.round(v).toLocaleString('vi-VN');}
function badgeCls(cat){if(/mặn/i.test(cat))return'dd-badge-man';if(/canh/i.test(cat))return'dd-badge-canh';if(/rau/i.test(cat))return'dd-badge-rau';return'dd-badge-com';}
function filtered(){return D.weekPlan.filter(function(m){return selDays.indexOf(m.dayLabel)>=0&&selCas.indexOf(m.ca)>=0;});}
function ddDestroy(id){if(ddCharts[id]){ddCharts[id].destroy();delete ddCharts[id];}}

// --- CSS injection (1 lần) ---

// --- CSS injection ---
function injectCss(){
  var css =
    '.dd-chip{display:inline-block;padding:5px 11px;border-radius:18px;border:1px solid var(--line);background:#fff;font-size:11.5px;font-weight:600;color:#666;cursor:pointer;margin:2px;transition:.12s}'+
    '.dd-chip:hover{border-color:var(--brand);color:var(--brand)}'+
    '.dd-chip.on{background:var(--brand);color:#fff;border-color:var(--brand)}'+
    // '.dd-frow{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:13px;width:100%;'+
    //   'position:sticky;top:0;z-index:15;background:#fff;padding:12px 16px;'+
    //   'border:1px solid var(--line);border-left:3px solid var(--brand);border-radius:12px;'+
    //   'box-shadow:0 1px 3px rgba(0,0,0,.05);min-height:72px;}'+
    '.dd-frow{/* khung do CSS global .dd-frow */}'+
    '.dd-frow label{font-size:10.5px;font-weight:600;color:var(--muted)}'+
    '.dd-frow select{border:1px solid #D6D6D6;border-radius:8px;padding:7px 11px;font-size:13px;font-family:inherit;min-width:200px;background:#fff;color:var(--text)}'+
    '.dd-frow select:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(122,31,43,.1);outline:none}'+
    '.dd-grid{display:grid;grid-template-columns:1fr 360px;gap:16px;margin-top:10px;align-items:start}'+
    '@media(max-width:1100px){.dd-grid{grid-template-columns:1fr}}'+
    '.dd-tbl2{width:100%;border-collapse:collapse;font-size:13px}'+
    '.dd-tbl2 th{background:var(--brand);color:#fff;font-size:11px;font-weight:600;padding:9px 8px;text-align:left;white-space:nowrap}'+
    '.dd-tbl2 td{padding:8px;border-bottom:1px solid #F0F0F0;white-space:nowrap}'+
    '.dd-tbl2 .r{text-align:right}'+
    '.dd-tbl2 tbody tr:hover{background:#FCF7F8}'+
    '.dd-tbl2 tfoot td{background:#FBF6F0;font-weight:800;border-top:2px solid var(--brand)}'+
    '.dd-badge{display:inline-block;padding:2px 7px;border-radius:12px;font-size:9.5px;font-weight:700}'+
    '.dd-badge-man{background:#FDECEC;color:#B3161C}'+
    '.dd-badge-canh{background:#EAF0FB;color:#2554B0}'+
    '.dd-badge-rau{background:#E9F8EF;color:#15803D}'+
    '.dd-badge-com{background:#FEF6E0;color:#8A6410}'+
    'select.dd-sel2{border:1px solid #D6D6D6;border-radius:6px;padding:4px 6px;font-size:12px;font-family:inherit;max-width:220px;min-width:140px}'+
    'input.dd-qty2{border:1px solid #D6D6D6;border-radius:6px;padding:4px 6px;font-size:12px;width:60px;text-align:right}'+
    'input.dd-qty2:focus{border-color:var(--brand);outline:none}'+
    '.dd-kpi-big{background:var(--brand);color:#fff;border-radius:12px;padding:14px;text-align:center;margin-bottom:10px}'+
    '.dd-kpi-big .v{font-size:28px;font-weight:900;line-height:1.15}'+
    '.dd-kpi-big .dd-lb{font-size:11px;opacity:.85;margin-bottom:4px}'+
    '.dd-kpi-sm{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}'+
    '.dd-kpi-c{border-radius:10px;padding:10px 8px;text-align:center}'+
    '.dd-kpi-c .v{font-size:18px;font-weight:800;margin:2px 0}'+
    '.dd-kpi-c .dd-lb{font-size:11px;color:#666;line-height:1.3}'+
    '.dd-donut{position:relative;height:180px;margin:8px auto}'+
    '.dd-leg{font-size:12px;margin-top:8px;line-height:1.7}'+
    '.dd-leg div{display:flex;align-items:center;gap:6px}'+
    '.dd-leg span{display:inline-block;width:10px;height:10px;border-radius:3px;flex:0 0 auto}'+
    '.dd-nf{border:3px solid #333;border-radius:8px;padding:11px;font-size:11px;margin-top:12px}'+
    '.dd-nf h4{font-size:13px;font-weight:900;border-bottom:6px solid #333;padding-bottom:3px;margin-bottom:4px}'+
    '.dd-nf .big{font-size:22px;font-weight:900}'+
    '.dd-nf table{width:100%;border-collapse:collapse}'+
    '.dd-nf td{padding:2px 0;border-top:1px solid #ddd}'+
    '.dd-nf .r{text-align:right}'+
    '.dd-nf .thick{border-top:4px solid #333}'+
    '.dd-charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}'+
    '@media(max-width:900px){.dd-charts{grid-template-columns:1fr}}'+
    '.dd-cbox{height:200px;position:relative}'+
    '.dd-menu-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}'+
    '.dd-menu-tbl th{background:#f7f7f7;padding:7px 6px;text-align:left;font-size:10.5px;border-bottom:1px solid var(--line)}'+
    '.dd-menu-tbl td{padding:6px;border-bottom:1px solid #F4F4F4}'+
    '.dd-menu-tbl tbody tr{cursor:pointer}'+
    '.dd-menu-tbl tbody tr:hover{background:#FCF7F8}'+
    '.dd-menu-tbl .r{text-align:right}'+
    '.dd-pop-ov{position:fixed;inset:0;background:rgba(30,15,18,.55);z-index:200;display:none;align-items:flex-start;justify-content:center;padding:28px 16px;overflow:auto}'+
    '.dd-pop-ov.open{display:flex}'+
    '.dd-pop-box{background:#fff;border-radius:14px;max-width:700px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);animation:ddPopIn .2s ease}'+
    '@keyframes ddPopIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'+
    '.dd-pop-h{padding:16px 20px;border-bottom:1px solid var(--line);position:relative}'+
    '.dd-pop-h h2{color:var(--brand);font-size:17px;font-weight:800;padding-right:28px}'+
    '.dd-pop-h .sub{color:var(--muted);font-size:11.5px;margin-top:2px}'+
    '.dd-pop-x{position:absolute;top:12px;right:16px;border:0;background:transparent;font-size:21px;color:#aaa;cursor:pointer}'+
    '.dd-pop-x:hover{color:var(--brand)}'+
    '.dd-pop-b{padding:16px 20px 20px}'+
    '.dd-pop-kpi{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-bottom:12px}'+
    '.dd-pop-k{border-radius:8px;padding:9px;text-align:center}'+
    '.dd-pop-k .v{font-size:16px;font-weight:800}'+
    '.dd-pop-k .dd-lb{font-size:10px;color:#777;margin-top:2px}';

  var st=document.getElementById('ddCss');
  if(!st){ st=document.createElement('style'); st.id='ddCss'; document.head.appendChild(st); }
  st.textContent=css;
}

// --- Build (1 lần: inject CSS + skeleton HTML + events) ---
function build(){injectCss();

  // Filter full-width trên thanh #fbarDD
  var ddIn = document.getElementById('fbarDDIn');
  if (ddIn) {
    ddIn.innerHTML = '<div class="dd-frow" id="ddFilters" style="width:100%"></div>';
  }

  // Nội dung tab: không còn filter
  var box = document.getElementById('tab-dinhduong');
  box.innerHTML =
    '<div id="ddMainContent"></div>'+
    '<div class="dd-charts" id="ddChartsRow"></div>'+
    '<div class="card" style="margin-top:12px">'+
      '<h3 style="font-size:13px;font-weight:700;color:#4A4A4A">📖 Danh sách thực đơn (bấm xem chi tiết)</h3>'+
      '<div id="ddMenuList"></div>'+
    '</div>';
  // Popup container
  if(!document.getElementById('ddPopOv')){
    var ov=document.createElement('div');ov.id='ddPopOv';ov.className='dd-pop-ov';
    ov.innerHTML='<div class="dd-pop-box"><div class="dd-pop-h"><button class="dd-pop-x" id="ddPopX">×</button><h2 id="ddPopTitle"></h2><div class="sub" id="ddPopSub"></div></div><div class="dd-pop-b" id="ddPopBody"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',function(e){if(e.target===ov)ov.classList.remove('open');});
    document.getElementById('ddPopX').addEventListener('click',function(){ov.classList.remove('open');});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')ov.classList.remove('open');});
  }
  // Events
  document.getElementById('ddFilters').addEventListener('click',function(e){
    var c=e.target.closest('.dd-chip');if(!c)return;
    if(c.dataset.ca){var v=c.dataset.ca,i=selCas.indexOf(v);if(i>=0)selCas.splice(i,1);else selCas.push(v);}
    if(c.dataset.day){var v2=c.dataset.day,i2=selDays.indexOf(v2);if(i2>=0)selDays.splice(i2,1);else selDays.push(v2);}
    selMealIdx=0;renderAll();
  });
  document.getElementById('ddMenuList').addEventListener('click',function(e){var tr=e.target.closest('tr[data-idx]');if(tr)openPopup(+tr.dataset.idx);});
  //document.getElementById('ddReload').addEventListener('click',function(){D=null;built=false;load();});
  built=true;
}

// --- RenderAll ---
function renderAll(){
  renderFilters();var list=filtered();var meal=list[selMealIdx];
  if(!meal){document.getElementById('ddMainContent').innerHTML='<div class="empty" style="padding:30px;color:var(--muted)">Chọn ít nhất 1 ca và 1 ngày</div>';document.getElementById('ddChartsRow').innerHTML='';renderMenuList(list);return;}
  var t=calcDay(meal);
  var h='<div style="font-size:13px;font-weight:800;color:var(--brand);margin-bottom:5px">📋 '+esc(meal.dayLabel)+' ('+esc(meal.ca)+') — '+esc(meal.dishLabel)+'</div>';
  h+='<div class="dd-grid"><div><div class="card"><h3 style="font-size:12.5px;font-weight:700;color:#4A4A4A">Thành phần suất ăn</h3><div id="ddTblWrap"></div></div><div class="dd-nf" id="ddNF"></div></div>';
  h+='<div><div id="ddKPI"></div><div class="card"><h3 style="font-size:12.5px;font-weight:700;color:#4A4A4A">Tỷ lệ Protein – Lipid – Carb</h3><div class="dd-donut"><canvas id="ddChDonut"></canvas></div><div class="dd-leg" id="ddLeg"></div></div></div></div>';
  document.getElementById('ddMainContent').innerHTML=h;
  renderTable(meal);renderKPI(meal);renderDonut(meal);renderNF(meal);renderCharts(list);renderMenuList(list);bindTbl(meal,list);
}

function renderFilters(){
  var h='<label>Ca:</label>';
  CAS.forEach(function(c){
    h+='<span class="dd-chip'+(selCas.indexOf(c)>=0?' on':'')+'" data-ca="'+esc(c)+'">'+esc(c)+'</span>';
  });
  h+='<label style="margin-left:8px">Ngày:</label>';
  DAYS.forEach(function(d){
    h+='<span class="dd-chip'+(selDays.indexOf(d)>=0?' on':'')+'" data-day="'+esc(d)+'">'+esc(d)+'</span>';
  });
  var list=filtered();
  h+='<label style="margin-left:8px">Món:</label><select id="ddMealSel">';
  list.forEach(function(m,i){
    h+='<option value="'+i+'"'+(i===selMealIdx?' selected':'')+'>'+
      esc(m.dayLabel)+' ('+esc(m.ca)+') — '+esc(m.dishLabel)+'</option>';
  });
  if(!list.length) h+='<option>Không có</option>';
  h+='</select>';
  // Nút cùng hàng filter, đẩy sang phải
  h+='<button class="btn btn-out" id="ddReload" style="margin-left:auto">⟳ Tải lại dữ liệu</button>';

  document.getElementById('ddFilters').innerHTML=h;
  var sel=document.getElementById('ddMealSel');
  if(sel) sel.onchange=function(){ selMealIdx=+this.value; renderAll(); };
  var btn=document.getElementById('ddReload');
  if(btn) btn.onclick=function(){ refreshAllTabs(true); };
}

function renderTable(meal){
  var h='<table class="dd-tbl2"><thead><tr><th>Loại</th><th>Món</th><th class="r">Định lượng (g)</th><th class="r">Kcal</th><th class="r">Protein (g)</th><th class="r">Lipid (g)</th><th class="r">Carb (g)</th><th class="r">Chất xơ (g)</th></tr></thead><tbody>';
  meal.components.forEach(function(c,i){var v=calc(c);var opts=D.nutriDb.filter(function(x){return x.category===c.category;}).map(function(x){return'<option value="'+esc(x.name)+'"'+(x.name===c.name?' selected':'')+'>'+esc(x.name)+'</option>';}).join('');
    h+='<tr><td><span class="dd-badge '+badgeCls(c.category)+'">'+esc(c.category)+'</span></td><td><select class="dd-sel2" data-i="'+i+'">'+opts+'</select></td><td class="r"><input class="dd-qty2" type="number" min="0" step="5" value="'+c.qty+'" data-i="'+i+'"></td><td class="r">'+n1(v.kcal)+'</td><td class="r">'+n1(v.protein)+'</td><td class="r">'+n1(v.fat)+'</td><td class="r">'+n1(v.carb)+'</td><td class="r">'+n1(v.fiber)+'</td></tr>';});
  var t=calcDay(meal);h+='</tbody><tfoot><tr><td colspan="2"><b>TỔNG</b></td><td></td><td class="r"><b>'+n0(t.kcal)+'</b></td><td class="r"><b>'+n1(t.protein)+'</b></td><td class="r"><b>'+n1(t.fat)+'</b></td><td class="r"><b>'+n1(t.carb)+'</b></td><td class="r"><b>'+n1(t.fiber)+'</b></td></tr></tfoot></table>';
  document.getElementById('ddTblWrap').innerHTML=h;
}

function renderKPI(meal){
  var t=calcDay(meal);
  document.getElementById('ddKPI').innerHTML=
    '<div class="dd-kpi-big"><div class="dd-lb">Tổng năng lượng</div><div class="v">'+n0(t.kcal)+' Kcal</div></div>'+
    '<div class="dd-kpi-sm">'+
      '<div class="dd-kpi-c" style="background:#EAF0FB">'+
        '<div class="dd-lb" style="color:#2554B0;font-weight:700">Protein</div>'+
        '<div class="v" style="color:#2554B0">'+n1(t.protein)+' g</div>'+
        '<div class="dd-lb">'+n1(t.pctP)+'% năng lượng</div></div>'+
      '<div class="dd-kpi-c" style="background:#FEF6E0">'+
        '<div class="dd-lb" style="color:#8A6410;font-weight:700">Lipid (Fat)</div>'+
        '<div class="v" style="color:#8A6410">'+n1(t.fat)+' g</div>'+
        '<div class="dd-lb">'+n1(t.pctF)+'% năng lượng</div></div>'+
      '<div class="dd-kpi-c" style="background:#E9F8EF">'+
        '<div class="dd-lb" style="color:#15803D;font-weight:700">Carb</div>'+
        '<div class="v" style="color:#15803D">'+n1(t.carb)+' g</div>'+
        '<div class="dd-lb">'+n1(t.pctC)+'% năng lượng</div></div>'+
      '<div class="dd-kpi-c" style="background:#F3E3E5">'+
        '<div class="dd-lb" style="color:#7A1F2B;font-weight:700">Chất xơ</div>'+
        '<div class="v" style="color:#7A1F2B">'+n1(t.fiber)+' g</div>'+
        '<div class="dd-lb">Không tính % P-L-G</div></div>'+
    '</div>';
}

function renderDonut(meal){ddDestroy('ddChDonut');var t=calcDay(meal);var el=document.getElementById('ddChDonut');if(!el)return;
  ddCharts.ddChDonut=new Chart(el.getContext('2d'),{type:'doughnut',data:{labels:['Protein','Fat','Carb'],datasets:[{data:[t.pctP,t.pctF,t.pctC],backgroundColor:['#2554B0','#C9A227','#16A34A'],borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{display:false}}}});
  document.getElementById('ddLeg').innerHTML='<div><span style="background:#2554B0"></span>Protein '+n1(t.protein)+'g ('+n1(t.pctP)+'%)</div><div><span style="background:#C9A227"></span>Fat '+n1(t.fat)+'g ('+n1(t.pctF)+'%)</div><div><span style="background:#16A34A"></span>Carb '+n1(t.carb)+'g ('+n1(t.pctC)+'%)</div>';}

function renderNF(meal){var t=calcDay(meal);document.getElementById('ddNF').innerHTML='<h4>Thông tin dinh dưỡng</h4><div style="font-size:10px;color:#777">'+esc(meal.dayLabel)+' ('+esc(meal.ca)+') — '+esc(meal.dishLabel)+'</div><div class="big" style="margin:4px 0">'+n0(t.kcal)+' Kcal</div><table><tr class="thick"><td><b>Protein</b></td><td class="r"><b>'+n1(t.protein)+' g</b></td></tr><tr><td><b>Fat</b></td><td class="r"><b>'+n1(t.fat)+' g</b></td></tr><tr><td><b>Carb</b></td><td class="r"><b>'+n1(t.carb)+' g</b></td></tr><tr><td><b>Chất xơ</b></td><td class="r"><b>'+n1(t.fiber)+' g</b></td></tr><tr class="thick"><td>%P / %F / %C</td><td class="r">'+n1(t.pctP)+' / '+n1(t.pctF)+' / '+n1(t.pctC)+'</td></tr></table>';}

function bindTbl(meal,list){var w=document.getElementById('ddTblWrap');if(!w)return;
  w.addEventListener('change',function(e){if(e.target.matches('select.dd-sel2')){meal.components[+e.target.dataset.i].name=e.target.value;renderTable(meal);renderKPI(meal);renderDonut(meal);renderNF(meal);renderCharts(list);renderMenuList(list);}});
  w.addEventListener('input',function(e){if(e.target.matches('input.dd-qty2')){meal.components[+e.target.dataset.i].qty=Math.max(0,+e.target.value||0);renderKPI(meal);renderDonut(meal);renderNF(meal);renderCharts(list);renderMenuList(list);}});}

// --- Charts: Clustered Column (Kcal theo ngày×ca + P/F/C stacked theo ca) ---
function renderCharts(list){
  var daySet=[];list.forEach(function(m){if(daySet.indexOf(m.dayLabel)<0)daySet.push(m.dayLabel);});
  var caSet=[];list.forEach(function(m){if(caSet.indexOf(m.ca)<0)caSet.push(m.ca);});
  var caColors={'Sáng':'#C9A227','Trưa':'#7A1F2B','Tối':'#2554B0'};
  var kcalDS=caSet.map(function(ca){return{label:ca,backgroundColor:caColors[ca]||'#999',borderRadius:4,
    data:daySet.map(function(d){var m=list.filter(function(x){return x.dayLabel===d&&x.ca===ca;})[0];return m?Math.round(calcDay(m).kcal):0;})};});
  var macroDS=[];caSet.forEach(function(ca){['protein','fat','carb'].forEach(function(nut){
    var colors={protein:'#2554B0',fat:'#C9A227',carb:'#16A34A'};var labels={protein:'P',fat:'F',carb:'C'};
    macroDS.push({label:ca+' '+labels[nut],backgroundColor:colors[nut],stack:ca,borderRadius:1,
      data:daySet.map(function(d){var m=list.filter(function(x){return x.dayLabel===d&&x.ca===ca;})[0];if(!m)return 0;return+(calcDay(m)[nut].toFixed(1));})});});});
  document.getElementById('ddChartsRow').innerHTML='<div class="card"><h3 style="font-size:12.5px;font-weight:700;color:#4A4A4A">Kcal theo ngày × ca</h3><div class="dd-cbox"><canvas id="ddChKcal"></canvas></div></div><div class="card"><h3 style="font-size:12.5px;font-weight:700;color:#4A4A4A">P/F/C theo ngày × ca</h3><div class="dd-cbox"><canvas id="ddChMacro"></canvas></div></div>';
  ddDestroy('ddChKcal');ddDestroy('ddChMacro');
  ddCharts.ddChKcal=new Chart(document.getElementById('ddChKcal').getContext('2d'),{type:'bar',data:{labels:daySet,datasets:kcalDS},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:10},boxWidth:10}},tooltip:{callbacks:{label:function(it){var ca=caSet[it.datasetIndex];var m=list.filter(function(x){return x.dayLabel===daySet[it.dataIndex]&&x.ca===ca;})[0];if(!m)return ca+': 0';var t=calcDay(m);return[' '+ca+': '+n0(t.kcal)+' Kcal',' P:'+n1(t.protein)+'g F:'+n1(t.fat)+'g C:'+n1(t.carb)+'g'];}}}},scales:{y:{beginAtZero:true}}}});
  ddCharts.ddChMacro=new Chart(document.getElementById('ddChMacro').getContext('2d'),{type:'bar',data:{labels:daySet,datasets:macroDS},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:9},boxWidth:8}}},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}}});
}

// --- Danh sách thực đơn (bảng) ---
function renderMenuList(list){
  var h='<table class="dd-menu-tbl"><thead><tr><th>Ngày</th><th>Ca</th><th>Tên sản phẩm</th><th class="r">Kcal</th><th class="r">Protein</th><th class="r">Lipid</th><th class="r">Carb</th><th class="r">Chất xơ</th></tr></thead><tbody>';
  list.forEach(function(m,i){var t=calcDay(m);h+='<tr data-idx="'+i+'" style="cursor:pointer"><td>'+esc(m.dayLabel)+'</td><td>'+esc(m.ca)+'</td><td style="font-weight:700;color:var(--brand)">'+esc(m.dishLabel)+'</td><td class="r">'+n0(t.kcal)+'</td><td class="r">'+n1(t.protein)+'</td><td class="r">'+n1(t.fat)+'</td><td class="r">'+n1(t.carb)+'</td><td class="r">'+n1(t.fiber)+'</td></tr>';});
  h+='</tbody></table>';document.getElementById('ddMenuList').innerHTML=list.length?h:'<div class="empty" style="padding:20px;color:var(--muted)">Không có món</div>';
}

// --- Popup chi tiết ---
function openPopup(idx){var list=filtered();var meal=list[idx];if(!meal)return;var t=calcDay(meal);
  document.getElementById('ddPopTitle').textContent=meal.dishLabel;
  document.getElementById('ddPopSub').textContent=meal.dayLabel+' — Ca '+meal.ca;
  var h='<div class="dd-pop-kpi"><div class="dd-pop-k" style="background:#FDECEC"><div class="v" style="color:#7A1F2B">'+n0(t.kcal)+'</div><div class="dd-lb">Kcal</div></div><div class="dd-pop-k" style="background:#EAF0FB"><div class="v" style="color:#2554B0">'+n1(t.protein)+'g</div><div class="dd-lb">Protein</div></div><div class="dd-pop-k" style="background:#FEF6E0"><div class="v" style="color:#8A6410">'+n1(t.fat)+'g</div><div class="dd-lb">Fat</div></div><div class="dd-pop-k" style="background:#E9F8EF"><div class="v" style="color:#15803D">'+n1(t.carb)+'g</div><div class="dd-lb">Carb</div></div><div class="dd-pop-k" style="background:#F3E3E5"><div class="v" style="color:#7A1F2B">'+n1(t.fiber)+'g</div><div class="dd-lb">Xơ</div></div></div>';
  h+='<table class="dd-tbl2"><thead><tr><th>Loại</th><th>Thành phần</th><th class="r">Định lượng (g)</th><th class="r">Kcal</th><th class="r">Protein</th><th class="r">Lipid</th><th class="r">Carb</th><th class="r">Chất xơ</th></tr></thead><tbody>';
  meal.components.forEach(function(c){var v=calc(c);h+='<tr><td><span class="dd-badge '+badgeCls(c.category)+'">'+esc(c.category)+'</span></td><td>'+esc(c.name)+'</td><td class="r">'+n1(c.qty)+'</td><td class="r">'+n1(v.kcal)+'</td><td class="r">'+n1(v.protein)+'</td><td class="r">'+n1(v.fat)+'</td><td class="r">'+n1(v.carb)+'</td><td class="r">'+n1(v.fiber)+'</td></tr>';});
  h+='</tbody><tfoot><tr><td colspan="2"><b>TỔNG</b></td><td></td><td class="r"><b>'+n0(t.kcal)+'</b></td><td class="r"><b>'+n1(t.protein)+'</b></td><td class="r"><b>'+n1(t.fat)+'</b></td><td class="r"><b>'+n1(t.carb)+'</b></td><td class="r"><b>'+n1(t.fiber)+'</b></td></tr></tfoot></table>';
  document.getElementById('ddPopBody').innerHTML=h;
  document.getElementById('ddPopOv').classList.add('open');
}

return {
  render: render,
  invalidate: function(){ D = null; built = false; },
  reload: function(){ D = null; built = false; load(); }
};
})();



/* ---------- BOOT ---------- */
// Logo loaded from local file - no API call needed
document.getElementById('logoBox').innerHTML = '<img src="logo_akitchen_2.jpg" alt="A.Kitchen">';

initTooltip();
// === SIDEBAR EVENTS ===
(function(){
  var sb = document.getElementById('sidebar');
  // var tog = document.getElementById('sbToggle');
  var tog = document.getElementById('sbCollapseBtn');
  var ham = document.getElementById('sbHamburger');
  var ov = document.getElementById('sbOverlay');

  // Toggle collapse (desktop)
  tog.addEventListener('click', function(){ sb.classList.toggle('collapsed'); document.body.classList.toggle('sb-collapsed'); });

  // Hamburger (mobile)
  function openMobileMenu(){
    sb.classList.add('mobile-open');
    ov.classList.add('show');
    ham.classList.add('is-open');
    ham.setAttribute('aria-expanded', 'true');
    ham.setAttribute('aria-label', 'Đóng bảng điều khiển');
  }
  function closeMobileMenu(){
    sb.classList.remove('mobile-open');
    ov.classList.remove('show');
    ham.classList.remove('is-open');
    ham.setAttribute('aria-expanded', 'false');
    ham.setAttribute('aria-label', 'Mở bảng điều khiển');
  }
  ham.addEventListener('click', function(){
    if (sb.classList.contains('mobile-open')) closeMobileMenu();
    else openMobileMenu();
  });
  ov.addEventListener('click', closeMobileMenu);

  // Nav click
  document.querySelectorAll('.sb-item').forEach(function(item){
    item.addEventListener('click', function(){
      switchTab(item.dataset.tab);
      closeMobileMenu();
    });
  });

  // Sync logo từ getLogoUrl vào sidebar
  // Logo loaded from local file
  document.getElementById('sbLogoImg').src = 'logo_akitchen_2.jpg';
})();

// Sync live status vào sidebar footer
var origSetLive = setLive;
setLive = function(ok, txt){
  origSetLive(ok, txt);
  var d2 = document.getElementById('liveDot2');
  var t2 = document.getElementById('liveTxt2');
  if (d2) d2.classList.toggle('off', !ok);
  if (t2) t2.textContent = txt;
};

bindFilters();
bindRevenueFilters();   // bộ lọc riêng cho tab Doanh thu & Food Cost
bindKehoachFilters();   // bộ lọc riêng cho tab So sánh Kế hoạch
loadData();
/* ----- Ghi log truy cập kèm thông tin trình duyệt ----- */
// (function logVisitClient(){
//   try {
//     callPostAPI('logDashboardAccess', {
//         trigger: 'client',
//         userAgent: navigator.userAgent || '',
//         language: navigator.language || '',
//         platform: navigator.platform || '',
//         screen: (screen.width || 0) + 'x' + (screen.height || 0),
//         timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
//         referrer: document.referrer || '',
//         path: location.pathname || '',
//         note: ''
//       }).catch(function(){});
//   } catch (e) {}
// })();
// startPolling();
// startHardRefresh();     // refresh cứng toàn dashboard mỗi 60 giây

