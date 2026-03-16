import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Auction, Bid, UserProfile, CreditTransaction } from '../types';
import { AuctionCard } from './AuctionCard';
import { Gavel, History, Sparkles, TrendingUp, Wallet, Trophy, LayoutDashboard, ChevronRight } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { placeBid } from '../lib/auctionActions';
import { geminiService } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

interface BidderPanelProps {
  profile: UserProfile;
}

type DashboardSection = 'overview' | 'engagements' | 'history' | 'gallery';

export function BidderPanel({ profile }: BidderPanelProps) {
  const [activeTab, setActiveTab] = useState<'arena' | 'dashboard'>('arena');
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>('overview');
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [userBids, setUserBids] = useState<Bid[]>([]);
  const [userTransactions, setUserTransactions] = useState<CreditTransaction[]>([]);
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [recentBids, setRecentBids] = useState<Bid[]>([]);
  const [aiStrategy, setAiStrategy] = useState<{ suggestedBid: number; reasoning: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'topup' | 'lock' | 'unlock' | 'deduct'>('all');

  useEffect(() => {
    const q = query(collection(db, 'auctions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAuctions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Auction)));
    }, (error) => { handleFirestoreError(error, OperationType.GET, 'auctions'); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'bids'), where('bidderId', '==', profile.uid), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUserBids(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Bid)));
    }, (error) => { handleFirestoreError(error, OperationType.GET, 'bids'); });
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    const q = query(collection(db, 'transactions'), where('userId', '==', profile.uid), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUserTransactions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CreditTransaction)));
    }, (error) => { handleFirestoreError(error, OperationType.GET, 'transactions'); });
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    if (selectedAuction) {
      const q = query(collection(db, 'bids'), where('auctionId', '==', selectedAuction.id), orderBy('timestamp', 'desc'), limit(10));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setRecentBids(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Bid)));
      }, (error) => { handleFirestoreError(error, OperationType.GET, 'bids'); });
      return () => unsubscribe();
    }
  }, [selectedAuction]);

  const handleGetAIStrategy = async () => {
    if (!selectedAuction) return;
    setLoading(true);
    try {
      const strategy = await geminiService.getBiddingStrategy(
        selectedAuction.title,
        selectedAuction.currentBid || selectedAuction.minBid,
        profile.credits - profile.lockedCredits,
        recentBids
      );
      setAiStrategy(strategy);
      setBidAmount(strategy.suggestedBid);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handlePlaceBid = async () => {
    if (!selectedAuction) return;
    setError('');
    const result = await placeBid(selectedAuction.id, profile.uid, profile.displayName, bidAmount);
    if (!result.success) { setError(result.error || 'Failed to place bid'); }
    else { setSelectedAuction(null); setAiStrategy(null); }
  };

  const activeBids = auctions.filter(a => a.status === 'active' && userBids.some(b => b.auctionId === a.id));
  const wonItems = auctions.filter(a => a.winnerId === profile.uid);
  const filteredTransactions = userTransactions.filter(t => historyFilter === 'all' || t.type === historyFilter);

  const sidebarItems: { id: DashboardSection; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview',    label: 'Overview',            icon: <LayoutDashboard size={16} /> },
    { id: 'engagements', label: 'Current Engagements', icon: <Gavel size={16} />,   count: activeBids.length },
    { id: 'history',     label: 'Financial History',   icon: <History size={16} />, count: userTransactions.length },
    { id: 'gallery',     label: 'Victory Gallery',     icon: <Trophy size={16} />,  count: wonItems.length },
  ];

  return (
    <div className="space-y-0">

      {/* ── TAB NAV ── */}
      <div className="flex gap-4 border-b border-[#141414]">
        <button
          onClick={() => setActiveTab('arena')}
          className={cn("px-6 py-3 font-black uppercase tracking-widest text-sm transition-all relative",
            activeTab === 'arena' ? "text-[#141414]" : "text-[#141414]/40 hover:text-[#141414]")}
        >
          Live Arena
          {activeTab === 'arena' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-[#141414]" />}
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn("px-6 py-3 font-black uppercase tracking-widest text-sm transition-all relative",
            activeTab === 'dashboard' ? "text-[#141414]" : "text-[#141414]/40 hover:text-[#141414]")}
        >
          My Dashboard
          {activeTab === 'dashboard' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-[#141414]" />}
        </button>
      </div>

      {/* ── LIVE ARENA ── */}
      {activeTab === 'arena' && (
        <div className="space-y-8 animate-in fade-in duration-500 pt-8">
          <div className="flex justify-between items-end border-b border-[#141414] pb-4">
            <div>
              <h2 className="text-4xl font-black uppercase italic tracking-tighter">Live Arena</h2>
              <p className="text-sm text-[#141414]/60 font-mono">Active Auctions & Real-Time Bidding</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {auctions.filter(a => a.status === 'active').map(auction => (
              <div key={auction.id}>
                <AuctionCard auction={auction} onBid={(a) => { setSelectedAuction(a); setBidAmount((a.currentBid || a.minBid) + 10); }} />
              </div>
            ))}
            {auctions.filter(a => a.status === 'active').length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-[#141414]/10">
                <p className="text-[#141414]/40 font-mono uppercase italic">No active auctions at the moment</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MY DASHBOARD ──
          FIX: h-[calc(100vh-10rem)] locks the dashboard to viewport height.
          The sidebar and workspace both scroll independently inside this fixed container. */}
      {activeTab === 'dashboard' && (
        <div className="animate-in slide-in-from-bottom-4 duration-500 flex h-[calc(100vh-10rem)] border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden mt-6">

          {/* Sidebar — FIX: overflow-y-auto so sidebar scrolls if sections overflow */}
          <div className="w-56 shrink-0 border-r border-[#141414] bg-[#F5F5F3] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#141414] bg-[#141414] text-white shrink-0">
              <p className="text-[10px] font-mono opacity-60 uppercase">My Dashboard</p>
              <p className="text-xs font-black uppercase truncate mt-0.5">{profile.displayName}</p>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
              {sidebarItems.map((item) => (
                <button key={item.id} onClick={() => setDashboardSection(item.id)}
                  className={cn("w-full flex items-center justify-between px-3 py-2.5 text-left font-bold uppercase tracking-widest text-[10px] border border-transparent transition-all group",
                    dashboardSection === item.id ? "bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.2)]" : "hover:bg-[#141414]/5 text-[#141414]")}>
                  <span className="flex items-center gap-2">{item.icon}{item.label}</span>
                  <span className="flex items-center gap-1">
                    {item.count !== undefined && (
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 border",
                        dashboardSection === item.id ? "border-white/30 bg-white/10" : "border-[#141414]/20 bg-[#141414]/5")}>
                        {item.count}
                      </span>
                    )}
                    <ChevronRight size={10} className={cn("transition-transform",
                      dashboardSection === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-40")} />
                  </span>
                </button>
              ))}
            </nav>
            {/* Balance peek */}
            <div className="p-3 border-t border-[#141414]/10 bg-emerald-50 shrink-0">
              <p className="text-[9px] font-mono text-emerald-700 uppercase tracking-widest">Available</p>
              <p className="text-sm font-black text-emerald-800">{formatCurrency(profile.credits - profile.lockedCredits)}</p>
            </div>
          </div>

          {/* Workspace — FIX: overflow-y-auto makes only this area scroll */}
          <div className="flex-1 overflow-y-auto bg-white custom-scrollbar">
            <AnimatePresence mode="wait">

              {/* OVERVIEW */}
              {dashboardSection === 'overview' && (
                <motion.div key="overview" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="p-8 space-y-8">
                  <div className="border-b border-[#141414] pb-4">
                    <h3 className="text-3xl font-black uppercase italic tracking-tighter">Overview</h3>
                    <p className="text-sm text-[#141414]/60 font-mono">Your account at a glance</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-[#141414] text-white p-6 shadow-[8px_8px_0px_0px_rgba(16,185,129,1)] min-w-0">
                      <div className="flex items-center gap-3 mb-2 opacity-60"><Wallet size={18} /><span className="text-[10px] font-bold uppercase tracking-widest">Available Balance</span></div>
                      <div className="font-black leading-tight truncate" style={{ fontSize: 'clamp(1.1rem, 3.5vw, 2rem)' }}>{formatCurrency(profile.credits - profile.lockedCredits)}</div>
                      <div className="mt-2 text-[10px] font-mono opacity-40 uppercase truncate">Total: {formatCurrency(profile.credits)} | Locked: {formatCurrency(profile.lockedCredits)}</div>
                    </div>
                    <div onClick={() => setDashboardSection('engagements')} className="bg-white border border-[#141414] p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] cursor-pointer hover:bg-[#141414]/5 transition-all group">
                      <div className="flex items-center gap-3 mb-2 text-[#141414]/40"><TrendingUp size={18} /><span className="text-[10px] font-bold uppercase tracking-widest">Active Bids</span></div>
                      <div className="text-4xl font-black">{activeBids.length}</div>
                      <div className="mt-2 text-[10px] font-mono text-[#141414]/40 uppercase flex items-center gap-1">View engagements<ChevronRight size={10} className="group-hover:translate-x-1 transition-transform" /></div>
                    </div>
                    <div onClick={() => setDashboardSection('gallery')} className="bg-white border border-[#141414] p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] cursor-pointer hover:bg-[#141414]/5 transition-all group">
                      <div className="flex items-center gap-3 mb-2 text-[#141414]/40"><Sparkles size={18} /><span className="text-[10px] font-bold uppercase tracking-widest">Won Items</span></div>
                      <div className="text-4xl font-black">{wonItems.length}</div>
                      <div className="mt-2 text-[10px] font-mono text-[#141414]/40 uppercase flex items-center gap-1">View gallery<ChevronRight size={10} className="group-hover:translate-x-1 transition-transform" /></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between border-b border-[#141414] pb-2 mb-4 cursor-pointer group" onClick={() => setDashboardSection('history')}>
                      <div className="flex items-center gap-3"><History size={16} /><h4 className="text-sm font-black uppercase italic">Recent Transactions</h4></div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 group-hover:text-[#141414] flex items-center gap-1 transition-colors">View all <ChevronRight size={10} /></span>
                    </div>
                    <div className="space-y-2">
                      {userTransactions.slice(0, 4).map(tx => (
                        <div key={tx.id} className="flex justify-between items-center py-2 border-b border-[#141414]/10 last:border-0">
                          <div>
                            <div className="text-sm font-bold">{tx.description}</div>
                            <div className="text-[9px] font-mono text-[#141414]/40 uppercase">{new Date(tx.timestamp).toLocaleString()}</div>
                          </div>
                          <div className={cn("font-black text-sm", ['topup', 'unlock'].includes(tx.type) ? "text-emerald-600" : "text-red-600")}>
                            {['topup', 'unlock'].includes(tx.type) ? '+' : '-'}{formatCurrency(tx.amount)}
                          </div>
                        </div>
                      ))}
                      {userTransactions.length === 0 && <p className="text-[#141414]/40 font-mono text-xs uppercase italic py-4 text-center">No transactions yet</p>}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* CURRENT ENGAGEMENTS */}
              {dashboardSection === 'engagements' && (
                <motion.div key="engagements" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="p-8 space-y-6">
                  <div className="border-b border-[#141414] pb-4">
                    <h3 className="text-3xl font-black uppercase italic tracking-tighter">Current Engagements</h3>
                    <p className="text-sm text-[#141414]/60 font-mono">Auctions you are actively bidding on</p>
                  </div>
                  <div className="space-y-4">
                    {activeBids.map(auction => {
                      const isHighBidder = auction.currentBidderId === profile.uid;
                      return (
                        <div key={auction.id} className="bg-white border border-[#141414] p-4 flex justify-between items-center hover:bg-[#141414]/5 transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                          <div>
                            <div className="font-bold uppercase tracking-tight">{auction.title}</div>
                            <div className="text-[10px] font-mono text-[#141414]/40 uppercase">Ends: {new Date(auction.endTime).toLocaleString()}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-lg">{formatCurrency(auction.currentBid)}</div>
                            <div className={cn("text-[9px] font-bold uppercase px-2 py-0.5 border border-[#141414] inline-block mt-1", isHighBidder ? "bg-emerald-400" : "bg-orange-400")}>
                              {isHighBidder ? 'Winning' : 'Outbid'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {activeBids.length === 0 && (
                      <div className="py-20 text-center border border-dashed border-[#141414]/10 text-[#141414]/40 font-mono text-xs uppercase italic">No active bids found</div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* FINANCIAL HISTORY */}
              {dashboardSection === 'history' && (
                <motion.div key="history" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="p-8 space-y-6">
                  <div className="flex justify-between items-end border-b border-[#141414] pb-4">
                    <div>
                      <h3 className="text-3xl font-black uppercase italic tracking-tighter">Financial History</h3>
                      <p className="text-sm text-[#141414]/60 font-mono">All credit movements on your account</p>
                    </div>
                    <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as any)}
                      className="text-[10px] font-bold uppercase tracking-widest bg-white border border-[#141414] px-2 py-1 focus:outline-none shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                      <option value="all">All Events</option>
                      <option value="topup">Top Ups</option>
                      <option value="lock">Bid Locks</option>
                      <option value="unlock">Outbid Unlocks</option>
                      <option value="deduct">Final Payments</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    {filteredTransactions.map(tx => (
                      <div key={tx.id} className="flex justify-between items-start py-3 border-b border-[#141414]/10 last:border-0">
                        <div>
                          <div className="text-[10px] font-mono text-[#141414]/40 uppercase">{new Date(tx.timestamp).toLocaleString()}</div>
                          <div className="text-sm font-bold">{tx.description}</div>
                          <div className="text-[9px] font-mono text-[#141414]/60 uppercase mt-0.5">{tx.type}</div>
                        </div>
                        <div className={cn("font-black", ['topup', 'unlock'].includes(tx.type) ? "text-emerald-600" : "text-red-600")}>
                          {['topup', 'unlock'].includes(tx.type) ? '+' : '-'}{formatCurrency(tx.amount)}
                        </div>
                      </div>
                    ))}
                    {filteredTransactions.length === 0 && (
                      <div className="py-20 text-center text-[#141414]/40 font-mono text-xs uppercase italic">No transactions recorded</div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* VICTORY GALLERY */}
              {dashboardSection === 'gallery' && (
                <motion.div key="gallery" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="p-8 space-y-6">
                  <div className="border-b border-[#141414] pb-4">
                    <h3 className="text-3xl font-black uppercase italic tracking-tighter">Victory Gallery</h3>
                    <p className="text-sm text-[#141414]/60 font-mono">Auctions you have won</p>
                  </div>
                  {wonItems.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                      {wonItems.map(auction => (
                        <div key={auction.id} className="bg-white border border-[#141414] overflow-hidden shadow-[4px_4px_0px_0px_rgba(16,185,129,1)]">
                          <img src={auction.imageUrl || `https://picsum.photos/seed/${auction.id}/400/300`} alt={auction.title}
                            className="w-full h-32 object-cover border-b border-[#141414]" referrerPolicy="no-referrer" />
                          <div className="p-4">
                            <div className="font-bold text-sm uppercase truncate">{auction.title}</div>
                            <div className="flex justify-between items-end mt-2">
                              <span className="text-[9px] font-mono text-[#141414]/40 uppercase">Final Price</span>
                              <span className="font-black text-emerald-600">{formatCurrency(auction.currentBid)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-20 text-center border border-dashed border-[#141414]/10 text-[#141414]/40 font-mono text-xs uppercase italic">No victories yet — get bidding!</div>
                  )}
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── BID MODAL ── */}
      <AnimatePresence>
        {selectedAuction && (
          <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white border border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] w-full flex flex-col md:flex-row overflow-hidden"
              style={{ maxWidth: 900, maxHeight: 'calc(100vh - 2rem)', height: 'auto' }}
            >
              {/* Image panel — fixed height on mobile, fills column on desktop */}
              <div className="w-full md:w-2/5 shrink-0 bg-[#141414]/5 border-b md:border-b-0 md:border-r border-[#141414]"
                style={{ minHeight: 200, maxHeight: 320 }}>
                <img
                  src={selectedAuction.imageUrl || `https://picsum.photos/seed/${selectedAuction.id}/800/800`}
                  alt={selectedAuction.title}
                  className="w-full h-full object-cover"
                  style={{ maxHeight: 320 }}
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Content panel — scrolls internally */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-start p-6 pb-4 shrink-0 border-b border-[#141414]/10">
                  <div>
                    <h3 className="text-xl font-black uppercase italic leading-tight">{selectedAuction.title}</h3>
                    <p className="text-[10px] text-[#141414]/40 font-mono uppercase mt-1">ID: {selectedAuction.id}</p>
                  </div>
                  <button onClick={() => setSelectedAuction(null)} className="text-[#141414]/40 hover:text-[#141414] ml-4 shrink-0 text-lg">✕</button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-4">
                  {/* Current high bid */}
                  <div className="bg-[#141414] text-white p-4 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(16,185,129,1)]">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-white/50 block font-mono">Current High Bid</span>
                        <span className="text-2xl font-black">{formatCurrency(selectedAuction.currentBid || selectedAuction.minBid)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-widest text-white/50 block font-mono">By Bidder</span>
                        <span className="text-sm font-bold">{selectedAuction.currentBidderName || 'No bids'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent bids — scrollable when > 4 */}
                  <div>
                    <div className="flex items-center justify-between gap-2 border-b border-[#141414]/10 pb-2 mb-2">
                      <div className="flex items-center gap-2 text-[#141414]/40">
                        <History size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Recent Activity</span>
                      </div>
                      {recentBids.length > 4 && (
                        <span className="text-[9px] font-mono text-[#141414]/30 uppercase">{recentBids.length} bids · scroll</span>
                      )}
                    </div>
                    {/* Cap at ~4 rows visible, scroll for the rest */}
                    <div
                      className="space-y-1 overflow-y-auto custom-scrollbar"
                      style={{ maxHeight: recentBids.length > 4 ? 132 : 'none' }}
                    >
                      {recentBids.length > 0 ? recentBids.map((bid, idx) => (
                        <div key={bid.id} className={cn(
                          "flex justify-between items-center text-sm py-1.5 border-b border-[#141414]/5 last:border-0",
                          idx === 0 ? "text-[#141414]" : "text-[#141414]/50"
                        )}>
                          <span className="font-medium">{bid.bidderName}</span>
                          <div className="flex items-center gap-2">
                            <span className={cn("font-bold", idx === 0 ? "text-emerald-600" : "")}>
                              {formatCurrency(bid.amount)}
                            </span>
                            <span className="text-[9px] font-mono text-[#141414]/30">
                              {new Date(bid.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      )) : (
                        <p className="text-xs text-[#141414]/40 italic py-2">No bids placed yet. Be the first!</p>
                      )}
                    </div>
                  </div>

                  {/* AI strategy */}
                  {aiStrategy && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50 border border-emerald-400 p-4">
                      <div className="flex items-center gap-2 text-emerald-700 mb-1">
                        <Sparkles size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">AI Strategist Suggestion</span>
                      </div>
                      <p className="text-xs text-emerald-800 leading-relaxed italic">"{aiStrategy.reasoning}"</p>
                      <div className="mt-2 text-xs font-bold text-emerald-900">Recommended Bid: {formatCurrency(aiStrategy.suggestedBid)}</div>
                    </motion.div>
                  )}
                </div>

                {/* Bid input — always pinned at bottom */}
                <div className="shrink-0 px-6 py-4 border-t border-[#141414]/10 space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[#141414]/40">$</span>
                      <input
                        type="number"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(Number(e.target.value))}
                        className="w-full pl-8 pr-4 py-3 border border-[#141414] focus:outline-none font-bold"
                      />
                    </div>
                    <button
                      onClick={handleGetAIStrategy}
                      disabled={loading}
                      className="bg-emerald-400 text-[#141414] px-4 border border-[#141414] hover:bg-emerald-300 disabled:opacity-50"
                      title="Get AI Strategy"
                    >
                      <Sparkles size={20} />
                    </button>
                  </div>
                  {error && <p className="text-red-600 text-[10px] font-mono">{error}</p>}
                  <button
                    onClick={handlePlaceBid}
                    className="w-full bg-[#141414] text-white py-3 font-bold uppercase tracking-widest hover:bg-white hover:text-[#141414] border border-[#141414] transition-all shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-1 active:translate-y-1"
                  >
                    Confirm Bid
                  </button>
                  <p className="text-[9px] text-center text-[#141414]/40 font-mono uppercase">Credits will be soft-locked until you are outbid.</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}