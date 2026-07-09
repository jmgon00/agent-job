// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PATCH } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
let otherUserId: string;
let jobId: string;
const testUserEmail = `test-jobs-patch-${Date.now()}@agentjob-test.local`;
const otherUserEmail = `test-jobs-patch-other-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: testUserEmail } });
  testUserId = user.id;
  const other = await prisma.user.create({ data: { email: otherUserEmail } });
  otherUserId = other.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [testUserId, otherUserId] } },
  });
});

beforeEach(async () => {
  const job = await prisma.savedJob.create({
    data: {
      userId: testUserId,
      title: "Dev",
      company: "Acme",
      portal: "linkedin",
      link: "https://x.com/1",
    },
  });
  jobId = job.id;
});

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/jobs/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/jobs/[id]", () => {
  it("updates the status when the job belongs to the given user", async () => {
    const response = await PATCH(patchRequest({ userId: testUserId, status: "applied" }), {
      params: Promise.resolve({ id: jobId }),
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("applied");

    const saved = await prisma.savedJob.findUnique({ where: { id: jobId } });
    expect(saved?.status).toBe("applied");
  });

  it("rejects an invalid status value with 400 before writing", async () => {
    const response = await PATCH(
      patchRequest({ userId: testUserId, status: "not-a-real-status" }),
      { params: Promise.resolve({ id: jobId }) }
    );
    expect(response.status).toBe(400);

    const saved = await prisma.savedJob.findUnique({ where: { id: jobId } });
    expect(saved?.status).toBe("saved");
  });

  it("returns 404 and makes no change when the job belongs to a different user", async () => {
    const response = await PATCH(patchRequest({ userId: otherUserId, status: "applied" }), {
      params: Promise.resolve({ id: jobId }),
    });
    expect(response.status).toBe(404);

    const saved = await prisma.savedJob.findUnique({ where: { id: jobId } });
    expect(saved?.status).toBe("saved");
  });
});
