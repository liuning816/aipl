import siliconflow_client


def translate_text_arr(text_arr, target="zh-CN", user_id=None):
    """
    使用硅基流动API翻译文本数组

    Args:
        text_arr: 要翻译的文本列表
        target: 目标语言代码(默认中文简体)

    Returns:
        翻译后的文本列表
    """
    # 系统指令
    system_instruction = f"You are a translator. Translate the given text to {target}. Only output the translated text, nothing else. Do not add any explanations or additional content."

    translated = []
    client = siliconflow_client.get_client()

    for text in text_arr:
        try:
            # 用户提示
            user_prompt = f"Translate this text to {target}: {text}"

            # 使用客户端生成翻译
            result = client.generate_text(
                system_instruction=system_instruction,
                user_prompt=user_prompt,
                temperature=0.3,  # 降低随机性，提升稳定性
                top_p=0.95,
                max_tokens=512,  # 限制输出长度
                user_id=user_id,
                scenario="translation",
            )

            translated.append(result.strip())
            print(f"Translated '{text}' to '{result.strip()}'")
        except Exception as e:
            print(f"Translation error for '{text}': {e}")
            translated.append(text)  # 翻译失败时返回原文

    return translated