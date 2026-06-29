"""Create assets table for user media assets persistence.

Revision ID: 002_assets
Revises: 001_initial
Create Date: 2026-06-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "002_assets"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create assets table.

    存储用户生成任务的相关图片/视频/音频，按 source（来源模块）+ media_type 分类。
    """
    op.create_table(
        "assets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("media_type", sa.String(16), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("url", sa.String(512), nullable=False),
        sa.Column("file_path", sa.String(512), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.String(128), nullable=True),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("meta_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_assets_user_id", "assets", ["user_id"])
    op.create_index("ix_assets_source", "assets", ["source"])
    op.create_index("ix_assets_created_at", "assets", ["created_at"])


def downgrade() -> None:
    """Drop assets table."""
    op.drop_index("ix_assets_created_at", table_name="assets")
    op.drop_index("ix_assets_source", table_name="assets")
    op.drop_index("ix_assets_user_id", table_name="assets")
    op.drop_table("assets")
