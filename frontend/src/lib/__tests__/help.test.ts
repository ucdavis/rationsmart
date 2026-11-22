import { describe, it, expect, vi, beforeEach } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api-client/client", () => ({ api: { get } }));

import {
  checkHelpGuide,
  clearHelpIndexCache,
  getAdminHelpIndex,
  getAdminHelpTopic,
  getHelpIndex,
  getHelpTopic,
  helpMediaUrl,
  parseHelpIndex,
  parseHelpTopic,
} from "@/lib/api-client/help";
import {
  formatVideoLength,
  helpFaqsHref,
  helpGuideHref,
  helpHomeHref,
  helpScreenHref,
  helpTopicHref,
  reportHelpScreen,
} from "@/lib/help";
import indexEn from "@/app/__tests__/fixtures/help/index.en.json";
import indexHi from "@/app/__tests__/fixtures/help/index.hi.json";
import pickFeedsEn from "@/app/__tests__/fixtures/help/topic.pick-feeds.en.json";
import calfPlanEn from "@/app/__tests__/fixtures/help/topic.calf-plan.en.json";

beforeEach(() => {
  get.mockReset();
  clearHelpIndexCache();
});

describe("reportHelpScreen (contract §3 Report key rule)", () => {
  it("evaluation → report.evaluation, whatever the rating", () => {
    expect(reportHelpScreen("evaluation", "INFEASIBLE")).toBe("report.evaluation");
  });
  it("INFEASIBLE recommendation → report.no-diet (any case)", () => {
    expect(reportHelpScreen("recommendation", "INFEASIBLE")).toBe("report.no-diet");
    expect(reportHelpScreen("recommendation", "infeasible")).toBe("report.no-diet");
  });
  it("any other recommendation → report.recommendation", () => {
    expect(reportHelpScreen("recommendation", "OPTIMAL")).toBe("report.recommendation");
    expect(reportHelpScreen("recommendation", null)).toBe("report.recommendation");
    expect(reportHelpScreen(undefined, undefined)).toBe("report.recommendation");
  });
});

describe("help links", () => {
  it("builds the help routes with only the params that are set", () => {
    expect(helpHomeHref()).toBe("/help/manual");
    expect(helpHomeHref("hi")).toBe("/help/manual?lang=hi");
    expect(helpFaqsHref("en")).toBe("/help/faqs?lang=en");
    expect(helpTopicHref("pick-feeds", "vi")).toBe("/help/topic?key=pick-feeds&lang=vi");
    expect(helpScreenHref("report.no-diet", "en")).toBe(
      "/help/topic?screen=report.no-diet&lang=en"
    );
  });
  it("builds the printable guide link (N16)", () => {
    expect(helpGuideHref("full", "hi")).toBe("/api/proxy/v1/help/guide?edition=full&lang=hi");
    expect(helpGuideHref("quick")).toBe("/api/proxy/v1/help/guide?edition=quick");
  });
  it("formats video lengths as m:ss", () => {
    expect(formatVideoLength(130)).toBe("2:10");
    expect(formatVideoLength(65)).toBe("1:05");
    expect(formatVideoLength(0)).toBe("0:00");
  });
});

