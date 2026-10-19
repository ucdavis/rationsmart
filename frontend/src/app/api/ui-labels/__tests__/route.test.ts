// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET, generateStaticParams } from "@/app/api/ui-labels/[lang]/route";

const get = (lang: string) =>
  GET(new Request(`http://localhost/api/ui-labels/${lang}`), { params: { lang } });

describe("/api/ui-labels/[lang]", () => {
  it("builds one static page per language column of the spreadsheet", async () => {
    const params = await generateStaticParams();
    expect(params).toEqual(
      ["hi", "tl", "id", "th", "vi", "bn", "ne", "am", "om"].map((lang) => ({ lang }))
    );
  });

  it("serves a language's column as { English: translation }", async () => {
    const res = await get("hi");
    expect(res.status).toBe(200);
    const dict = (await res.json()) as Record<string, string>;
    expect(dict["Continue"]).toBe("जारी रखें");
    expect(Object.keys(dict).length).toBeGreaterThan(800);
  });

  it("404s a code with no column, and anything that isn't a code", async () => {
    expect((await get("fr")).status).toBe(404);
    expect((await get("..%2Fhi")).status).toBe(404);
  });
});
