"""calendar events: obligation time, location, client-added

Revision ID: e6a0c4f29b83
Revises: d5f9b3e18a72
Create Date: 2026-10-10 16:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e6a0c4f29b83'
down_revision: Union[str, Sequence[str], None] = 'd5f9b3e18a72'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE obligationtype ADD VALUE IF NOT EXISTS 'OTHER'")
    op.add_column('client_obligations', sa.Column('due_time', sa.Time(), nullable=True))
    op.add_column('client_obligations', sa.Column('location', sa.String(length=300), nullable=True))
    op.add_column('client_obligations', sa.Column('added_by_client', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('client_obligations', sa.Column('staff_seen_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('client_obligations', 'staff_seen_at')
    op.drop_column('client_obligations', 'added_by_client')
    op.drop_column('client_obligations', 'location')
    op.drop_column('client_obligations', 'due_time')
    # Postgres cannot drop an enum value; rows filed under OTHER are left alone.
