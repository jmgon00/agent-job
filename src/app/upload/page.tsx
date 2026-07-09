"use client";

import { useState } from "react";
import { getStoredUser } from "@/lib/auth-storage";

interface UploadResult {
  imported: number;
  errors: { row: number; reason: string }[];
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    const user = getStoredUser();
    if (!file || !user) {
      setError("Selecciona un archivo .xlsx");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.set("userId", user.id);
    formData.set("file", file);

    try {
      const response = await fetch("/api/jobs/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setError("No se pudo subir el archivo. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      const json = (await response.json()) as UploadResult;
      setResult(json);
      setLoading(false);
    } catch {
      setError("No se pudo subir el archivo. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-dark-950 px-4 py-16 text-white">
      <h1 className="text-3xl font-bold">Subir postulaciones</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-dark-200"
        />
        {error && <p className="text-sm text-magenta-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-cyan-400 py-2 font-semibold text-dark-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
        >
          {loading ? "Subiendo..." : "Subir"}
        </button>
      </form>

      {result && (
        <div className="w-full max-w-md text-dark-200">
          <p className="mb-2">
            {result.imported} filas importadas, {result.errors.length} con errores.
          </p>
          {result.errors.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-magenta-400">
              {result.errors.map((err) => (
                <li key={err.row}>
                  Fila {err.row}: {err.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
