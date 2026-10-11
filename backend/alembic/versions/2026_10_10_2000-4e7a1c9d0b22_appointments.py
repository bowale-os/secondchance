"""appointments

Revision ID: 4e7a1c9d0b22
Revises: 9b1d7e3a2c10
Create Date: 2026-10-10 20:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4e7a1c9d0b22'
down_revision: Union[str, Sequence[str], None] = '9b1d7e3a2c10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('appointments',
    sa.Column('client_id', sa.Uuid(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('location_name', sa.String(length=200), nullable=True),
    sa.Column('address', sa.String(length=255), nullable=True),
    sa.Column('transit_note', sa.String(length=255), nullable=True),
    sa.Column('documents_to_bring', sa.JSON(), nullable=True),
    sa.Column('obligation_id', sa.Uuid(), nullable=True),
    sa.Column('cancelled', sa.Boolean(), nullable=False),
    sa.Column('created_by_staff_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['obligation_id'], ['client_obligations.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by_staff_id'], ['staff.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_appointments_client_id'), 'appointments', ['client_id'], unique=False)
    op.create_index(op.f('ix_appointments_starts_at'), 'appointments', ['starts_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_appointments_starts_at'), table_name='appointments')
    op.drop_index(op.f('ix_appointments_client_id'), table_name='appointments')
    op.drop_table('appointments')
