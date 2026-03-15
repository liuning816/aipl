import json
import siliconflow_client
    

def evaluate_question_score(course, topic, subtopic, question, user_answer, question_type, user_id=None):
    """评估单个题目的分数
    
    Args:
        course: 课程名称
        topic: 主题
        subtopic: 子主题
        question: 题目对象
        user_answer: 用户答案
        question_type: 题目类型
    
    Returns:
        dict: 包含score(分数), feedback(反馈), is_correct(是否正确)的字典
    """
    # 选择题类型：single_choice, multiple_choice, true_false
    choice_types = ['single_choice', 'multiple_choice', 'true_false']
    
    if question_type in choice_types:
        # 选择题：全部选对得10分，否则0分
        correct_answer = question.get('correctAnswer') or question.get('answerIndex') or question.get('answer')
        options = question.get('options', [])
        
        # 解析正确答案索引
        def parse_correct_indices(raw, opts):
            indices = []
            if raw is None:
                return indices
            
            def push(val):
                if isinstance(val, int):
                    if 0 <= val < len(opts):
                        indices.append(val)
                elif isinstance(val, str):
                    s = val.strip()
                    if not s:
                        return
                    # 字母格式（A, B, C...）
                    import re
                    m = re.match('^[A-Za-z]', s)
                    if m:
                        idx = ord(s[0].upper()) - 65
                        if 0 <= idx < len(opts):
                            indices.append(idx)
                            return
                    # 文本匹配
                    found = next((i for i, o in enumerate(opts) if o and (o.strip() == s or o.strip().startswith(s))), None)
                    if found is not None:
                        indices.append(found)
            
            if isinstance(raw, list):
                for r in raw:
                    push(r)
            else:
                push(raw)
            
            return list(dict.fromkeys(indices))
        
        correct_indices = parse_correct_indices(correct_answer, options)
        
        # 解析用户选择的索引
        selected_indices = []
        if isinstance(user_answer, list):
            selected_indices = user_answer
        elif isinstance(user_answer, str):
            # 可能是 "A,B" 格式或单个字母
            import re
            if ',' in user_answer or '，' in user_answer:
                parts = re.split('[,，]', user_answer)
                for p in parts:
                    p = p.strip()
                    if re.match('^[A-Za-z]$', p):
                        selected_indices.append(ord(p.upper()) - 65)
                    elif p.isdigit():
                        idx = int(p)
                        if 0 <= idx < len(options):
                            selected_indices.append(idx)
            elif re.match('^[A-Za-z]$', user_answer):
                selected_indices = [ord(user_answer.upper()) - 65]
            elif user_answer.isdigit():
                idx = int(user_answer)
                if 0 <= idx < len(options):
                    selected_indices = [idx]
        
        # 判断是否完全正确
        correct_set = set(correct_indices)
        selected_set = set(selected_indices)
        is_correct = correct_set == selected_set and len(correct_set) > 0
        
        if is_correct:
            return {
                'score': 10,
                'feedback': '回答正确！',
                'is_correct': True
            }
        else:
            return {
                'score': 0,
                'feedback': '回答错误，请查看正确答案和解析。',
                'is_correct': False
            }
    else:
        # 非选择题：使用AI评估分数（0-10分）
        system_instruction = """你是一位专业的教育评估专家。请根据题目和学生的回答，给出一个公正的评分和详细的反馈。

评分标准：
- 满分10分
- 根据答案的准确性、完整性、逻辑性进行评分
- 给出具体的分数（整数，0-10分）
- 提供详细的反馈，指出优点和不足

输出格式必须是严格的JSON：
{
  "score": 分数（0-10的整数）,
  "feedback": "详细的反馈内容",
  "strengths": ["优点1", "优点2"],
  "improvements": ["改进建议1", "改进建议2"]
}

请确保：
1. JSON格式完全正确
2. 分数是0-10的整数
3. 反馈具体、有帮助，能够指导学生改进"""

        user_prompt = f"""请评估以下学生的回答：

课程：{course}
主题：{topic}
子主题：{subtopic}

题目类型：{question_type}
题目内容：{question.get('question', '')}

学生回答：{user_answer}

题目参考信息：
- 参考答案：{question.get('modelAnswer') or question.get('correctAnswer') or '未提供'}
- 知识点：{question.get('knowledgePoint') or '未指定'}

请根据学生的回答质量，给出0-10分的评分，并提供详细的反馈。"""

        try:
            client = siliconflow_client.get_client()
            result = client.generate_json(
                system_instruction=system_instruction,
                user_prompt=user_prompt,
                temperature=0.7,
                top_p=0.9,
                max_tokens=2000,
                user_id=user_id,
                scenario="evaluation",
            )
            
            # 确保分数在0-10范围内
            score = result.get('score', 0)
            if not isinstance(score, int):
                try:
                    score = int(float(score))
                except:
                    score = 0
            score = max(0, min(10, score))
            
            return {
                'score': score,
                'feedback': result.get('feedback', ''),
                'is_correct': score == 10,
                'strengths': result.get('strengths', []),
                'improvements': result.get('improvements', [])
            }
        except Exception as e:
            print(f"AI评估失败: {e}")
            return {
                'score': 0,
                'feedback': '评估失败，请稍后重试。',
                'is_correct': False
            }


