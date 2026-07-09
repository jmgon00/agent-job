import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executeStructuredAgent } from "@/lib/agents/claude";

const optimizeSchema = z.object({
  userId: z.string().min(1),
  portal: z.enum(["linkedin", "bumeran"]),
});

const optimizedProfileSchema = z.object({
  headline: z.string(),
  summary: z.string(),
});

const PORTAL_PROMPTS: Record<"linkedin" | "bumeran", string> = {
  linkedin: `Sos un experto en optimizacion de perfiles de LinkedIn. A partir del texto libre que te pasa el usuario describiendo su experiencia, skills y objetivo laboral, genera un perfil optimizado para LinkedIn.

Reglas:
- "headline": corto (menos de 220 caracteres), con las keywords de rol y seniority mas relevantes, estilo profesional de networking.
- "summary": en primera persona, orientado a reclutadores y conexiones, resaltando logros y objetivo laboral.

Responde UNICAMENTE con un objeto JSON valido de la forma {"headline": "...", "summary": "..."}. No agregues texto antes ni despues del JSON, ni uses markdown.`,
  bumeran: `Sos un experto en redaccion de CVs para el mercado laboral latinoamericano (portal Bumeran). A partir del texto libre que te pasa el usuario describiendo su experiencia, skills y objetivo laboral, genera un perfil optimizado para Bumeran.

Reglas:
- "headline": el titulo del puesto que el usuario busca, directo y claro.
- "summary": estilo CV, orientado a logros y experiencia concreta, sin adornos de networking.

Responde UNICAMENTE con un objeto JSON valido de la forma {"headline": "...", "summary": "..."}. No agregues texto antes ni despues del JSON, ni uses markdown.`,
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const parsed = optimizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "userId o portal invalido" }, { status: 400 });
  }
  const { userId, portal } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (!user.rawProfile) {
      return NextResponse.json(
        { error: "Guarda tu perfil base primero" },
        { status: 400 }
      );
    }

    const optimized = await executeStructuredAgent({
      agentInstructions: PORTAL_PROMPTS[portal],
      userQuery: user.rawProfile,
      schema: optimizedProfileSchema,
    });

    const profile = await prisma.userProfile.upsert({
      where: { userId_portal: { userId, portal } },
      update: { headline: optimized.headline, summary: optimized.summary },
      create: {
        userId,
        portal,
        headline: optimized.headline,
        summary: optimized.summary,
      },
    });

    return NextResponse.json(profile, { status: 200 });
  } catch (error) {
    console.error("[POST /api/profiles/optimize error]", error);
    return NextResponse.json({ error: "No se pudo optimizar el perfil" }, { status: 500 });
  }
}
