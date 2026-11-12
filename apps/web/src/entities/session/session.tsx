"use client";
import { api, type Me } from "@nabi/shared";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/shared/api/apiFetch";
import { auth } from "@/shared/lib/firebase";

type Session = { user: User | null; me: Me | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> };
const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (u: User | null) => {
    setUser(u);
    setMe(u ? await apiFetch(api.me).catch(() => null) : null);
    setLoading(false);
  }, []);

  useEffect(() => onIdTokenChanged(auth, (u) => void load(u)), [load]);

  const value: Session = {
    user,
    me,
    loading,
    refresh: () => load(auth.currentUser),
    logout: () => signOut(auth),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("SessionProvider가 없어요");
  return s;
}

/** 로그인이 필요한 화면. 비로그인이면 로그인 화면으로 보냈다가 돌아온다(07 2장). */
export function useRequireLogin() {
  const s = useSession();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!s.loading && !s.me) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [s.loading, s.me, router, path]);
  return s;
}

export const loginHref = (next: string) => `/login?next=${encodeURIComponent(next)}`;
