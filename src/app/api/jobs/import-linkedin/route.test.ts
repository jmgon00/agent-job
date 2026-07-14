// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
const testUserEmail = `test-import-linkedin-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: testUserEmail } });
  testUserId = user.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: testUserId } });
});

afterEach(async () => {
  await prisma.savedJob.deleteMany({ where: { userId: testUserId } });
});

function importRequest(body: unknown): Request {
  return new Request("http://localhost/api/jobs/import-linkedin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function cardHtml(id: string, title: string, company: string): string {
  return `
    <li>
      <div class="base-card job-search-card">
        <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/${id}?trk=xyz">
          <h3 class="base-search-card__title">${title}</h3>
          <h4 class="base-search-card__subtitle">${company}</h4>
          <div class="base-search-card__metadata">
            <span class="job-search-card__location">Buenos Aires, Argentina</span>
          </div>
        </a>
      </div>
    </li>
  `;
}

describe("POST /api/jobs/import-linkedin", () => {
  it("imports new jobs and skips ones already saved by link", async () => {
    await prisma.savedJob.create({
      data: {
        userId: testUserId,
        title: "Old",
        company: "Old Co",
        portal: "LinkedIn",
        link: "https://www.linkedin.com/jobs/view/999",
        status: "saved",
      },
    });

    const html = `<ul>${cardHtml("999", "Old", "Old Co")}${cardHtml("111", "Frontend Developer", "Mercado Libre")}</ul>`;

    const response = await POST(importRequest({ userId: testUserId, html }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.imported).toBe(1);
    expect(json.duplicates).toBe(1);

    const saved = await prisma.savedJob.findMany({ where: { userId: testUserId } });
    expect(saved).toHaveLength(2);
    const newRow = saved.find((job) => job.link === "https://www.linkedin.com/jobs/view/111");
    expect(newRow?.title).toBe("Frontend Developer");
    expect(newRow?.location).toBe("Buenos Aires, Argentina");
    expect(newRow?.portal).toBe("LinkedIn");
    expect(newRow?.status).toBe("saved");
  });

  it("rejects a missing userId with 400", async () => {
    const response = await POST(importRequest({ html: "<div></div>" }));
    expect(response.status).toBe(400);
  });

  it("rejects a missing html with 400", async () => {
    const response = await POST(importRequest({ userId: testUserId }));
    expect(response.status).toBe(400);
  });

  it("returns imported: 0 without erroring for HTML with no jobs", async () => {
    const response = await POST(
      importRequest({ userId: testUserId, html: "<div>no jobs here</div>" })
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.imported).toBe(0);
    expect(json.duplicates).toBe(0);
    expect(json.unrecognizedCount).toBe(0);
  });
});
