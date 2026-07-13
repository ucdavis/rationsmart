import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NavDrawer from "@/components/NavDrawer";
import { useStore, type User } from "@/lib/store";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

function makeUser(over: Partial<User> = {}): User {
  return {
    id: "u-1",
    name: "Aiyappa",
    email: "aiyappa@digitalgreen.org",
    country: "India",
    country_id: "1",
    country_code: "IN",
    currency: "INR",
    pin: "123456",
    is_admin: false,
    token: "jwt-abc",
    preferred_language: "en",
    ...over,
  };
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  useStore.setState({
    user: null,
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  });
});

describe("NavDrawer", () => {
  it("renders the non-admin menu items in the documented order (no Admin item)", () => {
    useStore.setState({ user: makeUser({ is_admin: false }) });
    render(<NavDrawer open onClose={() => {}} />);

    const buttons = screen.getAllByRole("button");
    const labels = buttons
      .map((b) => b.textContent || "")
      .filter((t) =>
        [
          "Profile",
          "Feed Reports",
          "Help & Support",
          "Feedback",
          "Terms & Conditions",
          "Admin",
        ].some((l) => t.includes(l))
      );

    expect(labels).toHaveLength(5);
    expect(labels[0]).toContain("Profile");
    expect(labels[1]).toContain("Feed Reports");
    expect(labels[2]).toContain("Help & Support");
    expect(labels[3]).toContain("Feedback");
    expect(labels[4]).toContain("Terms & Conditions");
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("shows the 'Ongoing' badge on Help & Support and Terms & Conditions", () => {
    useStore.setState({ user: makeUser() });
    render(<NavDrawer open onClose={() => {}} />);
    expect(screen.getAllByText("Ongoing")).toHaveLength(2);
  });

  it("Admin item appears first when user.is_admin is true", () => {
    useStore.setState({ user: makeUser({ is_admin: true }) });
    render(<NavDrawer open onClose={() => {}} />);

    const buttons = screen.getAllByRole("button");
    const labels = buttons
      .map((b) => b.textContent || "")
      .filter((t) =>
        [
          "Admin",
          "Profile",
          "Feed Reports",
          "Help & Support",
          "Feedback",
          "Terms & Conditions",
        ].some((l) => t.includes(l))
      );

    expect(labels).toHaveLength(6);
    expect(labels[0]).toContain("Admin");
    expect(labels[1]).toContain("Profile");
    expect(labels[5]).toContain("Terms & Conditions");
  });

  it.each([
    ["Profile", "/profile"],
    ["Feed Reports", "/reports"],
    ["Help & Support", "/help"],
    ["Feedback", "/feedback"],
    ["Terms & Conditions", "/terms"],
  ])("clicking '%s' navigates to '%s' and closes the drawer", (label, href) => {
    const onClose = vi.fn();
    useStore.setState({ user: makeUser() });
    render(<NavDrawer open onClose={onClose} />);

    fireEvent.click(screen.getByText(label));

    expect(onClose).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith(href);
  });

  it("clicking the Admin item navigates to /admin", () => {
    const onClose = vi.fn();
    useStore.setState({ user: makeUser({ is_admin: true }) });
    render(<NavDrawer open onClose={onClose} />);

    fireEvent.click(screen.getByText("Admin"));

    expect(push).toHaveBeenCalledWith("/admin");
  });

  it("clicking Logout opens a confirmation dialog instead of logging out immediately", () => {
    useStore.setState({ user: makeUser() });
    const logoutSpy = vi.fn();
    useStore.setState({ logout: logoutSpy });
    render(<NavDrawer open onClose={() => {}} />);

    fireEvent.click(screen.getByText("Logout"));

    expect(screen.getByText("Are you sure you want to logout?")).toBeInTheDocument();
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("confirming logout ('Yes, Logout') calls store.logout() and navigates to /welcome", () => {
    const onClose = vi.fn();
    useStore.setState({ user: makeUser() });
    const logoutSpy = vi.fn();
    useStore.setState({ logout: logoutSpy });
    render(<NavDrawer open onClose={onClose} />);

    fireEvent.click(screen.getByText("Logout"));
    fireEvent.click(screen.getByText("Yes, Logout"));

    expect(logoutSpy).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith("/welcome");
    expect(onClose).toHaveBeenCalled();
  });

  it("dismissing the confirm dialog ('No') does not log out", () => {
    useStore.setState({ user: makeUser() });
    const logoutSpy = vi.fn();
    useStore.setState({ logout: logoutSpy });
    render(<NavDrawer open onClose={() => {}} />);

    fireEvent.click(screen.getByText("Logout"));
    fireEvent.click(screen.getByText("No"));

    expect(logoutSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("Are you sure you want to logout?")).toBeNull();
  });

  it("does not render the overlay or menu items when closed, but drawer stays mounted (hidden via transform)", () => {
    useStore.setState({ user: makeUser() });
    render(<NavDrawer open={false} onClose={() => {}} />);
    // Menu items are still in the DOM (drawer stays mounted, just translated off-screen)
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("falls back to 'User' and empty email when no user is signed in", () => {
    useStore.setState({ user: null });
    render(<NavDrawer open onClose={() => {}} />);
    expect(screen.getByText("User")).toBeInTheDocument();
  });

  // UI-label translation (src/lib/i18n-ui.ts) — menu labels, badge, and
  // the logout confirmation dialog all route through t().
  it("translates menu items and the 'Ongoing' badge when preferred_language is 'hi'", async () => {
    useStore.setState({ user: makeUser({ preferred_language: "hi" }) });
    render(<NavDrawer open onClose={() => {}} />);

    await screen.findByText("प्रोफ़ाइल"); // Profile
    expect(screen.getByText("चारा रिपोर्ट")).toBeInTheDocument(); // Feed Reports
    expect(screen.getByText("सहायता एवं समर्थन")).toBeInTheDocument(); // Help & Support
    expect(screen.getByText("प्रतिक्रिया")).toBeInTheDocument(); // Feedback
    expect(screen.getByText("नियम और शर्तें")).toBeInTheDocument(); // Terms & Conditions
    expect(screen.getAllByText("चल रहा है")).toHaveLength(2); // Ongoing
    expect(screen.getByText("लॉगआउट")).toBeInTheDocument(); // Logout
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });

  it("translates the logout confirmation dialog and the 'User' fallback name when preferred_language is 'hi'", async () => {
    useStore.setState({ user: makeUser({ name: "", preferred_language: "hi" }) });
    render(<NavDrawer open onClose={() => {}} />);

    await screen.findByText("उपयोगकर्ता"); // "User" fallback name

    fireEvent.click(screen.getByText("लॉगआउट")); // Logout
    expect(screen.getByText("क्या आप वाकई लॉगआउट करना चाहते हैं?")).toBeInTheDocument(); // Are you sure...
    expect(screen.getByText("हाँ, लॉगआउट")).toBeInTheDocument(); // Yes, Logout
    expect(screen.getByText("नहीं")).toBeInTheDocument(); // No
  });
});
