"""seed languages (BCP 47)

Prefills `languages` with each country's most-spoken languages, so an admin
activates and links one instead of looking up its code (plan:
docs/dev_docs/langauge_setup/v1_Language_Codes_BCP47_Plan.md, sec. 4.1).

Rows are inserted INACTIVE and get no country_languages link, so no user sees
them until an admin acts. ON CONFLICT DO NOTHING: an existing row keeps its
name and active flag. The list is a frozen copy of
scripts_2/language_seed/build_language_seed.py output (CLDR top 3 non-English
languages per country with at least 5% speakers, plus every language the
report workbook translates), so a library upgrade never changes this migration.

Inserted rows carry created_at = SEEDED_AT. downgrade() removes only rows with
that marker that are still inactive and unused, so a language that existed
before this revision (on any database) is never deleted.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-10-24 00:00:00.000000

"""
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import insert

revision: str = 'b9c0d1e2f3a4'
down_revision: Union[str, Sequence[str], None] = 'a8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Marks the rows this migration inserted (ON CONFLICT leaves existing rows alone).
SEEDED_AT = datetime(2026, 10, 24, tzinfo=timezone.utc)

# (code, CLDR English name), generated 2026-10-24.
SEED = (
    ('aa', 'Afar'),
    ('abr', 'Abron'),
    ('aeb', 'Tunisian Arabic'),
    ('af', 'Afrikaans'),
    ('ak', 'Akan'),
    ('am', 'Amharic'),
    ('apc', 'North Levantine Arabic'),
    ('apd', 'Sudanese Arabic'),
    ('ar', 'Arabic'),
    ('arq', 'Algerian Arabic'),
    ('ary', 'Moroccan Arabic'),
    ('arz', 'Egyptian Arabic'),
    ('as', 'Assamese'),
    ('ay', 'Aymara'),
    ('az', 'Azerbaijani'),
    ('bar', 'Bavarian'),
    ('bci', 'Baoulé'),
    ('be', 'Belarusian'),
    ('bej', 'Beja'),
    ('bem', 'Bemba'),
    ('bg', 'Bulgarian'),
    ('bgc', 'Haryanvi'),
    ('bho', 'Bhojpuri'),
    ('bi', 'Bislama'),
    ('bm', 'Bambara'),
    ('bn', 'Bangla'),
    ('bs', 'Bosnian'),
    ('ca', 'Catalan'),
    ('ceb', 'Cebuano'),
    ('chk', 'Chuukese'),
    ('ckb', 'Central Kurdish'),
    ('cop', 'Coptic'),
    ('crs', 'Seselwa Creole French'),
    ('cs', 'Czech'),
    ('da', 'Danish'),
    ('de', 'German'),
    ('dje', 'Zarma'),
    ('dv', 'Divehi'),
    ('dyu', 'Dyula'),
    ('dz', 'Dzongkha'),
    ('ee', 'Ewe'),
    ('el', 'Greek'),
    ('es', 'Spanish'),
    ('et', 'Estonian'),
    ('fa', 'Persian'),
    ('fan', 'Fang'),
    ('ff', 'Fula'),
    ('ffm', 'Maasina Fulfulde'),
    ('fi', 'Finnish'),
    ('fil', 'Filipino'),
    ('fj', 'Fijian'),
    ('fon', 'Fon'),
    ('fr', 'French'),
    ('ga', 'Irish'),
    ('gil', 'Gilbertese'),
    ('gl', 'Galician'),
    ('gn', 'Guarani'),
    ('gsw', 'Swiss German'),
    ('gu', 'Gujarati'),
    ('ha', 'Hausa'),
    ('hak', 'Hakka Chinese'),
    ('haz', 'Hazaragi'),
    ('he', 'Hebrew'),
    ('hi', 'Hindi'),
    ('hif', 'Fiji Hindi'),
    ('hr', 'Croatian'),
    ('ht', 'Haitian Creole'),
    ('hu', 'Hungarian'),
    ('hy', 'Armenian'),
    ('id', 'Indonesian'),
    ('ig', 'Igbo'),
    ('is', 'Icelandic'),
    ('it', 'Italian'),
    ('ja', 'Japanese'),
    ('jam', 'Jamaican Creole English'),
    ('jv', 'Javanese'),
    ('ka', 'Georgian'),
    ('kea', 'Kabuverdianu'),
    ('ki', 'Kikuyu'),
    ('kj', 'Kuanyama'),
    ('kjg', 'Khmu'),
    ('kk', 'Kazakh'),
    ('km', 'Khmer'),
    ('kmb', 'Kimbundu'),
    ('kn', 'Kannada'),
    ('ko', 'Korean'),
    ('kos', 'Kosraean'),
    ('kpe', 'Kpelle'),
    ('kri', 'Krio'),
    ('ku', 'Kurdish'),
    ('ky', 'Kyrgyz'),
    ('la', 'Latin'),
    ('lah', 'Western Panjabi'),
    ('lb', 'Luxembourgish'),
    ('lg', 'Ganda'),
    ('lmo', 'Lombard'),
    ('lo', 'Lao'),
    ('lt', 'Lithuanian'),
    ('ltg', 'Latgalian'),
    ('lua', 'Luba-Lulua'),
    ('luy', 'Luyia'),
    ('lv', 'Latvian'),
    ('mai', 'Maithili'),
    ('man', 'Mandingo'),
    ('men', 'Mende'),
    ('mfe', 'Morisyen'),
    ('mg', 'Malagasy'),
    ('mh', 'Marshallese'),
    ('mk', 'Macedonian'),
    ('ml', 'Malayalam'),
    ('mn', 'Mongolian'),
    ('mos', 'Mossi'),
    ('mr', 'Marathi'),
    ('ms', 'Malay'),
    ('mt', 'Maltese'),
    ('mxc', 'Manyika'),
    ('my', 'Burmese'),
    ('mzn', 'Mazanderani'),
    ('na', 'Nauru'),
    ('nan', 'Min Nan Chinese'),
    ('nb', 'Norwegian Bokmål'),
    ('nd', 'North Ndebele'),
    ('ndc', 'Ndau'),
    ('ne', 'Nepali'),
    ('ng', 'Ndonga'),
    ('nl', 'Dutch'),
    ('nn', 'Norwegian Nynorsk'),
    ('no', 'Norwegian'),
    ('nod', 'Northern Thai'),
    ('nus', 'Nuer'),
    ('ny', 'Nyanja'),
    ('nyn', 'Nyankole'),
    ('om', 'Oromo'),
    ('or', 'Odia'),
    ('pa', 'Punjabi'),
    ('pau', 'Palauan'),
    ('pcm', 'Nigerian Pidgin'),
    ('pis', 'Pijin'),
    ('pl', 'Polish'),
    ('pon', 'Pohnpeian'),
    ('ps', 'Pashto'),
    ('pt', 'Portuguese'),
    ('puu', 'Punu'),
    ('qu', 'Quechua'),
    ('quc', 'Kʼicheʼ'),
    ('qug', 'Chimborazo Highland Quichua'),
    ('raj', 'Rajasthani'),
    ('rkt', 'Rangpuri'),
    ('rn', 'Rundi'),
    ('ro', 'Romanian'),
    ('ru', 'Russian'),
    ('rw', 'Kinyarwanda'),
    ('sg', 'Sango'),
    ('shn', 'Shan'),
    ('si', 'Sinhala'),
    ('sk', 'Slovak'),
    ('sl', 'Slovenian'),
    ('sm', 'Samoan'),
    ('sn', 'Shona'),
    ('so', 'Somali'),
    ('sq', 'Albanian'),
    ('sr', 'Serbian'),
    ('srn', 'Sranan Tongo'),
    ('ss', 'Swati'),
    ('st', 'Southern Sotho'),
    ('su', 'Sundanese'),
    ('suk', 'Sukuma'),
    ('sv', 'Swedish'),
    ('sw', 'Swahili'),
    ('syl', 'Sylheti'),
    ('ta', 'Tamil'),
    ('te', 'Telugu'),
    ('tem', 'Timne'),
    ('tet', 'Tetum'),
    ('tg', 'Tajik'),
    ('th', 'Thai'),
    ('ti', 'Tigrinya'),
    ('tig', 'Tigre'),
    ('tk', 'Turkmen'),
    ('tly', 'Talysh'),
    ('tn', 'Tswana'),
    ('to', 'Tongan'),
    ('toi', 'Tonga (Zambia)'),
    ('tpi', 'Tok Pisin'),
    ('tr', 'Turkish'),
    ('tsj', 'Tshangla'),
    ('tts', 'Northeastern Thai'),
    ('tum', 'Tumbuka'),
    ('tvl', 'Tuvalu'),
    ('uk', 'Ukrainian'),
    ('umb', 'Umbundu'),
    ('ur', 'Urdu'),
    ('uz', 'Uzbek'),
    ('vi', 'Vietnamese'),
    ('vmw', 'Makhuwa'),
    ('wni', 'Ndzwani Comorian'),
    ('wo', 'Wolof'),
    ('wuu', 'Wu Chinese'),
    ('xh', 'Xhosa'),
    ('xmf', 'Mingrelian'),
    ('yo', 'Yoruba'),
    ('yue', 'Cantonese'),
    ('zdj', 'Ngazidja Comorian'),
    ('zh', 'Chinese'),
    ('zu', 'Zulu'),
)

