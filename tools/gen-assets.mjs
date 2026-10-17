/**
 * مُولِّد أصول «واصل شات» — يعمل بـ Node فقط (بلا أي حزم خارجية).
 *
 * ينتج:
 *   1) أيقونات مشغّل Android بكل الكثافات (عادية + دائرية + الطبقة الأمامية للـadaptive).
 *   2) شاشات البداية (splash) للاتجاهين الأفقي والعمودي.
 *   3) أصول متجر Google Play: أيقونة 512×512 وصورة العرض 1024×500.
 *
 * الشكل مطابق لأيقونة الموقع public/favicon.svg:
 *   خلفية متدرّجة بتركوازي الهوية (#1fb09c → #148d7f) + فقاعة محادثة بيضاء + ٣ نقاط.
 *
 * التشغيل:  node tools/gen-assets.mjs
 */
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------------------------------------------ */
/*  أدوات ترميز PNG (بدون مكتبات)                                      */
/* ------------------------------------------------------------------ */

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32 (buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk (type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const tag = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])), 0)
  return Buffer.concat([len, tag, data, crc])
}

/** ترميز RGBA (8 بت/قناة) إلى PNG */
function encodePNG (w, h, rgba) {
  const stride = w * 4 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0 // filter: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------------ */
/*  هندسة الرسم                                                        */
/* ------------------------------------------------------------------ */

// مساحة تصميم 64×64 مطابقة لـfavicon.svg
const C = { x: 32, y: 29.6, rx: 19, ry: 16.6 } // فقاعة المحادثة
const TAIL = [[20, 42.5], [15.9, 49.9], [26.1, 46.4]] // ذيل الفقاعة
const DOTS = [[24, 29.5], [32, 29.5], [40, 29.5]]
const DOT_R = 2.6

const TEAL_START = [0x1f / 255, 0xb0 / 255, 0x9c / 255]
const TEAL_END = [0x14 / 255, 0x8d / 255, 0x7f / 255]
const DOT_COLOR = [0x14 / 255, 0x8d / 255, 0x7f / 255]
const WHITE = [1, 1, 1]

const SS = 3 // عدد العيّنات لكل بُعد عند تنعيم الحواف

function makeCanvas (w, h) {
  return { w, h, d: new Float32Array(w * h * 4) }
}

/** تركيب طبقة فوق اللوحة: coverage تُرجع تغطية 0..1، color تُرجع [r,g,b] عند نقطة */
function paint (cv, coverage, color) {
  const { w, h, d } = cv
  const inv = 1 / (SS * SS)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let cov = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          cov += coverage(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
        }
      }
      cov *= inv
      if (cov <= 0) continue
      const a = cov > 1 ? 1 : cov
      const [cr, cg, cb] = color(x + 0.5, y + 0.5)
      const i = (y * w + x) * 4
      const da = d[i + 3]
      const outA = a + da * (1 - a)
      if (outA <= 0) { d[i + 3] = 0; continue }
      d[i] = (cr * a + d[i] * da * (1 - a)) / outA
      d[i + 1] = (cg * a + d[i + 1] * da * (1 - a)) / outA
      d[i + 2] = (cb * a + d[i + 2] * da * (1 - a)) / outA
      d[i + 3] = outA
    }
  }
}

function toRGBA (cv) {
  const out = Buffer.alloc(cv.w * cv.h * 4)
  for (let i = 0; i < cv.w * cv.h; i++) {
    out[i * 4] = Math.round(Math.min(1, Math.max(0, cv.d[i * 4])) * 255)
    out[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, cv.d[i * 4 + 1])) * 255)
    out[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, cv.d[i * 4 + 2])) * 255)
    out[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, cv.d[i * 4 + 3])) * 255)
  }
  return out
}

/* --------------------------- أشكال -------------------------------- */

const insideRoundRect = (x, y, w, h, r) => {
  if (x < 0 || y < 0 || x > w || y > h) return 0
  const cx = Math.min(Math.max(x, r), w - r)
  const cy = Math.min(Math.max(y, r), h - r)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r ? 1 : 0
}

const insideCircle = (x, y, w, h, r) => {
  const cx = w / 2
  const cy = h / 2
  const dx = x - cx
  const dy = y - cy
  const rr = Math.min(r, w / 2, h / 2)
  return dx * dx + dy * dy <= rr * rr ? 1 : 0
}

const insideTriangle = (x, y, pts) => {
  const [a, b, c] = pts
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])
  const d1 = s([x, y], a, b)
  const d2 = s([x, y], b, c)
  const d3 = s([x, y], c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return neg && pos ? 0 : 1
}

const insideEllipse = (x, y, cx, cy, rx, ry) => {
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return dx * dx + dy * dy <= 1 ? 1 : 0
}

/* ------------------ رسم الأيقونة / شاشة البداية -------------------- */

/**
 * @param {number} size  العرض=الارتفاع
 * @param {object} opt
 *   bg        : 'rounded' | 'circle' | 'full' | 'none'
 *   logoScale : مقياس الشعار نسبةً إلى مساحة 64×64
 *   width/height: للسماح بأبعاد غير مربعة (splash)
 */
