import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const { push, replace, back, searchRef, getHelpIndex, getHelpTopic } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  searchRef: { current: "" },
  getHelpIndex: vi.fn(),
  getHelpTopic: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back }),
  useSearchParams: () => new URLSearchParams(searchRef.current),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getHelpIndex, getHelpTopic };
});

import HelpHomePage from "@/app/help/manual/page";
import HelpTopicPage from "@/app/help/topic/page";
import HelpFaqsPage from "@/app/help/faqs/page";
import HelpAndSupportPage from "@/app/help/page";
import HelpButton from "@/components/help/HelpButton";
import { parseHelpIndex, parseHelpTopic } from "@/lib/api-client/help";
import { useStore } from "@/lib/store";
import indexEn from "./fixtures/help/index.en.json";
import indexHi from "./fixtures/help/index.hi.json";
import pickFeedsEn from "./fixtures/help/topic.pick-feeds.en.json";
import pickFeedsHi from "./fixtures/help/topic.pick-feeds.hi.json";
import calfPlanEn from "./fixtures/help/topic.calf-plan.en.json";

const INDEX_EN = parseHelpIndex(indexEn);
const httpError = (status?: number) =>
  Object.assign(new Error("failed"), status === undefined ? {} : { status });

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  back.mockClear();
  getHelpIndex.mockReset().mockResolvedValue(INDEX_EN);
  getHelpTopic.mockReset().mockResolvedValue(parseHelpTopic(pickFeedsEn));
  searchRef.current = "";
  useStore.setState({ user: null, lastUiLanguage: "en" });
  // jsdom has no scrolling; "Watch this step" scrolls the player into view.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe("Help & Support rows (F3)", () => {
  it("User Manual and FAQs open the help screens", () => {
    render(<HelpAndSupportPage />);
    fireEvent.click(screen.getByText("User Manual"));
    expect(push).toHaveBeenCalledWith("/help/manual");
    fireEvent.click(screen.getByText("FAQs"));
    expect(push).toHaveBeenCalledWith("/help/faqs");
  });
});

describe("HelpButton (❓)", () => {
  it("opens the screen's topic in the profile language, not the screen's (simulation) one", () => {
    useStore.setState({ user: { preferred_language: "vi" } as never });
    render(<HelpButton screen="feed-selection" lang="hi" />);
    fireEvent.click(screen.getByRole("button"));
    expect(push).toHaveBeenCalledWith("/help/topic?screen=feed-selection&lang=vi");
  });
  it("uses the device's last language before sign-in", () => {
    useStore.setState({ user: null, lastUiLanguage: "vi" });
    render(<HelpButton screen="login" floating />);
    fireEvent.click(screen.getByRole("button", { name: "How to" }));
    expect(push).toHaveBeenCalledWith("/help/topic?screen=login&lang=vi");
  });
});

