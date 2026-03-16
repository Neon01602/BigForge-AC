import React, { useEffect, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { Auth } from './components/Auth';
import { Navbar } from './components/Navbar';
import { AdminPanel } from './components/AdminPanel';
import { BidderPanel } from './components/BidderPanel';
import { Hammer, Loader2 } from 'lucide-react';

// ── Live 3D Perspective Grid Background ─────────────────────────
function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width  = Math.round(window.innerWidth  * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    let last = 0;
    const SPEED = 0.00006;

    const draw = (ts: number) => {
      const dt = ts - last; last = ts;
      offsetRef.current = (offsetRef.current + dt * SPEED) % 1;

      const W = canvas.width  / dpr;
      const H = canvas.height / dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const HORIZON = H * 0.48;
      const BOTTOM  = H + 60;
      const CX      = W / 2;

      // Vertical converging lines
      const V_LINES = 48;
      for (let i = 0; i <= V_LINES; i++) {
        const frac     = i / V_LINES;
        const bottomX  = CX + (frac - 0.5) * W * 2.6;
        const edgeness = Math.abs(frac - 0.5) * 2;
        const alpha    = 0.08 + (1 - edgeness) * 0.10;
        ctx.strokeStyle = `rgba(20,20,20,${alpha.toFixed(3)})`;
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(CX, HORIZON);
        ctx.lineTo(bottomX, BOTTOM);
        ctx.stroke();
      }
      const H_LINES = 22;

      // Animated horizontal lines — constant speed, t² perspective spacing
      for (let i = 0; i <= H_LINES; i++) {
        const rawT = (i / H_LINES + offsetRef.current) % 1;
        const t    = rawT * rawT;
        const y    = HORIZON + (BOTTOM - HORIZON) * t;
 
        // Calculate x positions of the two outermost vertical lines at this y
        // Vertical line goes from (CX, HORIZON) to (CX + (frac-0.5)*W*4, BOTTOM)
        // Interpolate at current y: x = CX + (frac-0.5)*W*4 * ((y-HORIZON)/(BOTTOM-HORIZON))
        const spread = (y - HORIZON) / (BOTTOM - HORIZON);
        const leftX  = CX - W * 2.5 * 0.5 * spread;  // frac=0 → leftmost
        const rightX = CX + W * 2.5 * 0.5 * spread;  // frac=1 → rightmost
 
        const alpha = 0.07 + t * 0.18;
        ctx.strokeStyle = `rgba(20,20,20,${alpha.toFixed(3)})`;
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(leftX, y);
        ctx.lineTo(rightX, y);
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100%',
        display: 'block', pointerEvents: 'none', zIndex: 0,
      }}
    />
  );
}

// ────────────────────────────────────────────────────────────────

export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-[#141414]" size={48} />
        <div className="flex flex-col items-center">
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-[#141414]">BidForge</h1>
          <p className="text-[10px] font-mono uppercase text-[#141414]/40">Initializing Competitive Arena...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Auth />;
  }

  return (
    <div
      className="min-h-screen text-[#141414] font-sans selection:bg-[#141414] selection:text-white"
      style={{ backgroundColor: '#E4E3E0', position: 'relative' }}
    >
      <GridBackground />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Navbar profile={profile} />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {profile.role === 'admin' ? (
            <AdminPanel />
          ) : (
            <BidderPanel profile={profile} />
          )}
        </main>

        <footer className="border-t border-[#141414]/10 py-8 mt-12 bg-white/60 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2 opacity-20 grayscale">
              <Hammer size={16} />
              <span className="text-sm font-bold tracking-tighter uppercase italic">BidForge</span>
            </div>
            <p className="text-[10px] font-mono uppercase text-[#141414]/40">
              CodeBidz 2026 · Hackathon Submission · Team: Absolute Cinema
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}