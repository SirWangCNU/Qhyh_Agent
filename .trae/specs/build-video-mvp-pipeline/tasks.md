# Tasks

- [x] Task 1: 新增 TTS 服务（edge-tts）
  - [x] SubTask 1.1: 在 `pyproject.toml` 新增依赖 edge-tts、moviepy、Pillow
  - [x] SubTask 1.2: 在 `src/config.py` 新增 TTS_VOICE、VIDEO_FPS、VIDEO_RESOLUTION 配置项
  - [x] SubTask 1.3: 新建 `src/tts_service.py`，实现 synthesize(text, output_path) → mp3
  - [x] SubTask 1.4: 在 `src/main.py` 新增 `POST /api/tts/generate` 端点
  - [x] SubTask 1.5: 验证 TTS 端点返回合法 mp3 文件

- [x] Task 2: 新增视频合成服务（moviepy + Pillow）
  - [x] SubTask 2.1: 新建 `src/video_compose.py`，实现 compose(images, audio_path, output_path) → mp4
  - [x] SubTask 2.2: 用 Pillow 把图片裁切缩放到 1080×1920 竖屏
  - [x] SubTask 2.3: 用 moviepy 拼接图片轮播（每张 3-4 秒）+ 叠加音频
  - [x] SubTask 2.4: 在 `src/main.py` 新增 `POST /api/video/compose` 端点
  - [x] SubTask 2.5: 验证合成端点返回可播放的 mp4

- [x] Task 3: 新增一键成片端点
  - [x] SubTask 3.1: 在 `src/main.py` 新增 `POST /api/video/mvp`，串联分镜取图 → TTS → 合成
  - [x] SubTask 3.2: 挂载 `outputs/` 静态目录供前端访问成片
  - [x] SubTask 3.3: 验证端到端：输入 state → 返回 mp4 下载 URL

- [x] Task 4: 前端 Agent 输出结构化渲染
  - [x] SubTask 4.1: 在 `agent-renderers.js` 新增 renderAgentOutput(stepKey, output) 分步渲染函数
  - [x] SubTask 4.2: 策划 Agent：主题、卖点列表、受众、情感基调、创意角度、视频类型、策略备注 分字段卡片
  - [x] SubTask 4.3: 文案 Agent：Hook、口播正文、CTA 分块展示
  - [x] SubTask 4.4: 脚本 Agent：分镜表格（镜头号/画面/旁白/运镜/时长）
  - [x] SubTask 4.5: 视觉 Agent：分镜 Prompt 卡片（含 shot_id、prompt、negative_prompt）
  - [x] SubTask 4.6: 投放 Agent：标题候选、标签、发布时间、推广策略 分字段
  - [x] SubTask 4.7: 报告 Agent：Markdown 渲染（非纯文本）
  - [x] SubTask 4.8: 在 `style.css` 新增 Agent 输出卡片样式（字段标签 + 值的排版）

- [x] Task 5: 前端图片生成流程完善
  - [x] SubTask 5.1: 改造 `workshop.js` generateImages 为逐张独立请求 + 独立加载态
  - [x] SubTask 5.2: 每张图片卡片新增「重生」按钮，单张重新生成
  - [x] SubTask 5.3: 图片加载失败时显示重试按钮
  - [x] SubTask 5.4: 在 `style.css` 新增图片卡片加载态与重试按钮样式

- [x] Task 6: 前端一键成片与播放下载
  - [x] SubTask 6.1: 在 `index.html` 素材区新增「一键成片」按钮与视频播放区
  - [x] SubTask 6.2: 在 `video-compose-ui.js` 新增 composeVideo 函数，调用 `POST /api/video/mvp`
  - [x] SubTask 6.3: 成片完成后渲染 `<video>` 播放器 + 「下载成片」按钮
  - [x] SubTask 6.4: 在 `style.css` 新增视频播放区样式

- [x] Task 7: 端到端验证
  - [x] SubTask 7.1: 运行 pytest 确保现有测试不回归
  - [x] SubTask 7.2: 启动后端，手动验证 6 Agent 分步执行产出结构化展示
  - [x] SubTask 7.3: 验证图片逐张生成 + 单张重生
  - [x] SubTask 7.4: 验证一键成片产出可播放 mp4

# Task Dependencies
- [Task 2] depends on [Task 1]（视频合成需要 TTS 音频）
- [Task 3] depends on [Task 1] 和 [Task 2]
- [Task 6] depends on [Task 3]（前端成片调用后端端点）
- [Task 4] 和 [Task 5] 可与 [Task 1-3] 并行
- [Task 7] depends on 全部任务