describe("Help home", () => {
  it("shows the Quick start card and the other 12 topics with video pills", async () => {
    render(<HelpHomePage />);
    expect(await screen.findByText("Quick start: from login to report")).toBeInTheDocument();
    for (const topic of INDEX_EN.topics) {
      expect(screen.getByText(topic.title)).toBeInTheDocument();
    }
    expect(screen.getByText("▶ 2:10")).toBeInTheDocument(); // pick-feeds, 130 s
    expect(getHelpIndex).toHaveBeenCalledWith("en");
  });

  it("asks for the profile language and keeps it when opening a topic", async () => {
    useStore.setState({ user: { preferred_language: "hi" } as never });
    render(<HelpHomePage />);
    fireEvent.click(await screen.findByText("Pick feeds and prices"));
    expect(push).toHaveBeenCalledWith("/help/topic?key=pick-feeds&lang=hi");
    expect(getHelpIndex).toHaveBeenCalledWith("hi");
  });

  it("filters topics by the search text", async () => {
    render(<HelpHomePage />);
    await screen.findByText("Pick feeds and prices");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PDF" } });
    expect(screen.getByText("Save, share and reuse reports")).toBeInTheDocument();
    expect(screen.queryByText("Pick feeds and prices")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("No help topics match your search.")).toBeInTheDocument();
  });

  it("shows the not-yet-in-your-language note when fallback is true", async () => {
    getHelpIndex.mockResolvedValue(parseHelpIndex(indexHi));
    render(<HelpHomePage />);
    expect(await screen.findByText("This help is not yet in your language.")).toBeInTheDocument();
  });

  it.each([
    [undefined, "Help needs internet."],
    [503, "Help is not available right now."],
  ])("index failure (status %s) → %s, and Try again retries", async (status, message) => {
    getHelpIndex.mockRejectedValueOnce(httpError(status));
    render(<HelpHomePage />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try again"));
    expect(await screen.findByText("Pick feeds and prices")).toBeInTheDocument();
  });

  it("shows a known notice from a topic that failed, and ignores any other text", async () => {
    searchRef.current = "notice=Help+is+not+available+right+now.";
    const { unmount } = render(<HelpHomePage />);
    expect(await screen.findByText("Help is not available right now.")).toBeInTheDocument();
    unmount();
    searchRef.current = "notice=Call+0800+now";
    render(<HelpHomePage />);
    await screen.findByText("Pick feeds and prices");
    expect(screen.queryByText("Call 0800 now")).not.toBeInTheDocument();
  });
});

describe("Topic screen", () => {
  it("❓ key → the map's topic, with the screen's related topics", async () => {
    searchRef.current = "screen=feed-selection&lang=en";
    render(<HelpTopicPage />);
    expect(
      await screen.findByRole("heading", { name: "Pick feeds and prices" })
    ).toBeInTheDocument();
    expect(getHelpTopic).toHaveBeenCalledWith("pick-feeds", "en");
    expect(screen.getByText("Also on this screen")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Your own feeds"));
    expect(push).toHaveBeenCalledWith("/help/topic?key=own-feeds&lang=en");
  });

  it("renders steps, the problems box and Next topic; text stays plain", async () => {
    searchRef.current = "key=pick-feeds";
    render(<HelpTopicPage />);
    await screen.findByText("Steps");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    // "\n" is a line break inside one text node, never markup.
    expect(
      screen.getByText(/Add more feeds\. Include at least one forage\.\s+Tip:/)
    ).toBeInTheDocument();
    expect(screen.getByText("Common problems")).toBeInTheDocument();
    expect(screen.getByText("A feed is refused by name")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Get a least-cost diet and read the report →"));
    expect(push).toHaveBeenCalledWith("/help/topic?key=get-diet&lang=en");
    fireEvent.click(screen.getByText("All topics"));
    expect(push).toHaveBeenCalledWith("/help/manual?lang=en");
  });

  it("image: null → step text only; images go through the proxy", async () => {
    searchRef.current = "key=pick-feeds";
    const { container } = render(<HelpTopicPage />);
    await screen.findByText("Steps");
    const items = screen.getAllByRole("listitem");
    expect(items[3]?.querySelector("img")).toBeNull();
    expect(items[0]?.querySelector("img")?.getAttribute("src")).toBe(
      "/api/proxy/v1/help/media/en/pick-feeds-1.webp?v=1a2b3c"
    );
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("▶ starts the no-cookie player; Watch this step starts it at that second", async () => {
    searchRef.current = "key=pick-feeds&lang=en";
    const { container } = render(<HelpTopicPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Play video" }));
    let src = container.querySelector("iframe")?.getAttribute("src") ?? "";
    expect(src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/AbCdEfGhIj0\?/);
    expect(src).toContain("start=0");
    expect(src).toContain("cc_lang_pref=en");
    expect(src).toContain("rel=0");
    const watch = screen.getAllByText(/Watch this step/);
    expect(watch).toHaveLength(4);
    fireEvent.click(watch[2] as HTMLElement);
    src = container.querySelector("iframe")?.getAttribute("src") ?? "";
    expect(src).toContain("start=48");
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("allow")).toBe(
      "autoplay; fullscreen; picture-in-picture; encrypted-media"
    );
    expect(iframe?.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
  });

  it("the poster and the player sit in a tall 9:16 box (N21: Shorts)", async () => {
    searchRef.current = "key=pick-feeds";
    const { container } = render(<HelpTopicPage />);
    const poster = await screen.findByRole("button", { name: "Play video" });
    expect(poster.style.aspectRatio).toBe("9 / 16");
    // calc(75dvh * 9 / 16), which the browser reduces: never taller than 75% of the screen.
    expect(poster.style.width).toBe("min(100%, 42.1875dvh)");
    fireEvent.click(poster);
    const box = container.querySelector("iframe")?.parentElement;
    expect(box?.style.aspectRatio).toBe("9 / 16");
    expect(box?.style.margin).toBe("0px auto");
  });

  it("video: null → steps only (no player, no Watch this step, no problems box)", async () => {
    getHelpTopic.mockResolvedValue(parseHelpTopic(calfPlanEn));
    searchRef.current = "screen=calf-plan";
    render(<HelpTopicPage />);
    await screen.findByText("Steps");
    expect(screen.queryByRole("button", { name: "Play video" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Watch this step/)).not.toBeInTheDocument();
    expect(screen.queryByText("Common problems")).not.toBeInTheDocument();
    // From ❓ the screen's related list (empty for calf-plan) wins over the topic's.
    expect(screen.queryByText("Also on this screen")).not.toBeInTheDocument();
  });

  it("fallback topic → content plus the note", async () => {
    getHelpTopic.mockResolvedValue(parseHelpTopic(pickFeedsHi));
    useStore.setState({ user: { preferred_language: "hi" } as never });
    searchRef.current = "key=pick-feeds&lang=hi";
    render(<HelpTopicPage />);
    expect(await screen.findByText("चारा और कीमतें चुनें")).toBeInTheDocument();
    expect(getHelpTopic).toHaveBeenCalledWith("pick-feeds", "hi");
  });

  it("unknown screen key → Help home", async () => {
    searchRef.current = "screen=nowhere&lang=en";
    render(<HelpTopicPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/help/manual?lang=en"));
    expect(getHelpTopic).not.toHaveBeenCalled();
  });

  it("index failure on ❓ → Help home", async () => {
    getHelpIndex.mockRejectedValue(httpError(503));
    searchRef.current = "screen=feed-selection";
    render(<HelpTopicPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/help/manual?lang=en"));
  });

  it("404 topic → Help home; 503 → Help home with the message", async () => {
    getHelpTopic.mockRejectedValueOnce(httpError(404));
    searchRef.current = "key=gone";
    const { unmount } = render(<HelpTopicPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/help/manual?lang=en"));
    unmount();
    replace.mockClear();
    getHelpTopic.mockRejectedValueOnce(httpError(503));
    render(<HelpTopicPage />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/help/manual?lang=en&notice=Help+is+not+available+right+now."
      )
    );
  });

  it("Back returns to the screen it came from", async () => {
    searchRef.current = "key=pick-feeds";
    render(<HelpTopicPage />);
    await screen.findByText("Steps");
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(back).toHaveBeenCalled();
  });
});

describe("FAQ list", () => {
  it("lists every FAQ; an answer with a topic links to it", async () => {
    searchRef.current = "lang=en";
    render(<HelpFaqsPage />);
    expect(await screen.findByText('My report shows "PDF Pending".')).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
    const card = screen.getByText("How do I contact the RationSmart team?").parentElement;
    expect(within(card as HTMLElement).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByText("No diet found? →"));
    expect(push).toHaveBeenCalledWith("/help/topic?key=troubleshooting&lang=en");
  });

  it("offline → Help needs internet.", async () => {
    getHelpIndex.mockRejectedValueOnce(httpError());
    render(<HelpFaqsPage />);
    expect(await screen.findByText("Help needs internet.")).toBeInTheDocument();
  });
});

describe("Help language = profile language", () => {
  it("ignores a ?lang= that differs from the profile language", async () => {
    useStore.setState({ user: { preferred_language: "hi" } as never });
    searchRef.current = "lang=vi";
    render(<HelpHomePage />);
    await screen.findByText("Pick feeds and prices");
    expect(getHelpIndex).toHaveBeenCalledWith("hi");
    expect(getHelpIndex).not.toHaveBeenCalledWith("vi");
  });
});