describe("parseHelpIndex", () => {
  it("keeps all 13 topics in number order and all 15 screen keys", () => {
    const index = parseHelpIndex(indexEn);
    expect(index.topics).toHaveLength(13);
    expect(index.topics.map((t) => t.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(Object.keys(index.screens)).toHaveLength(15);
    expect(index.screens["feed-selection"]).toEqual({
      topic: "pick-feeds",
      related: ["own-feeds", "limits"],
    });
    expect(index.quick_start).toBe("quick-start");
    expect(index.fallback).toBe(false);
    expect(index.faqs[3]?.topic).toBeNull();
  });
  it("reads fallback and the served language", () => {
    const index = parseHelpIndex(indexHi);
    expect(index.language).toBe("hi");
    expect(index.fallback).toBe(true);
  });
  it("degrades a broken body to an empty index instead of crashing", () => {
    const index = parseHelpIndex("oops");
    expect(index.topics).toEqual([]);
    expect(index.screens).toEqual({});
    expect(index.language).toBe("en");
  });
});

describe("parseHelpTopic", () => {
  it("reads video, steps, problems, related and next", () => {
    const topic = parseHelpTopic(pickFeedsEn);
    expect(topic.video?.youtube_id).toBe("AbCdEfGhIj0");
    expect(topic.video?.chapters).toHaveLength(4);
    expect(topic.steps).toHaveLength(4);
    expect(topic.steps[3]?.image).toBeNull();
    expect(topic.steps[2]?.video_start).toBe(48);
    expect(topic.problems).toHaveLength(2);
    expect(topic.next).toBe("get-diet");
  });
  it("video: null stays null; video_start: null stays null", () => {
    const topic = parseHelpTopic(calfPlanEn);
    expect(topic.video).toBeNull();
    expect(topic.steps[0]?.video_start).toBeNull();
    expect(topic.problems).toEqual([]);
  });
  it("drops a video whose id isn't a YouTube id (it would go into the iframe URL)", () => {
    const bad = { ...pickFeedsEn, video: { ...pickFeedsEn.video, youtube_id: "x/../evil" } };
    expect(parseHelpTopic(bad).video).toBeNull();
  });
});

describe("helpMediaUrl", () => {
  it("prefixes /api/proxy to backend help-media paths only", () => {
    expect(helpMediaUrl("/v1/help/media/en/a.webp?v=1")).toBe(
      "/api/proxy/v1/help/media/en/a.webp?v=1"
    );
    expect(helpMediaUrl(null)).toBeNull();
    expect(helpMediaUrl("https://evil.example/a.png")).toBeNull();
    expect(helpMediaUrl("/v1/help/media/../../auth/me")).toBeNull();
    // N19: Admin Manual images.
    expect(helpMediaUrl("/v1/admin/help/media/en/admin-users-01.webp?v=1")).toBe(
      "/api/proxy/v1/admin/help/media/en/admin-users-01.webp?v=1"
    );
    expect(helpMediaUrl("/v1/admin/help/media/../../admin/users")).toBeNull();
  });
});

describe("getHelpIndex / getHelpTopic", () => {
  it("fetches the index once per language and sends ?lang=", async () => {
    get.mockResolvedValue({ data: indexEn });
    await getHelpIndex("en");
    await getHelpIndex("en");
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/v1/help/index", { params: { lang: "en" } });
    get.mockResolvedValue({ data: indexHi });
    await getHelpIndex("hi");
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("doesn't keep a failed index, so the next open retries", async () => {
    get.mockRejectedValueOnce(new Error("offline"));
    await expect(getHelpIndex("en")).rejects.toThrow("offline");
    get.mockResolvedValueOnce({ data: indexEn });
    await expect(getHelpIndex("en")).resolves.toMatchObject({ quick_start: "quick-start" });
  });
  it("gets a topic by key and refuses a malformed key without a request", async () => {
    get.mockResolvedValue({ data: pickFeedsEn });
    await expect(getHelpTopic("pick-feeds", "en")).resolves.toMatchObject({ key: "pick-feeds" });
    expect(get).toHaveBeenCalledWith("/v1/help/topics/pick-feeds", { params: { lang: "en" } });
    get.mockClear();
    await expect(getHelpTopic("../admin", "en")).rejects.toMatchObject({ status: 404 });
    expect(get).not.toHaveBeenCalled();
  });
  it("checks the printable guide as a blob with edition and lang (N16)", async () => {
    get.mockResolvedValue({ data: new Blob() });
    await expect(checkHelpGuide("quick", "en")).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledWith("/v1/help/guide", {
      params: { edition: "quick", lang: "en" },
      responseType: "blob",
    });
  });
});

describe("Admin Manual (N19)", () => {
  it("asks the admin endpoints with no lang and reads audience: admin", async () => {
    const { default: adminIndex } =
      await import("@/app/__tests__/fixtures/help/admin-index.en.json");
    get.mockResolvedValue({ data: adminIndex });
    const index = await getAdminHelpIndex();
    expect(get).toHaveBeenCalledWith("/v1/admin/help/index");
    expect(index.topics).toHaveLength(8);
    expect(index.topics[0]?.audience).toBe("admin");
    expect(index.screens).toEqual({});
    expect(index.faqs).toEqual([]);
  });
  it("is not cached: every call asks again", async () => {
    get.mockResolvedValue({ data: {} });
    await getAdminHelpIndex();
    await getAdminHelpIndex();
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("gets a topic by key and refuses a malformed key without a request", async () => {
    const { default: users } =
      await import("@/app/__tests__/fixtures/help/admin-topic.admin-users.en.json");
    get.mockResolvedValue({ data: users });
    await expect(getAdminHelpTopic("admin-users")).resolves.toMatchObject({ key: "admin-users" });
    expect(get).toHaveBeenCalledWith("/v1/admin/help/topics/admin-users");
    get.mockClear();
    await expect(getAdminHelpTopic("../users")).rejects.toMatchObject({ status: 404 });
    expect(get).not.toHaveBeenCalled();
  });
});
