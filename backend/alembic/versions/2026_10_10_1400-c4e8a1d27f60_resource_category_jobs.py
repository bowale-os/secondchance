"""add jobs resource category

Revision ID: c4e8a1d27f60
Revises: b7f2e4a91c35
Create Date: 2026-10-10 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c4e8a1d27f60'
down_revision: Union[str, Sequence[str], None] = 'b7f2e4a91c35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE cannot run inside a transaction block on older Postgres versions.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE resourcecategory ADD VALUE IF NOT EXISTS 'JOBS' BEFORE 'ADDICTION'")


def downgrade() -> None:
    # Postgres cannot drop an enum value; rows filed under JOBS are left alone.
    pass
