"""remove job related scrape sources

Revision ID: b7f2e4a91c35
Revises: a3d91c7e5b20
Create Date: 2026-10-10 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b7f2e4a91c35'
down_revision: Union[str, Sequence[str], None] = 'a3d91c7e5b20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW = (
    'SAMHSA', 'HRSA', 'LSC', 'GOV_OFFICE', 'TWO_ONE_ONE',
    'CONTINUUM_OF_CARE', 'FOOD_BANK', 'REENTRY_GUIDE', 'MEETING_GUIDE',
    'EVENT_CALENDAR', 'ORG_WEBSITE', 'OSM',
    'CURATED_IMPORT', 'CASE_WORKER', 'OTHER',
)
OLD = NEW[:9] + ('EMPLOYER_LIST',) + NEW[9:]
# Rows scraped from a removed source keep existing, filed under OTHER.
REMOVED_TO_OTHER = {'EMPLOYER_LIST': 'OTHER'}


def _swap(labels: tuple, mapping: dict) -> None:
    """Postgres cannot drop enum values, so replace the type and remap rows."""
    values = ", ".join(f"'{v}'" for v in labels)
    cases = " ".join(f"WHEN '{a}' THEN '{b}'" for a, b in mapping.items())
    expr = f"CASE source::text {cases} ELSE source::text END" if mapping else "source::text"
    op.execute("ALTER TYPE scrapesource RENAME TO scrapesource_old")
    op.execute(f"CREATE TYPE scrapesource AS ENUM ({values})")
    op.execute(
        f"ALTER TABLE resources ALTER COLUMN source TYPE scrapesource USING ({expr})::scrapesource"
    )
    op.execute("DROP TYPE scrapesource_old")


def upgrade() -> None:
    _swap(NEW, REMOVED_TO_OTHER)


def downgrade() -> None:
    # Rows moved to OTHER stay OTHER; the old label is simply allowed again.
    _swap(OLD, {})
