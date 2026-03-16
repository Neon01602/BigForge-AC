import React, { useState, useEffect, useRef } from 'react';
import { Hammer, LogOut, Wallet, Shield, Bell, Check, X, User, Copy, ChevronDown } from 'lucide-react';
import { auth, db } from '../firebase';
import { UserProfile, Notification } from '../types';
import { formatCurrency } from '../lib/utils';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

interface NavbarProps {
  profile: UserProfile;
}

export function Navbar({ profile }: NavbarProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [copied, setCopied] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const availableCredits = profile.credits - profile.lockedCredits;
  const isAdmin = profile.role === 'admin';

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', profile.uid),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'notifications');
    });
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAsRead  = async (id: string) => updateDoc(doc(db, 'notifications', id), { read: true });
  const deleteNotif = async (id: string) => deleteDoc(doc(db, 'notifications', id));
  const unreadCount = notifications.filter(n => !n.read).length;

  const copyUid = () => {
    navigator.clipboard.writeText(profile.uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <nav className="text-white border-b sticky top-0 z-50 bg-[#141414] border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">

          {/* ── Logo ── */}
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-white">
              <Hammer size={20} color="#141414" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-black uppercase italic tracking-tighter text-xl text-white">BidForge</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] mt-0.5 text-white/40">Auction Platform</span>
            </div>
          </div>

          {/* ── Right side ── */}
          <div className="flex items-center gap-4">

            {/* Credits — bidder only */}
            {!isAdmin && (
              <div className="hidden md:flex items-center gap-6 border-r border-white/10 pr-6">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-white/50">Available</span>
                  <div className="flex items-center gap-1.5">
                    <Wallet size={13} className="text-emerald-400" />
                    <span className="text-emerald-400 font-bold text-sm">{formatCurrency(availableCredits)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-white/50">Locked</span>
                  <span className="text-orange-400 font-bold text-sm">{formatCurrency(profile.lockedCredits)}</span>
                </div>
              </div>
            )}

            {/* ── Notifications ── */}
            <div className="relative">
              <button
                onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false); }}
                className="p-2 transition-all relative text-white/60 hover:text-white"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-[#141414]">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-80 z-50 overflow-hidden"
                      style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.18)', boxShadow: '8px 8px 0 rgba(0,0,0,0.6)' }}
                    >
                      <div className="p-4 border-b flex justify-between items-center bg-[#0d0d0d] border-white/10">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-white">Notifications</h4>
                        <span className="text-[10px] font-mono text-white/40 uppercase">{unreadCount} New</span>
                      </div>
                      <div className="max-h-96 overflow-y-auto custom-scrollbar">
                        {notifications.length > 0 ? (
                          <div className="divide-y divide-white/8">
                            {notifications.map(notif => (
                              <div
                                key={notif.id}
                                className="p-4 transition-colors group"
                                style={{ background: notif.read ? '#1a1a1a' : 'rgba(52,211,153,0.06)' }}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-bold text-xs text-white">{notif.title}</span>
                                      {!notif.read && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                                    </div>
                                    <p className="text-[10px] leading-relaxed mb-2 text-white/60">{notif.message}</p>
                                    <span className="text-[8px] font-mono uppercase text-white/30">
                                      {new Date(notif.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!notif.read && (
                                      <button onClick={() => markAsRead(notif.id)} className="p-1 hover:bg-emerald-400/10 text-emerald-400 rounded" title="Mark as read">
                                        <Check size={12} />
                                      </button>
                                    )}
                                    <button onClick={() => deleteNotif(notif.id)} className="p-1 hover:bg-red-500/10 text-red-400 rounded" title="Delete">
                                      <X size={12} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 text-center font-mono text-[10px] uppercase italic text-white/30">
                            No notifications yet
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Divider */}
            <div className="w-px h-7 bg-white/10" />

            {/* ── Profile button + dropdown ── */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => { setShowProfile(!showProfile); setShowNotifications(false); }}
                className="flex items-center gap-2 px-2 py-1.5 transition-all rounded-sm"
                style={{ background: showProfile ? 'rgba(255,255,255,0.08)' : 'transparent' }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff' }}
                >
                  {(profile.displayName || profile.email || '?').charAt(0).toUpperCase()}
                </div>

                <div className="hidden sm:flex flex-col items-start leading-none gap-0.5">
                  <div className="flex items-center gap-1.5">
                    {isAdmin && <Shield size={10} className="text-emerald-400" />}
                    <span className="font-bold text-sm tracking-tight text-white">{profile.displayName}</span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: isAdmin ? '#34D399' : 'rgba(255,255,255,0.4)' }}>
                    {profile.role}
                  </span>
                </div>

                <ChevronDown
                  size={14}
                  className="transition-transform duration-200 text-white/40"
                  style={{ transform: showProfile ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>

              {/* ── Profile Dropdown ── */}
              <AnimatePresence>
                {showProfile && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-72 z-50 overflow-hidden"
                      style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.18)', boxShadow: '8px 8px 0 rgba(0,0,0,0.6)' }}
                    >
                      {/* Header */}
                      <div className="px-5 py-4 border-b bg-[#0d0d0d] border-white/8">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#ffffff' }}
                          >
                            {(profile.displayName || profile.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-sm leading-tight text-white">{profile.displayName}</div>
                            <div className="text-[10px] font-mono mt-0.5 text-white/45">{profile.email}</div>
                          </div>
                        </div>
                      </div>

                      {/* Info rows */}
                      <div className="px-5 py-3 space-y-3">

                        {/* UID */}
                        <div>
                          <div className="text-[9px] font-mono uppercase tracking-widest mb-1 text-white/35">User ID</div>
                          <div className="flex items-center gap-2">
                            <code
                              className="text-[10px] font-mono flex-1 truncate px-2 py-1 rounded-sm text-white/55"
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                              {profile.uid}
                            </code>
                            <button
                              onClick={copyUid}
                              className="p-1.5 transition-all rounded-sm flex-shrink-0"
                              style={{
                                background: copied ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)',
                                border: `1px solid ${copied ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.12)'}`,
                                color: copied ? '#34D399' : 'rgba(255,255,255,0.45)',
                              }}
                              title="Copy UID"
                            >
                              {copied ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          </div>
                        </div>

                        {/* Role */}
                        <div>
                          <div className="text-[9px] font-mono uppercase tracking-widest mb-1 text-white/35">Role</div>
                          <div className="flex items-center gap-2">
                            {isAdmin
                              ? <Shield size={13} className="text-emerald-400 flex-shrink-0" />
                              : <User size={13} className="text-white/40 flex-shrink-0" />
                            }
                            <span
                              className="text-xs font-bold uppercase tracking-widest"
                              style={{ color: isAdmin ? '#34D399' : '#ffffff' }}
                            >
                              {profile.role}
                            </span>
                            {isAdmin && (
                              <span
                                className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-sm"
                                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34D399' }}
                              >
                                Full Access
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Member since */}
                        <div>
                          <div className="text-[9px] font-mono uppercase tracking-widest mb-1 text-white/35">Member Since</div>
                          <div className="text-xs font-mono text-white/55">
                            {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="mx-5 bg-white/8" style={{ height: 1 }} />

                      {/* Sign out */}
                      <div className="px-5 py-3">
                        <button
                          onClick={() => auth.signOut()}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all"
                          style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.18)' }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)';
                            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.35)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.18)';
                          }}
                        >
                          <LogOut size={14} style={{ color: '#ef4444', opacity: 0.7 }} />
                          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#ef4444', opacity: 0.75 }}>
                            Sign Out
                          </span>
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
