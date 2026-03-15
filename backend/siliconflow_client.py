"""
SiliconFlow API 客户端
统一处理所有 SiliconFlow API 调用,包括重试机制和错误处理
"""

import os
import json
import time
import random
import requests
from dotenv import load_dotenv
import prompt_injector

load_dotenv()


class SiliconFlowClient:
    """硅基流动 API 客户端"""

    def __init__(self, model="Qwen/Qwen2.5-7B-Instruct"):
        """初始化客户端"""
        self.api_key = os.environ.get("SILICONFLOW_API_KEY")
        if not self.api_key:
            raise ValueError("SILICONFLOW_API_KEY environment variable is not set")

        self.base_url = "https://api.siliconflow.cn/v1/chat/completions"
        self.model = model
        self.max_retries = 5
        self.base_retry_delay = 2.0
        self.max_retry_delay = 60.0

    def _calculate_retry_delay(self, attempt):
        """计算重试延迟时间（包含抖动）"""
        delay = self.base_retry_delay * (2 ** attempt)
        jitter = random.uniform(0.1, 0.3) * delay
        return min(delay + jitter, self.max_retry_delay)

    def _make_request(self, payload, timeout=600):
        """发送 API 请求并处理重试"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        for attempt in range(self.max_retries):
            try:
                response = requests.post(
                    self.base_url,
                    json=payload,
                    headers=headers,
                    timeout=timeout
                )
                response.raise_for_status()

                result = response.json()

                if 'choices' in result and len(result['choices']) > 0:
                    content = result['choices'][0]['message']['content']
                    return content
                else:
                    raise ValueError(f"Unexpected response format: {result}")

            except requests.exceptions.HTTPError as e:
                status_code = e.response.status_code if e.response else None
                transient_codes = [502, 503, 504, 429]

                if status_code in transient_codes and attempt < self.max_retries - 1:
                    retry_delay = self._calculate_retry_delay(attempt)
                    print(f"⚠️  服务器错误 {status_code}，正在重试 ({attempt + 1}/{self.max_retries})...")
                    print(f"   等待 {retry_delay:.1f} 秒后重试...")
                    time.sleep(retry_delay)
                    continue
                else:
                    raise RuntimeError(f"SiliconFlow API HTTP error: {str(e)}") from e

            except requests.exceptions.ReadTimeout as e:
                if attempt < self.max_retries - 1:
                    retry_delay = self._calculate_retry_delay(attempt)
                    print(f"⚠️  请求超时，正在重试 ({attempt + 1}/{self.max_retries})...")
                    time.sleep(retry_delay)
                    continue
                else:
                    raise RuntimeError(f"SiliconFlow API timeout: {str(e)}") from e

            except requests.exceptions.ConnectionError as e:
                if attempt < self.max_retries - 1:
                    retry_delay = self._calculate_retry_delay(attempt)
                    print(f"⚠️  连接错误，正在重试 ({attempt + 1}/{self.max_retries})...")
                    time.sleep(retry_delay)
                    continue
                else:
                    raise RuntimeError(f"SiliconFlow API connection failed: {str(e)}") from e

        raise RuntimeError("Failed to complete request after all retries")

    def generate_json(self, system_instruction, user_prompt, temperature=1, top_p=0.95, max_tokens=8192, user_id=None, scenario=None):
        """生成 JSON 格式响应"""
        merged_system_instruction = prompt_injector.merge_system_instruction(
            system_instruction,
            user_id=user_id,
            scenario=scenario,
        )
        messages = [
            {"role": "system", "content": merged_system_instruction},
            {"role": "user", "content": user_prompt}
        ]

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"}
        }

        content = self._make_request(payload)
        print(content)
        return json.loads(content)

    def generate_text(self, system_instruction, user_prompt, temperature=1, top_p=0.95, max_tokens=8192, user_id=None, scenario=None):
        """生成纯文本响应"""
        merged_system_instruction = prompt_injector.merge_system_instruction(
            system_instruction,
            user_id=user_id,
            scenario=scenario,
        )
        messages = [
            {"role": "system", "content": merged_system_instruction},
            {"role": "user", "content": user_prompt}
        ]

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens
        }

        content = self._make_request(payload)
        print(content)
        return content


# 创建全局客户端实例
_client = None

def get_client():
    """获取全局客户端实例"""
    global _client
    if _client is None:
        _client = SiliconFlowClient()
    return _client