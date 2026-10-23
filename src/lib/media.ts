// ============================================================================
// أدوات وسائط محلية (Canvas) — قص وضغط وإزالة خلفية بسيطة
// ----------------------------------------------------------------------------
// كل المعالجة تتم في المتصفح قبل الرفع، فلا تُرفع الصور الأصلية الكبيرة.
// إزالة الخلفية مناسبة للخلفيات الموحّدة/البسيطة، وتبقى الصورة كما هي عند
// تعذّر العزل أو عندما تكون النتيجة غير موثوقة.
// ============================================================================

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('CANVAS_EXPORT_FAILED'))
      },
      type,
      quality,
    )
  })
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'))
    image.src = url
  })
}

export function loadImageFromFile(file: File): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  const url = URL.createObjectURL(file)
  return loadImageFromUrl(url).then(
    (image) => ({ image, revoke: () => URL.revokeObjectURL(url) }),
    (error) => {
      URL.revokeObjectURL(url)
      throw error
    },
  )
}

function fitCanvas(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width || 1, height || 1))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function encodeUnderLimit(
  canvas: HTMLCanvasElement,
  maxBytes: number,
  preferredTypes: string[],
  qualities: number[],
): Promise<Blob | null> {
  for (const type of preferredTypes) {
    for (const quality of qualities) {
      try {
        const blob = await canvasToBlob(canvas, type, quality)
        if (blob.size <= maxBytes) return blob
      } catch {
        // نوع الترميز غير مدعوم في هذا المتصفح — نجرّب النوع التالي.
      }
    }
  }
  return null
}

/**
 * ضغط صورة الحالة قبل رفعها.
 * - يصغّرها إلى حد أقصى 1600px
 * - يعيد ترميزها WebP (أو PNG/JPEG كبديل)
 * - يحافظ على GIF كما هو حتى لا يفقد الحركة
 */
export async function compressImageFile(
  file: File,
  options?: { maxDimension?: number; maxBytes?: number; quality?: number },
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  const maxDimension = options?.maxDimension ?? 1600
  const maxBytes = options?.maxBytes ?? 12 * 1024 * 1024
  const quality = options?.quality ?? 0.84
  const { image, revoke } = await loadImageFromFile(file)

  try {
    // لا نعيد الصيغة الأصلية إلا إذا كانت صيغة مسموحاً بها في التخزين.
    // HEIC/AVIF وغيرها تُعاد ترميزها دائماً حتى تعمل على كل الأجهزة.
    const passthrough = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    if (
      passthrough &&
      file.size <= 700 * 1024 &&
      image.naturalWidth <= maxDimension &&
      image.naturalHeight <= maxDimension
    ) {
      return file
    }

    const target = fitCanvas(image.naturalWidth, image.naturalHeight, maxDimension)
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('CANVAS_UNAVAILABLE')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, target.width, target.height)

    const blob =
      (await encodeUnderLimit(canvas, maxBytes, ['image/webp'], [quality, 0.74, 0.62])) ??
      (await encodeUnderLimit(canvas, maxBytes, ['image/jpeg', 'image/png'], [quality, 0.74]))
    if (!blob) throw new Error('IMAGE_COMPRESS_FAILED')

    const type = blob.type || 'image/webp'
    const ext = type.includes('webp') ? 'webp' : type.includes('jpeg') ? 'jpg' : 'png'
    const base = file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'status'
    return new File([blob], `${base}.${ext}`, { type, lastModified: Date.now() })
  } finally {
    revoke()
  }
}

function colorDistanceSquared(
  data: Uint8ClampedArray,
  a: number,
  b: number,
): number {
  const dr = data[a] - data[b]
  const dg = data[a + 1] - data[b + 1]
  const db = data[a + 2] - data[b + 2]
  return dr * dr + dg * dg + db * db
}

/**
 * إزالة الخلفية المتصلة بالحواف إذا كانت قريبة من ألوان زوايا/حواف الصورة.
 * الخوارزمية محلية (flood fill) ولا ترسل الصورة إلى أي خدمة خارجية.
 * تعيد نسبة البكسلات التي أُزيلت، وإن كانت النتيجة مبالغاً فيها تُستعاد الصورة.
 */
