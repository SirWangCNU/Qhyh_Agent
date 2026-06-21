"""青禾映画 MVP 前端（Streamlit）。

单页面应用：左侧输入农产品信息，右侧展示多 Agent 生成的创作方案。
运行：streamlit run frontend/app.py
"""

from __future__ import annotations

import json
import os
import sys

import requests
import streamlit as st

# 将项目根目录加入 sys.path，便于从 .env 读取后端地址
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from src.config import settings  # noqa: E402

BACKEND_URL = os.getenv("BACKEND_URL", settings.BACKEND_URL).rstrip("/")
GENERATE_API = f"{BACKEND_URL}/api/generate"
GENERATE_STREAM_API = f"{BACKEND_URL}/api/generate/stream"
HEALTH_API = f"{BACKEND_URL}/api/health"

# Agent 名称映射（用于前端展示）
NODE_LABELS = {
    "planner": "🎯 策划 Agent",
    "copywriter": "✍️ 文案 Agent",
    "scriptwriter": "🎬 脚本 Agent",
    "visual_designer": "🎨 视觉 Agent",
    "distributor": "📢 投放 Agent",
    "report_generator": "📄 报告生成",
}

NODE_ORDER = ["planner", "copywriter", "scriptwriter", "visual_designer", "distributor", "report_generator"]


def parse_sse_stream(response):
    """解析 SSE 流，逐个 yield (event, data)。"""
    buffer = ""
    for chunk in response.iter_content(chunk_size=1024, decode_unicode=True):
        if not chunk:
            continue
        buffer += chunk
        while "\n\n" in buffer:
            block, buffer = buffer.split("\n\n", 1)
            event = None
            data_parts = []
            for line in block.split("\n"):
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    data_parts.append(line[5:].strip())
            if event is not None and data_parts:
                try:
                    data = json.loads("".join(data_parts))
                    yield event, data
                except json.JSONDecodeError as e:
                    st.error(f"解析 SSE 数据失败: {e}")


def render_node_status(current_node, completed_nodes, error_node=None):
    """渲染各 Agent 的执行状态徽章。"""
    badges = []
    for node in NODE_ORDER:
        label = NODE_LABELS.get(node, node)
        if error_node == node:
            badges.append(f"<span style='color:#ff4d4f;font-weight:600'>{label} ❌</span>")
        elif node == current_node:
            badges.append(f"<span style='color:#1890ff;font-weight:600'>{label} 🔄</span>")
        elif node in completed_nodes:
            badges.append(f"<span style='color:#52c41a;font-weight:600'>{label} ✅</span>")
        else:
            badges.append(f"<span style='color:#999'>{label} ⏳</span>")
    return " &nbsp;&nbsp; ".join(badges)


