import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DeleteAccountDialog from "@/components/profile/DeleteAccountDialog";
import { WorkbookCard } from "@/components/admin/country-language/WorkbookCard";

const t = (s: string) => s;

describe("DeleteAccountDialog (F28 / W4)", () => {
  it("says the account is deactivated and can be restored — not 'permanent'", () => {
    render(<DeleteAccountDialog setShowDeleteDialog={vi.fn()} setShowPinSheet={vi.fn()} t={t} />);
    expect(
      screen.getByText(
        "Your account will be deactivated and you will be signed out. You can come back any time by registering again with the same email address."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/permanent/i)).toBeNull();
  });

  it("still goes on to the PIN step", () => {
    const setShowPinSheet = vi.fn();
    render(
      <DeleteAccountDialog setShowDeleteDialog={vi.fn()} setShowPinSheet={setShowPinSheet} t={t} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Yes/ }));
    expect(setShowPinSheet).toHaveBeenCalledWith(true);
  });
});

describe("WorkbookCard warnings (W9)", () => {
  const props = {
    handleDownload: vi.fn(),
    handleUpload: vi.fn(),
    isDownloading: false,
    isUploading: false,
    selCountry: {
      id: "c-in",
      name: "India",
      country_code: "IN",
      is_active: true,
      languages: ["en", "hi"],
    },
    setUploadFile: vi.fn(),
    showSnackbar: vi.fn(),
    t,
    uploadFile: null,
  };

  it("lists every skipped entry with its reason, as plain text", () => {
    const errors = [
      "Feeds row 4: 'मक्का' is already used by another feed in hi — skipped",
      "Feeds row 9: <b>not html</b> — skipped",
    ];
    render(
      <WorkbookCard
        {...props}
        uploadSummary={{ success: true, feeds_inserted: 3, feeds_skipped: 2, errors }}
      />
    );
    expect(screen.getByText("Warnings (2)")).toBeInTheDocument();
    expect(screen.getByText(errors[0]!)).toBeInTheDocument();
    // Rendered as text, never as markup.
    expect(screen.getByText(errors[1]!)).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("shows nothing extra when the list is empty", () => {
    render(
      <WorkbookCard {...props} uploadSummary={{ success: true, feeds_inserted: 1, errors: [] }} />
    );
    expect(screen.getByText("Import summary")).toBeInTheDocument();
    expect(screen.queryByText(/Warnings/)).toBeNull();
  });
});
