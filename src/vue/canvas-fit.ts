/** 画布尺寸/适配的纯计算，便于在 happy-dom 下单测。 */

export const CANVAS_INITIAL_W = 6000
export const CANVAS_INITIAL_H = 4000
export const CANVAS_MAX = 20000
export const CANVAS_PADDING = 24
export const FIT_PADDING = 32
export const SCALE_MIN = 0.1
export const SCALE_MAX = 3
export const FIT_MAX = 2

export interface Size {
  w: number
  h: number
}

/** 完整内容等比落进视口；允许缩到 0.1，但不放大超过 2x。 */
export function fitScale(viewW: number, viewH: number, contentW: number, contentH: number): number {
  if (contentW <= 0 || contentH <= 0) return 1
  const sx = (viewW - FIT_PADDING) / contentW
  const sy = (viewH - FIT_PADDING) / contentH
  return Math.min(FIT_MAX, Math.max(SCALE_MIN, Math.min(sx, sy)))
}

/** 大画布只增不减；内容超过当前画布时扩到内容 + padding，最多 CANVAS_MAX。 */
export function growCanvas(
  canvasW: number,
  canvasH: number,
  contentW: number,
  contentH: number,
): { width: number; height: number; changed: boolean } {
  const needW = Math.min(CANVAS_MAX, Math.max(canvasW, Math.ceil(contentW + CANVAS_PADDING)))
  const needH = Math.min(CANVAS_MAX, Math.max(canvasH, Math.ceil(contentH + CANVAS_PADDING)))
  return { width: needW, height: needH, changed: needW !== canvasW || needH !== canvasH }
}
