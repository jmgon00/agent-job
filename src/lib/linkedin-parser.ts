import * as cheerio from "cheerio";

export interface ParsedLinkedInJob {
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  link: string;
}

export interface LinkedInParseResult {
  jobs: ParsedLinkedInJob[];
  unrecognizedCount: number;
}

const JOB_VIEW_LINK_RE = /\/jobs\/view\/\d+/;
const SALARY_RE = /(\$\s?[\d.,]+(?:\s?-\s?\$?\s?[\d.,]+)?|\bUSD\b[^,\n]{0,20}|\bARS\b[^,\n]{0,20})/i;
const LOCATION_RE = /remoto|remote|h[ií]brido|hybrid|,\s*[A-ZÁÉÍÓÚÑ]/;

function normalizeJobUrl(href: string): string {
  const absolute = href.startsWith("http")
    ? href
    : `https://www.linkedin.com${href.startsWith("/") ? "" : "/"}${href}`;
  return absolute.split("?")[0];
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseLinkedInHtml(html: string): LinkedInParseResult {
  const $ = cheerio.load(html);
  const jobs: ParsedLinkedInJob[] = [];
  const seenLinks = new Set<string>();
  let unrecognizedCount = 0;

  $(".job-search-card, .base-search-card").each((_, el) => {
    const $card = $(el);
    const href = $card
      .find("a.base-card__full-link, a[href*='/jobs/view/']")
      .first()
      .attr("href");
    if (!href) return;

    const link = normalizeJobUrl(href);
    seenLinks.add(link);
    const title = collapseWhitespace($card.find(".base-search-card__title").first().text());
    const company = collapseWhitespace($card.find(".base-search-card__subtitle").first().text());
    const locationText = collapseWhitespace(
      $card.find(".job-search-card__location").first().text()
    );

    if (!title || !company) {
      unrecognizedCount++;
      return;
    }

    const salaryMatch = collapseWhitespace($card.text()).match(SALARY_RE);

    jobs.push({
      title,
      company,
      location: locationText || null,
      salary: salaryMatch ? salaryMatch[0].trim() : null,
      link,
    });
  });

  $("a[href*='/jobs/view/']").each((_, el) => {
    const $anchor = $(el);
    const href = $anchor.attr("href");
    if (!href || !JOB_VIEW_LINK_RE.test(href)) return;

    const link = normalizeJobUrl(href);
    if (seenLinks.has(link)) return;

    const $li = $anchor.closest("li");
    const $scope = $li.length ? $li : $anchor.parent().parent();

    const texts = Array.from(
      new Set(
        $scope
          .find("*")
          .addBack()
          .contents()
          .filter((_, node) => node.type === "text")
          .map((_, node) => collapseWhitespace($(node).text()))
          .get()
          .filter((text) => text.length > 1)
      )
    );

    if (texts.length < 2) {
      unrecognizedCount++;
      return;
    }

    const title = texts[0];
    const company = texts[1];
    const location = texts.find((text) => LOCATION_RE.test(text) && text !== title && text !== company) ?? null;
    const salaryMatch = collapseWhitespace($scope.text()).match(SALARY_RE);

    seenLinks.add(link);
    jobs.push({
      title,
      company,
      location,
      salary: salaryMatch ? salaryMatch[0].trim() : null,
      link,
    });
  });

  return { jobs, unrecognizedCount };
}
