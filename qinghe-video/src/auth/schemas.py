"""鉴权 API 请求/响应模型。"""
from pydantic import BaseModel, Field, ConfigDict

class UserCreate(BaseModel):
    """用户注册请求。"""
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)

class UserLogin(BaseModel):
    """用户登录请求。"""
    username: str
    password: str

class Token(BaseModel):
    """JWT 令牌响应。"""
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str

class UserOut(BaseModel):
    """用户信息响应。"""
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    is_active: bool
