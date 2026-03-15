"""TODO: 预留的测验分析模块。

当前版本仅保留函数骨架，尚未接入业务调用。
后续可在此补充 system_instruction / user_prompt，并在路由层挂载接口。
"""

import siliconflow_client


def get_quiz_analyse(course, topic, subtopic, description, questions):
    """TODO: 使用硅基流动API生成测验分析（占位实现）。"""
    # TODO: 设计稳定的 JSON 输出 schema，并补充评分统计/错因分析维度。
    system_instruction = '''  '''

    # TODO: 拼接 course/topic/subtopic/description/questions 为结构化提示词。
    user_prompt = f'''  '''

    client = siliconflow_client.get_client()
    return client.generate_json(
        system_instruction=system_instruction,
        user_prompt=user_prompt,
        temperature=1,
        top_p=0.95,
        max_tokens=20000
    )