def _summarize_user_profile(profile_data):
    """提取用户画像关键点，用于个性化出题提示"""
    if not profile_data or not isinstance(profile_data, dict):
        return ""

    learning_activity = profile_data.get('learning_activity', {})
    knowledge_mastery = profile_data.get('knowledge_mastery', {})
    learning_preferences = profile_data.get('learning_preferences', {})
    learning_effectiveness = profile_data.get('learning_effectiveness', {})
    recommendations = profile_data.get('personalized_recommendations', [])

    strong_areas = knowledge_mastery.get('strong_areas', [])
    weak_areas = knowledge_mastery.get('weak_areas', [])
    strong_list = [f"{a.get('subtopic')}({a.get('avg_score')}分)" for a in strong_areas if a.get('subtopic')]
    weak_list = [f"{a.get('subtopic')}({a.get('avg_score')}分)" for a in weak_areas if a.get('subtopic')]

    most_common_qtype = learning_preferences.get('most_common_question_type')
    difficulty_dist = learning_preferences.get('difficulty_distribution', {})

    summary = {
        "learning_activity": {
            "total_quizzes": learning_activity.get('total_quizzes'),
            "quiz_frequency": learning_activity.get('quiz_frequency'),
            "recent_activity": learning_activity.get('recent_activity'),
        },
        "knowledge_mastery": {
            "overall_score": knowledge_mastery.get('overall_score'),
            "improvement_trend": knowledge_mastery.get('improvement_trend'),
            "strong_areas": strong_list[:5],
            "weak_areas": weak_list[:5],
        },
        "learning_preferences": {
            "most_common_question_type": most_common_qtype,
            "difficulty_distribution": difficulty_dist,
        },
        "learning_effectiveness": {
            "error_rate": learning_effectiveness.get('error_rate'),
            "has_redo_habits": learning_effectiveness.get('has_redo_habits'),
        },
    }

    if isinstance(recommendations, list) and recommendations:
        summary["recommendations"] = [
            {
                "type": r.get('type'),
                "priority": r.get('priority'),
                "suggestion": r.get('suggestion')
            }
            for r in recommendations[:3]
            if isinstance(r, dict)
        ]

    return json.dumps(summary, ensure_ascii=False)


