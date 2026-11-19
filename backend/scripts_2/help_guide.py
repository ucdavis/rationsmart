"""Write the printable Help guide (PDF) to a folder, e.g. for a print shop.

    python -m scripts_2.help_guide                          # both editions, English, ./help_guide
    python -m scripts_2.help_guide --edition quick --lang hi --out ~/Desktop

Uses the same content and renderer as GET /v1/help/guide; needs no server or database, only
settings that load (importing services/ builds app.config.Settings, so run it where .env is).
Fonts come from the machine, so for print-ready files run it in the api container
(docker compose exec api python -m scripts_2.help_guide --out /backups/help_guide) to get the
same fonts as the app.
"""
import argparse
import sys
from pathlib import Path

from services.help_content import load_help_content
from services.help_guide import EDITIONS, guide_filename, render_guide_pdf


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--edition", choices=EDITIONS + ("both",), default="both")
    parser.add_argument("--lang", default="en", help="language code (falls back to English)")
    parser.add_argument("--out", type=Path, default=Path("help_guide"), help="output folder")
    args = parser.parse_args(argv)

    content = load_help_content()
    args.out.mkdir(parents=True, exist_ok=True)
    for edition in EDITIONS if args.edition == "both" else (args.edition,):
        path = args.out / guide_filename(content, edition, args.lang)
        path.write_bytes(render_guide_pdf(content, edition, args.lang))
        print(f"{path}  ({path.stat().st_size / 1024 / 1024:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
