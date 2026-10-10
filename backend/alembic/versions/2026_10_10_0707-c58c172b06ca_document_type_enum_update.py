"""document type enum update

Revision ID: c58c172b06ca
Revises: 5cc42d35cebf
Create Date: 2026-10-10 07:07:32.186856

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c58c172b06ca'
down_revision: Union[str, Sequence[str], None] = '5cc42d35cebf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW = (
    'SUPERVISION_PAPERS', 'COURT_NOTICE', 'PAYMENT_NOTICE', 'MONTHLY_REPORT', 'RELEASE_PAPERS',
    'MEDICAL_DISCHARGE', 'BENEFITS_LETTER', 'ID_DOCUMENT', 'HOUSING_AGREEMENT',
    'PROGRAM_CERTIFICATE', 'OTHER',
)
OLD = (
    'PAROLE_CERTIFICATE', 'COURT_NOTICE', 'JUDGMENT', 'FEE_STATEMENT', 'MONTHLY_REPORT',
    'MEDICATION_RELEASE', 'ID_DOCUMENT', 'BENEFITS_LETTER', 'HOUSING', 'CERTIFICATE', 'OTHER',
)
OLD_TO_NEW = {
    'PAROLE_CERTIFICATE': 'SUPERVISION_PAPERS', 'JUDGMENT': 'COURT_NOTICE',
    'FEE_STATEMENT': 'PAYMENT_NOTICE', 'MEDICATION_RELEASE': 'MEDICAL_DISCHARGE',
    'HOUSING': 'HOUSING_AGREEMENT', 'CERTIFICATE': 'PROGRAM_CERTIFICATE',
}
NEW_TO_OLD = {
    'SUPERVISION_PAPERS': 'PAROLE_CERTIFICATE', 'PAYMENT_NOTICE': 'FEE_STATEMENT',
    'RELEASE_PAPERS': 'OTHER', 'MEDICAL_DISCHARGE': 'MEDICATION_RELEASE',
    'HOUSING_AGREEMENT': 'HOUSING', 'PROGRAM_CERTIFICATE': 'CERTIFICATE',
}


def _swap(labels: tuple, mapping: dict) -> None:
    """Postgres cannot drop or rename enum values, so replace the type and remap rows."""
    values = ", ".join(f"'{v}'" for v in labels)
    cases = " ".join(f"WHEN '{a}' THEN '{b}'" for a, b in mapping.items())
    op.execute("ALTER TYPE documenttype RENAME TO documenttype_old")
    op.execute(f"CREATE TYPE documenttype AS ENUM ({values})")
    op.execute(
        "ALTER TABLE documents ALTER COLUMN doc_type TYPE documenttype "
        f"USING (CASE doc_type::text {cases} ELSE doc_type::text END)::documenttype"
    )
    op.execute("DROP TYPE documenttype_old")


def upgrade() -> None:
    _swap(NEW, OLD_TO_NEW)


def downgrade() -> None:
    _swap(OLD, NEW_TO_OLD)