_languages = sa.table(
    "languages",
    sa.column("code", sa.String),
    sa.column("name", sa.String),
    sa.column("is_active", sa.Boolean),
    sa.column("created_at", sa.DateTime(timezone=True)),
)


def upgrade() -> None:
    op.execute(
        insert(_languages)
        .values([
            {"code": code, "name": name, "is_active": False, "created_at": SEEDED_AT}
            for code, name in SEED
        ])
        .on_conflict_do_nothing(index_elements=["code"])
    )


def downgrade() -> None:
    codes = [code for code, _ in SEED]
    op.execute(
        sa.text(
            """
            DELETE FROM languages l
            WHERE l.code = ANY(:codes)
              AND l.created_at = :seeded_at
              AND l.is_active = false
              AND NOT EXISTS (SELECT 1 FROM country_languages x WHERE x.language_code = l.code)
              AND NOT EXISTS (SELECT 1 FROM feed_translations x WHERE x.language = l.code)
              AND NOT EXISTS (SELECT 1 FROM vocabulary_translations x WHERE x.language = l.code)
              AND NOT EXISTS (SELECT 1 FROM user_information x WHERE x.preferred_language = l.code)
            """
        ).bindparams(
            sa.bindparam("codes", value=codes, type_=sa.ARRAY(sa.String)),
            sa.bindparam("seeded_at", value=SEEDED_AT, type_=sa.DateTime(timezone=True)),
        )
    )
