# 青禾映画 · SQLite + JWT 鉴权机制实现方案（含 Alembic 迁移）

## 一、方案概要

为现有 FastAPI 后端增加一套基于 **SQLite + SQLAlchemy ORM + Alembic 迁移 + JWT** 的轻量级鉴权机制：

- **数据存储先行**：在 `src/db/` 新建独立数据访问层，模块化、零侵入现有 LangGraph 流水线代码。
- **Alembic 迁移管理**：所有 schema 变更通过迁移脚本版本控制，而非 `create_all()` 一次性建表。
- **管理员账号**：通过 Alembic 数据迁移脚本在 `upgrade()` 中插入默认 `admin / admin123` 记录。
- **预留注册接口**：`POST /api/auth/register` 允许后续扩展多用户，`User` 表已含 `role` 字段。
- **JWT 令牌**：登录返回 access token，前端存 `localStorage`，请求头携带 `Authorization: Bearer <token>`。
- **精美前端登录页**：匹配现有「编辑式有机风（Editorial Organic）」设计系统。

技术栈选型：

| 维度 | 选择 | 依赖 |
| --- | --- | --- |
| 数据库 | SQLite（文件 `qinghe.db`） | Python 标准库 |
| ORM | SQLAlchemy 2.x | `sqlalchemy>=2.0` |
| 数据库迁移 | Alembic | `alembic>=1.12` |
| 密码哈希 | bcrypt | `passlib[bcrypt]>=1.7` |
| JWT | python-jose | `python-jose[cryptography]>=3.3` |
| 令牌策略 | JWT（无状态） | — |
| 用户范围 | admin + 预留注册接口 | — |

---

## 二、现状分析

