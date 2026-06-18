"""add is_hidden to user_entries

Revision ID: 94af7ef02eb9
Revises: de4b367d4055
Create Date: 2026-06-17 20:55:11.156858

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "94af7ef02eb9"
down_revision: Union[str, None] = "de4b367d4055"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_entries",
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("user_entries", "is_hidden", server_default=None)


def downgrade() -> None:
    op.drop_column("user_entries", "is_hidden")
