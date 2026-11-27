import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface WaveBackdropProps {
  mode?: 'home' | 'study' | 'wall';
  pureView?: boolean;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  life: number;
  maxLife: number;
}

/**
 * 潮汐星海双层动态背景引擎（基于 Wallpaper Engine 3544823846「Wave」原画双层分离构建）
 * - Layer 1: 1080p 暮色星海与海面日落原画（wave-bg.jpg）
 * - Layer 2: 独立前景人物透明层（wave-fg.png），随指针微幅视差漂浮 + 微风呼吸
 * - Layer 3: 轻量化 Canvas 特效（高空偶发流星 + 海面鼠标水波涟漪，遵循 prefers-reduced-motion）
 * - Layer 4: 自适应可读性大气纱幕（保障玻璃拟态组件上正文始终保持 WCAG AA/AAA 对比度）
 */
export function WaveBackdrop({ mode = 'home', pureView = false }: WaveBackdropProps) {
  const fgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rawBase =
    (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';
  const assetPrefix = rawBase.endsWith('/') ? `${rawBase}assets` : `${rawBase}/assets`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    let rafId = 0;

    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let lastRippleAt = 0;

    const ripples: Ripple[] = [];
    const stars: ShootingStar[] = [];

    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const spawnRipple = (x: number, y: number, strong = false) => {
      // 仅在下半屏海面镜面区域生成透视椭圆形涟漪
      if (y < window.innerHeight * 0.5) return;
      if (ripples.length > 14) ripples.shift();
      ripples.push({
        x,
        y,
        r: strong ? 6 : 4,
        maxR: strong ? 92 : 58,
        alpha: strong ? 0.42 : 0.24,
      });
    };

    const spawnStar = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      stars.push({
        x: w * (0.45 + Math.random() * 0.5),
        y: h * (0.04 + Math.random() * 0.22),
        vx: -(4.2 + Math.random() * 2.8),
        vy: 1.5 + Math.random() * 1.1,
        len: 70 + Math.random() * 65,
        life: 0,
        maxLife: 48 + Math.random() * 28,
      });
    };

    const onPointerMove = (e: PointerEvent) => {
      const nx = e.clientX / Math.max(1, window.innerWidth) - 0.5;
      const ny = e.clientY / Math.max(1, window.innerHeight) - 0.5;
      targetX = nx * 10;
      targetY = ny * 6;
      const now = performance.now();
      if (now - lastRippleAt > 140) {
        lastRippleAt = now;
        spawnRipple(e.clientX, e.clientY, false);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      spawnRipple(e.clientX, e.clientY, true);
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });

    let nextStarTick = 120;
    let tick = 0;

    const frame = () => {
      tick += 1;
      curX += (targetX - curX) * 0.06;
      curY += (targetY - curY) * 0.06;

      if (fgRef.current) {
        fgRef.current.style.transform = `translate3d(${(-curX).toFixed(2)}px, ${(-curY).toFixed(
          2
        )}px, 0) scale(1.02)`;
      }

      if (ctx && canvas) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        ctx.clearRect(0, 0, w, h);

        // 偶发流星（贴合原壁纸右上星空流星意境）
        if (tick >= nextStarTick) {
          spawnStar();
          nextStarTick = tick + 260 + Math.floor(Math.random() * 260);
        }

        for (let i = stars.length - 1; i >= 0; i -= 1) {
          const s = stars[i];
          s.x += s.vx;
          s.y += s.vy;
          s.life += 1;
          const t = s.life / s.maxLife;
          const alpha = Math.sin(t * Math.PI) * 0.72;
          if (s.life >= s.maxLife) {
            stars.splice(i, 1);
            continue;
          }
          const grad = ctx.createLinearGradient(
            s.x,
            s.y,
            s.x - s.vx * (s.len / 6),
            s.y - s.vy * (s.len / 6)
          );
          grad.addColorStop(0, `rgba(225, 242, 255, ${alpha.toFixed(3)})`);
          grad.addColorStop(0.35, `rgba(128, 194, 255, ${(alpha * 0.6).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(128, 194, 255, 0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.vx * (s.len / 6), s.y - s.vy * (s.len / 6));
          ctx.stroke();
        }

        // 海面透视涟漪（贴合原壁纸 cursorripple）
        for (let i = ripples.length - 1; i >= 0; i -= 1) {
          const rp = ripples[i];
          rp.r += 0.95;
          const progress = rp.r / rp.maxR;
          const a = rp.alpha * (1 - progress);
          if (progress >= 1 || a <= 0.01) {
            ripples.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.translate(rp.x, rp.y);
          ctx.scale(1, 0.34);
          ctx.beginPath();
          ctx.arc(0, 0, rp.r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(218, 236, 255, ${a.toFixed(3)})`;
          ctx.lineWidth = 1.25;
          ctx.stroke();
          ctx.restore();
        }
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  return (
    <div
      className={cn(
        'wave-backdrop-root pointer-events-none fixed inset-0 z-0 overflow-hidden select-none',
        `wave-mode-${mode}`,
        pureView && 'is-pure-view'
      )}
      aria-hidden="true"
    >
      {/* Layer 1: 暮色海面与星空原画 */}
      <img
        src={`${assetPrefix}/wave-bg.jpg`}
        alt=""
        className="wave-bg-img absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Layer 2: 柔和地平线霞光呼吸 + 有机多极弥散渐变光晕 */}
      <div className="wave-horizon-breath absolute inset-0" />
      <div className="wave-diffuse-mesh absolute inset-0" aria-hidden="true">
        <span className="diffuse-orb diffuse-orb-peach" />
        <span className="diffuse-orb diffuse-orb-sky" />
        <span className="diffuse-orb diffuse-orb-aqua" />
      </div>

      {/* Layer 3: 独立人物剪影微视差前景层 */}
      <img
        ref={fgRef}
        src={`${assetPrefix}/wave-fg.png`}
        alt=""
        className="wave-fg-img absolute inset-0 h-full w-full object-cover object-center will-change-transform"
      />

      {/* Layer 4: 流星与海面涟漪 Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Layer 5: 主题自适应可读性大气纱幕 */}
      <div className="wave-veil absolute inset-0 transition-opacity duration-500" />
    </div>
  );
}
