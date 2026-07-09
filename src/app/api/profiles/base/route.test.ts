// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PUT } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
const testUserEmail = `test-profiles-base-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: testUserEmail } });
  testUserId = user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: testUserId } });
});

function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/profiles/base", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/profiles/base", () => {
  it("saves the raw profile text for the user", async () => {
    const response = await PUT(
      putRequest({ userId: testUserId, rawProfile: "Mi experiencia y skills." })
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.rawProfile).toBe("Mi experiencia y skills.");

    const saved = await prisma.user.findUnique({ where: { id: testUserId } });
    expect(saved?.rawProfile).toBe("Mi experiencia y skills.");
  });

  it("rejects an empty rawProfile with 400", async () => {
    const response = await PUT(putRequest({ userId: testUserId, rawProfile: "" }));
    expect(response.status).toBe(400);
  });

  it("rejects a missing userId with 400", async () => {
    const response = await PUT(putRequest({ rawProfile: "Texto." }));
    expect(response.status).toBe(400);
  });

  it("returns 404 when the user does not exist", async () => {
    const response = await PUT(
      putRequest({ userId: "does-not-exist", rawProfile: "Texto." })
    );
    expect(response.status).toBe(404);
  });
});
