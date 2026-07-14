"use client";

import { useState } from "react";
import { getStoredUser } from "@/lib/auth-storage";

interface ImportResult {
  imported: number;
  duplicates: number;
  unrecognizedCount: number;
}

export default function ImportLinkedInPage() {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    const user = getStoredUser();
    if (!html.trim() || !user) {
      setError("Pega el HTML de los resultados antes de importar.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/jobs/import-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, html }),
      });

      if (!response.ok) {
        setError("No se pudo importar. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      const json = (await response.json()) as ImportResult;
      setResult(json);
      setLoading(false);
    } catch {
      setError("No se pudo importar. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-dark-950 px-4 py-16 text-white">
      <h1 className="text-3xl font-bold">Importar desde LinkedIn</h1>
      <ol className="w-full max-w-md list-decimal space-y-1 pl-5 text-sm text-dark-300">
        <li>Busca vacantes en LinkedIn logueado con tu cuenta.</li>
        <li>
          Abri las herramientas de desarrollador (F12) y ubica el contenedor
          de resultados en la pestana Elements.
        </li>
        <li>Click derecho sobre ese contenedor, Copy, Copy outerHTML.</li>
        <li>Pega el contenido abajo y presiona Importar.</li>
      </ol>
      <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={10}
          placeholder="Pega aca el HTML copiado"
          className="rounded-lg bg-dark-800 p-3 font-mono text-xs text-white"
        />
        {error && <p className="text-sm text-magenta-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-cyan-400 py-2 font-semibold text-dark-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
        >
          {loading ? "Importando..." : "Importar"}
        </button>
      </form>

      {result && (
        <div className="w-full max-w-md text-dark-200">
          <p>
            {result.imported} vacantes nuevas, {result.duplicates} ya existian.
          </p>
          {result.unrecognizedCount > 0 && (
            <p className="text-sm text-dark-400">
              {result.unrecognizedCount} tarjetas no se pudieron reconocer.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