def get_quiz(course, topic, subtopic, description, user_profile=None, user_id=None):
    """使用硅基流动API生成测验题目"""
        
    system_instruction =  """你是一位专业的教育评估专家和测验设计AI助手。请根据提供的学习内容生成高质量、多样化的测验题目。

  核心要求：
  1. 仅使用以下题型：
     - 单项选择题（4个选项，1个正确答案）:type是"single_choice"
     - 多项选择题（4-5个选项，2个以上正确答案）:type是"multiple_choice"
     - 简答题（简短回答）:type是"short_answer"
     - 计算题（需要计算步骤）:type是"calculation"
     - 案例分析题（基于情景的分析）:type是"case_study"
  2. 题目难度根据内容复杂度自动调整
  3. 题目应涵盖不同认知层次：记忆、理解、应用、分析、评价、创造
  4. 确保每个问题有清晰的评分标准和答案解析
  5. 题目数量根据内容复杂度和深度决定（通常8-20题）

题目类型分布建议（可根据内容调整）：
- 基础认知题（30-40%）：单选、判断、填空
- 应用分析题（40-50%）：多选、计算
- 综合能力题（20-30%）：案例分析、简答

输出格式必须是严格的JSON结构：
{
  "questions": [
    {
      "id": 1,
      "type": "question_type",  // 题目类型
      "question": "问题文本",
      // 根据题目类型的不同字段：
      // 选择题类：
      "options": ["选项A", "选项B", "选项C", "选项D"],  // 可选
      "correctAnswer": "正确答案或索引",
      
      
      
      
      // 通用字段：
      "explanation": "详细的答案解析",
      "difficulty": "easy/medium/hard/expert",
      "knowledgePoint": "该题考察的核心知识点",
      "learningTip": "针对此题的学习建议",
      "points": 分值,  // 此题分值
      "timeEstimate": "预计完成时间（分钟）"
    }
  ],
  "quizInfo": {
    "course": "课程名称",
    "topic": "主题",
    "subtopic": "子主题",
    "description": "测验描述",
    "totalQuestions": 0,
    "totalPoints": 0,
    "estimatedTime": "预计完成总时间",
    "difficultyLevel": "测验整体难度",
    "questionTypes": ["使用的题型列表（仅上述七种）"],
    "scoringRules": {
      "passingScore": 60,
      "gradingScale": {
        "A": "90-100分",
        "B": "80-89分",
        "C": "70-79分",
        "D": "60-69分",
        "F": "0-59分"
      }
    },
    "instructions": "测验说明和答题要求"
  }
}

请确保：
1. JSON格式完全正确，可以被Python的json模块直接解析
2. 问题表述清晰无歧义
3. 根据题目类型设计合适的答题方式
4. 答案解析详细，有助于学习理解
5. 题目难度与学习内容匹配
6. 题目类型一定要正确（仅限以下七种）：
  - 单项选择题:type是"single_choice"
  - 多项选择题:type是"multiple_choice"
  - 简答题:type是"short_answer"
  - 计算题:type是"calculation"
  - 案例分析题:type是"case_study"
  - 判断题:type是"true_false"
  - 填空题:type是"fill_in_the_blank"
7. 不同题型比例合理，覆盖知识点的各个方面"""
        
    # 用户提示 - 更详细、结构化
    profile_summary = _summarize_user_profile(user_profile)

    user_prompt = f"""请生成一份多样化题型的综合测验：

课程背景：{course}
主题：{topic}
子主题：{subtopic}
子主题详细描述：{description}
"""

    if profile_summary:
        user_prompt += f"""
用户画像要点（用于个性化出题）：
{profile_summary}
"""

    user_prompt += """

具体要求：
1. 请根据描述的详细程度和复杂度生成适当数量和类型的题目
2. 题目应覆盖该子主题的核心概念和关键知识点
3. 设计多种题型，避免单一题型
4. 题目难度要有梯度，从基础到进阶
5. 确保答案解析详细，能帮助学习者真正理解
6. 如果是技术类主题，包含必要的计算题或应用题
7. 如果是理论类主题，包含案例分析或简答题
8. 提供清晰的评分标准和测验说明

请生成符合上述要求的JSON格式测验题目。同时根据学生的学习进度和知识水平，生成每道题的解析。"""
    # 使用客户端生成 JSON 响应
    client = siliconflow_client.get_client()
    return client.generate_json(
        system_instruction=system_instruction,
        user_prompt=user_prompt,
        temperature=1,
        top_p=0.95,
        max_tokens=20000,
        user_id=user_id,
        scenario="quiz",
    )