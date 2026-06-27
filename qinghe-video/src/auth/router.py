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
    """用户注册。"""
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = User(username=payload.username, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """用户登录，返回 JWT 令牌。"""
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已被禁用")
    token = create_access_token(subject=user.username)
    return Token(access_token=token, username=user.username, role=user.role)

@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    """获取当前用户信息。"""
    return current
