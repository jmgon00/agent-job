"use client";

import { useEffect, useState } from "react";
import { getStoredUser } from "@/lib/auth-storage";

type Portal = "linkedin" | "bumeran";

interface PortalProfile {
  id: string;
  portal: string;
  headline: string | null;
  summary: string | null;
}

const PORTAL_LABELS: Record<Portal, string> = {
  linkedin: "LinkedIn",
  bumeran: "Bumeran",
};

export default function ProfilePage() {
  const [rawProfile, setRawProfile] = useState("");
  const [baseSaved, setBaseSaved] = useState(false);
  const [profiles, setProfiles] = useState<PortalProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [portal, setPortal] = useState<Portal>("linkedin");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return;

    fetch(`/api/profiles?userId=${user.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data: { rawProfile: string | null; profiles: PortalProfile[] }) => {
        setRawProfile(data.rawProfile ?? "");
        setBaseSaved(Boolean(data.rawProfile));
        setProfiles(data.profiles);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSaveBase(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    const user = getStoredUser();
    if (!user) return;

    setSaving(true);
    try {
      const response = await fetch("/api/profiles/base", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, rawProfile }),
      });
      if (!response.ok) throw new Error("failed");
      setBaseSaved(true);
    } catch {
      setSaveError("No se pudo guardar el perfil. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleOptimize() {
    setOptimizeError("");
    const user = getStoredUser();
    if (!user) return;

    setOptimizing(true);
    try {
      const response = await fetch("/api/profiles/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, portal }),
      });
      if (!response.ok) throw new Error("failed");
      const updated: PortalProfile = await response.json();
      setProfiles((current) => [
        updated,
        ...current.filter((p) => p.portal !== updated.portal),
      ]);
    } catch {
      setOptimizeError("No se pudo optimizar el perfil. Intenta de nuevo.");
    } finally {
      setOptimizing(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dark-950 text-white">
        Cargando...
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-dark-950 px-4 py-16 text-white">
      <h1 className="text-3xl font-bold">Tu perfil</h1>

      <form onSubmit={handleSaveBase} className="flex w-full max-w-md flex-col gap-4">
        <label className="text-sm text-dark-300">
          Contame tu experiencia, skills y objetivo laboral
        </label>
        <textarea
          value={rawProfile}
          onChange={(e) => setRawProfile(e.target.value)}
          rows={8}
          className="rounded-lg bg-dark-800 p-3 text-white"
        />
        {saveError && <p className="text-sm text-magenta-400">{saveError}</p>}
        <button
          type="submit"
          disabled={saving || rawProfile.trim() === ""}
          className="w-full rounded-lg bg-cyan-400 py-2 font-semibold text-dark-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar perfil"}
        </button>
      </form>

      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="flex gap-4">
          <select
            value={portal}
            onChange={(e) => setPortal(e.target.value as Portal)}
            className="rounded-lg bg-dark-800 px-3 py-2 text-white"
          >
            <option value="linkedin">LinkedIn</option>
            <option value="bumeran">Bumeran</option>
          </select>
          <button
            onClick={handleOptimize}
            disabled={optimizing || !baseSaved}
            className="flex-1 rounded-lg bg-cyan-400 py-2 font-semibold text-dark-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
          >
            {optimizing ? "Optimizando..." : "Optimizar"}
          </button>
        </div>
        {!baseSaved && (
          <p className="text-sm text-dark-400">
            Guarda tu perfil base primero para poder optimizarlo.
          </p>
        )}
        {optimizeError && <p className="text-sm text-magenta-400">{optimizeError}</p>}
      </div>

      {profiles.length > 0 && (
        <div className="flex w-full max-w-md flex-col gap-4">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-dark-700 bg-dark-900 p-4 text-dark-200"
            >
              <h2 className="mb-2 font-semibold text-cyan-400">
                {PORTAL_LABELS[p.portal as Portal] ?? p.portal}
              </h2>
              <p className="mb-1 font-medium">{p.headline}</p>
              <p className="text-sm">{p.summary}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
