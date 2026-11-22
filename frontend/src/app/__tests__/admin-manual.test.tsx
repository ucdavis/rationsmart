import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const { push, replace, back, searchRef, getAdminHelpIndex, getAdminHelpTopic, getHelpIndex } =
  vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    searchRef: { current: "" },
    getAdminHelpIndex: vi.fn(),
    getAdminHelpTopic: vi.fn(),
    getHelpIndex: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back }),
  useSearchParams: () => new URLSearchParams(searchRef.current),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getAdminHelpIndex, getAdminHelpTopic, getHelpIndex };
});

import AdminLayout from "@/app/(main)/admin/layout";
import AdminManualPage from "@/app/(main)/admin/manual/page";
import AdminManualTopicPage from "@/app/(main)/admin/manual/topic/page";
import { parseHelpIndex, parseHelpTopic } from "@/lib/api-client/help";
import { useStore, type User } from "@/lib/store";
import adminIndex from "./fixtures/help/admin-index.en.json";
import adminTour from "./fixtures/help/admin-topic.admin-tour.en.json";
import adminUsers from "./fixtures/help/admin-topic.admin-users.en.json";

// N19. Fixtures are the backend's own answers (services.help_content, admin
// content), so the shapes match /v1/admin/help on Test.
const INDEX = parseHelpIndex(adminIndex);
const USERS = parseHelpTopic(adminUsers);
const httpError = (status?: number) =>
  Object.assign(new Error("failed"), status === undefined ? {} : { status });

