"""Create workshop_sessions table for workshop history persistence.

Revision ID: 004_workshop
Revises: 003_canvas
Create Date: 2026-06-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "004_workshop"
down_revision: Union[str, None] = "003_canvas"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create workshop_sessions table.

    存储分步工坊会话：state_json 整体序列化存储前端 workshop-store 的 persist 快照，
    支持多会话切换与跨设备恢复，与 canvas_projects 模式一致。
    """
    op.create_table(
        "workshop_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("state_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_workshop_sessions_user_id", "workshop_sessions", ["user_id"]
    )


def downgrade() -> None:
    """Drop workshop_sessions table."""
    op.drop_index(
        "ix_workshop_sessions_user_id", table_name="workshop_sessions"
    )
    op.drop_table("workshop_sessions")
