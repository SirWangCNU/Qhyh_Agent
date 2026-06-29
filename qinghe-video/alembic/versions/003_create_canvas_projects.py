"""Create canvas_projects table for infinite canvas feature.

Revision ID: 003_canvas
Revises: 002_assets
Create Date: 2026-06-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "003_canvas"
down_revision: Union[str, None] = "002_assets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create canvas_projects table.

    存储无限画布项目：nodes/edges/viewport 整体 JSON 序列化存储，
    符合 React Flow 序列化模型，单用户百项目级别查询性能足够。
    """
    op.create_table(
        "canvas_projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("nodes_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("edges_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("viewport_json", sa.Text(), nullable=True),
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
    op.create_index("ix_canvas_projects_user_id", "canvas_projects", ["user_id"])


def downgrade() -> None:
    """Drop canvas_projects table."""
    op.drop_index("ix_canvas_projects_user_id", table_name="canvas_projects")
    op.drop_table("canvas_projects")
