# Debug Session: video-ascii-encode-error
- **Status**: [FIXED — pending user confirmation]
- **Issue**: 画布生成视频时后端返回 `'ascii' codec can't encode characters in position 9-13: ordinal not in range(128)`，即使已将 `src/canvas/service.py` 中部分中文日志改为英文后仍复现。
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-video-ascii-encode-error.ndjson

## Reproduction Steps
1. 启动前后端（`run.ps1` 或分别启动）。
2. 进入无限画布，创建生成节点并切换为「生视频」。
3. 填写中文提示词，连接参考图，点击生成。
4. 后端报错 `'ascii' codec can't encode characters...`。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Z | **.env 行内注释 `# 为空时复用 AIAPIAL_API_KEY` 被 python-dotenv 当成 `VIDEO_API_KEY` 的值，含中文导致 httpx 编码 Authorization 头失败** | **Confirmed** | **Low** | **api_key_len=23 = `# 为空时复用 AIAPIAL_API_KEY` 字符数；报错 position 9-13 对应 api_key 第 2-6 位「为空时复用」5 个中文字符** |
| B | Seedance 网关返回的错误/响应体在 `response.text` / `response.json()` 解码阶段使用 ASCII | Med | Low | Pending |
| C | `httpx` 序列化含中文的 JSON payload 时缺少 `charset=utf-8` 或环境默认编码为 ASCII | Med | Low | Pending |
| D | 本地文件路径/参考图 base64 转码在含中文提示词时进入某条分支触发 ASCII 编码 | Low | Med | Pending |
| E | `uvicorn` / Windows PowerShell 的 stdout 编码为 ASCII，导致任何非 ASCII  traceback 打印失败 | High | Low | Pending |

## Instrumentation
- `src/canvas/service.py`：新增 `_report_video_ascii` 并打点 `run_generate_video` 入口、调用 `generate_video` 前后、异常捕获（含 traceback）。
- `src/video_generation.py`：新增 `_report_video_ascii` 并打点 `generate_video` 入口、`submit_video_generation` entry / payload / response / HTTP 异常。
- `src/canvas/router.py`：在 `GET /api/canvas/projects` 增加异常捕获与 traceback 上报。
- Debug Server 已启动：`http://127.0.0.1:7777/event`

## Log Evidence
- 2026-07-03 复现：异常类型为 `UnicodeEncodeError`，消息 `'ascii' codec can't encode characters in position 9-13: ordinal not in range(128)`；异常发生在 `video_generation.py:generate_video:entry` 之后、`submit_video_generation:response` 之前，说明在请求发送阶段触发。
- 下一步：通过 payload 打点 + traceback  pinpoint 具体代码行。
- 新发现：用户反馈 `GET /api/canvas/projects` 返回 500，可能与视频错误独立，也可能是后端异常后的连锁反应；已插桩捕获。

## Verification Conclusion

### Root Cause
`.env` 第 42 行 `VIDEO_API_KEY=                       # 为空时复用 AIAPIAL_API_KEY` 中的行内注释被 python-dotenv 当成了 `VIDEO_API_KEY` 的值（23 字符，含 5 个中文字符「为空时复用」）。`_get_video_api_key()` 用 `settings.VIDEO_API_KEY or settings.AIAPIAL_API_KEY`，由于该值是 truthy 字符串，不会回退，直接拿含中文的串构造 `Authorization: Bearer # 为空时复用 AIAPIAL_API_KEY`。httpx 在 `_normalize_header_value` 用 ASCII 编码头值时崩溃，报错 position 9-13 正好对应 5 个中文字符。

### Pre-fix vs Post-fix
| 项 | Pre-fix | Post-fix |
|---|---|---|
| `settings.VIDEO_API_KEY` | `'# 为空时复用 AIAPIAL_API_KEY'` (23 chars, 含中文) | `''` (空) |
| `_get_video_api_key()` 返回 | `'# 为空时复用 AIAPIAL_API_KEY'` | `'sk-cd2X13LIsKbO4eTAIcjEyLeSJYXCbLupU3cMrJMuXUfq1vw2'` (51 chars, 纯 ASCII) |
| `Authorization` 头编码 | ASCII 编码失败 → 500 | 正常 |
| pytest tests/ | 131 passed | 131 passed |

### Fix Applied
1. `.env` 第 42 行：`VIDEO_API_KEY=                       # 为空时复用 AIAPIAL_API_KEY` → `VIDEO_API_KEY=`（移除被误解析的行内注释）
2. `src/video_generation.py` `_get_video_api_key()`：加 `.strip()` + `#` 开头检测的防御逻辑，防止类似 .env 误配置再次触发

