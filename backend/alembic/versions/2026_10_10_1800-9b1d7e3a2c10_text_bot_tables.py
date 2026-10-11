"""text bot: enrollments, sessions, audit log

Revision ID: 9b1d7e3a2c10
Revises: e6a0c4f29b83
Create Date: 2026-10-10 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9b1d7e3a2c10'
down_revision: Union[str, Sequence[str], None] = 'e6a0c4f29b83'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

botchannel = sa.Enum('IMESSAGE', 'RCS', 'SMS', 'WHATSAPP', 'TELEGRAM', 'OTHER', name='botchannel')
botenrollmentstatus = sa.Enum('ACTIVE', 'STOPPED', 'LOCKED', 'REVOKED', name='botenrollmentstatus')
botsessionstate = sa.Enum('AWAITING_NAME', 'AWAITING_PIN', 'ACTIVE', 'LOCKED', name='botsessionstate')


def upgrade() -> None:
    op.create_table('bot_enrollments',
    sa.Column('client_id', sa.Uuid(), nullable=False),
    sa.Column('phone_encrypted', sa.Text(), nullable=False),
    sa.Column('phone_hash', sa.String(length=64), nullable=False),
    sa.Column('phone_last4', sa.String(length=4), nullable=False),
    sa.Column('channel', botchannel, nullable=True),
    sa.Column('status', botenrollmentstatus, nullable=False),
    sa.Column('consent_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('enrolled_by_staff_id', sa.Uuid(), nullable=True),
    sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['enrolled_by_staff_id'], ['staff.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('client_id'),
    )
    op.create_index(op.f('ix_bot_enrollments_phone_hash'), 'bot_enrollments', ['phone_hash'], unique=True)

    op.create_table('bot_sessions',
    sa.Column('enrollment_id', sa.Uuid(), nullable=False),
    sa.Column('state', botsessionstate, nullable=False),
    sa.Column('name_matched', sa.Boolean(), nullable=False),
    sa.Column('failed_attempts', sa.Integer(), nullable=False),
    sa.Column('authenticated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_activity_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_results', sa.JSON(), nullable=True),
    sa.Column('pending_attachment_ref', sa.String(length=255), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['enrollment_id'], ['bot_enrollments.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('enrollment_id'),
    )

    op.create_table('bot_audit_log',
    sa.Column('enrollment_id', sa.Uuid(), nullable=True),
    sa.Column('intent', sa.String(length=50), nullable=False),
    sa.Column('outcome', sa.String(length=50), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['enrollment_id'], ['bot_enrollments.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_bot_audit_log_enrollment_id'), 'bot_audit_log', ['enrollment_id'], unique=False)
    op.create_index(op.f('ix_bot_audit_log_created_at'), 'bot_audit_log', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_bot_audit_log_created_at'), table_name='bot_audit_log')
    op.drop_index(op.f('ix_bot_audit_log_enrollment_id'), table_name='bot_audit_log')
    op.drop_table('bot_audit_log')
    op.drop_table('bot_sessions')
    op.drop_index(op.f('ix_bot_enrollments_phone_hash'), table_name='bot_enrollments')
    op.drop_table('bot_enrollments')
    botsessionstate.drop(op.get_bind(), checkfirst=True)
    botenrollmentstatus.drop(op.get_bind(), checkfirst=True)
    botchannel.drop(op.get_bind(), checkfirst=True)
