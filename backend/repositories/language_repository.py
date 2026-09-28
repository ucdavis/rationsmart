from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CountryLanguage, CountryModel, Language


class LanguageRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Language CRUD ─────────────────────────────────────────────────────────

    async def create(self, code: str, name: str) -> Language:
        lang = Language(code=code.strip().lower(), name=name.strip(), is_active=True)
        self.db.add(lang)
        await self.db.flush()
        return lang

    async def get_all(self) -> list[Language]:
        result = await self.db.execute(
            select(Language).order_by(Language.code)
        )
        return list(result.scalars().all())

    async def get_by_code(self, code: str) -> Optional[Language]:
        result = await self.db.execute(
            select(Language).where(Language.code == code.strip().lower())
        )
        return result.scalars().first()

    async def update(
        self,
        code: str,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[Language]:
        lang = await self.get_by_code(code)
        if lang is None:
            return None
        if name is not None:
            lang.name = name.strip()
        if is_active is not None:
            lang.is_active = is_active
        await self.db.flush()
        return lang

    # ── Country↔language assignment ───────────────────────────────────────────

    async def get_all_countries_with_languages(self) -> list[tuple]:
        """Return list of (CountryModel, [language_code, ...]) sorted by country name."""
        countries = (
            await self.db.execute(
                select(CountryModel)
                .where(CountryModel.is_active == True)  # noqa: E712
                .order_by(CountryModel.name)
            )
        ).scalars().all()

        cl_rows = (
            await self.db.execute(select(CountryLanguage))
        ).scalars().all()

        lang_map: dict[str, list[str]] = {}
        for cl in cl_rows:
            lang_map.setdefault(str(cl.country_id), []).append(cl.language_code)

        return [(c, sorted(lang_map.get(str(c.id), []))) for c in countries]

    async def assign(self, country_id: str, code: str) -> bool:
        """Insert (country_id, code) if not already present. Returns True when inserted."""
        existing = (
            await self.db.execute(
                select(CountryLanguage).where(
                    CountryLanguage.country_id == country_id,
                    CountryLanguage.language_code == code,
                )
            )
        ).scalars().first()

        if existing:
            return False  # already assigned

        self.db.add(CountryLanguage(country_id=country_id, language_code=code))
        await self.db.flush()
        return True

    async def unassign(self, country_id: str, code: str) -> bool:
        """Remove (country_id, code). Returns True when a row was deleted."""
        result = await self.db.execute(
            delete(CountryLanguage).where(
                CountryLanguage.country_id == country_id,
                CountryLanguage.language_code == code,
            )
        )
        return result.rowcount > 0
