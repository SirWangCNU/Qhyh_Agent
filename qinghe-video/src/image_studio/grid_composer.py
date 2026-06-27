"""Pillow 九宫格拼接：把 9 张变体图拼成 3×3 导演板。

每格含图片 + 维度标签条，失败的格子用灰色占位 + 错误文字。
参考 src/video_compose.py 的 Pillow 用法（Image.open/resize/LANCZOS）。
"""

from __future__ import annotations

import io
import logging
import time

import httpx
from PIL import Image, ImageDraw

from src.config import PROJECT_ROOT, settings
from src.image_studio.models import VariantImageResult

logger = logging.getLogger(__name__)

_OUTPUTS_IMAGE_DIR = PROJECT_ROOT / "outputs" / "image"


def _parse_cell_size(size_str: str) -> tuple[int, int]:
    """解析 640x640 → (640, 640)。"""
    try:
        w, h = size_str.lower().split("x")
        return int(w), int(h)
    except Exception:
        return 640, 640


def _load_image(image_url: str, cell_w: int, cell_h: int) -> Image.Image:
    """从相对 URL 或绝对 URL 加载图片，缩放到 cell 尺寸（cover 模式居中裁切）。"""
    if image_url.startswith(("http://", "https://")):
        with httpx.Client(timeout=60, follow_redirects=True) as client:
            resp = client.get(image_url)
            resp.raise_for_status()
            img_bytes = resp.content
    else:
        # 相对路径 /outputs/image/xxx.jpg → 项目根 + 路径
        local_path = PROJECT_ROOT / image_url.lstrip("/")
        img_bytes = local_path.read_bytes()

    with Image.open(io.BytesIO(img_bytes)) as img:
        img = img.convert("RGB")
        # cover 模式：保持比例居中裁切到 cell 宽高比，再缩放
        target_ratio = cell_w / cell_h
        current_ratio = img.width / img.height
        if current_ratio > target_ratio:
            new_w = int(img.height * target_ratio)
            left = (img.width - new_w) // 2
            img = img.crop((left, 0, left + new_w, img.height))
        else:
            new_h = int(img.width / target_ratio)
            top = (img.height - new_h) // 2
            img = img.crop((0, top, img.width, top + new_h))
        return img.resize((cell_w, cell_h), Image.Resampling.LANCZOS)


def _make_placeholder(cell_w: int, cell_h: int, label: str) -> Image.Image:
    """生成失败的灰色占位格。"""
    img = Image.new("RGB", (cell_w, cell_h), color=(200, 200, 200))
    draw = ImageDraw.Draw(img)
    # 简单居中文字（用默认字体）
    text = "生成失败"
    try:
        bbox = draw.textbbox((0, 0), text)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(((cell_w - tw) // 2, (cell_h - th) // 2), text, fill=(120, 120, 120))
    except Exception:
        pass
    return img


def compose_grid(
    variants: list[VariantImageResult],
) -> str:
    """把 9 张变体图拼成 3×3 九宫格，返回相对 URL /outputs/image/grid_xxx.jpg。

    Args:
        variants: 9 个变体图结果（含成功与失败）

    Returns:
        str: 九宫格图相对 URL
    """
    _OUTPUTS_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    cell_w, cell_h = _parse_cell_size(settings.IMAGE_STUDIO_CELL_SIZE)
    gap = settings.IMAGE_STUDIO_GRID_GAP
    label_h = settings.IMAGE_STUDIO_LABEL_HEIGHT

    cols, rows = 3, 3
    canvas_w = cell_w * cols + gap * (cols + 1)
    canvas_h = (cell_h + label_h) * rows + gap * (rows + 1)
    canvas = Image.new("RGB", (canvas_w, canvas_h), color=(245, 243, 238))
    draw = ImageDraw.Draw(canvas)

    for idx, variant in enumerate(variants):
        row = idx // cols
        col = idx % cols
        x = gap + col * (cell_w + gap)
        y = gap + row * (cell_h + label_h + gap)

        # 加载图片或占位
        if variant.image_url and variant.error is None:
            try:
                img = _load_image(variant.image_url, cell_w, cell_h)
            except Exception as e:
                logger.warning("[ImageStudio] 九宫格加载变体 %d 失败: %s", variant.variant_id, e)
                img = _make_placeholder(cell_w, cell_h, "生成失败")
        else:
            img = _make_placeholder(cell_w, cell_h, "生成失败")

        canvas.paste(img, (x, y))

        # 标签条背景
        label_bg_color = (61, 90, 61)  # --color-brand
        draw.rectangle([x, y + cell_h, x + cell_w, y + cell_h + label_h], fill=label_bg_color)
        # 标签文字（白色，居中）
        label_text = f"{variant.variant_id}. {variant.dimension_label}"
        try:
            bbox = draw.textbbox((0, 0), label_text)
            tw = bbox[2] - bbox[0]
            tx = x + (cell_w - tw) // 2
            ty = y + cell_h + (label_h - (bbox[3] - bbox[1])) // 2 - 2
            draw.text((tx, ty), label_text, fill=(255, 255, 255))
        except Exception:
            draw.text((x + 8, y + cell_h + 8), label_text, fill=(255, 255, 255))

    ts = int(time.time() * 1000)
    filename = f"grid_{ts}.jpg"
    filepath = _OUTPUTS_IMAGE_DIR / filename
    canvas.save(filepath, format="JPEG", quality=90)
    logger.info("[ImageStudio] 九宫格已保存: %s", filepath)
    return f"/outputs/image/{filename}"
