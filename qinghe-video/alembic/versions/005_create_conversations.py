"""Create conversations and conversation_messages tables.

Revision ID: 005_conversations
Revises: 004_workshop
Create Date: 2026-07-03

关系型两表设计：
- conversations: 会话元信息（标题、迭代数、消息数、时间戳）
- conversation_messages: 消息明细（role/type/content/meta_json/seq）

conversation_messages.conversation_id 外键 ON DELETE CASCADE，
依赖 SQLite PRAGMA foreign_keys=ON（在 database.py 的 connect 事件中开启）。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "005_conversations"
down_revision: Union[str, None] = "004_workshop"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create conversations + conversation_messages tables."""
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("summary", sa.String(500), nullable=True),
        sa.Column("iterations", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
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
    # 用户列表查询索引（user_id + updated_at 倒序）
    op.create_index(
        "ix_conversations_user_id",
        "conversations",
        ["user_id"],
    )

    op.create_table(
        "conversation_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.String(36),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("type", sa.String(16), nullable=False, server_default="text"),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("meta_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    # 消息分页与排序索引（conversation_id + seq 升序）
    op.create_index(
        "ix_conversation_messages_conversation_id_seq",
        "conversation_messages",
        ["conversation_id", "seq"],
    )


def downgrade() -> None:
    """Drop conversation_messages + conversations tables."""
    op.drop_index(
        "ix_conversation_messages_conversation_id_seq",
        table_name="conversation_messages",
    )
    op.drop_table("conversation_messages")
    op.drop_index("ix_conversations_user_id", table_name="conversations")
    op.drop_table("conversations")
