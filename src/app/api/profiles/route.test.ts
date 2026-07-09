// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
const testUserEmail = `test-profiles-get-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: testUserEmail, rawProfile: "Desarrollador con 5 anios de experiencia." },
  });
  testUserId = user.id;
  await prisma.userProfile.create({
    data: {
      userId: testUserId,
      portal: "linkedin",
      headline: "Dev Senior",
      summary: "Resumen existente.",
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: testUserId } });
});

function getRequest(query: string): Request {
  return new Request(`http://localhost/api/profiles${query}`);
}

describe("GET /api/profiles", () => {
  it("returns the raw profile and existing portal profiles for the user", async () => {
    const response = await GET(getRequest(`?userId=${testUserId}`));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.rawProfile).toBe("Desarrollador con 5 anios de experiencia.");
    expect(json.profiles).toHaveLength(1);
    expect(json.profiles[0]).toMatchObject({ portal: "linkedin", headline: "Dev Senior" });
  });

  it("returns 400 when userId is missing", async () => {
    const response = await GET(getRequest(""));
    expect(response.status).toBe(400);
  });

  it("returns 404 when the user does not exist", async () => {
    const response = await GET(getRequest("?userId=does-not-exist"));
    expect(response.status).toBe(404);
  });
});
