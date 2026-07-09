import type { Metadata } from "next";
import "./globals.css";
import { AuthGate } from "@/components/sections/AuthGate";

export const metadata: Metadata = {
  title: "agent-job - Automatizacion de Busqueda de Empleo",
  description:
    "Plataforma de automatizacion de busqueda de empleo: optimizacion de CV por IA, sincronizacion de portales y seguimiento de postulaciones.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
