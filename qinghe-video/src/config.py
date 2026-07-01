"""配置加载模块。

使用 pydantic-settings 从 .env 文件加载所有配置项，
支持 OpenAI / DeepSeek / Qwen 等兼容接口切换。
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


# 项目根目录（qinghe-video/）
PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """应用全局配置。

    所有字段均可通过 .env 文件或环境变量覆盖。
    """

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ---------- LLM 配置 ----------
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_API_KEY: str = ""
    LLM_TEMPERATURE: float = 0.7
    LLM_MAX_TOKENS: int = 2048

    # ---------- 应用配置 ----------
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 18739
    LOG_LEVEL: str = "INFO"

    # ---------- 前端配置 ----------
    STREAMLIT_PORT: int = 18510
    BACKEND_URL: str = "http://localhost:18739"

    # ---------- 图片生成配置（OpenAI 兼容中转站） ----------
    APILINK_API_BASE_URL: str = "https://agaigw.com"
    AIAPIAL_API_KEY: str = ""
    IMAGE_MODEL: str = "doubao-seedream-5-0-260128"
    IMAGE_SIZE: str = "1920x1920"
    IMAGE_RESPONSE_FORMAT: str = "url"
    VIDEO_MODEL: str = "doubao-seedance-2-0-260128"
    VIDEO_SIZE: str = "1280x720"

    # ---------- 图片编辑生成配置（gpt-image-2） ----------
    IMAGE_EDIT_API_URL: str = "https://aiapiall.com/v1/images/generations"
    IMAGE_EDIT_API_KEY: str = ""
    # 前端可选的图片模型列表（逗号分隔），未配置时回退为 [IMAGE_MODEL]。
    # 供无限画布生成节点的模型下拉框使用。
    IMAGE_MODEL_OPTIONS: str = ""

    # ---------- 图像处理工作室配置（九宫格导演板） ----------
    IMAGE_STUDIO_CELL_SIZE: str = "640x640"     # 九宫格单格尺寸
    IMAGE_STUDIO_GRID_GAP: int = 16             # 九宫格间距
    IMAGE_STUDIO_LABEL_HEIGHT: int = 40         # 标签条高度

    # ---------- TTS 配音配置 ----------
    tts_voice: str = "zh-CN-XiaoxiaoNeural"
    tts_rate: str = "+0%"
    tts_volume: str = "+0%"

    # ---------- 视频合成配置 ----------
    video_fps: int = 30
    video_resolution: str = "1080x1920"
    video_per_image_duration: float = 3.5

    # ---------- 鉴权与数据库配置 ----------
    SQLITE_PATH: str = "qinghe.db"
    JWT_SECRET: str = "qinghe-dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24        # 24 小时
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """获取全局配置单例。

    Returns:
        Settings: 加载完成的配置实例。
    """
    return Settings()


# 默认配置实例，供各模块直接 import
settings = get_settings()


def get_prompt(prompt_name: str) -> str:
    """读取 prompts 目录下的 system prompt 文本。

    Args:
        prompt_name: 不带扩展名的 prompt 文件名，如 "planner"。

    Returns:
        str: prompt 文本内容。
    """
    prompt_path = PROJECT_ROOT / "src" / "prompts" / f"{prompt_name}.txt"
    return prompt_path.read_text(encoding="utf-8")


def get_system_prompt(prompt_name: str) -> str:
    """读取 system prompt 并转义 LangChain f-string 模板中的大括号。

    因为 system prompt 中包含 JSON 示例，直接传入 ChatPromptTemplate 会被
    LangChain 当作模板变量解析，导致 ``Nested replacement fields`` 错误。
    此函数将 ``{`` 和 ``}`` 分别转义为 ``{{`` 和 ``}}``，使 JSON 原样输出。

    注意：当前所有 system prompt 文件中不包含真正的模板变量，因此统一转义安全。

    Args:
        prompt_name: 不带扩展名的 prompt 文件名，如 "planner"。

    Returns:
        str: 已转义的 prompt 文本内容。
    """
    return get_prompt(prompt_name).replace("{", "{{").replace("}", "}}")


def get_image_model_options() -> list[str]:
    """解析前端可选的图片模型列表。

    优先读取 ``IMAGE_MODEL_OPTIONS``（逗号分隔），为空时回退为 ``[IMAGE_MODEL]``，
    去重并保留顺序。

    Returns:
        list[str]: 可选模型 id 列表，至少包含 1 项。
    """
    raw = settings.IMAGE_MODEL_OPTIONS.strip()
    if not raw:
        return [settings.IMAGE_MODEL]
    seen: set[str] = set()
    options: list[str] = []
    for item in raw.split(","):
        name = item.strip()
        if name and name not in seen:
            seen.add(name)
            options.append(name)
    if settings.IMAGE_MODEL not in seen:
        options.insert(0, settings.IMAGE_MODEL)
    return options