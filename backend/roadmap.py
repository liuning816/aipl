import siliconflow_client
  
  
def create_roadmap(topic, time, knowledge_level, user_id=None):
    """使用硅基流动API生成学习路线图"""
    
    # 系统指令
    system_instruction = '''你是一个AI助手,根据用户输入提供个性化的学习路径。你需要提供学习的子主题,并附上每个子主题的简短描述,说明具体要学什么以及每个子主题需要多少时间。对需要更多理解的子主题给予更多时间。重要提示:确保所有键都是小写的。
示例输出:
{
  "第1周": {
    "topic":"Python入门",
    "subtopics":[
      {
        "subtopic":"Python入门",
        "time":"10 分钟",
        "description":"学习python的Hello World程序"
      },
      {
        "subtopic":"Python中的数据类型",
        "time":"1 小时",
        "description":"了解 int、string、boolean、array、dict 及数据类型转换"
      }
    ]
  }
}'''
      
    # 用户提示
    user_prompt = f"请为我制定一个学习 {topic} 的路线图，时间为 {time}。 我的知识水平是 {knowledge_level}。 我每周可以投入16小时。"
      
    # 使用客户端生成 JSON 响应
    client = siliconflow_client.get_client()
    return client.generate_json(
        system_instruction=system_instruction,
        user_prompt=user_prompt,
        temperature=1,
        top_p=0.95,
      max_tokens=8192,
      user_id=user_id,
      scenario="roadmap",
    )