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
    """获取当前已认证的用户。"""
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
    """获取当前管理员用户（需要 admin 角色）。"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user