function renderIcon (size, opt = {}) {
  return renderCanvas(size, size, opt)
}

function renderCanvas (w, h, opt = {}) {
  const bg = opt.bg ?? 'rounded'
  const logoScale = opt.logoScale ?? 1
  const cv = makeCanvas(w, h)
  const min = Math.min(w, h)

  // الخلفية
  if (bg !== 'none') {
    const radius = bg === 'circle' ? min / 2 : min * (16 / 64)
    const cov = bg === 'circle'
      ? (x, y) => insideCircle(x, y, w, h, min / 2)
      : bg === 'full'
        ? () => 1
        : (x, y) => insideRoundRect(x, y, w, h, radius)
    paint(cv, cov, (x, y) => {
      const t = Math.min(1, Math.max(0, (x / w + y / h) / 2))
      return [
        TEAL_START[0] + (TEAL_END[0] - TEAL_START[0]) * t,
        TEAL_START[1] + (TEAL_END[1] - TEAL_START[1]) * t,
        TEAL_START[2] + (TEAL_END[2] - TEAL_START[2]) * t,
      ]
    })
  }

  // تحويل إحداثيات مساحة 64×64 إلى البكسل
  const k = (min / 64) * logoScale
  const ox = w / 2
  const oy = h / 2
  const map = (p) => [ox + (p[0] - 32) * k, oy + (p[1] - 32) * k]

  const ell = map([C.x, C.y])
  const tail = TAIL.map(map)
  const dots = DOTS.map(map)

  // فقاعة المحادثة (بيضاء)
  paint(cv, (x, y) => {
    if (insideEllipse(x, y, ell[0], ell[1], C.rx * k, C.ry * k)) return 1
    return insideTriangle(x, y, tail)
  }, () => WHITE)

  // النقاط الثلاث (بلون الهوية)
  paint(cv, (x, y) => {
    for (const d of dots) {
      if (insideEllipse(x, y, d[0], d[1], DOT_R * k, DOT_R * k)) return 1
    }
    return 0
  }, () => DOT_COLOR)

  return cv
}

function savePNG (file, cv) {
  const abs = path.join(ROOT, file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const buf = encodePNG(cv.w, cv.h, toRGBA(cv))
  fs.writeFileSync(abs, buf)
  console.log(`  ✓ ${file}  (${cv.w}×${cv.h}, ${buf.length} B)`)
}

/* ------------------------------------------------------------------ */
/*  المخرجات                                                           */
/* ------------------------------------------------------------------ */

const RES = 'android/app/src/main/res'

// (اسم الكثافة، حجم الأيقونة، حجم الطبقة الأمامية للـadaptive)
const DENSITIES = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
]

console.log('▸ أيقونات المشغّل (Android launcher icons)')
for (const [density, s, fg] of DENSITIES) {
  savePNG(`${RES}/mipmap-${density}/ic_launcher.png`,
    renderIcon(s, { bg: 'rounded', logoScale: 1 }))
  savePNG(`${RES}/mipmap-${density}/ic_launcher_round.png`,
    renderIcon(s, { bg: 'circle', logoScale: 0.86 }))
  // 0.80 يُبقي الشعار (مع ذيله) داخل «المنطقة الآمنة» للأيقونة التكيفية
  savePNG(`${RES}/mipmap-${density}/ic_launcher_foreground.png`,
    renderIcon(fg, { bg: 'none', logoScale: 0.8 }))
}

console.log('▸ شاشات البداية (splash)')
// (المجلد، العرض، الارتفاع)
const SPLASHES = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
]
for (const [dir, w, h] of SPLASHES) {
  savePNG(`${RES}/${dir}/splash.png`, renderCanvas(w, h, { bg: 'full', logoScale: 0.37 }))
}

console.log('▸ أصول متجر Google Play')
savePNG('store/play-icon-512.png', renderIcon(512, { bg: 'rounded', logoScale: 1 }))
savePNG('store/feature-graphic-1024x500.png',
  renderCanvas(1024, 500, { bg: 'full', logoScale: 1.1 }))

console.log('▸ أيقونات الويب / تطبيق الويب القابل للتثبيت (public)')
// أيقونات PNG مطلوبة لظهور «تثبيت التطبيق» في Chrome/Android ولأيقونة iOS
savePNG('public/icon-192.png', renderIcon(192, { bg: 'rounded', logoScale: 0.9 }))
savePNG('public/icon-512.png', renderIcon(512, { bg: 'rounded', logoScale: 0.9 }))
// maskable: خلفية كاملة + شعار داخل «المنطقة الآمنة» (0.58) حتى لا يُقتطع بالقناع
savePNG('public/icon-maskable-512.png', renderIcon(512, { bg: 'full', logoScale: 0.58 }))
// iOS يطبّق تدويره الخاص ولا يدعم الشفافية جيداً ⇒ خلفية كاملة
savePNG('public/apple-touch-icon.png', renderIcon(180, { bg: 'full', logoScale: 0.8 }))

console.log('تم.')
