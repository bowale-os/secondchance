"""add feed_america scrape source

Revision ID: d5f9b3e18a72
Revises: c4e8a1d27f60
Create Date: 2026-10-10 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd5f9b3e18a72'
down_revision: Union[str, Sequence[str], None] = 'c4e8a1d27f60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE scrapesource ADD VALUE IF NOT EXISTS 'FEED_AMERICA' BEFORE 'OSM'")


def downgrade() -> None:
    # Postgres cannot drop an enum value; rows filed under FEED_AMERICA are left alone.
    pass
