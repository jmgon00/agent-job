"use client";

import { useEffect, useState } from "react";
import { EmailGateModal } from "./EmailGateModal";
import {
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  type StoredUser,
} from "@/lib/auth-storage";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredUser | null | undefined>(undefined);

  useEffect(() => {
    // localStorage is unavailable during SSR; reading it here (rather than
    // in the initial useState) avoids a hydration mismatch by deferring the
    // divergence from the server-rendered `undefined` until after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(getStoredUser());
  }, []);

  if (user === undefined) {
    return null;
  }

  if (user === null) {
    return (
      <EmailGateModal
        onSuccess={(newUser) => {
          setStoredUser(newUser);
          setUser(newUser);
        }}
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-dark-700 bg-dark-900 px-6 py-3 text-sm text-dark-300">
        <nav className="flex items-center gap-4">
          <a href="/dashboard" className="hover:text-cyan-400">
            Dashboard
          </a>
          <a href="/upload" className="hover:text-cyan-400">
            Subir Excel
          </a>
          <a href="/profile" className="hover:text-cyan-400">
            Perfil
          </a>
          <a href="/import/linkedin" className="hover:text-cyan-400">
            Importar LinkedIn
          </a>
        </nav>
        <div className="flex items-center gap-4">
          <span>{user.email}</span>
          <button
            onClick={() => {
              clearStoredUser();
              setUser(null);
            }}
            className="text-cyan-400 hover:text-cyan-300"
          >
            Cerrar sesion
          </button>
        </div>
      </div>
      {children}
    </>
  );
}
