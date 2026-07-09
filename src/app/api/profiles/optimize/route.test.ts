// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";

const { mockExecuteStructuredAgent } = vi.hoisted(() => ({
  mockExecuteStructuredAgent: vi.fn(),
}));

vi.mock("@/lib/agents/claude", () => ({
  executeStructuredAgent: mockExecuteStructuredAgent,
}));

import { POST } from "./route";

let userWithProfileId: string;
let userWithoutProfileId: string;
const emailWith = `test-profiles-optimize-with-${Date.now()}@agentjob-test.local`;
const emailWithout = `test-profiles-optimize-without-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const withProfile = await prisma.user.create({
    data: { email: emailWith, rawProfile: "Desarrollador con 5 anios de experiencia." },
  });
  userWithProfileId = withProfile.id;

  const withoutProfile = await prisma.user.create({ data: { email: emailWithout } });
  userWithoutProfileId = withoutProfile.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [userWithProfileId, userWithoutProfileId] } },
  });
});

beforeEach(() => {
  mockExecuteStructuredAgent.mockReset();
});

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/profiles/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profiles/optimize", () => {
  it("generates and upserts the optimized profile for the portal", async () => {
    mockExecuteStructuredAgent.mockResolvedValueOnce({
      headline: "Dev Senior",
      summary: "Resumen generado.",
    });

    const response = await POST(
      postRequest({ userId: userWithProfileId, portal: "linkedin" })
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.headline).toBe("Dev Senior");
    expect(json.summary).toBe("Resumen generado.");

    const saved = await prisma.userProfile.findUnique({
      where: { userId_portal: { userId: userWithProfileId, portal: "linkedin" } },
    });
    expect(saved?.headline).toBe("Dev Senior");
  });

  it("overwrites an existing profile for the same user+portal on a second call", async () => {
    mockExecuteStructuredAgent.mockResolvedValueOnce({
      headline: "Primera version",
      summary: "Primer resumen.",
    });
    await POST(postRequest({ userId: userWithProfileId, portal: "bumeran" }));

    mockExecuteStructuredAgent.mockResolvedValueOnce({
      headline: "Segunda version",
      summary: "Segundo resumen.",
    });
    const response = await POST(
      postRequest({ userId: userWithProfileId, portal: "bumeran" })
    );
    expect(response.status).toBe(200);

    const rows = await prisma.userProfile.findMany({
      where: { userId: userWithProfileId, portal: "bumeran" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].headline).toBe("Segunda version");
  });

  it("returns 400 when the user has no rawProfile saved", async () => {
    const response = await POST(
      postRequest({ userId: userWithoutProfileId, portal: "linkedin" })
    );
    expect(response.status).toBe(400);
    expect(mockExecuteStructuredAgent).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid portal", async () => {
    const response = await POST(
      postRequest({ userId: userWithProfileId, portal: "not-a-portal" })
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 when the user does not exist", async () => {
    const response = await POST(
      postRequest({ userId: "does-not-exist", portal: "linkedin" })
    );
    expect(response.status).toBe(404);
  });

  it("returns 500 when the agent call fails", async () => {
    mockExecuteStructuredAgent.mockRejectedValueOnce(new Error("agent down"));
    const response = await POST(
      postRequest({ userId: userWithProfileId, portal: "linkedin" })
    );
    expect(response.status).toBe(500);
  });
});