const admin = (over: Partial<User> = {}) =>
  ({ id: "a-1", is_admin: true, preferred_language: "en", ...over }) as User;

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  back.mockClear();
  getAdminHelpIndex.mockReset().mockResolvedValue(INDEX);
  getAdminHelpTopic.mockReset().mockResolvedValue(USERS);
  getHelpIndex.mockReset();
  searchRef.current = "";
  useStore.setState({ user: admin(), lastUiLanguage: "en" });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe("Admin Manual list", () => {
  it("shows the Admin tour hero and topics 1–7 with video lengths, from the admin endpoint", async () => {
    render(<AdminManualPage />);
    expect(await screen.findByText("Admin tour: what admins do")).toBeInTheDocument();
    expect(screen.getByText("Admin Manual")).toBeInTheDocument();
    for (const title of [
      "Manage users",
      "Manage shared feeds",
      "Upload, download and delete feeds in bulk",
      "Sync feeds from CLIMDES",
      "Countries and languages",
      "Local feed names",
      "Reports and feedback",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText("▶ 1:08")).toBeInTheDocument(); // hero, 68 s
    expect(screen.getAllByText("▶ 1:09")).toHaveLength(2); // Manage users, Countries: 69 s
    expect(getAdminHelpIndex).toHaveBeenCalled();
    // The public manual is never asked.
    expect(getHelpIndex).not.toHaveBeenCalled();
  });

  it("search matches title and summary and hides the hero", async () => {
    render(<AdminManualPage />);
    await screen.findByText("Admin tour: what admins do");
    const search = screen.getByRole("searchbox", { name: "Search help…" });
    fireEvent.change(search, { target: { value: "climdes" } });
    expect(screen.getByText("Sync feeds from CLIMDES")).toBeInTheDocument();
    expect(screen.queryByText("Manage users")).toBeNull();
    // A summary-only match ("Excel file" is in the bulk topic's summary).
    fireEvent.change(search, { target: { value: "excel file" } });
    expect(screen.getByText("Upload, download and delete feeds in bulk")).toBeInTheDocument();
    expect(screen.queryByText("Quick start")).toBeNull();
  });

  it("opens topics inside the Admin Manual, never /help", async () => {
    render(<AdminManualPage />);
    fireEvent.click(await screen.findByText("Admin tour: what admins do"));
    expect(push).toHaveBeenLastCalledWith("/admin/manual/topic?key=admin-tour");
    fireEvent.click(screen.getByText("Manage users"));
    expect(push).toHaveBeenLastCalledWith("/admin/manual/topic?key=admin-users");
    expect(push.mock.calls.flat().some((href) => String(href).startsWith("/help"))).toBe(false);
  });

  it("Hindi app language: Hindi labels, English content, no fallback note", async () => {
    useStore.setState({ user: admin({ preferred_language: "hi" }) });
    getAdminHelpIndex.mockResolvedValue({ ...INDEX, fallback: true });
    render(<AdminManualPage />);
    expect(await screen.findByText("प्रशासक मार्गदर्शिका")).toBeInTheDocument();
    expect(screen.getByText("Manage users")).toBeInTheDocument();
    expect(screen.queryByText("यह सहायता अभी आपकी भाषा में उपलब्ध नहीं है।")).toBeNull();
    expect(screen.queryByText("This help is not yet in your language.")).toBeNull();
  });

  it.each([
    [503, "Help is not available right now."],
    [undefined, "Help needs internet."],
  ])("index error %s shows the help message with Try again", async (status, message) => {
    getAdminHelpIndex.mockRejectedValueOnce(httpError(status));
    render(<AdminManualPage />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try again"));
    expect(await screen.findByText("Admin tour: what admins do")).toBeInTheDocument();
    expect(getAdminHelpIndex).toHaveBeenCalledTimes(2);
  });

  it("shows a topic's error notice when sent back from a topic", async () => {
    searchRef.current = "notice=Help+is+not+available+right+now.";
    render(<AdminManualPage />);
    expect(await screen.findByText("Help is not available right now.")).toBeInTheDocument();
  });

  it("is fetched again on every visit (nothing kept for the next user)", async () => {
    const first = render(<AdminManualPage />);
    await screen.findByText("Admin tour: what admins do");
    first.unmount();
    render(<AdminManualPage />);
    await screen.findByText("Admin tour: what admins do");
    expect(getAdminHelpIndex).toHaveBeenCalledTimes(2);
  });

  it("a non-admin is sent to Cattle Info and sees nothing", () => {
    useStore.setState({ user: admin({ is_admin: false }) });
    render(
      <AdminLayout>
        <AdminManualPage />
      </AdminLayout>
    );
    expect(replace).toHaveBeenCalledWith("/cattle-info");
    expect(screen.queryByText("Admin Manual")).toBeNull();
    expect(getAdminHelpIndex).not.toHaveBeenCalled();
  });
});

describe("Admin Manual topic", () => {
  it("shows the poster, steps with admin images, Watch this step, problems and navigation", async () => {
    searchRef.current = "key=admin-users";
    render(<AdminManualTopicPage />);
    expect(await screen.findByRole("heading", { name: "Manage users" })).toBeInTheDocument();
    expect(getAdminHelpTopic).toHaveBeenCalledWith("admin-users");
    expect(screen.getByText("User Management")).toBeInTheDocument(); // screen label
    expect(screen.getByRole("button", { name: "Play video" })).toBeInTheDocument();

    const steps = within(screen.getByRole("list"));
    expect(steps.getAllByRole("listitem")).toHaveLength(5);
    const images = document.querySelectorAll("ol img");
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.getAttribute("src")).toMatch(/^\/api\/proxy\/v1\/admin\/help\/media\/en\//);
    }
    expect(screen.getAllByText(/Watch this step/).length).toBeGreaterThan(0);
    expect(screen.getByText(/deactivate your own account/)).toBeInTheDocument();

    // Every link stays in the Admin Manual.
    fireEvent.click(await screen.findByText("Manage shared feeds →"));
    expect(push).toHaveBeenLastCalledWith("/admin/manual/topic?key=admin-feeds");
    fireEvent.click(screen.getByText("Admin tour: what admins do"));
    expect(push).toHaveBeenLastCalledWith("/admin/manual/topic?key=admin-tour");
    fireEvent.click(screen.getByText("All topics"));
    expect(push).toHaveBeenLastCalledWith("/admin/manual");
  });

  it("Watch this step plays the no-cookie player from that step", async () => {
    searchRef.current = "key=admin-users";
    render(<AdminManualTopicPage />);
    fireEvent.click((await screen.findAllByText(/Watch this step/))[0]!);
    const frame = document.querySelector("iframe");
    expect(frame?.getAttribute("src")).toMatch(
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}\?start=10&/
    );
  });

  it("a topic with no video shows steps only", async () => {
    getAdminHelpTopic.mockResolvedValue({ ...parseHelpTopic(adminTour), video: null });
    searchRef.current = "key=admin-tour";
    render(<AdminManualTopicPage />);
    expect(await screen.findByRole("heading", { name: "Admin tour: what admins do" }));
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Play video" })).toBeNull();
    expect(screen.queryByText(/Watch this step/)).toBeNull();
  });

  it("Hindi labels, English content, no fallback note", async () => {
    useStore.setState({ user: admin({ preferred_language: "hi" }) });
    getAdminHelpTopic.mockResolvedValue({ ...USERS, fallback: true });
    searchRef.current = "key=admin-users";
    render(<AdminManualTopicPage />);
    expect(await screen.findByText("चरण")).toBeInTheDocument(); // Steps
    expect(screen.getByText("उपयोगकर्ता प्रबंधन")).toBeInTheDocument(); // User Management
    expect(screen.getByRole("heading", { name: "Manage users" })).toBeInTheDocument();
    expect(screen.queryByText("यह सहायता अभी आपकी भाषा में उपलब्ध नहीं है।")).toBeNull();
  });

  it("a 404 goes back to the Admin Manual list", async () => {
    getAdminHelpTopic.mockRejectedValueOnce(httpError(404));
    searchRef.current = "key=admin-nope";
    render(<AdminManualTopicPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/manual"));
  });

  it.each([
    [503, "/admin/manual?notice=Help+is+not+available+right+now."],
    [undefined, "/admin/manual?notice=Help+needs+internet."],
  ])("error %s goes back to the list with the help message", async (status, href) => {
    getAdminHelpTopic.mockRejectedValueOnce(httpError(status));
    searchRef.current = "key=admin-users";
    render(<AdminManualTopicPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(href));
  });

  it("no key goes back to the list", async () => {
    render(<AdminManualTopicPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/manual"));
    expect(getAdminHelpTopic).not.toHaveBeenCalled();
  });
});