### 2.1 现有架构关键点
- **入口**：[main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py) 中 `app = FastAPI(...)` 在 line 42 构造，**无 `lifespan` 钩子**，所有路由直接挂在 `app` 上，无 `APIRouter`。
- **单例模式**：[config.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py#L66-L77) 用 `@lru_cache(maxsize=1)` + 模块级 `settings = get_settings()`；[graph.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/graph.py) 用模块级 `app_graph = build_graph()`。**新 DB 引擎应复用此模式**。
- **零鉴权**：全代码无 `Depends`、无 middleware、无 `Authorization` 头。
- **10 个端点**全部无保护，其中 8 个需要保护（见下表）。
- **静态挂载**：[main.py#L62](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py#L62) `/assets` 与 [main.py#L71](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py#L71) `/outputs` 用 `StaticFiles`，**绕过 FastAPI 依赖项**，无法用 `Depends` 保护。
- **CORS 配置**：[main.py#L49-L55](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py#L49-L55) `allow_origins=["*"]` + `allow_credentials=True`，JWT 模式不依赖 cookie，暂不修改。
- **前端无 token 存储**：7 处 `fetch()` 调用各自构造 headers，无共享封装。
- **设计系统**：[style.css#L8-L41](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/css/style.css#L8-L41) 已定义完整 CSS 变量令牌，新登录页直接复用。
- **配置扩展安全**：[config.py#L27](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py#L27) `extra="ignore"`，新增 Settings 字段不会破坏现有 `.env`。
- **无现有数据库代码**：项目当前零数据库依赖，完全内存状态。

### 2.2 端点保护分类

| 路径 | 处理 |
| --- | --- |
| `GET /` | **保持公开** |
| `GET /api/health` | **保持公开** |
| `GET /assets/*` | **保持公开** |
| `GET /outputs/*` | **保持公开**（文件名含随机熵，无法携带 Bearer） |
| `POST /api/auth/login` | **新增，公开** |
| `POST /api/auth/register` | **新增，公开** |
| `GET /api/auth/me` | **新增，受保护** |
| `POST /api/agents/{step}` | **加保护** |
| `POST /api/images/generate` | **加保护** |
| `POST /api/videos/generate` | **加保护** |
| `POST /api/tts/generate` | **加保护** |
| `POST /api/video/compose` | **加保护** |
| `POST /api/video/mvp` | **加保护** |
| `POST /api/generate` | **加保护** |
| `POST /api/generate/stream` | **加保护** |

---

## 三、实现步骤

### 阶段 A · 依赖与配置

#### A1. 新增依赖

**修改文件**：[qinghe-video/pyproject.toml](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/pyproject.toml)

在 `dependencies` 列表追加：
```toml
"sqlalchemy>=2.0",
"alembic>=1.12",
"passlib[bcrypt]>=1.7",
"python-jose[cryptography]>=3.3",
```

安装命令：`pip install -e ".[dev]"`

#### A2. 扩展配置

**修改文件**：[qinghe-video/src/config.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py)

在 `Settings` 类末尾（L63 之后）追加：
```python
# ---------- 鉴权与数据库配置 ----------
SQLITE_PATH: str = "qinghe.db"
JWT_SECRET: str = "qinghe-dev-secret-change-me"
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_MINUTES: int = 60 * 24        # 24 小时
ADMIN_USERNAME: str = "admin"
ADMIN_PASSWORD: str = "admin123"
```

同步更新 `.env.example` 末尾追加对应键值。

---

### 阶段 B · 数据库层（SQLAlchemy + Alembic）

#### B1. 数据库引擎与会话工厂

**新建文件**：`qinghe-video/src/db/__init__.py`（空包标记）

**新建文件**：`qinghe-video/src/db/database.py`

```python
"""SQLite 数据库引擎与会话工厂。"""
from pathlib import Path
from functools import lru_cache
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from src.config import settings, PROJECT_ROOT

SQLITE_URL = f"sqlite:///{(PROJECT_ROOT / settings.SQLITE_PATH).resolve()}"

@lru_cache(maxsize=1)
def get_engine():
    return create_engine(SQLITE_URL, echo=False, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=get_engine(), autocommit=False, autoflush=False)
Base = declarative_base()

def get_db():
    """FastAPI 依赖：每个请求注入一个 DB 会话，请求结束自动关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

#### B2. 用户 ORM 模型

**新建文件**：`qinghe-video/src/db/models.py`

```python
"""用户表 ORM 模型。"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from src.db.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(16), default="user", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
```

#### B3. Alembic 迁移初始化

**新建文件**：`qinghe-video/alembic.ini`

标准 Alembic 配置文件，修改关键行：
```ini
[alembic]
script_location = alembic
sqlalchemy.url = sqlite:///qinghe.db
```

> `sqlalchemy.url` 在运行时会被 `env.py` 中的代码覆盖，此处仅为占位。

**新建文件**：`qinghe-video/alembic/env.py`

核心改动 — 从 `src.db.database` 导入 `Base` 和 `SQLITE_URL`：
```python
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from src.db.database import Base, SQLITE_URL
from src.db import models  # noqa: F401 — 确保 ORM 模型被加载到 Base.metadata

config = context.config
config.set_main_option("sqlalchemy.url", SQLITE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

**新建文件**：`qinghe-video/alembic/script.py.mako`

标准 Mako 模板（`alembic init` 自动生成的默认内容即可）。

**新建目录**：`qinghe-video/alembic/versions/`（空目录）

#### B4. 初始迁移脚本

**新建文件**：`qinghe-video/alembic/versions/001_create_users_table.py`

```python
"""创建 users 表 + 注入默认管理员账号。

Revision ID: 001_initial
"""
from alembic import op
import sqlalchemy as sa
from passlib.context import CryptContext

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def upgrade():
    # 建表
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    # 注入默认管理员（密码从环境变量读取，若未设置则用默认值）
    import os
    admin_user = os.getenv("ADMIN_USERNAME", "admin")
    admin_pass = os.getenv("ADMIN_PASSWORD", "admin123")
    hashed = pwd_context.hash(admin_pass)
    op.execute(
        f"INSERT INTO users (username, hashed_password, role, is_active) "
        f"VALUES ('{admin_user}', '{hashed}', 'admin', 1)"
    )

def downgrade():
    op.drop_table("users")
```

> 注：迁移脚本中 SQL 直接执行是 Alembic 推荐的数据迁移方式（op.execute），因为此时 ORM model 可能已变更。

#### B5. Alembic 使用命令

```powershell
cd qinghe-video

# 首次初始化（生成迁移脚本目录、env.py、alembic.ini）
# 注意：这些文件我们会手动创建，无需运行 alembic init

# 执行迁移（建表 + 注入 admin）
alembic upgrade head

# 后续新增表或字段变更时，生成新迁移脚本
alembic revision --autogenerate -m "描述变更内容"

# 查看当前迁移版本
alembic current

# 回滚一个版本
alembic downgrade -1

# 查看迁移历史
alembic history
```

---

### 阶段 C · 鉴权逻辑层

#### C1. 安全工具（密码哈希 + JWT）

**新建文件**：`qinghe-video/src/auth/__init__.py`（空包标记）

**新建文件**：`qinghe-video/src/auth/security.py`

```python
"""密码哈希与 JWT 工具。"""
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from src.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
    minutes = expires_minutes if expires_minutes is not None else settings.JWT_EXPIRE_MINUTES
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None
```

#### C2. Pydantic Schemas

**新建文件**：`qinghe-video/src/auth/schemas.py`

```python
"""鉴权 API 请求/响应模型。"""
from pydantic import BaseModel, Field, ConfigDict

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    is_active: bool
```

#### C3. FastAPI 依赖项

**新建文件**：`qinghe-video/src/auth/dependencies.py`

```python
"""FastAPI 鉴权依赖项。"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import User
from src.auth.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    username = decode_access_token(token)
    if not username:
        raise credentials_exc
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active:
        raise credentials_exc
    return user

def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user
```

#### C4. 鉴权路由

**新建文件**：`qinghe-video/src/auth/router.py`

```python
"""鉴权 API 路由。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import User
from src.auth.security import verify_password, hash_password, create_access_token
from src.auth.schemas import UserCreate, UserLogin, Token, UserOut
from src.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = User(username=payload.username, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已被禁用")
    token = create_access_token(subject=user.username)
    return Token(access_token=token, username=user.username, role=user.role)

@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return current
```

---

### 阶段 D · 后端集成（修改现有文件）

#### D1. 修改 main.py

**修改文件**：[qinghe-video/src/main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py)

**改动 1**：import 区追加：
```python
from contextlib import asynccontextmanager
from src.auth.router import router as auth_router
from src.auth.dependencies import get_current_user
```

**改动 2**：增加 lifespan（数据库迁移在启动前由 Alembic CLI 完成，此处无需 create_all）：
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(..., lifespan=lifespan)
```

**改动 3**：注册路由：
```python
app.include_router(auth_router)
```

**改动 4**：为 8 个需要保护的端点添加参数：
```python
from src.db.models import User

# 在每个需要保护的端点函数签名中追加：
_current_user: User = Depends(get_current_user)
```

涉及端点（按行号顺序）：
- `run_agent_step_api` (L89)
- `generate_image_asset` (L103)
- `generate_video_asset` (L120)
- `generate_tts` (L134)
- `compose_video_endpoint` (L174)
- `video_mvp_endpoint` (L208)
- `generate` (L232)
- `generate_stream` (L279)

---

### 阶段 E · 前端登录页与 Token 注入

#### E1. 新增 auth.css

**新建文件**：`qinghe-video/frontend/assets/css/auth.css`

完全复用 [style.css](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/css/style.css#L8-L41) 的设计令牌：

- 全屏遮罩 `backdrop-filter: blur(8px);` + `background: rgba(245, 241, 232, 0.92);`
- 居中卡片 `max-width: 420px; background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);`
- 顶部麦穗 SVG 图标
- 标题 `var(--font-display)` 衬线字体
- 输入框：底部细线样式，focus 变 `--color-brand`
- 主按钮：`background: var(--color-brand); color: #fff;`
- 错误提示：`--color-warn` 陶土橙
- 切换登录/注册：`--color-accent` 麦穗金

#### E2. 新增 auth.js

**新建文件**：`qinghe-video/frontend/assets/js/auth.js`

职责：
- `Q.auth` 命名空间：`getToken()` / `setToken()` / `clearToken()` — localStorage `qinghe_token`
- `Q.auth.getUser()` / `setUser()` / `clearUser()` — 缓存用户信息
- **fetch 包装（monkey-patch）**：拦截 `window.fetch`，为 `/api/*` 请求自动注入 `Authorization: Bearer <token>`，401 时触发登出
- `Q.auth.requireAuth()` — 页面加载时检查 token，无则显示登录遮罩
- `Q.auth.login()` / `register()` / `logout()`
- 登录/注册表单 DOM 事件绑定

fetch 包装核心逻辑：
```javascript
var originalFetch = window.fetch;
window.fetch = function (url, opts) {
  opts = opts || {};
  var target = typeof url === "string" ? url : (url && url.url) || "";
  if (target.indexOf("/api/") !== -1) {
    var token = Q.auth.getToken();
    if (token) {
      opts.headers = opts.headers || {};
      if (opts.headers instanceof Headers) {
        opts.headers.set("Authorization", "Bearer " + token);
      } else {
        opts.headers["Authorization"] = "Bearer " + token;
      }
    }
  }
  return originalFetch.call(this, url, opts).then(function (resp) {
    if (resp.status === 401) { Q.auth.logout(); }
    return resp;
  });
};
```

> `/outputs/*` 不匹配 `/api/` 前缀，不注入 token，媒体资源保持公开。

#### E3. 修改 index.html

**修改文件**：[qinghe-video/frontend/index.html](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html)

**改动 1**：`</head>` 前追加：
```html
<link rel="stylesheet" href="assets/css/auth.css" />
```

**改动 2**：`<body>` 起始处（`<header>` 之前）插入登录遮罩 DOM：
```html
<div class="auth-overlay" id="authOverlay" hidden>
  <div class="auth-card">
    <div class="auth-card__brand"><!-- 麦穗 SVG（复用现有设计） --></div>
    <h2 class="auth-card__title">青禾映画 · 管理登录</h2>
    <form id="loginForm">...</form>
    <form id="registerForm" hidden>...</form>
    <p class="auth-card__toggle" id="authToggle">还没有账号？立即注册</p>
  </div>
</div>
```

**改动 3**：`</body>` 前，在 `app.js` 之前插入：
```html
<script src="assets/js/auth.js"></script>
```

**改动 4**：导航栏增加登出按钮：
```html
<button class="nav__logout" id="navLogout" hidden>登出</button>
```

---

### 阶段 F · 测试

#### F1. 鉴权单元测试

**新建文件**：`qinghe-video/tests/test_auth.py`

使用 `sqlite:///:memory:` 临时引擎 + `TestClient`，不影响项目 `qinghe.db`：

- `test_password_hash_and_verify` — 哈希后验证通过
- `test_jwt_create_and_decode` — 编码解码还原 username
- `test_jwt_invalid_token_returns_none` — 损坏 token 返回 None
- `test_user_model_create` — User ORM 对象构造正常
- `test_register_duplicate_username_400` — 重复注册 400
- `test_login_wrong_password_401` — 错误密码 401
- `test_protected_endpoint_without_token_401` — 无 token 访问受保护端点 401
- `test_protected_endpoint_with_valid_token_200` — 有效 token 访问成功

---

## 四、文件清单

### 新建文件（16 个）

| 路径 | 作用 |
| --- | --- |
| `src/db/__init__.py` | 包标记 |
| `src/db/database.py` | 引擎 + SessionLocal + get_db |
| `src/db/models.py` | User ORM 模型 |
| `src/auth/__init__.py` | 包标记 |
| `src/auth/security.py` | bcrypt + JWT 工具 |
| `src/auth/schemas.py` | 请求/响应 Pydantic 模型 |
| `src/auth/dependencies.py` | get_current_user / get_current_admin |
| `src/auth/router.py` | /api/auth/{login,register,me} |
| `alembic.ini` | Alembic 配置 |
| `alembic/env.py` | Alembic 环境（加载 ORM 模型） |
| `alembic/script.py.mako` | 迁移脚本模板 |
| `alembic/versions/001_create_users_table.py` | 初始迁移：建表 + 注入 admin |
| `frontend/assets/css/auth.css` | 登录页样式 |
| `frontend/assets/js/auth.js` | 前端 token 管理 + fetch 包装 |
| `tests/test_auth.py` | 鉴权单测 |

### 修改文件（4 个）

| 路径 | 改动 |
| --- | --- |
| [pyproject.toml](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/pyproject.toml) | 追加 sqlalchemy / alembic / passlib[bcrypt] / python-jose[cryptography] |
| [src/config.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py) | Settings 追加 6 个鉴权字段 |
| [src/main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py) | lifespan + include_router + 8 端点加 Depends |
| [frontend/index.html](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html) | 加 auth.css/js、登录遮罩 DOM、登出按钮 |

---

## 五、假设与决策

### 5.1 关键设计决策

1. **Alembic 而非 create_all()**：所有 schema 变更通过迁移脚本版本控制，生产部署安全可追溯。
2. **admin 账号注入在迁移脚本中**：`001_create_users_table.py` 的 `upgrade()` 直接 INSERT admin 记录，与建表原子化，不依赖应用启动逻辑。
3. **`/outputs/*` 保持公开**：媒体文件由 `<audio>`/`<video>` 标签加载，无法注入 Bearer 头。文件名含 12 位 hex 随机熵。
4. **Token 存 `localStorage`**：关闭浏览器再打开仍保持登录。XSS 风险通过同源策略缓解。
5. **fetch 包装而非重写**：对 `window.fetch` monkey-patch 自动注入 token，避免修改 7 处现有调用点。
6. **同步 SQLAlchemy**：不引入 aiosqlite，与现有同步端点保持一致。
7. **`role` 字段预留**：注册默认 `role="user"`，`admin` 为初始化账号。

### 5.2 已知限制

- **无刷新令牌（refresh token）**：24 小时过期后需重新登录。
- **无登录失败限速**：如需可后续加 `slowapi`。
- **Streamlit 前端未集成**：未加 token 注入，请求会 401。

---

## 六、验证步骤

### 6.1 安装与迁移
```powershell
cd qinghe-video
pip install -e ".[dev]"

# 执行数据库迁移（建表 + 注入 admin）
alembic upgrade head
```

### 6.2 单元测试
```powershell
pytest tests/test_auth.py -v
pytest tests/ -v   # 全量回归
```

### 6.3 启动与 API 验证
```powershell
uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload

# 未登录访问受保护端点 → 401
curl -X POST http://localhost:18739/api/generate -H "Content-Type: application/json" -d '{"product_name":"test"}'

# 登录 → 拿到 token
$resp = curl -X POST http://localhost:18739/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | ConvertFrom-Json
$token = $resp.access_token

# 带 token 访问 /api/auth/me
curl -H "Authorization: Bearer $token" http://localhost:18739/api/auth/me

# 注册新用户
curl -X POST http://localhost:18739/api/auth/register -H "Content-Type: application/json" -d '{"username":"user1","password":"pass1234"}'
```

### 6.4 数据库迁移验证
```powershell
# 查看当前迁移版本
alembic current

# 查看迁移历史
alembic history

# 验证 admin 记录
sqlite3 qinghe.db "SELECT id, username, role, is_active FROM users;"
# 预期：1|admin|admin|1
```

### 6.5 前端验证
1. 浏览器打开 `http://localhost:18739/` → 登录遮罩自动弹出
2. 输入 `admin / admin123` → 登录成功，遮罩消失
3. 刷新页面 → 保持登录态（localStorage）
4. 点击「登出」→ 清空 token，回到登录页
5. 切换注册表单 → 注册新用户后自动登录

---

## 七、实施顺序

1. 修改 `pyproject.toml` + `pip install -e ".[dev]"` 装依赖
2. 修改 `src/config.py` 追加 6 个 Settings 字段 + 更新 `.env.example`
3. 新建 `src/db/` 3 个文件（database / models / __init__）
4. 新建 `src/auth/` 5 个文件（security / schemas / dependencies / router / __init__）
5. 新建 Alembic 配置（alembic.ini / env.py / script.py.mako / versions/001）
6. `alembic upgrade head` 执行迁移
7. 修改 `src/main.py`：lifespan + include_router + 8 端点加 Depends
8. 新建 `tests/test_auth.py`，运行 `pytest tests/ -v` 全绿
9. 启动后端，API 手动验证
10. 新建 `frontend/assets/css/auth.css` + `frontend/assets/js/auth.js`
11. 修改 `frontend/index.html`
12. 浏览器全流程验证
