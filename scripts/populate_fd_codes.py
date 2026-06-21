"""
Populate fd_code for every row in the feed library Excel file.

Code format: 10-character uppercase alphanumeric
  - First 6 chars: slug derived from fd_name (A-Z, 0-9 only)
  - Last 4 chars:  first 4 hex chars of SHA-1(fd_name.lower() + "|" + fd_country_name.lower())

This is deterministic: same fd_name always produces the same fd_code.

Usage:
    python scripts/populate_fd_codes.py <path_to_excel_file>
    python scripts/populate_fd_codes.py imp_files/feeds_export_20260619_103022.xlsx
"""

import sys
import hashlib
import re
import pandas as pd


def generate_fd_code(name: str, country: str) -> str:
    name = (name or "").strip()
    country = (country or "").strip()
    slug = re.sub(r"[^A-Z0-9]", "", name.upper())
    prefix = slug[:6].ljust(6, "X")          # 6 chars from feed name, padded with X if short
    combined = f"{name.lower()}|{country.lower()}"
    suffix = hashlib.sha1(combined.encode()).hexdigest()[:4].upper()
    return prefix + suffix                    # always exactly 10 chars


def main(path: str) -> None:
    df = pd.read_excel(path)

    for col in ("fd_name", "fd_country_name"):
        if col not in df.columns:
            print(f"ERROR: '{col}' column not found in the file.")
            sys.exit(1)

    if "fd_code" not in df.columns:
        df.insert(0, "fd_code", None)

    missing_mask = df["fd_code"].isna() | (df["fd_code"].astype(str).str.strip() == "")
    print(f"Total rows       : {len(df)}")
    print(f"Already have code: {(~missing_mask).sum()}")
    print(f"Will populate    : {missing_mask.sum()}")

    codes = df.loc[missing_mask].apply(
        lambda row: generate_fd_code(row["fd_name"], row["fd_country_name"]), axis=1
    )
    df.loc[missing_mask, "fd_code"] = codes

    # Collision check
    duplicates = df[df["fd_code"].duplicated(keep=False)][["fd_name", "fd_code"]]
    if not duplicates.empty:
        print("\nWARNING: duplicate fd_code values detected:")
        print(duplicates.to_string(index=False))
        sys.exit(1)

    df.to_excel(path, index=False)
    print(f"\nDone. File updated: {path}")
    print("\nSample of populated codes:")
    print(df[["fd_name", "fd_code"]].head(15).to_string(index=False))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/populate_fd_codes.py <path_to_excel_file>")
        sys.exit(1)
    main(sys.argv[1])
