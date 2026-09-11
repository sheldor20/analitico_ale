'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
export default function AuthBoundary({ userId, children }: { userId: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stopped = false;
    let checking = false;
    const leave = () => { if (!stopped) { setReady(false); window.location.replace('/login'); } };
    const verify = async () => {
      if (checking || stopped) return;
      checking = true;
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
        const data = response.ok ? await response.json() : null;
        if (data?.userId !== userId) leave();
        else if (!stopped) setReady(true);
      } catch { leave(); }
      finally { checking = false; }
    };
    if (!supabase) { leave(); return; }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (session && session.user.id !== userId)) leave();
    });
    const visible = () => { if (document.visibilityState === 'visible') void verify(); };
    const externalLogout = (event: StorageEvent) => { if (event.key === 'commercial:logout') leave(); };
    window.addEventListener('storage', externalLogout);
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel('commercial:session'); channel.onmessage = event => { if (event.data === 'logout') leave(); }; } catch { /* Storage and session revalidation are independent fallbacks. */ }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { setReady(false); void verify(); } };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', restored);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void verify(); }, 60000);
    void verify();
    return () => { stopped = true; data.subscription.unsubscribe(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pageshow', restored); window.removeEventListener('storage', externalLogout); channel?.close(); };
  }, [userId]);
  if (!ready) return <main className="auth-check" role="status">Validando acesso…</main>;
  return <div key={userId}>{children}</div>;
}
