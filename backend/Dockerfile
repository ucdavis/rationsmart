# Base pinned by digest: the server keeps no tagged copy of the base, so an
# unpinned tag is re-resolved on every build and each new Docker Hub release
# rebuilt every layer (full pip install, ~10 min) even with no code change.
# Updates come as a monthly Dependabot "docker" PR (.github/dependabot.yml).
# Latest digest: docker buildx imagetools inspect python:3.12-slim
FROM python:3.12-slim@sha256:6b25cbe6577518889d553cdd5a5da97d259348d8f6e45b527dd731caaba27a07

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# pg_dump/pg_restore for scripts_2/db_reset.py's backup. Pinned to the
# server's major version (15) from the PostgreSQL apt repo: Debian's default
# client is newer, and a newer pg_dump's archive can't be read by the
# database container's own pg_restore 15.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && install -d /etc/apt/keyrings \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /etc/apt/keyrings/postgresql.asc \
    && echo "deb [signed-by=/etc/apt/keyrings/postgresql.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-15 \
    && apt-get remove -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt

# WeasyPrint requires Cairo/Pango system libs
RUN apt-get update && apt-get install -y \
    gcc \
    build-essential \
    libpq-dev \
    libffi-dev \
    python3-dev \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libglib2.0-0 \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/requirements.txt \
    && apt-get remove -y gcc build-essential libffi-dev python3-dev \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Report PDF fonts for non-Latin scripts (Noto, SIL OFL: fonts/OFL.txt): Devanagari,
# Bengali, Thai, Ethiopic, Arabic and the Indian scripts. DejaVu (pulled in with the
# Pango libs) covers Latin; fontconfig falls back to these per character, so the report
# CSS does not name them. Kept after pip so a font change does not reinstall packages.
COPY fonts/ /usr/share/fonts/truetype/rationsmart/
RUN fc-cache -f

COPY . /app

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WORKERS:-4}"]
