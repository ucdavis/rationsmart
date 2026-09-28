import { describe, it, expect } from "vitest";
import { safeExternalUrl, isSameOrigin } from "@/lib/safe-url";
import {
  filenameFromContentDisposition,
  uploadFileProblem,
  MAX_UPLOAD_BYTES,
} from "@/lib/download";

describe("safeExternalUrl (audit A-07)", () => {
  it("accepts https URLs and refuses plain-http third-party ones", () => {
    expect(safeExternalUrl("https://bucket.example.com/r.pdf")?.href).toBe(
      "https://bucket.example.com/r.pdf"
    );
    expect(safeExternalUrl("http://bucket.example.com/r.pdf")).toBeNull();
  });

  it("upgrades http S3 links to https", () => {
    expect(safeExternalUrl("http://b.s3.ap-southeast-2.amazonaws.com/r.pdf")?.href).toBe(
      "https://b.s3.ap-southeast-2.amazonaws.com/r.pdf"
    );
  });

  it("rejects script-bearing and non-web schemes", () => {
    for (const bad of [
      "javascript:alert(1)",
      " JavaScript:alert(1)",
      "data:text/html,x",
      "vbscript:x",
    ]) {
      expect(safeExternalUrl(bad)).toBeNull();
    }
  });

  it("rejects empty and non-string input", () => {
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(42)).toBeNull();
  });

  it("compares origins exactly, not by prefix", () => {
    // Starts with this origin's scheme + host, but is a different host.
    const { hostname } = window.location;
    const lookalike = safeExternalUrl(`https://${hostname}.evil.example/x`)!;
    expect(isSameOrigin(lookalike)).toBe(false);
    expect(isSameOrigin(safeExternalUrl("/files/x.xlsx")!)).toBe(true);
  });
});

describe("filenameFromContentDisposition (audit B-15)", () => {
  it("reads plain and RFC 5987 filenames", () => {
    expect(filenameFromContentDisposition('attachment; filename="feeds.xlsx"', "x")).toBe(
      "feeds.xlsx"
    );
    expect(
      filenameFromContentDisposition("attachment; filename*=UTF-8''f%C3%A9eds.xlsx", "x")
    ).toBe("féeds.xlsx");
  });

  it("does not throw on malformed percent-encoding", () => {
    expect(filenameFromContentDisposition('attachment; filename="100%.xlsx"', "x")).toBe(
      "100%.xlsx"
    );
  });

  it("falls back when missing or when the name contains a path", () => {
    expect(filenameFromContentDisposition(undefined, "fallback.xlsx")).toBe("fallback.xlsx");
    expect(filenameFromContentDisposition('attachment; filename="../x.xlsx"', "f.xlsx")).toBe(
      "f.xlsx"
    );
  });
});

describe("uploadFileProblem (audit A-22)", () => {
  const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

  it("accepts an allowed extension within the size limit", () => {
    expect(uploadFileProblem(file("feeds.XLSX", 10), [".xlsx"])).toBeNull();
  });

  it("rejects the wrong extension, empty files and oversized files", () => {
    expect(uploadFileProblem(file("feeds.exe", 10), [".xlsx"])).toMatch(/xlsx/);
    expect(uploadFileProblem(file("feeds.xlsx", 0), [".xlsx"])).toMatch(/empty/);
    expect(uploadFileProblem(file("feeds.xlsx", MAX_UPLOAD_BYTES + 1), [".xlsx"])).toMatch(
      /too large/
    );
  });
});
