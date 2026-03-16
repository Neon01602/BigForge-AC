import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot, orderBy, addDoc, updateDoc, doc, deleteDoc, limit, getDocs, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { Auction, UserProfile, Bid, CreditTransaction } from '../types';
import { Plus, Trash2, Edit3, BarChart3, Users, Hammer, Sparkles, AlertTriangle, Play, History, Wallet, Search, LayoutDashboard, UserMinus, X, Flag, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { geminiService } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

// ── 3D Bid Heatmap ───────────────────────────────────────────────
interface HeatmapAuction { id: string; title: string; bidFrequency?: number; }

function BidHeatmap3D({ auctions }: { auctions: HeatmapAuction[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef  = useRef({
    rotY: -0.45, rotX: 0.32,
    dragging: false, lastX: 0, lastY: 0,
    animFrameId: 0,
    currentHeights: [] as number[],
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const { rotY, rotX } = stateRef.current;
    const items = auctions.length > 0 ? auctions : [];
    const maxFreq = Math.max(1, ...items.map(a => a.bidFrequency || 0));
    const targets = items.map(a => Math.min((a.bidFrequency || 0) / maxFreq, 1));
    const cur = stateRef.current.currentHeights;
    while (cur.length < items.length) cur.push(0);
    cur.length = items.length;
    for (let i = 0; i < items.length; i++) cur[i] += (targets[i] - cur[i]) * 0.08;
    const cx = W / 2, cy = H / 2 + 20, scale = Math.min(W, H) * 0.38;
    function project(x: number, y: number, z: number): [number, number] {
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const x1 = x * cosY + z * sinY, z1 = -x * sinY + z * cosY;
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const y2 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
      const fac = 4 / (4 + z2 + 2);
      return [cx + x1 * scale * fac, cy - y2 * scale * fac];
    }
    const n = items.length;
    if (n === 0) {
      ctx.fillStyle = 'rgba(20,20,20,0.3)'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
      ctx.fillText('NO ACTIVE AUCTIONS', W / 2, H / 2); return;
    }
    const spacing = 2.2 / Math.max(n - 1, 1), bw = Math.min(0.55, spacing * 0.65), startX = -1.1;
    for (let gi = 0; gi <= 5; gi++) {
      const gx = startX + gi * (2.2 / 5);
      const [ax, ay] = project(gx, 0, -0.6), [bxp, byp] = project(gx, 0, 0.6);
      ctx.strokeStyle = 'rgba(20,20,20,0.08)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bxp, byp); ctx.stroke();
    }
    for (let gi = 0; gi <= 4; gi++) {
      const gz = -0.6 + gi * 0.3;
      const [ax, ay] = project(startX, 0, gz), [bxp, byp] = project(startX + 2.2, 0, gz);
      ctx.strokeStyle = 'rgba(20,20,20,0.08)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bxp, byp); ctx.stroke();
    }
    const order = items.map((_, i) => i).sort((a, b) => {
      const za = -(startX + a * spacing) * Math.sin(rotY), zb = -(startX + b * spacing) * Math.sin(rotY);
      return za - zb;
    });
    order.forEach(i => {
      const t = cur[i], barH = 0.05 + t * 1.6, bx = startX + i * spacing;
      const freq = items[i].bidFrequency || 0, intensity = Math.min(freq * 10, 100) / 100, alpha = Math.max(0.08, intensity);
      const x0 = bx - bw / 2, x1 = bx + bw / 2, z0 = -bw / 2, z1 = bw / 2;
      const C = {
        ftl: project(x0, barH, z1), ftr: project(x1, barH, z1),
        fbl: project(x0, 0, z1),   fbr: project(x1, 0, z1),
        btl: project(x0, barH, z0), btr: project(x1, barH, z0),
        bbl: project(x0, 0, z0),   bbr: project(x1, 0, z0),
      };
      function face(pts: [number,number][], br: number) {
        const a = Math.min(1, alpha * br);
        ctx.fillStyle = `rgba(255,99,33,${a.toFixed(3)})`; ctx.strokeStyle = 'rgba(20,20,20,0.6)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      face([C.btl, C.btr, C.bbr, C.bbl], 0.55); face([C.bbl, C.bbr, C.fbr, C.fbl], 0.7);
      face([C.btr, C.ftr, C.fbr, C.bbr], 0.75); face([C.btl, C.ftl, C.fbl, C.bbl], 0.75);
      face([C.ftl, C.ftr, C.fbr, C.fbl], 1.0);  face([C.btl, C.btr, C.ftr, C.ftl], 1.15);
      if (freq > 0) {
        const [lx, ly] = project(bx, barH + 0.08, 0);
        ctx.fillStyle = intensity > 0.5 ? 'rgba(20,20,20,0.9)' : 'rgba(20,20,20,0.5)';
        ctx.font = `500 ${Math.round(10 + t * 3)}px monospace`; ctx.textAlign = 'center';
        ctx.fillText(String(freq), lx, ly);
      }
      const [lx2, ly2] = project(bx, -0.12, 0);
      ctx.fillStyle = 'rgba(20,20,20,0.45)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      const short = items[i].title.length > 10 ? items[i].title.slice(0, 9) + '…' : items[i].title;
      ctx.fillText(short.toUpperCase(), lx2, ly2 + 10);
    });
    stateRef.current.animFrameId = requestAnimationFrame(draw);
  }, [auctions]);

  useEffect(() => {
    stateRef.current.animFrameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(stateRef.current.animFrameId);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    });
    ro.observe(canvas); return () => ro.disconnect();
  }, []);

  const onMouseDown = (e: React.MouseEvent) => { stateRef.current.dragging = true; stateRef.current.lastX = e.clientX; stateRef.current.lastY = e.clientY; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!stateRef.current.dragging) return;
    stateRef.current.rotY += (e.clientX - stateRef.current.lastX) * 0.012;
    stateRef.current.rotX += (e.clientY - stateRef.current.lastY) * 0.008;
    stateRef.current.rotX = Math.max(-0.6, Math.min(0.7, stateRef.current.rotX));
    stateRef.current.lastX = e.clientX; stateRef.current.lastY = e.clientY;
  };
  const onMouseUp = () => { stateRef.current.dragging = false; };

  return (
    <div className="bg-[#F5F5F3] border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
      <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-[#141414]/10">
        <div className="flex items-center gap-3 text-[#141414]/40">
          <BarChart3 size={18} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]">Live Bid Heatmap (Bids/Min)</span>
        </div>
        <div className="flex items-center gap-4">
          {[['HIGH', '1.0'], ['MID', '0.5'], ['LOW', '0.15']].map(([label, alpha]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 border border-[#141414]/30 inline-block" style={{ background: `rgba(255,99,33,${alpha})` }} />
              <span className="text-[9px] font-bold font-mono text-[#141414]/50">{label}</span>
            </div>
          ))}
          <span className="text-[9px] font-mono text-[#141414]/30 ml-1">drag to rotate</span>
        </div>
      </div>
      {auctions.length === 0 ? (
        <div className="flex items-center justify-center h-[260px] text-[#141414]/40 font-mono text-xs uppercase italic">No active auctions to track</div>
      ) : (
        <canvas ref={canvasRef} className="w-full"
          style={{ height: 260, cursor: stateRef.current.dragging ? 'grabbing' : 'grab', display: 'block' }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} />
      )}
    </div>
  );
}

// ── Bid Activity Charts ───────────────────────────────────────────
// Four pure-canvas charts — zero external dependencies.
// 1. Line  — bids per minute, last 30 min          (orange-red)
// 2. Bar   — top 5 auctions by bid count           (orange intensity)
// 3. Area  — cumulative bid value, last 30 min     (emerald)
// 4. Line  — individual bid amounts over time      (purple)

interface BidChartData {
  bids: (Bid & { auctionTitle?: string })[];
  auctions: Auction[];
}

function BidActivityCharts({ bids, auctions }: BidChartData) {
  const lineRef = useRef<HTMLCanvasElement>(null);
  const barRef  = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLCanvasElement>(null);
  const amtRef  = useRef<HTMLCanvasElement>(null);

  const setup = (canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    if (!W || !H) return null;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W, H };
  };

  // 1. Bids per minute
  const drawLine = useCallback(() => {
    const canvas = lineRef.current; if (!canvas) return;
    const s = setup(canvas); if (!s) return;
    const { ctx, W, H } = s;
    const MINS = 30, PAD = { t: 28, r: 14, b: 38, l: 40 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const now = Date.now();
    const counts = Array<number>(MINS).fill(0);
    bids.forEach(b => {
      const age = Math.floor((now - new Date(b.timestamp).getTime()) / 60000);
      if (age >= 0 && age < MINS) counts[MINS - 1 - age]++;
    });
    const maxC = Math.max(1, ...counts);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(20,20,20,0.06)'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(20,20,20,0.32)'; ctx.font = '8px monospace'; ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(maxC * (1 - i / 4))), PAD.l - 5, y + 3);
    }
    ctx.fillStyle = 'rgba(20,20,20,0.28)'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    [0, 5, 10, 15, 20, 25, 29].forEach(i => ctx.fillText(`-${MINS - 1 - i}m`, PAD.l + (i / (MINS - 1)) * cW, H - PAD.b + 13));
    const pts = counts.map((v, i) => ({ x: PAD.l + (i / (MINS - 1)) * cW, y: PAD.t + cH - (v / maxC) * cH }));
    const grd = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
    grd.addColorStop(0, 'rgba(255,99,33,0.14)'); grd.addColorStop(1, 'rgba(255,99,33,0.01)');
    ctx.beginPath(); ctx.moveTo(pts[0].x, PAD.t + cH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, PAD.t + cH); ctx.closePath(); ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = 'rgba(255,99,33,0.9)'; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
    pts.forEach((p, i) => { if (!counts[i]) return; ctx.beginPath(); ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,99,33,1)'; ctx.fill(); });
    ctx.fillStyle = 'rgba(20,20,20,0.32)'; ctx.font = '7.5px monospace'; ctx.textAlign = 'left';
    ctx.fillText('BIDS / MIN  ·  LAST 30 MIN', PAD.l, PAD.t - 10);
  }, [bids]);

  // 2. Top 5 auctions bar
  const drawBar = useCallback(() => {
    const canvas = barRef.current; if (!canvas) return;
    const s = setup(canvas); if (!s) return;
    const { ctx, W, H } = s;
    const PAD = { t: 28, r: 14, b: 52, l: 36 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const map: Record<string, number> = {};
    bids.forEach(b => { map[b.auctionId] = (map[b.auctionId] || 0) + 1; });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxV = Math.max(1, ...sorted.map(([, v]) => v));
    ctx.clearRect(0, 0, W, H);
    if (!sorted.length) {
      ctx.fillStyle = 'rgba(20,20,20,0.2)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('NO BID DATA', W / 2, H / 2); return;
    }
    ctx.strokeStyle = 'rgba(20,20,20,0.06)'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(20,20,20,0.32)'; ctx.font = '8px monospace'; ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(maxV * (1 - i / 4))), PAD.l - 4, y + 3);
    }
    const n = sorted.length, slotW = cW / n, barW = slotW * 0.55;
    sorted.forEach(([id, v], i) => {
      const x = PAD.l + slotW * i + (slotW - barW) / 2;
      const bh = (v / maxV) * cH, y = PAD.t + cH - bh;
      const a = (0.15 + (v / maxV) * 0.85).toFixed(3);
      ctx.fillStyle = `rgba(255,99,33,${a})`; ctx.strokeStyle = `rgba(255,99,33,${Math.min(1, +a + 0.2).toFixed(3)})`; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.rect(x, y, barW, bh); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(20,20,20,0.55)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(v), x + barW / 2, y - 4);
      const title = auctions.find(a => a.id === id)?.title || id.slice(0, 8);
      const short = title.length > 10 ? title.slice(0, 9) + '…' : title;
      ctx.save(); ctx.translate(x + barW / 2, PAD.t + cH + 9); ctx.rotate(-Math.PI / 5.5);
      ctx.fillStyle = 'rgba(20,20,20,0.38)'; ctx.font = '7.5px monospace'; ctx.textAlign = 'right';
      ctx.fillText(short.toUpperCase(), 0, 0); ctx.restore();
    });
    ctx.fillStyle = 'rgba(20,20,20,0.32)'; ctx.font = '7.5px monospace'; ctx.textAlign = 'left';
    ctx.fillText('TOP 5 AUCTIONS  ·  BID COUNT', PAD.l, PAD.t - 10);
  }, [bids, auctions]);

  // 3. Cumulative value area
  const drawArea = useCallback(() => {
    const canvas = areaRef.current; if (!canvas) return;
    const s = setup(canvas); if (!s) return;
    const { ctx, W, H } = s;
    const MINS = 30, PAD = { t: 28, r: 14, b: 38, l: 60 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const now = Date.now();
    const perMin = Array<number>(MINS).fill(0);
    bids.forEach(b => {
      const age = Math.floor((now - new Date(b.timestamp).getTime()) / 60000);
      if (age >= 0 && age < MINS) perMin[MINS - 1 - age] += b.amount;
    });
    const running = [...perMin];
    for (let i = 1; i < MINS; i++) running[i] += running[i - 1];
    const maxV = Math.max(1, ...running);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(20,20,20,0.06)'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(20,20,20,0.32)'; ctx.font = '7px monospace'; ctx.textAlign = 'right';
      ctx.fillText(formatCurrency(Math.round(maxV * (1 - i / 4))), PAD.l - 3, y + 3);
    }
    ctx.fillStyle = 'rgba(20,20,20,0.28)'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    [0, 5, 10, 15, 20, 25, 29].forEach(i => ctx.fillText(`-${MINS - 1 - i}m`, PAD.l + (i / (MINS - 1)) * cW, H - PAD.b + 13));
    const pts = running.map((v, i) => ({ x: PAD.l + (i / (MINS - 1)) * cW, y: PAD.t + cH - (v / maxV) * cH }));
    const grd = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
    grd.addColorStop(0, 'rgba(52,211,153,0.22)'); grd.addColorStop(1, 'rgba(52,211,153,0.01)');
    ctx.beginPath(); ctx.moveTo(pts[0].x, PAD.t + cH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, PAD.t + cH); ctx.closePath(); ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = 'rgba(52,211,153,0.9)'; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
    const last = [...pts].reverse().find((_, i) => running[MINS - 1 - i] > 0);
    if (last) {
      ctx.beginPath(); ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(52,211,153,1)'; ctx.fill();
      ctx.beginPath(); ctx.arc(last.x, last.y, 6.5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(52,211,153,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,20,20,0.32)'; ctx.font = '7.5px monospace'; ctx.textAlign = 'left';
    ctx.fillText('CUMULATIVE VALUE  ·  LAST 30 MIN', PAD.l, PAD.t - 10);
  }, [bids]);

  // 4. Bid amounts over time — scatter-line (NEW)
  const drawAmtLine = useCallback(() => {
    const canvas = amtRef.current; if (!canvas) return;
    const s = setup(canvas); if (!s) return;
    const { ctx, W, H } = s;
    const PAD = { t: 28, r: 24, b: 38, l: 62 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    ctx.clearRect(0, 0, W, H);

    // Sort oldest → newest, cap at last 50
    const sorted = [...bids].reverse().slice(-50);
    if (sorted.length < 2) {
      ctx.fillStyle = 'rgba(20,20,20,0.2)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('NOT ENOUGH DATA YET', W / 2, H / 2); return;
    }

    const amounts = sorted.map(b => b.amount);
    const maxAmt = Math.max(...amounts);
    const minAmt = Math.min(...amounts);
    const range  = maxAmt - minAmt || 1;

    // Grid + y labels
    ctx.strokeStyle = 'rgba(20,20,20,0.06)'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
      const val = maxAmt - (range / 4) * i;
      ctx.fillStyle = 'rgba(20,20,20,0.32)'; ctx.font = '7px monospace'; ctx.textAlign = 'right';
      ctx.fillText(formatCurrency(Math.round(val)), PAD.l - 4, y + 3);
    }

    // X-axis labels
    ctx.fillStyle = 'rgba(20,20,20,0.28)'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    ctx.fillText('OLDEST', PAD.l + 16, H - PAD.b + 13);
    ctx.fillText('NEWEST', PAD.l + cW - 16, H - PAD.b + 13);

    const pts = sorted.map((b, i) => ({
      x:   PAD.l + (i / (sorted.length - 1)) * cW,
      y:   PAD.t + cH - ((b.amount - minAmt) / range) * cH,
      amt: b.amount,
      name: b.bidderName || '',
    }));

    // Gradient fill
    const grd = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
    grd.addColorStop(0, 'rgba(139,92,246,0.15)'); grd.addColorStop(1, 'rgba(139,92,246,0.01)');
    ctx.beginPath(); ctx.moveTo(pts[0].x, PAD.t + cH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, PAD.t + cH); ctx.closePath();
    ctx.fillStyle = grd; ctx.fill();

    // Connecting line
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = 'rgba(139,92,246,0.85)'; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();

    // Dots — highlight max bid
    const maxIdx = amounts.indexOf(maxAmt);
    pts.forEach((p, i) => {
      const isMax = i === maxIdx;
      ctx.beginPath(); ctx.arc(p.x, p.y, isMax ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isMax ? 'rgba(139,92,246,1)' : 'rgba(139,92,246,0.65)'; ctx.fill();
      if (isMax) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(139,92,246,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      }
    });

    // Peak annotation
    if (maxIdx >= 0) {
      const pp = pts[maxIdx];
      const label = formatCurrency(maxAmt);
      const lw = ctx.measureText(label).width + 8;
      const lx = Math.min(Math.max(pp.x - lw / 2, PAD.l), PAD.l + cW - lw);
      const ly = pp.y - 14;
      ctx.fillStyle = 'rgba(139,92,246,0.12)';
      ctx.fillRect(lx, ly - 9, lw, 12);
      ctx.fillStyle = 'rgba(139,92,246,0.95)'; ctx.font = '7.5px monospace'; ctx.textAlign = 'left';
      ctx.fillText(label, lx + 4, ly);
    }

    // Latest bid label at right edge
    const lastPt = pts[pts.length - 1];
    ctx.fillStyle = 'rgba(20,20,20,0.38)'; ctx.font = '7px monospace'; ctx.textAlign = 'right';
    ctx.fillText(formatCurrency(lastPt.amt), PAD.l + cW, lastPt.y - 5);

    // Chart title
    ctx.fillStyle = 'rgba(20,20,20,0.32)'; ctx.font = '7.5px monospace'; ctx.textAlign = 'left';
    ctx.fillText('BID AMOUNTS  ·  LAST 50 BIDS', PAD.l, PAD.t - 10);
  }, [bids]);

  useEffect(() => { drawLine(); drawBar(); drawArea(); drawAmtLine(); }, [drawLine, drawBar, drawArea, drawAmtLine]);

  useEffect(() => {
    const obs = new ResizeObserver(() => { drawLine(); drawBar(); drawArea(); drawAmtLine(); });
    [lineRef, barRef, areaRef, amtRef].forEach(r => { if (r.current) obs.observe(r.current); });
    return () => obs.disconnect();
  }, [drawLine, drawBar, drawArea, drawAmtLine]);

  // ── Modal state ──
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const modalWrapRef   = useRef<HTMLDivElement>(null);
  const tooltipRef     = useRef<HTMLDivElement>(null);

  const CHARTS = [
    { dot: 'rgba(255,99,33,0.9)',  label: 'Bids per Minute',  sub: '30 min',    color: '#FF6321' },
    { dot: 'rgba(255,99,33,0.6)',  label: 'Top 5 Auctions',   sub: 'bid count', color: '#FF6321' },
    { dot: 'rgba(52,211,153,0.9)', label: 'Cumulative Value',  sub: '30 min',    color: '#34D399' },
    { dot: 'rgba(139,92,246,0.9)', label: 'Bid Amounts',       sub: 'last 50',   color: '#8B5CF6' },
  ];

  // Draw the selected chart into the modal canvas at large size with bigger fonts
  const drawModal = useCallback((idx: number) => {
    const canvas = modalCanvasRef.current;
    const wrap   = modalWrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth || 800, H = wrap.clientHeight || 420;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (idx === 0) {
      // Bids per minute — line
      const MINS = 30, PAD = { t: 44, r: 24, b: 52, l: 60 };
      const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
      const now = Date.now();
      const counts = Array<number>(MINS).fill(0);
      bids.forEach(b => { const age = Math.floor((now - new Date(b.timestamp).getTime()) / 60000); if (age >= 0 && age < MINS) counts[MINS - 1 - age]++; });
      const maxC = Math.max(1, ...counts);
      ctx.strokeStyle = 'rgba(20,20,20,0.07)'; ctx.lineWidth = 0.8;
      for (let i = 0; i <= 4; i++) {
        const y = PAD.t + (cH / 4) * i;
        ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
        ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'right';
        ctx.fillText(String(Math.round(maxC * (1 - i / 4))), PAD.l - 8, y + 4);
      }
      ctx.fillStyle = 'rgba(20,20,20,0.4)'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
      [0, 5, 10, 15, 20, 25, 29].forEach(i => ctx.fillText(`-${MINS - 1 - i}m`, PAD.l + (i / (MINS - 1)) * cW, H - PAD.b + 18));
      const pts = counts.map((v, i) => ({ x: PAD.l + (i / (MINS - 1)) * cW, y: PAD.t + cH - (v / maxC) * cH, v }));
      const grd = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
      grd.addColorStop(0, 'rgba(255,99,33,0.18)'); grd.addColorStop(1, 'rgba(255,99,33,0.01)');
      ctx.beginPath(); ctx.moveTo(pts[0].x, PAD.t + cH); pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(pts[pts.length-1].x, PAD.t + cH); ctx.closePath(); ctx.fillStyle = grd; ctx.fill();
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = 'rgba(255,99,33,1)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
      pts.forEach(p => { if (!p.v) return; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,99,33,1)'; ctx.fill(); });
      ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
      ctx.fillText('BIDS / MIN  ·  LAST 30 MIN', PAD.l, PAD.t - 16);
    } else if (idx === 1) {
      // Top 5 bar
      const PAD = { t: 44, r: 24, b: 70, l: 50 };
      const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
      const map: Record<string, number> = {};
      bids.forEach(b => { map[b.auctionId] = (map[b.auctionId] || 0) + 1; });
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const maxV = Math.max(1, ...sorted.map(([, v]) => v));
      if (!sorted.length) { ctx.fillStyle = 'rgba(20,20,20,0.3)'; ctx.font = '14px monospace'; ctx.textAlign = 'center'; ctx.fillText('NO BID DATA', W/2, H/2); return; }
      ctx.strokeStyle = 'rgba(20,20,20,0.07)'; ctx.lineWidth = 0.8;
      for (let i = 0; i <= 4; i++) {
        const y = PAD.t + (cH / 4) * i;
        ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
        ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'right';
        ctx.fillText(String(Math.round(maxV * (1 - i / 4))), PAD.l - 6, y + 4);
      }
      const n = sorted.length, slotW = cW / n, barW = slotW * 0.55;
      sorted.forEach(([id, v], i) => {
        const x = PAD.l + slotW * i + (slotW - barW) / 2, bh = (v / maxV) * cH, y = PAD.t + cH - bh;
        const a = (0.2 + (v / maxV) * 0.8).toFixed(3);
        ctx.fillStyle = `rgba(255,99,33,${a})`; ctx.strokeStyle = 'rgba(255,99,33,1)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(x, y, barW, bh); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(20,20,20,0.75)'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
        ctx.fillText(String(v), x + barW / 2, y - 7);
        const title = auctions.find(a => a.id === id)?.title || id.slice(0, 8);
        const short = title.length > 14 ? title.slice(0, 13) + '…' : title;
        ctx.save(); ctx.translate(x + barW / 2, PAD.t + cH + 12); ctx.rotate(-Math.PI / 5);
        ctx.fillStyle = 'rgba(20,20,20,0.55)'; ctx.font = '11px monospace'; ctx.textAlign = 'right';
        ctx.fillText(short.toUpperCase(), 0, 0); ctx.restore();
      });
      ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
      ctx.fillText('TOP 5 AUCTIONS  ·  BID COUNT', PAD.l, PAD.t - 16);
    } else if (idx === 2) {
      // Cumulative value area
      const MINS = 30, PAD = { t: 44, r: 24, b: 52, l: 80 };
      const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
      const now = Date.now();
      const perMin = Array<number>(MINS).fill(0);
      bids.forEach(b => { const age = Math.floor((now - new Date(b.timestamp).getTime()) / 60000); if (age >= 0 && age < MINS) perMin[MINS - 1 - age] += b.amount; });
      const running = [...perMin]; for (let i = 1; i < MINS; i++) running[i] += running[i - 1];
      const maxV = Math.max(1, ...running);
      ctx.strokeStyle = 'rgba(20,20,20,0.07)'; ctx.lineWidth = 0.8;
      for (let i = 0; i <= 4; i++) {
        const y = PAD.t + (cH / 4) * i;
        ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
        ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right';
        ctx.fillText(formatCurrency(Math.round(maxV * (1 - i / 4))), PAD.l - 6, y + 4);
      }
      ctx.fillStyle = 'rgba(20,20,20,0.4)'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
      [0, 5, 10, 15, 20, 25, 29].forEach(i => ctx.fillText(`-${MINS - 1 - i}m`, PAD.l + (i / (MINS - 1)) * cW, H - PAD.b + 18));
      const pts = running.map((v, i) => ({ x: PAD.l + (i / (MINS - 1)) * cW, y: PAD.t + cH - (v / maxV) * cH, v }));
      const grd = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
      grd.addColorStop(0, 'rgba(52,211,153,0.25)'); grd.addColorStop(1, 'rgba(52,211,153,0.01)');
      ctx.beginPath(); ctx.moveTo(pts[0].x, PAD.t + cH); pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(pts[pts.length-1].x, PAD.t + cH); ctx.closePath(); ctx.fillStyle = grd; ctx.fill();
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = 'rgba(52,211,153,1)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
      const last = [...pts].reverse().find((_, i) => running[MINS - 1 - i] > 0);
      if (last) { ctx.beginPath(); ctx.arc(last.x, last.y, 5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(52,211,153,1)'; ctx.fill(); ctx.beginPath(); ctx.arc(last.x, last.y, 9, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(52,211,153,0.35)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
      ctx.fillText('CUMULATIVE VALUE  ·  LAST 30 MIN', PAD.l, PAD.t - 16);
    } else {
      // Bid amounts scatter-line
      const PAD = { t: 44, r: 32, b: 52, l: 82 };
      const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
      const sorted = [...bids].reverse().slice(-50);
      if (sorted.length < 2) { ctx.fillStyle = 'rgba(20,20,20,0.3)'; ctx.font = '14px monospace'; ctx.textAlign = 'center'; ctx.fillText('NOT ENOUGH DATA', W/2, H/2); return; }
      const amounts = sorted.map(b => b.amount);
      const maxAmt = Math.max(...amounts), minAmt = Math.min(...amounts), range = maxAmt - minAmt || 1;
      ctx.strokeStyle = 'rgba(20,20,20,0.07)'; ctx.lineWidth = 0.8;
      for (let i = 0; i <= 4; i++) {
        const y = PAD.t + (cH / 4) * i;
        ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
        ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right';
        ctx.fillText(formatCurrency(Math.round(maxAmt - (range / 4) * i)), PAD.l - 6, y + 4);
      }
      ctx.fillStyle = 'rgba(20,20,20,0.4)'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
      ctx.fillText('OLDEST', PAD.l + 20, H - PAD.b + 18); ctx.fillText('NEWEST', PAD.l + cW - 20, H - PAD.b + 18);
      const pts = sorted.map((b, i) => ({ x: PAD.l + (i / (sorted.length - 1)) * cW, y: PAD.t + cH - ((b.amount - minAmt) / range) * cH, amt: b.amount, name: b.bidderName || '' }));
      const grd = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
      grd.addColorStop(0, 'rgba(139,92,246,0.18)'); grd.addColorStop(1, 'rgba(139,92,246,0.01)');
      ctx.beginPath(); ctx.moveTo(pts[0].x, PAD.t + cH); pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(pts[pts.length-1].x, PAD.t + cH); ctx.closePath(); ctx.fillStyle = grd; ctx.fill();
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = 'rgba(139,92,246,1)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
      const maxIdx = amounts.indexOf(maxAmt);
      pts.forEach((p, i) => {
        const isMax = i === maxIdx;
        ctx.beginPath(); ctx.arc(p.x, p.y, isMax ? 6 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = isMax ? 'rgba(139,92,246,1)' : 'rgba(139,92,246,0.7)'; ctx.fill();
        if (isMax) { ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(139,92,246,0.3)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      });
      if (maxIdx >= 0) { const pp = pts[maxIdx]; ctx.fillStyle = 'rgba(139,92,246,0.95)'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText('▲ ' + formatCurrency(maxAmt), pp.x, pp.y - 14); }
      ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
      ctx.fillText('BID AMOUNTS  ·  LAST 50 BIDS', PAD.l, PAD.t - 16);
    }
  }, [bids, auctions]);

  // Redraw modal when idx or bids change
  useEffect(() => { if (modalIdx !== null) { requestAnimationFrame(() => drawModal(modalIdx)); } }, [modalIdx, drawModal]);

  // Modal resize observer
  useEffect(() => {
    if (modalIdx === null) return;
    const wrap = modalWrapRef.current; if (!wrap) return;
    const ro = new ResizeObserver(() => { if (modalIdx !== null) drawModal(modalIdx); });
    ro.observe(wrap); return () => ro.disconnect();
  }, [modalIdx, drawModal]);

  // Keyboard navigation for modal
  useEffect(() => {
    if (modalIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  setModalIdx(i => i !== null ? (i + 1) % 4 : null);
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    setModalIdx(i => i !== null ? (i + 3) % 4 : null);
      if (e.key === 'Escape')                                setModalIdx(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalIdx]);

  // Hover tooltip on modal canvas
  const handleModalMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = modalCanvasRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !tooltip || modalIdx === null) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = rect.width, H = rect.height;

    let tipHtml = '';
    const PAD_LINE = { t: 44, r: 24, b: 52, l: 60 };
    const PAD_AREA = { t: 44, r: 24, b: 52, l: 80 };
    const PAD_AMT  = { t: 44, r: 32, b: 52, l: 82 };
    const PAD_BAR  = { t: 44, r: 24, b: 70, l: 50 };

    if (modalIdx === 0) {
      // Bids per min
      const MINS = 30, { t, r, b, l } = PAD_LINE;
      const cW = W - l - r, cH = H - t - b;
      if (mx >= l && mx <= l + cW && my >= t && my <= t + cH) {
        const now = Date.now();
        const counts = Array<number>(MINS).fill(0);
        bids.forEach(bid => { const age = Math.floor((now - new Date(bid.timestamp).getTime()) / 60000); if (age >= 0 && age < MINS) counts[MINS - 1 - age]++; });
        const idx = Math.round(((mx - l) / cW) * (MINS - 1));
        const minAgo = MINS - 1 - idx;
        tipHtml = `<div style="font-size:12px;font-weight:700;font-family:monospace">-${minAgo}m ago</div><div style="font-size:14px;font-weight:700;color:#FF6321">${counts[idx]} bid${counts[idx] !== 1 ? 's' : ''}</div>`;
      }
    } else if (modalIdx === 1) {
      // Bar chart
      const { t, r, b, l } = PAD_BAR;
      const cW = W - l - r, cH = H - t - b;
      const map: Record<string, number> = {};
      bids.forEach(bid => { map[bid.auctionId] = (map[bid.auctionId] || 0) + 1; });
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const n = sorted.length, slotW = cW / n;
      if (mx >= l && mx <= l + cW && my >= t && my <= t + cH) {
        const i = Math.floor((mx - l) / slotW);
        if (i >= 0 && i < sorted.length) {
          const [id, v] = sorted[i];
          const title = auctions.find(a => a.id === id)?.title || id.slice(0, 12);
          tipHtml = `<div style="font-size:11px;font-weight:700;font-family:monospace;opacity:0.6">${title}</div><div style="font-size:15px;font-weight:700;color:#FF6321">${v} bids</div>`;
        }
      }
    } else if (modalIdx === 2) {
      // Cumulative value
      const MINS = 30, { t, r, b, l } = PAD_AREA;
      const cW = W - l - r, cH = H - t - b;
      if (mx >= l && mx <= l + cW && my >= t && my <= t + cH) {
        const now = Date.now();
        const perMin = Array<number>(MINS).fill(0);
        bids.forEach(bid => { const age = Math.floor((now - new Date(bid.timestamp).getTime()) / 60000); if (age >= 0 && age < MINS) perMin[MINS - 1 - age] += bid.amount; });
        const running = [...perMin]; for (let i = 1; i < MINS; i++) running[i] += running[i - 1];
        const idx = Math.round(((mx - l) / cW) * (MINS - 1));
        const minAgo = MINS - 1 - idx;
        tipHtml = `<div style="font-size:12px;font-weight:700;font-family:monospace">-${minAgo}m ago</div><div style="font-size:14px;font-weight:700;color:#34D399">${formatCurrency(running[idx])}</div>`;
      }
    } else {
      // Amounts scatter
      const { t, r, b, l } = PAD_AMT;
      const cW = W - l - r, cH = H - t - b;
      const sorted = [...bids].reverse().slice(-50);
      if (sorted.length >= 2 && mx >= l && mx <= l + cW && my >= t && my <= t + cH) {
        const idx = Math.round(((mx - l) / cW) * (sorted.length - 1));
        const bid = sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
        tipHtml = `<div style="font-size:11px;font-weight:700;font-family:monospace;opacity:0.6">${bid.bidderName || 'Bidder'}</div><div style="font-size:15px;font-weight:700;color:#8B5CF6">${formatCurrency(bid.amount)}</div>`;
      }
    }

    if (tipHtml) {
      tooltip.innerHTML = tipHtml;
      tooltip.style.opacity = '1';
      const tx = Math.min(mx + 14, W - 140);
      const ty = Math.max(my - 40, 8);
      tooltip.style.left = tx + 'px';
      tooltip.style.top  = ty + 'px';
    } else {
      tooltip.style.opacity = '0';
    }
  }, [modalIdx, bids, auctions]);

  if (!bids.length) return (
    <div className="bg-[#F5F5F3] border border-[#141414] p-10 text-center text-[#141414]/40 font-mono text-xs uppercase italic">
      No bid data to visualise yet
    </div>
  );

  return (
    <>
      {/* ── 2×2 thumbnail grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {CHARTS.map(({ dot, label, sub }, idx) => {
          const refs = [lineRef, barRef, areaRef, amtRef];
          return (
            <div key={label}
              className="bg-[#F5F5F3] border border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] overflow-hidden cursor-pointer hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all group"
              onClick={() => setModalIdx(idx)}>
              <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-[#141414]/10">
                <span className="w-2 h-2 inline-block shrink-0" style={{ background: dot }} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]">{label}</span>
                <span className="text-[9px] font-mono text-[#141414]/25 ml-auto mr-2">{sub}</span>
                <span className="text-[9px] font-mono text-[#141414]/30 border border-[#141414]/20 px-1.5 py-0.5 group-hover:border-[#141414]/50 group-hover:text-[#141414]/50 transition-all">↗ expand</span>
              </div>
              <canvas ref={refs[idx]} className="w-full" style={{ height: 180, display: 'block', pointerEvents: 'none' }} />
            </div>
          );
        })}
      </div>

      {/* ── Full-screen chart modal ── */}
      <AnimatePresence>
        {modalIdx !== null && (
          <div className="fixed inset-0 bg-[#141414]/85 backdrop-blur-sm z-[400] flex items-center justify-center p-6"
            onClick={() => setModalIdx(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 16 }}
              transition={{ duration: 0.18 }}
              className="bg-white border border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] w-full flex flex-col"
              style={{ maxWidth: 1000, maxHeight: 'calc(100vh - 3rem)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#141414] shrink-0 bg-[#141414] text-white">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 inline-block" style={{ background: CHARTS[modalIdx].dot }} />
                  <span className="font-black uppercase tracking-widest text-sm">{CHARTS[modalIdx].label}</span>
                  <span className="text-white/40 font-mono text-[10px]">·  {CHARTS[modalIdx].sub}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white/30 font-mono text-[10px] hidden md:block">← → navigate  ·  esc close</span>
                  {/* Chart nav pills */}
                  <div className="flex gap-1">
                    {CHARTS.map((c, i) => (
                      <button key={i} onClick={() => setModalIdx(i)}
                        className="w-6 h-6 flex items-center justify-center text-[10px] font-bold border transition-all"
                        style={{
                          background: i === modalIdx ? c.color : 'transparent',
                          borderColor: i === modalIdx ? c.color : 'rgba(255,255,255,0.2)',
                          color: i === modalIdx ? 'white' : 'rgba(255,255,255,0.4)',
                        }}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setModalIdx(null)}
                    className="text-white/50 hover:text-white text-lg leading-none ml-2">✕</button>
                </div>
              </div>

              {/* Canvas area */}
              <div ref={modalWrapRef} className="flex-1 relative min-h-0" style={{ minHeight: 360 }}>
                <canvas
                  ref={modalCanvasRef}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
                  onMouseMove={handleModalMouseMove}
                  onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.opacity = '0'; }}
                />
                {/* Hover tooltip */}
                <div ref={tooltipRef} style={{
                  position: 'absolute', pointerEvents: 'none', opacity: 0,
                  background: 'white', border: '1px solid rgba(20,20,20,0.15)',
                  boxShadow: '3px 3px 0 rgba(20,20,20,0.12)',
                  padding: '8px 12px', lineHeight: 1.5, transition: 'opacity 0.1s',
                  minWidth: 120, zIndex: 10,
                }} />
              </div>

              {/* Bottom nav bar */}
              <div className="shrink-0 border-t border-[#141414]/10 px-6 py-3 flex items-center justify-between bg-[#F5F5F3]">
                <button
                  onClick={() => setModalIdx(i => i !== null ? (i + 3) % 4 : null)}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-[#141414] px-4 py-2 hover:bg-[#141414] hover:text-white transition-all">
                  ← Prev
                </button>
                <div className="flex gap-2">
                  {CHARTS.map((c, i) => (
                    <button key={i} onClick={() => setModalIdx(i)}
                      className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 border transition-all"
                      style={{
                        background: i === modalIdx ? '#141414' : 'transparent',
                        borderColor: i === modalIdx ? '#141414' : 'rgba(20,20,20,0.2)',
                        color: i === modalIdx ? 'white' : 'rgba(20,20,20,0.45)',
                      }}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setModalIdx(i => i !== null ? (i + 1) % 4 : null)}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-[#141414] px-4 py-2 hover:bg-[#141414] hover:text-white transition-all">
                  Next →
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// ────────────────────────────────────────────────────────────────

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'auctions' | 'users' | 'flagged' | 'bids'>('dashboard');
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [flaggedUsers, setFlaggedUsers] = useState<UserProfile[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedReplay, setSelectedReplay] = useState<Auction | null>(null);
  const [replayBids, setReplayBids] = useState<Bid[]>([]);
  const [topupUser, setTopupUser] = useState<UserProfile | null>(null);
  const [topupAmount, setTopupAmount] = useState<number>(100);
  const [topupDescription, setTopupDescription] = useState('Admin top-up');
  const [userSearch, setUserSearch] = useState('');
  const [closingAuctionId, setClosingAuctionId] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<UserProfile | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [recentBids, setRecentBids] = useState<(Bid & { auctionTitle?: string })[]>([]);
  const [bidFilter, setBidFilter] = useState<string>('all');
  const [bidLimit, setBidLimit] = useState<50 | 100 | 200>(50);
  const [newBidIds, setNewBidIds] = useState<Set<string>>(new Set());
  const [newAuction, setNewAuction] = useState({ title: '', description: '', minBid: 0, duration: 60, imageUrl: '' });

  useEffect(() => {
    const q = query(collection(db, 'auctions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, snapshot => {
      setAuctions(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Auction)));
    }, e => handleFirestoreError(e, OperationType.GET, 'auctions'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));
    const unsubscribe = onSnapshot(q, snapshot => {
      setAllUsers(snapshot.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile)));
    }, e => handleFirestoreError(e, OperationType.GET, 'users'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('isFlagged', '==', true));
    const unsubscribe = onSnapshot(q, snapshot => {
      setFlaggedUsers(snapshot.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile)));
    }, e => handleFirestoreError(e, OperationType.GET, 'users'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedReplay) return;
    const q = query(collection(db, 'bids'), where('auctionId', '==', selectedReplay.id), orderBy('timestamp', 'asc'));
    getDocs(q).then(snap => setReplayBids(snap.docs.map(d => ({ ...d.data(), id: d.id } as Bid))));
  }, [selectedReplay]);

  useEffect(() => {
    const q = query(collection(db, 'bids'), orderBy('timestamp', 'desc'), limit(bidLimit));
    const unsubscribe = onSnapshot(q, snapshot => {
      const incoming = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Bid));
      setRecentBids(prev => {
        const prevIds = new Set(prev.map(b => b.id));
        const brandNew = incoming.filter(b => !prevIds.has(b.id)).map(b => b.id);
        if (brandNew.length > 0) {
          setNewBidIds(new Set(brandNew));
          setTimeout(() => setNewBidIds(new Set()), 2000);
        }
        return incoming;
      });
    }, e => handleFirestoreError(e, OperationType.GET, 'bids'));
    return () => unsubscribe();
  }, [bidLimit]);

  const enrichedBids = recentBids.map(b => ({ ...b, auctionTitle: auctions.find(a => a.id === b.auctionId)?.title || b.auctionId }));
  const filteredBids = bidFilter === 'all' ? enrichedBids : enrichedBids.filter(b => b.auctionId === bidFilter);

  const handleAIHelp = async () => {
    if (!newAuction.title) return;
    setLoading(true);
    try {
      const s = await geminiService.suggestAuctionDetails(newAuction.title);
      setNewAuction(p => ({ ...p, description: s.description, minBid: s.suggestedMinBid }));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const createAuction = async (e: React.FormEvent) => {
    e.preventDefault();
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + newAuction.duration * 60000).toISOString();
    await addDoc(collection(db, 'auctions'), { ...newAuction, currentBid: 0, status: 'active', startTime, endTime, createdAt: startTime, createdBy: 'admin', bidFrequency: 0 });
    setIsAdding(false); setNewAuction({ title: '', description: '', minBid: 0, duration: 60, imageUrl: '' });
  };

  const closeAuction = async (id: string) => {
    if (!id) return;
    setClosingAuctionId(id);
    try {
      await runTransaction(db, async t => {
        const aRef = doc(db, 'auctions', id), aDoc = await t.get(aRef);
        if (!aDoc.exists()) throw new Error('Auction not found');
        const aData = aDoc.data() as Auction;
        if (aData.status !== 'active') throw new Error('Already closed');
        const { currentBidderId: wId, currentBidderName: wName, currentBid: fBid } = aData;
        let wDoc = null;
        if (wId && fBid) { const wRef = doc(db, 'users', wId); wDoc = await t.get(wRef); }
        t.update(aRef, { status: 'closed', winnerId: wId || null, winnerName: wName || null });
        if (wId && fBid && wDoc?.exists()) {
          const wRef = doc(db, 'users', wId), wd = wDoc.data();
          t.update(wRef, { credits: wd.credits - fBid, lockedCredits: Math.max(0, wd.lockedCredits - fBid) });
          t.set(doc(collection(db, 'transactions')), { userId: wId, amount: fBid, type: 'deduct', description: `Won auction: ${aData.title}`, timestamp: new Date().toISOString() });
          t.set(doc(collection(db, 'notifications')), { userId: wId, title: 'Auction Won! 🏆', message: `Congratulations! You won the auction for "${aData.title}" with a bid of ${formatCurrency(fBid)}.`, type: 'win', read: false, timestamp: new Date().toISOString() });
        }
      });
    } catch (e) { console.error('Failed to close auction:', e); } finally { setClosingAuctionId(null); }
  };

  const deleteAuction = async (id: string) => { await deleteDoc(doc(db, 'auctions', id)); };
  const unflagUser   = async (uid: string) => { await updateDoc(doc(db, 'users', uid), { isFlagged: false, flagReason: '' }); };

  const handleFlagUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flagTarget || !flagReason.trim()) return;
    await updateDoc(doc(db, 'users', flagTarget.uid), { isFlagged: true, flagReason: flagReason.trim() });
    setFlagTarget(null); setFlagReason('');
  };

  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const removeUser = async (uid: string) => { await deleteDoc(doc(db, 'users', uid)); setUserToDelete(null); };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topupUser) return;
    setLoading(true);
    try {
      await runTransaction(db, async t => {
        const uRef = doc(db, 'users', topupUser.uid), uDoc = await t.get(uRef);
        if (!uDoc.exists()) throw new Error('User not found');
        t.update(uRef, { credits: (uDoc.data().credits || 0) + topupAmount });
        t.set(doc(collection(db, 'transactions')), { userId: topupUser.uid, amount: topupAmount, type: 'topup', description: topupDescription || 'Admin top-up', timestamp: new Date().toISOString() });
      });
      setTopupUser(null); setTopupAmount(100); setTopupDescription('Admin top-up');
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const filteredUsers = allUsers.filter(u =>
    u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white border border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] overflow-hidden">

      {/* ── SIDEBAR ── */}
      <div className="w-64 shrink-0 border-r border-[#141414] bg-[#F5F5F3] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-[#141414] bg-[#141414] text-white shrink-0">
          <h2 className="text-xl font-black uppercase italic tracking-tighter">Admin Console</h2>
          <p className="text-[10px] font-mono opacity-60 uppercase">System Control</p>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
          {([
            { id: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
            { id: 'auctions',  icon: <Hammer size={18} />,          label: 'Auctions'  },
            { id: 'users',     icon: <Users size={18} />,            label: 'Users'     },
          ] as const).map(({ id, icon, label }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={cn('w-full flex items-center gap-3 px-4 py-3 font-bold uppercase tracking-widest text-xs border border-transparent transition-all',
                activeTab === id ? 'bg-[#141414] text-white shadow-[4px_4px_0px_0px_rgba(20,20,20,0.2)]' : 'hover:bg-[#141414]/5')}>
              {icon} {label}
            </button>
          ))}
          <button onClick={() => setActiveTab('bids')}
            className={cn('w-full flex items-center justify-between px-4 py-3 font-bold uppercase tracking-widest text-xs border border-transparent transition-all',
              activeTab === 'bids' ? 'bg-[#141414] text-white shadow-[4px_4px_0px_0px_rgba(20,20,20,0.2)]' : 'hover:bg-[#141414]/5')}>
            <span className="flex items-center gap-3"><Activity size={18} /> Bid Activity</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </button>
          <button onClick={() => setActiveTab('flagged')}
            className={cn('w-full flex items-center justify-between px-4 py-3 font-bold uppercase tracking-widest text-xs border border-transparent transition-all',
              activeTab === 'flagged' ? 'bg-[#141414] text-white shadow-[4px_4px_0px_0px_rgba(20,20,20,0.2)]' : 'hover:bg-[#141414]/5')}>
            <span className="flex items-center gap-3"><AlertTriangle size={18} /> Flagged</span>
            {flaggedUsers.length > 0 && (
              <span className={cn('text-[9px] font-black px-1.5 py-0.5 border',
                activeTab === 'flagged' ? 'border-white/30 bg-white/10' : 'border-red-400 bg-red-100 text-red-600')}>
                {flaggedUsers.length}
              </span>
            )}
          </button>
        </nav>
        <div className="p-4 border-t border-[#141414]/10 bg-emerald-50 shrink-0">
          <div className="flex items-center gap-2 text-emerald-700">
            <Sparkles size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">System Optimal</span>
          </div>
        </div>
      </div>

      {/* ── WORKSPACE ── */}
      <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar">

        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-end border-b border-[#141414] pb-4">
              <div>
                <h3 className="text-3xl font-black uppercase italic tracking-tighter">System Overview</h3>
                <p className="text-sm text-[#141414]/60 font-mono">Real-time performance metrics</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#F5F5F3] border border-[#141414] p-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <div className="flex items-center gap-3 mb-2 text-[#141414]/40"><Hammer size={18} /><span className="text-[10px] font-bold uppercase tracking-widest">Active Listings</span></div>
                <div className="text-3xl font-black">{auctions.filter(a => a.status === 'active').length}</div>
              </div>
              <div className="bg-[#F5F5F3] border border-[#141414] p-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <div className="flex items-center gap-3 mb-2 text-[#141414]/40"><BarChart3 size={18} /><span className="text-[10px] font-bold uppercase tracking-widest">Total Volume</span></div>
                <div className="text-3xl font-black" style={{ color: '#22c55e' }}>{formatCurrency(auctions.reduce((acc, a) => acc + (a.currentBid || 0), 0))}</div>
              </div>
              <div className="bg-[#F5F5F3] border border-[#141414] p-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <div className="flex items-center gap-3 mb-2 text-[#141414]/40"><Users size={18} /><span className="text-[10px] font-bold uppercase tracking-widest">Total Users</span></div>
                <div className="text-3xl font-black">{allUsers.length}</div>
              </div>
            </div>
            <BidHeatmap3D auctions={auctions.filter(a => a.status === 'active')} />
          </div>
        )}

        {/* AUCTIONS */}
        {activeTab === 'auctions' && (
          <div className="space-y-8 animate-in slide-in-from-left-4 duration-500">
            <div className="flex justify-between items-end border-b border-[#141414] pb-4">
              <div>
                <h3 className="text-3xl font-black uppercase italic tracking-tighter">Auction Inventory</h3>
                <p className="text-sm text-[#141414]/60 font-mono">Manage listings and create new ones</p>
              </div>
              <button onClick={() => setIsAdding(true)}
                className="bg-[#141414] text-white px-6 py-3 font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-white hover:text-[#141414] border border-[#141414] transition-all shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <Plus size={20} /> New Auction
              </button>
            </div>
            <div className="bg-white border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#141414] text-white">
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest">Item</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest">Status</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest">Current Bid</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]/10">
                  {auctions.map(auction => (
                    <tr key={auction.id} className="hover:bg-[#141414]/5 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-sm">{auction.title}</div>
                        <div className="text-[10px] text-[#141414]/40 font-mono truncate max-w-[150px]">{auction.id}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase border border-[#141414] ${auction.status === 'active' ? 'bg-emerald-400' : 'bg-orange-400'}`}>
                          {auction.status}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-sm" style={{ color: '#22c55e' }}>{formatCurrency(auction.currentBid || auction.minBid)}</td>
                      <td className="p-4 text-right space-x-2">
                        {auction.status === 'closed' && (
                          <button onClick={() => setSelectedReplay(auction)} className="p-2 hover:bg-emerald-400 border border-transparent hover:border-[#141414] transition-all" title="View Replay">
                            <Play size={16} />
                          </button>
                        )}
                        {auction.status === 'active' && (
                          <button onClick={() => closeAuction(auction.id)} disabled={closingAuctionId === auction.id}
                            className="p-2 hover:bg-orange-400 border border-transparent hover:border-[#141414] transition-all disabled:opacity-50 disabled:cursor-not-allowed" title="Close Auction">
                            {closingAuctionId === auction.id
                              ? <span className="inline-block w-4 h-4 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
                              : <Edit3 size={16} />}
                          </button>
                        )}
                        <button onClick={() => deleteAuction(auction.id)} className="p-2 hover:bg-red-500 hover:text-white border border-transparent hover:border-[#141414] transition-all" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* USERS */}
        {activeTab === 'users' && (
          <div className="space-y-8 animate-in slide-in-from-left-4 duration-500">
            <div className="flex justify-between items-end border-b border-[#141414] pb-4">
              <div>
                <h3 className="text-3xl font-black uppercase italic tracking-tighter">User Management</h3>
                <p className="text-sm text-[#141414]/60 font-mono">Monitor credits and manage accounts</p>
              </div>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#141414]/40" />
                <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search users..."
                  className="pl-10 pr-4 py-2 border border-[#141414] focus:outline-none w-64 font-bold text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredUsers.map(user => (
                <div key={user.uid} className="bg-[#F5F5F3] border border-[#141414] p-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#141414] text-white flex items-center justify-center font-black text-lg">
                        {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm flex items-center gap-2">
                          {user.displayName || user.email?.split('@')[0] || 'Unknown'}
                          {user.isFlagged && <AlertTriangle size={14} className="text-red-500" />}
                        </div>
                        <div className="text-[10px] text-[#141414]/40 font-mono">{user.email}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-sm font-black" style={{ color: '#22c55e' }}>{formatCurrency(user.credits)}</span>
                          <span className="text-[9px] text-[#141414]/40 font-mono uppercase">Credits</span>
                        </div>
                      </div>
                    </div>
                    {user.isFlagged && <div className="bg-red-50 border border-red-200 p-2 text-[10px] text-red-600 font-mono">FLAGGED: {user.flagReason}</div>}
                  </div>
                  <div className="mt-6 flex gap-2">
                    <button onClick={() => setTopupUser(user)}
                      className="flex-1 text-[10px] font-bold uppercase tracking-widest bg-emerald-400 py-2 border border-[#141414] hover:bg-emerald-300 flex items-center justify-center gap-2">
                      <Wallet size={14} /> Top Up
                    </button>
                    {user.isFlagged ? (
                      <button onClick={() => unflagUser(user.uid)} className="text-[10px] font-bold uppercase tracking-widest bg-orange-400 py-2 px-3 border border-[#141414] hover:bg-orange-300 transition-all" title="Unflag User"><Flag size={14} /></button>
                    ) : (
                      <button onClick={() => { setFlagTarget(user); setFlagReason(''); }} className="text-[10px] font-bold uppercase tracking-widest bg-white py-2 px-3 border border-[#141414] hover:bg-orange-100 hover:border-orange-400 transition-all" title="Flag User"><Flag size={14} /></button>
                    )}
                    <button onClick={() => setUserToDelete(user.uid)} className="text-[10px] font-bold uppercase tracking-widest bg-white py-2 px-3 border border-[#141414] hover:bg-red-500 hover:text-white transition-all" title="Remove User"><UserMinus size={14} /></button>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <div className="col-span-full p-12 text-center text-[#141414]/40 font-mono text-sm uppercase italic border-2 border-dashed border-[#141414]/10">No users found matching your search</div>
              )}
            </div>
          </div>
        )}

        {/* BID ACTIVITY */}
        {activeTab === 'bids' && (
          <div className="space-y-8 animate-in slide-in-from-left-4 duration-500">
            <div className="flex flex-wrap justify-between items-end border-b border-[#141414] pb-4 gap-4">
              <div>
                <h3 className="text-3xl font-black uppercase italic tracking-tighter">Bid Activity</h3>
                <p className="text-sm text-[#141414]/60 font-mono">
                  Live feed of all bids across every auction
                  <span className="ml-2 inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    <span className="text-emerald-600 font-bold">Live</span>
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select value={bidFilter} onChange={e => setBidFilter(e.target.value)}
                  className="text-[10px] font-bold uppercase tracking-widest bg-white border border-[#141414] px-3 py-2 focus:outline-none shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] max-w-[200px] truncate">
                  <option value="all">All Auctions</option>
                  {auctions.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
                <select value={bidLimit} onChange={e => setBidLimit(Number(e.target.value) as 50 | 100 | 200)}
                  className="text-[10px] font-bold uppercase tracking-widest bg-white border border-[#141414] px-3 py-2 focus:outline-none shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                  <option value={50}>Last 50</option>
                  <option value={100}>Last 100</option>
                  <option value={200}>Last 200</option>
                </select>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Bids Shown', value: filteredBids.length,                                                                                       green: false },
                { label: 'Unique Bidders',   value: new Set(filteredBids.map(b => b.bidderId)).size,                                                           green: false },
                { label: 'Highest Bid',      value: filteredBids.length > 0 ? formatCurrency(Math.max(...filteredBids.map(b => b.amount))) : '—',              green: true  },
                { label: 'Total Value',      value: formatCurrency(filteredBids.reduce((s, b) => s + b.amount, 0)),                                            green: true  },
              ].map(stat => (
                <div key={stat.label} className="bg-[#F5F5F3] border border-[#141414] p-4 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[#141414]/40 mb-1">{stat.label}</div>
                  <div
                    className="text-2xl font-black"
                    style={stat.green ? { color: '#22c55e' } : undefined}
                  >{stat.value}</div>
                </div>
              ))}
            </div>

            {/* 4 Charts */}
            <BidActivityCharts bids={filteredBids} auctions={auctions} />

            {/* Live feed */}
            <div className="bg-white border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
              <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest">Live Bid Feed</span>
                <span className="flex items-center gap-1.5 text-[9px] font-mono text-white/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  {filteredBids.length} entries
                </span>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F5F3]">
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-[#141414]/50">Time</th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-[#141414]/50">Bidder</th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-[#141414]/50">Auction</th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-widest text-[#141414]/50 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]/10">
                  <AnimatePresence initial={false}>
                    {filteredBids.map((bid, index) => {
                      const isNew = newBidIds.has(bid.id);
                      const bidDate = new Date(bid.timestamp);
                      const isToday = bidDate.toDateString() === new Date().toDateString();
                      return (
                        <motion.tr key={bid.id}
                          initial={isNew ? { backgroundColor: 'rgba(52,211,153,0.3)' } : false}
                          animate={{ backgroundColor: 'rgba(0,0,0,0)' }}
                          transition={{ duration: 2 }}
                          className="hover:bg-[#141414]/5 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-xs">{isToday ? bidDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : bidDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
                            <div className="text-[9px] font-mono text-[#141414]/40 uppercase">{isToday ? 'Today' : bidDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-sm">{bid.bidderName}</div>
                            <div className="text-[9px] font-mono text-[#141414]/30 truncate max-w-[120px]">{bid.bidderId}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-sm truncate max-w-[180px]">{bid.auctionTitle}</div>
                            <div className="text-[9px] font-mono text-[#141414]/30 truncate max-w-[180px]">{bid.auctionId}</div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="font-black text-sm" style={{ color: '#22c55e' }}>{formatCurrency(bid.amount)}</div>
                            {index === 0 && bidFilter === 'all' && <div className="text-[9px] font-bold uppercase text-emerald-500 mt-0.5">Latest</div>}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                  {filteredBids.length === 0 && (
                    <tr><td colSpan={4} className="p-16 text-center text-[#141414]/40 font-mono text-sm uppercase italic">No bids recorded yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FLAGGED */}
        {activeTab === 'flagged' && (
          <div className="space-y-8 animate-in slide-in-from-left-4 duration-500">
            <div className="flex justify-between items-end border-b border-[#141414] pb-4">
              <div>
                <h3 className="text-3xl font-black uppercase italic tracking-tighter">Flagged Bidders</h3>
                <p className="text-sm text-[#141414]/60 font-mono">Review suspicious activity and unflag accounts</p>
              </div>
            </div>
            <div className="bg-white border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
              {flaggedUsers.length > 0 ? (
                <div className="divide-y divide-[#141414]/10">
                  {flaggedUsers.map(user => (
                    <div key={user.uid} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-600 text-white flex items-center justify-center"><AlertTriangle size={24} /></div>
                        <div>
                          <div className="font-bold text-lg">{user.displayName}</div>
                          <div className="text-xs text-[#141414]/40 font-mono">{user.email}</div>
                          <div className="mt-1 bg-red-50 text-red-600 text-[10px] font-mono p-1 inline-block border border-red-100">REASON: {user.flagReason}</div>
                        </div>
                      </div>
                      <div className="flex gap-3 w-full md:w-auto">
                        <button onClick={() => unflagUser(user.uid)} className="flex-1 md:flex-none text-xs font-bold uppercase tracking-widest bg-emerald-400 px-6 py-3 border border-[#141414] hover:bg-emerald-300 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-1 active:translate-y-1">Unflag User</button>
                        <button onClick={() => setUserToDelete(user.uid)} className="flex-1 md:flex-none text-xs font-bold uppercase tracking-widest bg-white px-6 py-3 border border-[#141414] hover:bg-red-500 hover:text-white transition-all shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-1 active:translate-y-1">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-16 text-center text-[#141414]/40 font-mono text-sm uppercase italic">No suspicious activity detected in the arena</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MANUAL FLAG MODAL */}
      <AnimatePresence>
        {flagTarget && (
          <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white border border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] max-w-md w-full p-8">
              <div className="flex items-center gap-4 text-orange-500 mb-6">
                <Flag size={28} />
                <div><h3 className="text-2xl font-black uppercase italic">Flag User</h3><p className="text-xs text-[#141414]/40 font-mono uppercase mt-0.5">{flagTarget.displayName}</p></div>
              </div>
              <form onSubmit={handleFlagUser} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/50 mb-1">Reason for flagging</label>
                  <textarea value={flagReason} onChange={e => setFlagReason(e.target.value)}
                    className="w-full px-4 py-3 border border-[#141414] focus:outline-none h-24 resize-none text-sm font-bold"
                    placeholder="e.g. Suspicious bidding pattern, colluding with seller..." required />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setFlagTarget(null); setFlagReason(''); }} className="flex-1 py-3 font-bold uppercase tracking-widest border border-[#141414] hover:bg-[#141414]/5 transition-all">Cancel</button>
                  <button type="submit" className="flex-1 bg-orange-400 text-[#141414] py-3 font-bold uppercase tracking-widest border border-[#141414] hover:bg-orange-300 transition-all shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-1 active:translate-y-1">Confirm Flag</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* USER DELETION MODAL */}
      <AnimatePresence>
        {userToDelete && (
          <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white border border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] max-w-md w-full p-8">
              <div className="flex items-center gap-4 text-red-600 mb-6"><AlertTriangle size={32} /><h3 className="text-2xl font-black uppercase italic">Critical Action</h3></div>
              <p className="text-[#141414] mb-8 font-bold leading-relaxed">Are you absolutely sure you want to remove this user? This will permanently delete their profile and cannot be undone.</p>
              <div className="flex gap-4">
                <button onClick={() => setUserToDelete(null)} className="flex-1 py-4 font-bold uppercase tracking-widest border border-[#141414] hover:bg-[#141414]/5 transition-all">Cancel</button>
                <button onClick={() => removeUser(userToDelete)} className="flex-1 bg-red-600 text-white py-4 font-bold uppercase tracking-widest border border-[#141414] hover:bg-red-700 transition-all shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-1 active:translate-y-1">Delete User</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TOPUP MODAL */}
      <AnimatePresence>
        {topupUser && (
          <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white border border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] max-w-md w-full p-8">
              <div className="flex justify-between items-start mb-6">
                <div><h3 className="text-2xl font-black uppercase italic">Top Up Credits</h3><p className="text-xs text-[#141414]/40 font-mono uppercase mt-1">User: {topupUser.displayName}</p></div>
                <button onClick={() => setTopupUser(null)} className="text-[#141414]/40 hover:text-[#141414]">✕</button>
              </div>
              <form onSubmit={handleTopup} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/50 mb-1">Amount (Credits)</label>
                  <input type="number" value={topupAmount} onChange={e => setTopupAmount(Number(e.target.value))} className="w-full px-4 py-2 border border-[#141414] focus:outline-none font-bold" required min="1" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/50 mb-1">Description</label>
                  <input type="text" value={topupDescription} onChange={e => setTopupDescription(e.target.value)} className="w-full px-4 py-2 border border-[#141414] focus:outline-none" placeholder="e.g. Promotional bonus" />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setTopupUser(null)} className="flex-1 py-3 font-bold uppercase tracking-widest border border-[#141414] hover:bg-[#141414]/5 transition-all">Cancel</button>
                  <button type="submit" disabled={loading} className="flex-1 bg-emerald-400 text-[#141414] py-3 font-bold uppercase tracking-widest border border-[#141414] hover:bg-emerald-300 transition-all shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-1 active:translate-y-1 disabled:opacity-50">
                    {loading ? 'Processing...' : 'Confirm Top Up'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AUCTION REPLAY MODAL */}
      <AnimatePresence>
        {selectedReplay && (
          <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white border border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] max-w-2xl w-full p-8">
              <div className="flex justify-between items-start mb-6">
                <div><h3 className="text-2xl font-black uppercase italic">Auction Replay Timeline</h3><p className="text-xs text-[#141414]/40 font-mono uppercase mt-1">{selectedReplay.title}</p></div>
                <button onClick={() => setSelectedReplay(null)} className="text-[#141414]/40 hover:text-[#141414]">✕</button>
              </div>
              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar">
                <div className="relative border-l-2 border-[#141414] ml-4 pl-8 space-y-8 py-4">
                  {replayBids.map((bid, index) => (
                    <div key={bid.id} className="relative">
                      <div className="absolute -left-[41px] top-1 w-4 h-4 bg-[#141414] border-2 border-white rounded-full" />
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-[10px] font-mono text-[#141414]/40 uppercase mb-1">{new Date(bid.timestamp).toLocaleTimeString()}</div>
                          <div className="font-bold text-sm">{bid.bidderName}</div>
                          {index === replayBids.length - 1 && <div className="mt-2 inline-block bg-emerald-400 px-2 py-0.5 text-[9px] font-bold uppercase border border-[#141414]">Winning Bid</div>}
                        </div>
                        <div className="text-lg font-black" style={{ color: '#22c55e' }}>{formatCurrency(bid.amount)}</div>
                      </div>
                    </div>
                  ))}
                  {replayBids.length === 0 && <div className="text-center py-8 text-[#141414]/40 font-mono text-xs uppercase italic">No bids were placed in this auction</div>}
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-[#141414]/10 flex justify-between items-center">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[#141414]/40 font-mono block">Final Price</span>
                  <span className="text-2xl font-black" style={{ color: '#22c55e' }}>{formatCurrency(selectedReplay.currentBid || selectedReplay.minBid)}</span>
                </div>
                <button onClick={() => setSelectedReplay(null)} className="bg-[#141414] text-white px-8 py-3 font-bold uppercase tracking-widest border border-[#141414] hover:bg-white hover:text-[#141414] transition-all shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">Close Replay</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADD AUCTION MODAL */}
      {isAdding && (
        <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white border border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] max-w-2xl w-full p-8">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-2xl font-black uppercase italic">Create New Auction</h3>
              <button onClick={() => setIsAdding(false)} className="text-[#141414]/40 hover:text-[#141414]">✕</button>
            </div>
            <form onSubmit={createAuction} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/50 mb-1">Item Title</label>
                  <div className="flex gap-2">
                    <input type="text" value={newAuction.title} onChange={e => setNewAuction({ ...newAuction, title: e.target.value })}
                      className="flex-1 px-4 py-2 border border-[#141414] focus:outline-none" placeholder="e.g. Vintage Rolex Submariner" required />
                    <button type="button" onClick={handleAIHelp} disabled={loading || !newAuction.title}
                      className="bg-emerald-400 text-[#141414] px-4 font-bold border border-[#141414] hover:bg-emerald-300 disabled:opacity-50 flex items-center gap-2">
                      <Sparkles size={16} /> AI Optimize
                    </button>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/50 mb-1">Description</label>
                  <textarea value={newAuction.description} onChange={e => setNewAuction({ ...newAuction, description: e.target.value })}
                    className="w-full px-4 py-2 border border-[#141414] focus:outline-none h-24 resize-none" required />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/50 mb-1">Min Bid (Credits)</label>
                  <input type="number" value={newAuction.minBid} onChange={e => setNewAuction({ ...newAuction, minBid: Number(e.target.value) })} className="w-full px-4 py-2 border border-[#141414] focus:outline-none" required />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/50 mb-1">Duration (Minutes)</label>
                  <input type="number" value={newAuction.duration} onChange={e => setNewAuction({ ...newAuction, duration: Number(e.target.value) })} className="w-full px-4 py-2 border border-[#141414] focus:outline-none" required />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/50 mb-1">Image URL</label>
                  <input type="url" value={newAuction.imageUrl} onChange={e => setNewAuction({ ...newAuction, imageUrl: e.target.value })} className="w-full px-4 py-2 border border-[#141414] focus:outline-none" placeholder="https://images.unsplash.com/..." />
                </div>
              </div>
              <button type="submit" className="w-full bg-[#141414] text-white py-4 font-bold uppercase tracking-widest hover:bg-emerald-400 hover:text-[#141414] transition-all border border-[#141414]">Launch Auction</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}