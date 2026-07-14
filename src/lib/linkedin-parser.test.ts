import { describe, it, expect } from "vitest";
import { parseLinkedInHtml } from "./linkedin-parser";

describe("parseLinkedInHtml", () => {
  it("extracts a job from the known public job-search-card structure, stripping tracking params from the link", () => {
    const html = `
      <ul>
        <li>
          <div class="base-card job-search-card">
            <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/111?refId=abc&trk=xyz">
              <h3 class="base-search-card__title">Frontend Developer</h3>
              <h4 class="base-search-card__subtitle">Mercado Libre</h4>
              <div class="base-search-card__metadata">
                <span class="job-search-card__location">Buenos Aires, Argentina</span>
              </div>
            </a>
          </div>
        </li>
      </ul>
    `;

    const result = parseLinkedInHtml(html);

    expect(result.unrecognizedCount).toBe(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toEqual({
      title: "Frontend Developer",
      company: "Mercado Libre",
      location: "Buenos Aires, Argentina",
      salary: null,
      link: "https://www.linkedin.com/jobs/view/111",
    });
  });

  it("falls back to the href-based heuristic when the card uses unrecognized (obfuscated) classes", () => {
    const html = `
      <li>
        <div class="abc123 def456">
          <a href="/jobs/view/222">
            <div class="xh12">
              <span>Backend Engineer (Node.js)</span>
              <span>Globant</span>
              <span>Ciudad Autonoma de Buenos Aires, Argentina</span>
            </div>
          </a>
        </div>
      </li>
    `;

    const result = parseLinkedInHtml(html);

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].title).toBe("Backend Engineer (Node.js)");
    expect(result.jobs[0].company).toBe("Globant");
    expect(result.jobs[0].location).toBe("Ciudad Autonoma de Buenos Aires, Argentina");
    expect(result.jobs[0].link).toBe("https://www.linkedin.com/jobs/view/222");
  });

  it("counts a card with fewer than two usable text values as unrecognized, not as a job", () => {
    const html = `
      <li>
        <a href="/jobs/view/333">
          <span>OnlyOneText</span>
        </a>
      </li>
    `;

    const result = parseLinkedInHtml(html);

    expect(result.jobs).toEqual([]);
    expect(result.unrecognizedCount).toBe(1);
  });

  it("returns no jobs and no unrecognized count for HTML with no job links at all", () => {
    const html = `<div><p>No hay vacantes aca.</p></div>`;

    const result = parseLinkedInHtml(html);

    expect(result.jobs).toEqual([]);
    expect(result.unrecognizedCount).toBe(0);
  });
});
