"""bot enrollment: morning nudge settings

Revision ID: 7c3f5a2e8d41
Revises: 4e7a1c9d0b22
Create Date: 2026-10-10 22:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7c3f5a2e8d41'
down_revision: Union[str, Sequence[str], None] = '4e7a1c9d0b22'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bot_enrollments', sa.Column('nudge_enabled', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('bot_enrollments', sa.Column('nudge_time', sa.Time(), server_default='08:00:00', nullable=False))
    op.add_column('bot_enrollments', sa.Column('last_nudged_on', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('bot_enrollments', 'last_nudged_on')
    op.drop_column('bot_enrollments', 'nudge_time')
    op.drop_column('bot_enrollments', 'nudge_enabled')
