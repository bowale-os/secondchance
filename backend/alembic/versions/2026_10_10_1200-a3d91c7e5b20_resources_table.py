"""resources table

Revision ID: a3d91c7e5b20
Revises: c58c172b06ca
Create Date: 2026-10-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a3d91c7e5b20'
down_revision: Union[str, Sequence[str], None] = 'c58c172b06ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Several columns share tri/gender/etc., so create each type once, explicitly.
ENUMS = {
    'resourcecategory': ('SHELTER', 'FOOD', 'ADDICTION', 'CLASSES', 'EVENTS'),
    'tri': ('YES', 'NO', 'UNKNOWN'),
    'gender': ('MEN', 'WOMEN', 'ANY', 'UNKNOWN'),
    'costtype': ('FREE', 'SLIDING_SCALE', 'FEE', 'UNKNOWN'),
    'recordspolicy': ('ACCEPTED', 'CASE_BY_CASE', 'NOT_ACCEPTED', 'UNKNOWN'),
    'verificationstatus': ('UNVERIFIED', 'VERIFIED', 'FLAGGED'),
    'scrapesource': (
        'SAMHSA', 'HRSA', 'LSC', 'GOV_OFFICE', 'TWO_ONE_ONE',
        'CONTINUUM_OF_CARE', 'FOOD_BANK', 'REENTRY_GUIDE', 'MEETING_GUIDE',
        'EMPLOYER_LIST', 'EVENT_CALENDAR', 'ORG_WEBSITE', 'OSM',
        'CURATED_IMPORT', 'CASE_WORKER', 'OTHER',
    ),
}


def _enum(name: str) -> postgresql.ENUM:
    return postgresql.ENUM(*ENUMS[name], name=name, create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    for name, labels in ENUMS.items():
        postgresql.ENUM(*labels, name=name).create(bind, checkfirst=True)

    op.create_table('resources',
    sa.Column('dedupe_key', sa.String(length=300), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('category', _enum('resourcecategory'), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('address', sa.JSON(), nullable=True),
    sa.Column('lat', sa.Float(), nullable=True),
    sa.Column('lng', sa.Float(), nullable=True),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('website', sa.String(length=500), nullable=True),
    sa.Column('hours', sa.JSON(), nullable=False),
    sa.Column('hours_note', sa.Text(), nullable=True),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('gender', _enum('gender'), nullable=False),
    sa.Column('families_welcome', _enum('tri'), nullable=False),
    sa.Column('records_policy', _enum('recordspolicy'), nullable=False),
    sa.Column('restrictions_note', sa.Text(), nullable=True),
    sa.Column('languages', sa.JSON(), nullable=False),
    sa.Column('cost_type', _enum('costtype'), nullable=False),
    sa.Column('access_methods', sa.JSON(), nullable=False),
    sa.Column('required_documents', sa.JSON(), nullable=False),
    sa.Column('requires_id', sa.Boolean(), nullable=False),
    sa.Column('near_transit', sa.Boolean(), nullable=True),
    sa.Column('nearest_stops', sa.JSON(), nullable=False),
    sa.Column('details', sa.JSON(), nullable=False),
    sa.Column('verification', _enum('verificationstatus'), nullable=False),
    sa.Column('source', _enum('scrapesource'), nullable=False),
    sa.Column('source_url', sa.String(length=1000), nullable=True),
    sa.Column('scraped_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('verified_by_staff_id', sa.Uuid(), nullable=True),
    sa.Column('field_meta', sa.JSON(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['verified_by_staff_id'], ['staff.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dedupe_key'),
    )
    op.create_index(op.f('ix_resources_name'), 'resources', ['name'], unique=False)
    op.create_index(op.f('ix_resources_category'), 'resources', ['category'], unique=False)
    op.create_index(op.f('ix_resources_starts_at'), 'resources', ['starts_at'], unique=False)
    op.create_index('ix_resources_category_transit', 'resources', ['category', 'near_transit'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_resources_category_transit', table_name='resources')
    op.drop_index(op.f('ix_resources_starts_at'), table_name='resources')
    op.drop_index(op.f('ix_resources_category'), table_name='resources')
    op.drop_index(op.f('ix_resources_name'), table_name='resources')
    op.drop_table('resources')
    bind = op.get_bind()
    for name in reversed(ENUMS):
        postgresql.ENUM(name=name).drop(bind, checkfirst=True)
