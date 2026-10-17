import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * مسار الأساس (base):
 * - محلياً وداخل Capacitor: './' (نسبي) ⇒ يعمل على أي مسار بلا أي تعديل،
 *   ولا يتأثر تشغيل الموقع محلياً (npm run dev / vite preview).
 * - على GitHub Pages: يمرّر ملف الـworkflow القيمة VITE_BASE_PATH=/wasel-chat/
 *   لتطابق اسم المستودع تماماً كما هو مطلوب للنشر على مسار فرعي.
 *
 * ملاحظة: القيمة النسبية './' تعمل أيضاً على GitHub Pages، لكننا نمرّر المسار
 * الصريح في النشر ليكون مطابقاً لاسم المستودع.
 */
const basePath = process.env.VITE_BASE_PATH?.trim() || './'

// https://vitejs.dev/config/
export default defineConfig({
  base: basePath,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    host: true,
  },
})
