"use client";

import { useEffect, useRef, useState } from "react";
import { getStoredUser } from "@/lib/auth-storage";
import { JOB_STATUSES, type JobStatus } from "@/lib/job-status";

interface SavedJobRow {
  id: string;
  title: string;
  company: string;
  portal: string;
  link: string;
  status: JobStatus;
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<SavedJobRow[] | null>(null);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const latestRequestRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return;

    fetch(`/api/jobs?userId=${user.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => setJobs(data.jobs))
      .catch(() => setError("No se pudieron cargar tus postulaciones."));
  }, []);

  async function handleStatusChange(jobId: string, newStatus: JobStatus) {
    const user = getStoredUser();
    if (!user || !jobs) return;

    const previous = jobs.find((j) => j.id === jobId)?.status;
    const requestId = (latestRequestRef.current[jobId] ?? 0) + 1;
    latestRequestRef.current[jobId] = requestId;

    setJobs((current) =>
      current
        ? current.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
        : current
    );
    setRowErrors((prev) => ({ ...prev, [jobId]: "" }));

    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, status: newStatus }),
      });

      if (!response.ok) {
        throw new Error("failed");
      }
    } catch {
      // Only revert if no newer status change has been issued for this
      // row since — a value-equality check isn't enough (the same
      // status can recur from a later request), so track request
      // recency explicitly instead.
      if (latestRequestRef.current[jobId] !== requestId) return;

      setJobs((current) =>
        current
          ? current.map((j) =>
              j.id === jobId ? { ...j, status: previous ?? j.status } : j
            )
          : current
      );
      setRowErrors((prev) => ({
        ...prev,
        [jobId]: "No se pudo actualizar el estado.",
      }));
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dark-950 text-magenta-400">
        {error}
      </main>
    );
  }

  if (jobs === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dark-950 text-white">
        Cargando...
      </main>
    );
  }

  if (jobs.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-dark-950 text-white">
        <p className="text-dark-200">Todavia no tenes postulaciones guardadas.</p>
        <a href="/upload" className="text-cyan-400 hover:text-cyan-300">
          Subir un Excel
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark-950 px-4 py-16 text-white">
      <h1 className="mb-6 text-3xl font-bold">Tus postulaciones</h1>
      <table className="w-full max-w-4xl text-left text-dark-200">
        <thead>
          <tr className="border-b border-dark-700 text-sm text-dark-400">
            <th className="py-2 pr-4">Titulo</th>
            <th className="py-2 pr-4">Empresa</th>
            <th className="py-2 pr-4">Portal</th>
            <th className="py-2 pr-4">Estado</th>
            <th className="py-2 pr-4">Link</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-dark-800">
              <td className="py-2 pr-4">{job.title}</td>
              <td className="py-2 pr-4">{job.company}</td>
              <td className="py-2 pr-4">{job.portal}</td>
              <td className="py-2 pr-4">
                <select
                  value={job.status}
                  onChange={(e) =>
                    handleStatusChange(job.id, e.target.value as JobStatus)
                  }
                  className="rounded bg-dark-800 px-2 py-1 text-white"
                >
                  {JOB_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                {rowErrors[job.id] && (
                  <p className="text-xs text-magenta-400">{rowErrors[job.id]}</p>
                )}
              </td>
              <td className="py-2 pr-4">
                <a
                  href={job.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300"
                >
                  Ver
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
