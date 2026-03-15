import siliconflow_client

    
def generate_resources(course, knowledge_level, description, time, user_id=None):
    """使用硅基流动API生成学习资源"""
    if not course or str(course).strip() == "":
        raise ValueError("course为必填字段，不能为空")

    # 系统指令
    system_instruction = '''你是一位专业的教育专家和AI学习助手。请直接生成完整、详细、可直接学习的内容资料，而不是学习计划或路径。

核心要求：
1. 直接提供学习内容，包含详细的概念解释、示例、代码（如果适用）
2. 内容结构清晰，按知识点逐步深入
3. 根据用户知识水平调整内容深度和难度
4. 提供实用的例子、练习和解决方案
5. 语言风格：专业、易懂、实用

输出结构：
## 主题：[具体学习主题]

### 📘 核心概念
- 概念1：[详细解释]
- 概念2：[详细解释]
- 概念3：[详细解释]

### 🎯 重点知识详解
[对每个重要知识点进行详细讲解，包含：
  - 定义和原理
  - 为什么重要
  - 实际应用场景
  - 常见误区]

### 💡 实践示例
[提供具体的例子，如：
  - 代码示例（如果是编程）
  - 解题步骤（如果是数学）
  - 案例分析（如果是商业）
  - 操作流程（如果是技能）]

### 🛠️ 动手练习
[设计可直接完成的练习：
  - 练习题1：[题目描述]
    - 参考答案：[详细解答]
  - 练习题2：[题目描述]
    - 参考答案：[详细解答]]

### 🔍 深度扩展
[提供进阶内容或相关知识点链接，供学有余力者深入学习]

### 📝 学习评估
[提供自我测试的问题或小测验]'''
        
    # 用户提示 - 明确要求生成内容
    user_prompt = f"""请直接为我生成完整的学习资料：

学习主题：{course}
我的当前水平：{knowledge_level}（请据此调整内容的深度和起点）
学习目标：{description}
期望学习时间：{time}

具体要求：
1. 请直接生成详细的学习内容，不要只说"学习XX"
2. 包含具体的概念解释、例子和练习
3. 内容要实用，能够让我立即开始学习
4. 如果适用，提供代码示例或实际操作步骤
5. 针对{knowledge_level}水平调整难度
6. 确保内容在{time}内可以学完"""

    # 使用客户端生成文本响应
    client = siliconflow_client.get_client()
    return client.generate_text(
      system_instruction=system_instruction,
      user_prompt=user_prompt,
      temperature=1,
      top_p=0.95,
      max_tokens=8192,
      user_id=user_id,
      scenario="resource",
    )