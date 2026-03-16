export type UserRole = 'admin' | 'bidder';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  credits: number;
  lockedCredits: number;
  isFlagged?: boolean;
  flagReason?: string;
  createdAt: string;
}

export type AuctionStatus = 'pending' | 'active' | 'closed';

export interface Auction {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  minBid: number;
  currentBid: number;
  currentBidderId?: string;
  currentBidderName?: string;
  startTime: string;
  endTime: string;
  status: AuctionStatus;
  winnerId?: string;
  createdBy: string;
  createdAt: string;
  bidFrequency?: number; // Bids in the last minute
}

export interface Bid {
  id: string;
  auctionId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  timestamp: string;
}

export type TransactionType = 'topup' | 'lock' | 'unlock' | 'deduct' | 'revoke';

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: TransactionType;
  description: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'win' | 'info' | 'alert';
  read: boolean;
  timestamp: string;
}
