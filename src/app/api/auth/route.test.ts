// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/db";

const testEmails: string[] = [];

function uniqueEmail(): string {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@agentjob-test.local`;
  testEmails.push(email);
  return email;
}

afterEach(async () => {
  if (testEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    testEmails.length = 0;
  }
});

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth", () => {
  it("creates a new user for a new email", async () => {
    const email = uniqueEmail();
    const response = await POST(postRequest({ email }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.email).toBe(email);
    expect(typeof json.id).toBe("string");
  });

  it("returns the same user id on a second call with the same email", async () => {
    const email = uniqueEmail();
    const first = await POST(postRequest({ email }));
    const firstJson = await first.json();
    const second = await POST(postRequest({ email }));
    const secondJson = await second.json();
    expect(secondJson.id).toBe(firstJson.id);
  });

  it("rejects an invalid email with 400", async () => {
    const response = await POST(postRequest({ email: "not-an-email" }));
    expect(response.status).toBe(400);
  });

  it("rejects a missing email field with 400", async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(400);
  });
});
