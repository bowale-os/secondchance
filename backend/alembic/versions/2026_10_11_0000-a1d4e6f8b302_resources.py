"""resources

Revision ID: a1d4e6f8b302
Revises: 7c3f5a2e8d41
Create Date: 2026-10-11 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1d4e6f8b302'
down_revision: Union[str, Sequence[str], None] = '7c3f5a2e8d41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('resources',
    sa.Column('source_key', sa.String(length=200), nullable=False),
    sa.Column('category', sa.String(length=20), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('address', sa.JSON(), nullable=True),
    sa.Column('lat', sa.Float(), nullable=True),
    sa.Column('lng', sa.Float(), nullable=True),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('website', sa.String(length=500), nullable=True),
    sa.Column('hours', sa.JSON(), nullable=False),
    sa.Column('hours_note', sa.String(length=300), nullable=True),
    sa.Column('gender', sa.String(length=10), nullable=False),
    sa.Column('families_welcome', sa.String(length=10), nullable=False),
    sa.Column('records_policy', sa.String(length=20), nullable=False),
    sa.Column('restrictions_note', sa.String(length=500), nullable=True),
    sa.Column('languages', sa.JSON(), nullable=False),
    sa.Column('cost_type', sa.String(length=20), nullable=False),
    sa.Column('access_methods', sa.JSON(), nullable=False),
    sa.Column('required_documents', sa.JSON(), nullable=False),
    sa.Column('details', sa.JSON(), nullable=False),
    sa.Column('near_transit', sa.Boolean(), nullable=True),
    sa.Column('nearest_stops', sa.JSON(), nullable=False),
    sa.Column('verification', sa.String(length=20), nullable=False),
    sa.Column('source_url', sa.String(length=500), nullable=True),
    sa.Column('last_verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('field_meta', sa.JSON(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_key'),
    )
    op.create_index(op.f('ix_resources_category'), 'resources', ['category'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_resources_category'), table_name='resources')
    op.drop_table('resources')
