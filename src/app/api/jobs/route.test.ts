// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
let otherUserId: string;
const testUserEmail = `test-jobs-${Date.now()}@agentjob-test.local`;
const otherUserEmail = `test-jobs-other-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: testUserEmail } });
  testUserId = user.id;
  const other = await prisma.user.create({ data: { email: otherUserEmail } });
  otherUserId = other.id;

  // Created via separate `create()` calls with explicit createdAt values,
  // not a single createMany: Postgres evaluates now() once per statement,
  // so a createMany batch gives every row in it an IDENTICAL createdAt,
  // which breaks the "newest first" ordering assertion below.
  await prisma.savedJob.create({
    data: {
      userId: testUserId,
      title: "Dev 1",
      company: "Acme",
      portal: "linkedin",
      link: "https://x.com/1",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    },
  });
  await prisma.savedJob.create({
    data: {
      userId: testUserId,
      title: "Dev 2",
      company: "Beta",
      portal: "bumeran",
      link: "https://x.com/2",
      createdAt: new Date("2024-01-02T00:00:00.000Z"),
    },
  });
  await prisma.savedJob.create({
    data: {
      userId: otherUserId,
      title: "Other job",
      company: "Gamma",
      portal: "linkedin",
      link: "https://x.com/3",
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [testUserId, otherUserId] } },
  });
});

function getRequest(userId: string | null): Request {
  const url = userId
    ? `http://localhost/api/jobs?userId=${userId}`
    : "http://localhost/api/jobs";
  return new Request(url, { method: "GET" });
}

describe("GET /api/jobs", () => {
  it("returns only the requested user's jobs, newest first", async () => {
    const response = await GET(getRequest(testUserId));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.jobs).toHaveLength(2);
    expect(json.jobs.map((j: { title: string }) => j.title)).toEqual([
      "Dev 2",
      "Dev 1",
    ]);
  });

  it("scopes results to the given user, not other users' jobs", async () => {
    const response = await GET(getRequest(otherUserId));
    const json = await response.json();
    expect(json.jobs).toHaveLength(1);
    expect(json.jobs[0].title).toBe("Other job");
  });

  it("rejects a missing userId with 400", async () => {
    const response = await GET(getRequest(null));
    expect(response.status).toBe(400);
  });
});
