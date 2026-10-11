"""document reader: readings and to-dos for kept papers, shared rate limit

Revision ID: 5d2b8e6f1a37
Revises: 7c3f5a2e8d41
Create Date: 2026-10-11 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5d2b8e6f1a37'
down_revision: Union[str, Sequence[str], None] = '7c3f5a2e8d41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('document_readings',
    sa.Column('document_id', sa.Uuid(), nullable=False),
    sa.Column('client_id', sa.Uuid(), nullable=False),
    sa.Column('language', sa.String(length=10), nullable=False),
    sa.Column('doc_type', sa.String(length=40), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('issuer', sa.String(length=300), nullable=True),
    sa.Column('document_date', sa.Date(), nullable=True),
    sa.Column('received_date', sa.Date(), nullable=False),
    sa.Column('simplified_encrypted', sa.Text(), nullable=False),
    sa.Column('glossary', sa.JSON(), nullable=False),
    sa.Column('flags', sa.JSON(), nullable=False),
    sa.Column('reader_version', sa.String(length=40), nullable=False),
    sa.Column('created_by_staff_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by_staff_id'], ['staff.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('document_id'),
    )
    op.create_index(op.f('ix_document_readings_client_id'), 'document_readings', ['client_id'], unique=False)

    op.create_table('document_actions',
    sa.Column('reading_id', sa.Uuid(), nullable=False),
    sa.Column('client_id', sa.Uuid(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('details', sa.Text(), nullable=False),
    sa.Column('due_type', sa.String(length=10), nullable=False),
    sa.Column('due_text', sa.Text(), nullable=True),
    sa.Column('due_exact_date', sa.Date(), nullable=True),
    sa.Column('due_anchor', sa.String(length=20), nullable=True),
    sa.Column('due_offset_hours', sa.Float(), nullable=True),
    sa.Column('due_offset_days', sa.Integer(), nullable=True),
    sa.Column('due_business_days', sa.Boolean(), nullable=True),
    sa.Column('priority', sa.String(length=10), nullable=False),
    sa.Column('consequence', sa.Text(), nullable=True),
    sa.Column('location', sa.Text(), nullable=True),
    sa.Column('contact', sa.JSON(), nullable=True),
    sa.Column('bring', sa.JSON(), nullable=False),
    sa.Column('source_quote', sa.Text(), nullable=False),
    sa.Column('source_page', sa.Integer(), nullable=False),
    sa.Column('confidence', sa.Float(), nullable=False),
    sa.Column('flags', sa.JSON(), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_by_staff_id', sa.Uuid(), nullable=True),
    sa.Column('obligation_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['reading_id'], ['document_readings.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['completed_by_staff_id'], ['staff.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['obligation_id'], ['client_obligations.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_document_actions_reading_id'), 'document_actions', ['reading_id'], unique=False)
    op.create_index(op.f('ix_document_actions_client_id'), 'document_actions', ['client_id'], unique=False)

    op.create_table('reader_usage',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('actor', sa.String(length=60), nullable=False),
    sa.Column('at', sa.Float(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reader_usage_actor'), 'reader_usage', ['actor'], unique=False)
    op.create_index(op.f('ix_reader_usage_at'), 'reader_usage', ['at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_reader_usage_at'), table_name='reader_usage')
    op.drop_index(op.f('ix_reader_usage_actor'), table_name='reader_usage')
    op.drop_table('reader_usage')
    op.drop_index(op.f('ix_document_actions_client_id'), table_name='document_actions')
    op.drop_index(op.f('ix_document_actions_reading_id'), table_name='document_actions')
    op.drop_table('document_actions')
    op.drop_index(op.f('ix_document_readings_client_id'), table_name='document_readings')
    op.drop_table('document_readings')