export function removeConnectedBackground(canvas: HTMLCanvasElement, tolerance = 38): number {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return 0
  const { width, height } = canvas
  if (width < 2 || height < 2) return 0

  const image = context.getImageData(0, 0, width, height)
  const data = image.data
  const original = new Uint8ClampedArray(data)
  const total = width * height
  const removed = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0

  const seedPoints = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ].filter(([x, y]) => data[(y * width + x) * 4 + 3] > 8)
  const seeds = Array.from(
    new Set(
      seedPoints.map(([x, y]) => (y * width + x) * 4),
    ),
  )
  if (!seeds.length) return 0
  const seedTolerance = Math.max(48, Math.round(tolerance * 1.45))
  const seedLimit = seedTolerance * seedTolerance
  const localLimit = tolerance * tolerance

  const nearSeed = (pixel: number) => {
    for (const seed of seeds) {
      if (colorDistanceSquared(data, pixel, seed) <= seedLimit) return true
    }
    return false
  }

  const enqueue = (x: number, y: number, pixel: number) => {
    const index = y * width + x
    if (removed[index]) return
    removed[index] = 1
    data[pixel + 3] = 0
    queue[tail++] = index
  }

  // نبذر من الحواف فقط، ثم ننتشر داخل البكسلات المتشابهة محلياً.
  for (let x = 0; x < width; x += 1) {
    const top = x * 4
    const bottom = ((height - 1) * width + x) * 4
    if (data[top + 3] > 8 && nearSeed(top)) enqueue(x, 0, top)
    if (data[bottom + 3] > 8 && nearSeed(bottom)) enqueue(x, height - 1, bottom)
  }
  for (let y = 1; y < height - 1; y += 1) {
    const left = (y * width) * 4
    const right = (y * width + width - 1) * 4
    if (data[left + 3] > 8 && nearSeed(left)) enqueue(0, y, left)
    if (data[right + 3] > 8 && nearSeed(right)) enqueue(width - 1, y, right)
  }

  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = Math.floor(index / width)
    const current = index * 4

    const visit = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
      const neighbourIndex = ny * width + nx
      if (removed[neighbourIndex]) return
      const neighbour = neighbourIndex * 4
      if (data[neighbour + 3] <= 8) return
      if (colorDistanceSquared(data, current, neighbour) <= localLimit) {
        enqueue(nx, ny, neighbour)
      }
    }

    visit(x - 1, y)
    visit(x + 1, y)
    visit(x, y - 1)
    visit(x, y + 1)
  }

  let removedCount = 0
  for (let i = 0; i < total; i += 1) removedCount += removed[i] ? 1 : 0
  const ratio = removedCount / total

  // إذا حاولت الخوارزمية إزالة معظم الصورة فهي ليست خلفية موحّدة.
  if (ratio > 0.92 || ratio === 0) {
    context.putImageData(new ImageData(original, width, height), 0, 0)
    return 0
  }

  context.putImageData(image, 0, 0)
  return ratio
}

/** قص المساحة الشفافة الزائدة حول الملصق مع هامش صغير، ثم ملء مربع الإخراج. */
export function trimTransparentCanvas(
  source: HTMLCanvasElement,
  outputSize = 512,
  padding = 20,
): HTMLCanvasElement {
  const context = source.getContext('2d', { willReadFrequently: true })
  if (!context) return source
  const { width, height } = source
  const data = context.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX <= minX || maxY <= minY) return source

  const contentW = maxX - minX + 1
  const contentH = maxY - minY + 1
  const targetW = Math.max(1, outputSize - padding * 2)
  const targetH = Math.max(1, outputSize - padding * 2)
  const scale = Math.min(targetW / contentW, targetH / contentH)
  const drawW = Math.max(1, Math.round(contentW * scale))
  const drawH = Math.max(1, Math.round(contentH * scale))
  const drawX = Math.round((outputSize - drawW) / 2)
  const drawY = Math.round((outputSize - drawH) / 2)

  const output = document.createElement('canvas')
  output.width = outputSize
  output.height = outputSize
  const outputContext = output.getContext('2d')
  if (!outputContext) return source
  outputContext.imageSmoothingEnabled = true
  outputContext.imageSmoothingQuality = 'high'
  outputContext.drawImage(source, minX, minY, contentW, contentH, drawX, drawY, drawW, drawH)
  return output
}

/**
 * ترميز الملصق النهائي مع تصغير تدريجي عند الحاجة، مع الحفاظ على الشفافية.
 */
export async function encodeStickerCanvas(
  source: HTMLCanvasElement,
  maxBytes = 3 * 1024 * 1024,
): Promise<Blob> {
  for (const size of [512, 448, 384, 320]) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('CANVAS_UNAVAILABLE')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, size, size)

    const blob = await encodeUnderLimit(
      canvas,
      maxBytes,
      ['image/webp', 'image/png'],
      [0.92, 0.84, 0.74, 0.62],
    )
    if (blob) return blob
  }
  throw new Error('STICKER_EXPORT_FAILED')
}
