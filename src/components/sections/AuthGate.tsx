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
      <div className="flex items-center justify-end gap-4 border-b border-dark-700 bg-dark-900 px-6 py-3 text-sm text-dark-300">
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
      {children}
    </>
  );
}
