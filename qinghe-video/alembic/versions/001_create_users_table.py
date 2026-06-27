"""Create users table and seed default admin.

Revision ID: 001_initial
Revises: None
Create Date: 2026-06-27
"""
from typing import Sequence, Union
import os

from alembic import op
import sqlalchemy as sa
import bcrypt

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create users table and seed default admin account."""
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    # Seed default admin (reads from env vars, falls back to defaults)
    admin_user = os.getenv("ADMIN_USERNAME", "admin")
    admin_pass = os.getenv("ADMIN_PASSWORD", "admin123")
    hashed = bcrypt.hashpw(admin_pass.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    op.execute(
        f"INSERT INTO users (username, hashed_password, role, is_active) "
        f"VALUES ('{admin_user}', '{hashed}', 'admin', 1)"
    )


def downgrade() -> None:
    """Drop users table."""
    op.drop_table("users")
