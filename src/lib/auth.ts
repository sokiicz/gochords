import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { cloudEnabled, supabase } from './supabase';

export interface AuthState {
  status: 'loading' | 'signed-in' | 'signed-out' | 'unavailable';
  session: Session | null;
  user: User | null;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    status: cloudEnabled ? 'loading' : 'unavailable',
    session: null,
    user: null,
  });

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const session = data.session;
      setState({
        status: session ? 'signed-in' : 'signed-out',
        session,
        user: session?.user ?? null,
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        status: session ? 'signed-in' : 'signed-out',
        session,
        user: session?.user ?? null,
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function signInWithEmail(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}
