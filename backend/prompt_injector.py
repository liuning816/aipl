"""Prompt injection utilities for user-defined prompt templates."""

from database import list_prompt_templates


def build_user_prompt_appendix(user_id, scenario=None, max_prompts=3, max_chars=2400):
    """Return an instruction appendix built from enabled user prompt templates."""
    if not user_id:
        return ""

    try:
        prompts = list_prompt_templates(user_id) or []
    except Exception:
        return ""

    enabled = []
    scenario_text = (scenario or "").strip().lower()

    for item in prompts:
        if not isinstance(item, dict):
            continue
        if item.get("enabled") is False:
            continue

        content = str(item.get("content") or "").strip()
        if not content:
            continue

        tags = item.get("tags") or []
        tag_text = ",".join(str(tag).strip().lower() for tag in tags if str(tag).strip())
        if scenario_text and scenario_text not in tag_text:
            # 如果提供了场景，优先选择带有该场景标签的模板
            continue

        enabled.append(item)

    # Fallback: if scenario filter yields none, include all enabled templates.
    if not enabled and scenario_text:
        for item in prompts:
            if not isinstance(item, dict):
                continue
            if item.get("enabled") is False:
                continue
            content = str(item.get("content") or "").strip()
            if content:
                enabled.append(item)

    if not enabled:
        return ""

    picked = []
    for item in enabled:
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        title = str(item.get("title") or "未命名提示词").strip()
        picked.append((title, content))
        if len(picked) >= max_prompts:
            break

    if not picked:
        return ""

    lines = [
        "",
        "[User Custom Prompt Templates]",
        "Apply the following user preferences when they do not conflict with safety or task constraints.",
    ]

    for idx, (title, content) in enumerate(picked, start=1):
        lines.append(f"{idx}. {title}: {content}")

    appendix = "\n".join(lines)
    if len(appendix) > max_chars:
        appendix = appendix[:max_chars].rstrip() + "..."
    return appendix


def merge_system_instruction(system_instruction, user_id=None, scenario=None):
    """Merge base system instruction with enabled user prompt templates."""
    base = str(system_instruction or "")
    appendix = build_user_prompt_appendix(user_id=user_id, scenario=scenario)
    if not appendix:
        return base
    return base + "\n" + appendix
