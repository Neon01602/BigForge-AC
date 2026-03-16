import React, { useState, useEffect, useRef } from 'react';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';
import { Hammer, LogIn, Mail, Lock, UserPlus } from 'lucide-react';
import { motion } from 'motion/react';

export let pendingDisplayName: string | null = null;

// ── Theme toggle — sets/removes html.dark, persists to localStorage ──
function useAuthTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('bidforge-auth-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('bidforge-auth-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return { isDark, toggle: () => setIsDark(v => !v) };
}

// ── Animated 3D perspective grid ──
function GridFloor({ isDark }: { isDark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width  = Math.round(window.innerWidth  * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    let last = 0;
    const SPEED = 0.018;

    const draw = (ts: number) => {
      const dt = ts - last; last = ts;
      offsetRef.current = (offsetRef.current + dt * SPEED * 0.001) % 1;

      const W = canvas.width / dpr, H = canvas.height / dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const HORIZON = H * 0.50;
      const BOTTOM  = H + 40;

      // Grid line colours adapt to theme
      const lineColor = isDark
        ? 'rgba(255,255,255,ALPHA)'
        : 'rgba(20,20,20,ALPHA)';

      const lc = (a: number) => lineColor.replace('ALPHA', a.toFixed(3));

      // Vertical converging lines
      const V_LINES = 22;
      for (let i = 0; i <= V_LINES; i++) {
        const frac     = i / V_LINES;
        const bottomX  = W / 2 + (frac - 0.5) * W * 2.4;
        const edgeness = Math.abs(frac - 0.5) * 2;
        const alpha    = 0.05 + (1 - edgeness) * 0.11;
        ctx.strokeStyle = lc(alpha);
        ctx.lineWidth   = 0.55 + (1 - edgeness) * 0.7;
        ctx.beginPath();
        ctx.moveTo(W / 2, HORIZON);
        ctx.lineTo(bottomX, BOTTOM);
        ctx.stroke();
      }

      // Animated horizontal lines
      const H_LINES = 20;
      for (let i = 0; i <= H_LINES; i++) {
        const base = i / H_LINES;
        const rawT = (base + offsetRef.current) % 1;
        const t    = rawT * rawT;
        const y    = HORIZON + (BOTTOM - HORIZON) * t;
        ctx.strokeStyle = lc(0.05 + t * 0.28);
        ctx.lineWidth   = 0.6 + t * 3.0;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Sky fade
      const skyTop    = isDark ? 'rgba(15,15,15,1)'   : 'rgba(228,227,224,1)';
      const skyBottom = isDark ? 'rgba(15,15,15,0)'   : 'rgba(228,227,224,0)';
      const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON);
      skyGrad.addColorStop(0, skyTop);
      skyGrad.addColorStop(0.6, isDark ? 'rgba(15,15,15,0.88)' : 'rgba(228,227,224,0.88)');
      skyGrad.addColorStop(1, skyBottom);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, HORIZON + 2);

      // Bottom fade
      const btmTop    = isDark ? 'rgba(15,15,15,0)'    : 'rgba(228,227,224,0)';
      const btmBottom = isDark ? 'rgba(15,15,15,0.96)' : 'rgba(228,227,224,0.96)';
      const btmGrad = ctx.createLinearGradient(0, H - 110, 0, H);
      btmGrad.addColorStop(0, btmTop);
      btmGrad.addColorStop(1, btmBottom);
      ctx.fillStyle = btmGrad;
      ctx.fillRect(0, H - 110, W, 110);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none', zIndex: 0 }}
    />
  );
}

export function Auth() {
  const { isDark, toggle } = useAuthTheme();
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(''); setLoading(true);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (isSignUp) {
        pendingDisplayName = name.trim() || email.split('@')[0];
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: pendingDisplayName });
        pendingDisplayName = null;
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      pendingDisplayName = null;
      setError(err.message);
    } finally { setLoading(false); }
  };

  // Derived colours from theme
  const bg        = isDark ? '#0f0f0f'             : '#E4E3E0';
  const cardBg    = isDark ? '#1a1a1a'             : '#ffffff';
  const cardBorder= isDark ? 'rgba(255,255,255,0.22)' : '#141414';
  const cardShadow= isDark ? '10px 10px 0 rgba(255,255,255,0.10)' : '10px 10px 0 #141414';
  const accentBar = isDark ? 'rgba(255,255,255,0.15)' : '#141414';
  const textPrim  = isDark ? '#ffffff'             : '#141414';
  const textSec   = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(20,20,20,0.5)';
  const inputBg   = isDark ? '#141414'             : '#ffffff';
  const inputBord = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(20,20,20,0.22)';
  const divider   = isDark ? 'rgba(255,255,255,0.1)'  : 'rgba(20,20,20,0.1)';
  const tabActiveBg = isDark ? '#ffffff'           : '#141414';
  const tabActiveText = isDark ? '#000000'         : '#ffffff';
  const tabInactiveText = textPrim;
  const btnPrimBg = isDark ? '#ffffff'             : '#141414';
  const btnPrimText = isDark ? '#000000'           : '#ffffff';
  const btnPrimBorder = isDark ? '#ffffff'         : '#141414';
  const btnPrimHoverBg  = isDark ? '#141414'       : '#ffffff';
  const btnPrimHoverText= isDark ? '#ffffff'       : '#141414';
  const btnGoogBg = isDark ? '#1e1e1e'             : '#ffffff';
  const btnGoogText = textPrim;
  const footerText= isDark ? 'rgba(255,255,255,0.28)' : 'rgba(20,20,20,0.45)';
  const errorBg   = isDark ? 'rgba(255,51,85,0.08)'   : '#fef2f2';
  const errorBorder= isDark ? 'rgba(255,51,85,0.3)'   : '#fecaca';
  const errorText = isDark ? '#ff5577'             : '#dc2626';
  const iconColor = isDark ? 'rgba(255,255,255,0.3)'  : 'rgba(20,20,20,0.35)';
  const toggleBg  = isDark ? '#1e1e1e'             : '#ffffff';
  const toggleBord= isDark ? 'rgba(255,255,255,0.2)'  : 'rgba(20,20,20,0.18)';

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    paddingLeft: 38, paddingRight: 14, paddingTop: 12, paddingBottom: 12,
    border: `1.5px solid ${inputBord}`,
    fontSize: 13, fontWeight: 600, color: textPrim,
    background: inputBg, outline: 'none',
    fontFamily: 'inherit', borderRadius: 0,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 9, fontWeight: 700,
    fontFamily: 'monospace', letterSpacing: '0.18em',
    textTransform: 'uppercase', color: textPrim, marginBottom: 6,
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'sans-serif', position: 'relative' }}>
      <GridFloor isDark={isDark} />

      {/* ── Dark / Light toggle pill ── */}
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        style={{
          position: 'fixed', top: 20, right: 24, zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '7px 14px',
          background: toggleBg,
          border: `1.5px solid ${toggleBord}`,
          borderRadius: 100, cursor: 'pointer',
          fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: textPrim,
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>{isDark ? '☀' : '☾'}</span>
        <span>{isDark ? 'Light' : 'Dark'}</span>
      </button>

      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 500 }}
      >
        {/* ── Card ── */}
        <div style={{
          background: cardBg,
          border: `3px solid ${cardBorder}`,
          boxShadow: cardShadow,
          display: 'flex', flexDirection: 'row', overflow: 'hidden',
          transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s',
        }}>
          {/* Left accent strip */}
          <div style={{ width: 9, background: accentBar, flexShrink: 0, transition: 'background 0.25s' }} />

          {/* Form */}
          <div style={{ flex: 1, padding: '38px 38px 34px 34px' }}>

            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
              <div style={{ width: 46, height: 46, background: isDark ? '#ffffff' : '#141414', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}>
                <Hammer size={22} color={isDark ? '#000000' : '#ffffff'} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 27, fontWeight: 900, letterSpacing: '-0.045em', textTransform: 'uppercase', fontStyle: 'italic', color: textPrim, lineHeight: 1 }}>
                  BidForge
                </h1>
                <p style={{ margin: '3px 0 0', fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.2em', textTransform: 'uppercase', color: textSec }}>
                  Real-Time Competitive Arena
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `2.5px solid ${cardBorder}`, marginBottom: 28 }}>
              {(['Sign In', 'Create Account'] as const).map((label, i) => {
                const active = isSignUp ? i === 1 : i === 0;
                return (
                  <button key={label} onClick={() => { setIsSignUp(i === 1); setError(''); }}
                    style={{
                      padding: '9px 20px', fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      background: active ? tabActiveBg : 'transparent',
                      color: active ? tabActiveText : tabInactiveText,
                      border: 'none', cursor: 'pointer',
                      marginBottom: -2.5,
                      borderBottom: active ? `2.5px solid ${cardBorder}` : '2.5px solid transparent',
                      transition: 'all 0.15s',
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Fields */}
            <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {isSignUp && (
                <motion.div key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ overflow: 'hidden' }}>
                  <label style={labelStyle}>Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <UserPlus size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: iconColor, pointerEvents: 'none' }} />
                    <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="John Doe" required={isSignUp} />
                  </div>
                </motion.div>
              )}

              <div>
                <label style={labelStyle}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: iconColor, pointerEvents: 'none' }} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="name@example.com" required />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: iconColor, pointerEvents: 'none' }} />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="••••••••" required />
                </div>
              </div>

              <button
                type="submit" disabled={loading}
                onMouseEnter={e => { if (!loading) { const b = e.currentTarget; b.style.background = btnPrimHoverBg; b.style.color = btnPrimHoverText; } }}
                onMouseLeave={e => { const b = e.currentTarget; b.style.background = btnPrimBg; b.style.color = btnPrimText; }}
                style={{
                  marginTop: 4, width: '100%', padding: '14px 0',
                  background: btnPrimBg, color: btnPrimText,
                  border: `2px solid ${btnPrimBorder}`,
                  fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                  letterSpacing: '0.2em', textTransform: 'uppercase',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.65 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: loading ? 'none' : `4px 4px 0 ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(20,20,20,0.3)'}`,
                  transition: 'all 0.12s',
                }}>
                {isSignUp ? <UserPlus size={16} /> : <LogIn size={16} />}
                {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
              <div style={{ flex: 1, height: 1, background: divider }} />
              <span style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.16em', color: textSec, textTransform: 'uppercase' }}>Or</span>
              <div style={{ flex: 1, height: 1, background: divider }} />
            </div>

            {/* Google */}
            <button
              onClick={handleGoogleSignIn} disabled={loading}
              onMouseEnter={e => { if (!loading) { const b = e.currentTarget; b.style.background = isDark ? '#ffffff' : '#141414'; b.style.color = isDark ? '#000000' : '#ffffff'; } }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.background = btnGoogBg; b.style.color = btnGoogText; }}
              style={{
                width: '100%', padding: '13px 0',
                background: btnGoogBg, color: btnGoogText,
                border: `2px solid ${cardBorder}`,
                fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.65 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: `3px 3px 0 ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(20,20,20,0.12)'}`,
                transition: 'all 0.12s',
              }}>
              <img src="https://www.google.com/favicon.ico" alt="G" style={{ width: 16, height: 16 }} />
              Continue with Google
            </button>

            {/* Error */}
            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                style={{ marginTop: 16, padding: '10px 14px', background: errorBg, border: `1px solid ${errorBorder}`, color: errorText, fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5 }}>
                {error}
              </motion.div>
            )}

            {/* Footer note */}
            <p style={{ marginTop: 22, fontSize: 9, fontFamily: 'monospace', color: footerText, letterSpacing: '0.04em', textAlign: 'center', lineHeight: 1.7 }}>
              By entering the arena, you agree to the terms of competitive engagement.
              The first user to register will be granted System Administrator privileges.
            </p>
          </div>
        </div>

        {/* Hackathon tag */}
        <div style={{ position: 'absolute', bottom: -22, right: 0, fontSize: 8, fontFamily: 'monospace', letterSpacing: '0.13em', color: footerText, textTransform: 'uppercase' }}>
          CodeBidz 2026 · Team Absolute Cinema
        </div>
      </motion.div>
    </div>
  );
}