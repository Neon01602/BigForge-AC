import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, limit, query } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';
import { pendingDisplayName } from '../components/Auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);

        const resolvedDisplayName =
          pendingDisplayName ||
          firebaseUser.displayName?.trim() ||
          firebaseUser.email?.split('@')[0] ||
          'Anonymous';

        if (userDoc.exists()) {
          const existingProfile = userDoc.data() as UserProfile;
          const isAdminEmail = firebaseUser.email === 'ahmadabdullah007860@bbdu.ac.in';

          const needsNamePatch =
            !existingProfile.displayName ||
            existingProfile.displayName === 'Anonymous';

          // FIX: also patch missing isFlagged field on old users
          // Firestore where('isFlagged', '==', true) silently skips documents
          // where the field doesn't exist at all — so flagged users never appear
          // in the admin list. Writing isFlagged: false explicitly on login
          // ensures the field exists on every user doc going forward.
          const needsFlagFieldPatch = existingProfile.isFlagged === undefined;

          if (isAdminEmail && existingProfile.role !== 'admin') {
            const updatedProfile: UserProfile = {
              ...existingProfile,
              role: 'admin',
              displayName: needsNamePatch ? resolvedDisplayName : existingProfile.displayName,
              isFlagged: existingProfile.isFlagged ?? false,
              flagReason: existingProfile.flagReason ?? '',
            };
            await setDoc(userRef, updatedProfile);
            setProfile(updatedProfile);
          } else if (needsNamePatch || needsFlagFieldPatch) {
            const patch: Partial<UserProfile> = {};
            if (needsNamePatch) patch.displayName = resolvedDisplayName;
            if (needsFlagFieldPatch) {
              patch.isFlagged = false;
              patch.flagReason = '';
            }
            await updateDoc(userRef, patch);
            setProfile({ ...existingProfile, ...patch });
          } else {
            setProfile(existingProfile);
          }
        } else {
          // New user — create profile
          const usersQuery = query(collection(db, 'users'), limit(1));
          const usersSnapshot = await getDocs(usersQuery);
          const isFirstUser = usersSnapshot.empty;
          const isAdminEmail = firebaseUser.email === 'ahmadabdullah007860@bbdu.ac.in';

          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: resolvedDisplayName,
            role: (isFirstUser || isAdminEmail) ? 'admin' : 'bidder',
            credits: 1000,
            lockedCredits: 0,
            // FIX: always write isFlagged explicitly so Firestore where queries work
            isFlagged: false,
            flagReason: '',
            createdAt: new Date().toISOString(),
          };

          await setDoc(userRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, profile, loading };
}
