import React, { useState, useEffect } from 'react';
import { Auction } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Timer, Gavel, TrendingUp, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';

interface AuctionCardProps {
  auction: Auction;
  onBid: (auction: Auction) => void;
  isOwner?: boolean;
}

export function AuctionCard({ auction, onBid, isOwner }: AuctionCardProps) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isEndingSoon, setIsEndingSoon] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const end = new Date(auction.endTime).getTime();
      const now = Date.now();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('AWAITING RESULT');
        setIsEndingSoon(false);
        clearInterval(timer);
      } else {
        setTimeLeft(formatDistanceToNow(end, { addSuffix: true }));
        setIsEndingSoon(diff < 60000); // Less than 1 minute
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [auction.endTime]);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden flex flex-col group"
    >
      <div className="relative aspect-video bg-[#141414]/5 overflow-hidden">
        <img 
          src={auction.imageUrl || `https://picsum.photos/seed/${auction.id}/800/450`} 
          alt={auction.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-3 left-3 flex gap-2">
          <div className={cn(
            "px-2 py-1 text-[10px] font-bold uppercase tracking-widest border border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]",
            auction.status === 'active' ? "bg-emerald-400" : "bg-orange-400"
          )}>
            {auction.status}
          </div>
          {isEndingSoon && (
            <div className="bg-red-500 text-white px-2 py-1 text-[10px] font-bold uppercase tracking-widest animate-pulse border border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
              Ending Soon
            </div>
          )}
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-bold tracking-tight text-[#141414] line-clamp-1">{auction.title}</h3>
          <div className="flex items-center gap-1 text-[#141414]/40">
            <Timer size={14} />
            <span className="text-[10px] font-mono uppercase">{timeLeft}</span>
          </div>
        </div>

        <p className="text-sm text-[#141414]/60 line-clamp-2 mb-4 h-10">{auction.description}</p>

        <div className="grid grid-cols-2 gap-4 mb-6 bg-[#141414]/5 p-3 border border-[#141414]/10">
          <div>
            <span className="text-[9px] uppercase tracking-widest text-[#141414]/40 font-mono block">Current Bid</span>
            <span className="text-xl font-black text-[#141414]">{formatCurrency(auction.currentBid || auction.minBid)}</span>
          </div>
          <div className="text-right">
            <span className="text-[9px] uppercase tracking-widest text-[#141414]/40 font-mono block">Highest Bidder</span>
            <span className="text-xs font-bold text-[#141414]/80 truncate block">
              {auction.currentBidderName || 'No bids yet'}
            </span>
          </div>
        </div>

        <button
          onClick={() => onBid(auction)}
          disabled={auction.status !== 'active' || new Date(auction.endTime).getTime() <= Date.now()}
          className={cn(
            "w-full py-3 font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-[#141414]",
            (auction.status === 'active' && new Date(auction.endTime).getTime() > Date.now())
              ? "bg-[#141414] text-white hover:bg-white hover:text-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-1 active:translate-y-1" 
              : "bg-[#141414]/10 text-[#141414]/40 cursor-not-allowed"
          )}
        >
          <Gavel size={18} />
          {auction.status === 'active' 
            ? (new Date(auction.endTime).getTime() <= Date.now() ? 'Awaiting Result' : 'Place Bid') 
            : 'Auction Closed'}
        </button>
      </div>
    </motion.div>
  );
}
