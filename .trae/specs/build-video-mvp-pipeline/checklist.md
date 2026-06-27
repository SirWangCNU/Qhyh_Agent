# Checklist

## 后端 TTS 服务
- [x] `pyproject.toml` 包含 edge-tts、moviepy、Pillow 依赖
- [x] `src/config.py` 包含 TTS_VOICE、VIDEO_FPS、VIDEO_RESOLUTION 配置项
- [x] `src/tts_service.py` 实现 synthesize 函数，输入文本输出 mp3
- [x] `POST /api/tts/generate` 端点正常返回 mp3 文件路径
- [x] 空文本传入时返回 400 错误

## 后端视频合成
- [x] `src/video_compose.py` 实现 compose 函数，输入图片列表 + 音频输出 mp4
- [x] 图片被裁切缩放到 1080×1920 竖屏比例
- [x] mp4 含旁白音频，时长与音频一致
- [x] `POST /api/video/compose` 端点正常返回 mp4 路径
- [x] 图片不足 1 张时返回 400 错误

## 后端一键成片
- [x] `POST /api/video/mvp` 端点串联生图 → TTS → 合成全流程
- [x] 返回的 mp4 URL 可被前端访问（outputs 静态目录已挂载）
- [x] 端到端：输入 workshop state → 返回可下载 mp4

## 前端 Agent 输出结构化
- [x] 策划 Agent 输出按字段分卡片展示（主题/卖点/受众/情感/创意/类型/策略）
- [x] 文案 Agent 输出分块展示（Hook/口播/CTA）
- [x] 脚本 Agent 输出分镜表格（镜头号/画面/旁白/运镜/时长）
- [x] 视觉 Agent 输出分镜 Prompt 卡片
- [x] 投放 Agent 输出分字段展示（标题/标签/时间/策略）
- [x] 报告 Agent 输出 Markdown 渲染
- [x] Agent 输出卡片样式符合农业编辑式有机风

## 前端图片生成流程
- [x] 点击「生成图片素材」后每张分镜图独立请求
- [x] 每张图片有独立加载态（骨架屏脉冲动画）
- [x] 每张已生成图片卡片有「重生」按钮
- [x] 点击「重生」仅重新生成该张图片
- [x] 图片加载失败时显示重试按钮

## 前端一键成片
- [x] 素材区有「一键成片」按钮
- [x] 点击后调用 `POST /api/video/mvp`
- [x] 成片完成后显示 `<video>` 播放器
- [x] 有「下载成片」按钮，点击下载 mp4
- [x] 视频播放区样式符合整体设计风格

## 端到端验证
- [x] `pytest tests/ -v` 全部通过（7 passed，无回归）
- [x] 6 Agent 分步执行后前端展示结构化产物（agent-renderers.js 已实现）
- [x] 图片逐张生成 + 单张重生功能正常（workshop.js 已实现）
- [x] 一键成片产出可播放的 9:16 mp4（实测 42859 bytes，HTTP 200 video/mp4）
- [x] 全流程无需登录、无需数据库、无需 Redis
