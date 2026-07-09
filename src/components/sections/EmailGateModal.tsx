"use client";

import { useState } from "react";
import type { StoredUser } from "@/lib/auth-storage";

interface EmailGateModalProps {
  onSuccess: (user: StoredUser) => void;
}

export function EmailGateModal({ onSuccess }: EmailGateModalProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Ingresa un email valido");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        setError("No se pudo conectar. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      const user = (await response.json()) as StoredUser;
      onSuccess(user);
    } catch {
      setError("No se pudo conectar. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-lg max-w-md w-full p-8">
        <h2 className="text-2xl font-bold text-white mb-2">Bienvenido a agent-job</h2>
        <p className="text-dark-300 mb-6">
          Ingresa tu email para empezar a organizar tu busqueda de empleo.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-dark-200 text-sm font-semibold mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-cyan-400"
              disabled={loading}
            />
            {error && <p className="text-magenta-400 text-sm mt-2">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-400 text-dark-950 font-semibold py-2 rounded-lg hover:bg-cyan-300 transition-colors disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Comenzar"}
          </button>
        </form>
      </div>
    </div>
  );
}
