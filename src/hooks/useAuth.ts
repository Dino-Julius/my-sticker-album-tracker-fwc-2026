import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type AuthStatus = "loading" | "ready";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? "loading" : "ready");
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setSession(data.session);
      setUser(data.session?.user ?? null);
      setStatus("ready");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setStatus("ready");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const sendMagicLink = async (email: string) => {
    if (!supabase) {
      setAuthMessage("Supabase no está configurado. Usando almacenamiento local.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      },
    });

    setAuthMessage(error ? error.message : "Enlace mágico enviado. Revisa tu correo.");
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    setAuthMessage(error ? error.message : "Sesión cerrada.");
  };

  return {
    authMessage,
    isConfigured: isSupabaseConfigured,
    isLoading: status === "loading",
    session,
    sendMagicLink,
    signOut,
    user,
  };
}
