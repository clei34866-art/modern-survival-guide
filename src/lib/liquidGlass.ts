import { useEffect, useRef } from 'react';

/**
 * Apple 风格液态玻璃边缘折射（基于 deepika-builds/liquid-glass 与 stormaref 门控原则）
 * - 仅在支持 backdrop-filter: url(#id) 的 Chromium 引擎上激活（Safari/Firefox 自动走标准磨砂）
 * - 强制 color-interpolation-filters="sRGB" 防止中性灰 128 偏移产生整面伪位移
 * - 仅用于 ≤800px 的悬浮胶囊控件，尊重 prefers-reduced-motion 与 prefers-reduced-transparency
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
let uid = 0;
let sharedDefs: SVGDefsElement | null = null;
let cachedSupport: boolean | null = null;

export function isLiquidGlassSupported(): boolean {
  if (cachedSupport !== null) return cachedSupport;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    cachedSupport = false;
    return false;
  }
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reducedTransparency = window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;
  if (reducedMotion || reducedTransparency) {
    cachedSupport = false;
    return false;
  }
  const ua = navigator.userAgent;
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  if (isSafari || isFirefox) {
    cachedSupport = false;
    return false;
  }
  if (typeof CSS === 'undefined' || !CSS.supports('backdrop-filter', 'url(#lg-test)')) {
    cachedSupport = false;
    return false;
  }
  try {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const ctx = c.getContext('2d');
    if (!ctx) {
      cachedSupport = false;
      return false;
    }
    ctx.getImageData(0, 0, 1, 1);
    cachedSupport = true;
    return true;
  } catch {
    cachedSupport = false;
    return false;
  }
}

function ensureDefs(): SVGDefsElement {
  if (sharedDefs && document.body.contains(sharedDefs)) return sharedDefs;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'fixed';
  svg.style.pointerEvents = 'none';
  sharedDefs = document.createElementNS(SVG_NS, 'defs');
  svg.appendChild(sharedDefs);
  document.body.appendChild(svg);
  return sharedDefs;
}

function createDisplacementDataUrl(
  w: number,
  h: number,
  radius: number,
  border: number,
  mapBlur: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(w));
  canvas.height = Math.max(2, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const gx = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gx.addColorStop(0, 'rgb(0,0,0)');
  gx.addColorStop(1, 'rgb(255,0,0)');
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gy = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gy.addColorStop(0, 'rgb(0,0,0)');
  gy.addColorStop(1, 'rgb(0,0,255)');
  ctx.globalCompositeOperation = 'difference';
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = 'source-over';
  const inset = Math.max(2, border * Math.min(canvas.width, canvas.height));
  ctx.filter = `blur(${mapBlur}px)`;
  ctx.fillStyle = 'rgba(128,128,128,0.94)';
  ctx.beginPath();
  const rw = Math.max(2, canvas.width - inset * 2);
  const rh = Math.max(2, canvas.height - inset * 2);
  const rr = Math.max(radius - inset, 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(inset, inset, rw, rh, rr);
  } else {
    ctx.rect(inset, inset, rw, rh);
  }
  ctx.fill();
  ctx.filter = 'none';
  return canvas.toDataURL();
}

export interface LiquidGlassOptions {
  enabled?: boolean;
  scale?: number;
  chroma?: number;
  border?: number;
  mapBlur?: number;
  blur?: number;
  saturate?: number;
  brightness?: number;
  maxWidth?: number;
}

export function useLiquidGlass<T extends HTMLElement>(options: LiquidGlassOptions = {}) {
  const ref = useRef<T | null>(null);
  const {
    enabled = true,
    scale = -30,
    chroma = 3,
    border = 0.14,
    mapBlur = 8,
    blur = 10,
    saturate = 1.72,
    brightness = 1.06,
    maxWidth = 820,
  } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !isLiquidGlassSupported()) return;

    const id = `lg-wave-lens-${++uid}`;
    const scales = [scale, scale + chroma, scale + 2 * chroma];
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const feImage = document.createElementNS(SVG_NS, 'feImage');
    feImage.setAttribute('x', '0');
    feImage.setAttribute('y', '0');
    feImage.setAttribute('result', 'map');
    feImage.setAttribute('preserveAspectRatio', 'none');
    filter.appendChild(feImage);

    const keep = [
      '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
      '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
      '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
    ];
    for (let i = 0; i < 3; i += 1) {
      const disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
      disp.setAttribute('in', 'SourceGraphic');
      disp.setAttribute('in2', 'map');
      disp.setAttribute('scale', String(scales[i]));
      disp.setAttribute('xChannelSelector', 'R');
      disp.setAttribute('yChannelSelector', 'B');
      disp.setAttribute('result', `d${i}`);
      filter.appendChild(disp);

      const cm = document.createElementNS(SVG_NS, 'feColorMatrix');
      cm.setAttribute('in', `d${i}`);
      cm.setAttribute('type', 'matrix');
      cm.setAttribute('values', keep[i]);
      cm.setAttribute('result', `c${i}`);
      filter.appendChild(cm);
    }

    const blend1 = document.createElementNS(SVG_NS, 'feBlend');
    blend1.setAttribute('in', 'c0');
    blend1.setAttribute('in2', 'c1');
    blend1.setAttribute('mode', 'screen');
    blend1.setAttribute('result', 'c01');
    filter.appendChild(blend1);

    const blend2 = document.createElementNS(SVG_NS, 'feBlend');
    blend2.setAttribute('in', 'c01');
    blend2.setAttribute('in2', 'c2');
    blend2.setAttribute('mode', 'screen');
    filter.appendChild(blend2);

    ensureDefs().appendChild(filter);

    const applyFilter = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h || w > maxWidth) {
        el.style.removeProperty('--glass-lens');
        return;
      }
      const computedR = parseFloat(getComputedStyle(el).borderTopLeftRadius || '999') || 0;
      const radius = Math.min(computedR, Math.min(w, h) / 2);
      const href = createDisplacementDataUrl(w, h, radius, border, mapBlur);
      if (!href) return;
      feImage.setAttribute('href', href);
      feImage.setAttribute('width', String(w));
      feImage.setAttribute('height', String(h));
      const filterStr = `url(#${id}) blur(${blur}px) saturate(${saturate}) brightness(${brightness})`;
      el.style.backdropFilter = filterStr;
      (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter =
        filterStr;
    };

    applyFilter();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(applyFilter, 120);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
      filter.remove();
      el.style.backdropFilter = '';
      (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter =
        '';
    };
  }, [enabled, scale, chroma, border, mapBlur, blur, saturate, brightness, maxWidth]);

  return ref;
}
