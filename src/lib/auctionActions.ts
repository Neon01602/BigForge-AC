import { runTransaction, doc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export async function placeBid(auctionId: string, bidderId: string, bidderName: string, amount: number) {
  const auctionRef = doc(db, 'auctions', auctionId);
  const bidderRef = doc(db, 'users', bidderId);

  try {
    // Fetch recent bids for anti-spam check BEFORE transaction
    const recentUserBidsQuery = query(
      collection(db, 'bids'),
      where('bidderId', '==', bidderId),
      orderBy('timestamp', 'desc'),
      limit(3)
    );
    const recentUserBidsSnapshot = await getDocs(recentUserBidsQuery);
    const recentUserBids = recentUserBidsSnapshot.docs.map(d => d.data());

    await runTransaction(db, async (transaction) => {
      const auctionDoc = await transaction.get(auctionRef);
      const bidderDoc = await transaction.get(bidderRef);

      if (!auctionDoc.exists()) throw new Error("Auction does not exist");
      if (!bidderDoc.exists()) throw new Error("User does not exist");

      const auctionData = auctionDoc.data();
      const bidderData = bidderDoc.data();

      // 0. Check if user is flagged
      if (bidderData.isFlagged) {
        throw new Error(`Your account is flagged: ${bidderData.flagReason}. Please contact admin.`);
      }

      // 1. Validate Auction Status and Time
      if (auctionData.status !== 'active') throw new Error("Auction is not active");
      if (new Date(auctionData.endTime).getTime() <= Date.now()) {
        throw new Error("Auction has ended and is awaiting result");
      }

      // 2. Validate Bid Amount
      if (amount <= (auctionData.currentBid || auctionData.minBid)) {
        throw new Error("Bid must be higher than current bid");
      }
      if (auctionData.currentBidderId === bidderId) {
        throw new Error(
          "You are already the highest bidder on this auction. " +
          "You cannot bid again until someone outbids you."
        );
      }
      

      // 3. Check Credits
      const newLockedTotal = bidderData.lockedCredits + amount;
      if (newLockedTotal > bidderData.credits) {
        const available = Math.max(0, bidderData.credits - bidderData.lockedCredits);
        throw new Error(
          `Insufficient credits. You need ${amount.toFixed(2)} credits for this bid, ` +
          `but only ${available.toFixed(2)} are available ` +
          `(Total: ${bidderData.credits.toFixed(2)}, Already locked: ${bidderData.lockedCredits.toFixed(2)}).`
        );
      }

      // 4. Bid Behaviour Flags (Anti-Spam)
      // FIX: detect spam BEFORE building the credits update so we can merge
      // both changes into a single transaction.update() call.
      // Previously the flag update and credits update were separate calls on
      // the same doc — the second call silently overwrote the first.
      let shouldFlag = false;
      if (recentUserBids.length >= 3) {
        const oldestRecentBidTime = new Date(recentUserBids[2].timestamp).getTime();
        if (Date.now() - oldestRecentBidTime < 10000) {
          shouldFlag = true;
        }
      }

      // 5. Handle Previous Bidder (Unlock their credits) — all reads first
      let prevBidderDoc = null;
      if (auctionData.currentBidderId) {
        const prevBidderRef = doc(db, 'users', auctionData.currentBidderId);
        prevBidderDoc = await transaction.get(prevBidderRef);
      }

      // ── ALL WRITES BELOW ──

      // 6. Lock Current Bidder's Credits — merged with flag if needed
      // FIX: single update call so flag isn't overwritten by credits update
      transaction.update(bidderRef, {
        lockedCredits: newLockedTotal,
        ...(shouldFlag && {
          isFlagged: true,
          flagReason: 'Excessive bidding detected (More than 3 bids in 10s)'
        })
      });

      // 7. Unlock Previous Bidder's Credits
      if (auctionData.currentBidderId && prevBidderDoc?.exists()) {
        const prevBidderRef = doc(db, 'users', auctionData.currentBidderId);
        const prevBidderData = prevBidderDoc.data();
        transaction.update(prevBidderRef, {
          lockedCredits: Math.max(0, prevBidderData.lockedCredits - auctionData.currentBid)
        });

        // Log unlock transaction
        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          userId: auctionData.currentBidderId,
          amount: auctionData.currentBid,
          type: 'unlock',
          description: `Outbid on auction: ${auctionData.title}`,
          timestamp: new Date().toISOString()
        });
      }

      // 8. Update Auction
      let newEndTime = auctionData.endTime;
      const now = Date.now();
      const endTimeMs = new Date(auctionData.endTime).getTime();

      // Anti-sniping: if bid in last 60s, extend by 30s
      if (endTimeMs - now < 60000) {
        newEndTime = new Date(endTimeMs + 30000).toISOString();
      }

      transaction.update(auctionRef, {
        currentBid: amount,
        currentBidderId: bidderId,
        currentBidderName: bidderName,
        endTime: newEndTime,
        bidFrequency: (auctionData.bidFrequency || 0) + 1
      });

      // 9. Record Bid
      const bidRef = doc(collection(db, 'bids'));
      transaction.set(bidRef, {
        auctionId,
        bidderId,
        bidderName,
        amount,
        timestamp: new Date().toISOString()
      });

      // 10. Record Lock Transaction
      const lockTxRef = doc(collection(db, 'transactions'));
      transaction.set(lockTxRef, {
        userId: bidderId,
        amount,
        type: 'lock',
        description: `Bid placed on auction: ${auctionData.title}`,
        timestamp: new Date().toISOString()
      });
    });

    return { success: true };
  } catch (error: any) {
    console.error("Bid failed:", error);
    return { success: false, error: error.message };
  }
}