# ============================================================
# 页面配置
# ============================================================
st.set_page_config(
    page_title="青禾映画 · 农业短视频创作平台",
    page_icon="🌾",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.title("🌾 青禾映画")
st.caption("LangGraph 多 Agent 协同 · 农业短视频智能创作平台 MVP")
st.divider()


# ============================================================
# 输入表单
# ============================================================
with st.container(border=True):
    st.subheader("📋 农产品信息录入")

    col_left, col_right = st.columns(2)
    with col_left:
        product_name = st.text_input("产品名称 *", value="阳山水蜜桃", placeholder="如：阳山水蜜桃")
        origin = st.text_input("产地 *", value="江苏无锡", placeholder="如：江苏无锡")
        category = st.text_input("品类 *", value="水果", placeholder="如：水果 / 蔬菜 / 茶叶")
        selling_points = st.text_area(
            "卖点 *", value="汁多味甜、地理标志产品、百年种植历史", placeholder="用一句话描述核心卖点"
        )

    with col_right:
        target_platform = st.selectbox(
            "目标平台",
            options=["抖音", "快手", "视频号", "B站"],
            index=0,
        )
        target_duration = st.selectbox(
            "目标时长",
            options=["15-30秒", "30-60秒", "60-90秒", "90秒以上"],
            index=1,
        )
        additional_info = st.text_area(
            "补充信息（可选）",
            value="",
            placeholder="如：预算有限、希望突出产地溯源、有现成采摘素材等",
        )

    st.markdown("")
    generate_btn = st.button("🚀 一键生成创作方案", type="primary", use_container_width=True)


# ============================================================
# 结果展示
# ============================================================
if generate_btn:
    # 基本校验
    if not product_name or not origin or not category or not selling_points:
        st.error("请完整填写带 * 号的必填项")
        st.stop()

    # 后端连通性检查
    try:
        health_resp = requests.get(HEALTH_API, timeout=5)
        if health_resp.status_code != 200:
            st.error(f"后端服务异常：HTTP {health_resp.status_code}")
            st.stop()
    except requests.exceptions.RequestException as e:
        st.error(f"无法连接后端服务（{BACKEND_URL}），请先启动后端：`uvicorn src.main:app`\n\n{e}")
        st.stop()

    # 调用 SSE 流式生成接口
    payload = {
        "product_name": product_name,
        "origin": origin,
        "category": category,
        "selling_points": selling_points,
        "target_platform": target_platform,
        "target_duration": target_duration,
        "additional_info": additional_info,
    }

    progress_container = st.container()
    with progress_container:
        st.markdown("### 🔄 流水线执行进度")
        progress_bar = st.progress(0, "准备启动...")
        status_text = st.empty()
        node_status_md = st.empty()

    current_node = None
    completed_nodes = set()
    error_node = None
    task_id = None
    final_result = None
    error_msg = None

    try:
        with requests.post(
            GENERATE_STREAM_API,
            json=payload,
            stream=True,
            headers={"Accept": "text/event-stream"},
            timeout=600,
        ) as resp:
            if resp.status_code != 200:
                st.error(f"流式生成失败：HTTP {resp.status_code} - {resp.text}")
                st.stop()

            for event, data in parse_sse_stream(resp):
                if event == "start":
                    task_id = data.get("task_id")
                    progress_bar.progress(0, "流水线已启动")
                    status_text.info(f"Task ID: **{task_id}**")
                    node_status_md.markdown(
                        render_node_status(current_node, completed_nodes, error_node),
                        unsafe_allow_html=True,
                    )

                elif event == "node_start":
                    current_node = data.get("node")
                    idx = NODE_ORDER.index(current_node) if current_node in NODE_ORDER else 0
                    progress = idx / len(NODE_ORDER)
                    progress_bar.progress(progress, f"正在执行：{NODE_LABELS.get(current_node, current_node)}")
                    status_text.info(f"正在执行：**{NODE_LABELS.get(current_node, current_node)}**")
                    node_status_md.markdown(
                        render_node_status(current_node, completed_nodes, error_node),
                        unsafe_allow_html=True,
                    )

                elif event == "node_update":
                    node = data.get("node")
                    if node:
                        completed_nodes.add(node)
                        current_node = None
                    node_status_md.markdown(
                        render_node_status(current_node, completed_nodes, error_node),
                        unsafe_allow_html=True,
                    )

                elif event == "error":
                    error_node = data.get("node") or current_node
                    error_msg = data.get("error")
                    st.warning(f"节点 **{NODE_LABELS.get(error_node, error_node)}** 执行出错：{error_msg}")
                    node_status_md.markdown(
                        render_node_status(current_node, completed_nodes, error_node),
                        unsafe_allow_html=True,
                    )

                elif event == "complete":
                    task_id = data.get("task_id") or task_id
                    final_result = data.get("result", {})
                    progress_bar.progress(1.0, "流水线执行完成")
                    status_text.success("✅ 创作方案生成完成")
                    node_status_md.markdown(
                        render_node_status(None, completed_nodes, error_node),
                        unsafe_allow_html=True,
                    )

    except requests.exceptions.RequestException as e:
        st.error(f"流式请求失败：{e}")
        st.stop()
    except Exception as e:
        st.error(f"前端处理出错：{e}")
        st.stop()

    if final_result:
        st.session_state["last_result"] = final_result
        st.session_state["last_task_id"] = task_id
    elif error_msg:
        st.error(f"生成失败：{error_msg}")
        st.stop()


# 展示上次结果
result = st.session_state.get("last_result")
if result:
    st.divider()
    task_id = st.session_state.get("last_task_id", "")
    st.subheader(f"🎨 创作方案 · Task {task_id}")

    # 报告展示方式切换
    view_mode = st.radio(
        "查看方式",
        options=["Markdown 报告", "结构化 JSON"],
        horizontal=True,
        label_visibility="collapsed",
    )

    if view_mode == "Markdown 报告":
        st.markdown(result.get("final_report", "*暂无报告*"))
    else:
        tab1, tab2, tab3, tab4, tab5 = st.tabs(
            ["策划", "文案", "脚本", "视觉", "投放"]
        )
        with tab1:
            st.json(result.get("planner_output") or {})
        with tab2:
            st.json(result.get("copywriter_output") or {})
        with tab3:
            st.json(result.get("scriptwriter_output") or {})
        with tab4:
            st.json(result.get("visual_output") or {})
        with tab5:
            st.json(result.get("distributor_output") or {})

    # 下载按钮
    st.divider()
    dl_col1, dl_col2 = st.columns(2)
    with dl_col1:
        st.download_button(
            "📄 下载 Markdown 报告",
            data=result.get("final_report", "").encode("utf-8"),
            file_name=f"qinghe_report_{task_id}.md",
            mime="text/markdown",
            use_container_width=True,
        )
    with dl_col2:
        import json

        st.download_button(
            "💾 下载完整 JSON",
            data=json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"),
            file_name=f"qinghe_result_{task_id}.json",
            mime="application/json",
            use_container_width=True,
        )
else:
    st.info("👆 填写农产品信息后，点击「一键生成创作方案」开始")


# ============================================================
# 页脚
# ============================================================
st.divider()
with st.expander("ℹ️ 关于青禾映画"):
    st.markdown(
        """
        **青禾映画** 是一个面向农户和农业合作社的多 Agent 协同短视频智能创作平台。
        用户只需输入农产品基本信息，系统通过 5 个 AI Agent 流水线协作，
        自动生成一套完整的短视频创作方案。

        **流水线**：策划 → 文案 → 脚本 → 视觉 → 投放 → 报告

        **配置**：所有可配置项位于项目根目录的 `.env` 文件中。
        """
    )
