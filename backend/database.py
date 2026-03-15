from mongodb import mongodb

def save_content(user_id, topic, content_type, content_data):
    """保存内容到 MongoDB"""
    return mongodb.save_content(user_id, topic, content_type, content_data)

def get_content(user_id, topic, content_type):
    """从 MongoDB 获取内容"""
    return mongodb.get_content(user_id, topic, content_type)

def get_or_create_user(user_id=None):
    """获取或创建用户"""
    return mongodb.get_or_create_user(user_id)

def create_user(username, email, password_hash):
    """创建注册用户"""
    return mongodb.create_user(username, email, password_hash)

def get_user_by_id(user_id):
    """根据用户ID获取用户信息"""
    return mongodb.get_user_by_id(user_id)

def get_user_by_identifier(identifier):
    """根据用户标识符获取用户信息"""
    return mongodb.get_user_by_identifier(identifier)

def update_last_login(user_id):
    """更新用户最后登录时间"""
    return mongodb.update_last_login(user_id)

def get_user_settings(user_id):
    """获取用户设置"""
    return mongodb.get_user_settings(user_id)

def update_user_settings(user_id, username=None, avatar_url=None, bank_quiz_default_count=None):
    """更新用户设置"""
    return mongodb.update_user_settings(
        user_id,
        username=username,
        avatar_url=avatar_url,
        bank_quiz_default_count=bank_quiz_default_count,
    )

def update_user_password_hash(user_id, password_hash):
    """更新用户密码哈希"""
    return mongodb.update_user_password_hash(user_id, password_hash)

def list_prompt_templates(user_id):
    """列出用户的提示模板"""
    return mongodb.list_prompt_templates(user_id)

def upsert_prompt_template(user_id, prompt_id, title, content, enabled=True, description=None, favorite=False, tags=None):
    """新增或更新提示模板"""
    return mongodb.upsert_prompt_template(
        user_id,
        prompt_id,
        title,
        content,
        enabled=enabled,
        description=description,
        favorite=favorite,
        tags=tags,
    )

def delete_prompt_template(user_id, prompt_id):
    """删除提示模板"""
    return mongodb.delete_prompt_template(user_id, prompt_id)

def delete_user_account_data(user_id):
    """删除用户账户数据"""
    return mongodb.delete_user_account_data(user_id)

def update_quiz_score(user_id, topic, score):
    """更新测验成绩"""
    return mongodb.update_quiz_score(user_id, topic, score)

def save_quiz_record(user_id, course, week, subtopic, record, quiz_type='ai'):
    """保存测验完整记录，包含分数信息"""
    return mongodb.save_quiz_record(user_id, course, week, subtopic, record, quiz_type=quiz_type)

# 新增：更新测验记录（用于后台评分）
def update_quiz_record(record_id, record, score_info=None):
    """更新测验记录内容与分数信息"""
    return mongodb.update_quiz_record(record_id, record, score_info)

# 新增函数：获取测验记录的分数详情
def get_quiz_score_summary(user_id, course=None, week=None, subtopic=None, quiz_type=None):
    """获取测验记录的分数汇总信息"""
    return mongodb.get_quiz_score_summary(user_id, course, week, subtopic, quiz_type=quiz_type)

# 新增函数：获取用户的分数历史
def get_user_score_history(user_id, course=None, limit=50, quiz_type=None):
    """获取用户的分数历史记录"""
    return mongodb.get_user_score_history(user_id, course, limit, quiz_type=quiz_type)

# 导入用户画像模块
try:
    import user_profile
except ImportError:
    print("Warning: user_profile module not available")

def generate_user_profile(user_id):
    """生成用户画像"""
    return user_profile.generate_and_save_profile(user_id)

def get_user_profile_db(user_id):
    """获取用户画像"""
    return user_profile.get_user_profile(user_id)

def save_user_profile_db(user_id, profile_data):
    """保存用户画像（用于导入场景）"""
    return user_profile.save_user_profile(user_id, profile_data)

def update_profile_on_quiz_completion(user_id, quiz_record_id=None):
    """测验完成后更新用户画像（可选）"""
    try:
        # 导入用户画像模块
        try:
            import user_profile
        except ImportError:
            print("Warning: user_profile module not available")
            return None
        
        # 异步或延迟更新，这里简单调用
        result = user_profile.generate_and_save_profile(user_id)
        print(f"用户画像更新完成: {result.get('success') if result else 'No result'}")
        return result
    except Exception as e:
        print(f"更新用户画像失败: {e}")
        import traceback
        traceback.print_exc()
        return None

def get_user_contents(user_id, limit: int = 50, skip: int = 0):
    """获取用户的所有内容（支持分页，默认 limit=50）"""
    return mongodb.get_user_contents(user_id, limit=limit, skip=skip)

def get_quiz_records(user_id, course=None, week=None, subtopic=None, quiz_type=None, limit: int = 50, skip: int = 0):
    """根据条件获取测验记录（可按 course/week/subtopic 过滤，支持分页）"""
    return mongodb.get_quiz_records(user_id, course, week, subtopic, quiz_type=quiz_type, limit=limit, skip=skip)

def delete_quiz_records(user_id, course=None, week=None, subtopic=None, quiz_type=None):
    """按条件删除测验记录"""
    return mongodb.delete_quiz_records(user_id, course, week, subtopic, quiz_type=quiz_type)

def cancel_course(user_id, topic):
    """取消学习某课程，删除与该课程相关的所有数据库数据"""
    return mongodb.delete_course_data(user_id, topic)

# 统计辅助
def count_quiz_records(user_id, course=None, week=None, subtopic=None, quiz_type=None):
    """返回测验记录总数（与 get_quiz_records 相同筛选条件）"""
    return mongodb.count_quiz_records(user_id, course, week, subtopic, quiz_type=quiz_type)

def count_user_contents(user_id):
    """返回用户内容总数"""
    return mongodb.count_user_contents(user_id)

def get_subjects_overview(user_id, search_text=None, sort_mode='recent'):
    """获取用户的学科概览"""
    return mongodb.get_subjects_overview(user_id, search_text=search_text, sort_mode=sort_mode)

def set_subject_order(user_id, order_list):
    """设置用户的学科顺序"""
    return mongodb.set_subject_order(user_id, order_list)

def get_subject_detail(user_id, subject):
    """获取用户的学科详情"""
    return mongodb.get_subject_detail(user_id, subject)

# 错题集 / 重做
def add_wrong_question(user_id, course, week, subtopic, question_obj, user_answer=None, correct_answer=None, difficulty=None, source='auto', note=None):
    """添加错题"""
    return mongodb.upsert_wrong_question(user_id, course, week, subtopic, question_obj, user_answer, correct_answer, difficulty, source, note)

def remove_wrong_question(user_id, question_key):
    """删除错题"""
    return mongodb.remove_wrong_question(user_id, question_key)

def list_wrong_questions(user_id, course=None, week=None, subtopic=None, difficulty=None):
    """列出错题"""
    return mongodb.list_wrong_questions(user_id, course, week, subtopic, difficulty)

def update_wrong_note(user_id, question_key, note):
    """更新错题备注"""
    return mongodb.update_wrong_note(user_id, question_key, note)

def check_wrong_membership(user_id, questions, course, week, subtopic):
    """检查错题是否属于用户"""
    return mongodb.check_wrong_membership(user_id, questions, course, week, subtopic)

def add_redo_record(user_id, course, week, subtopic, question_obj, correct_answer, attempt_answer, difficulty=None, batch_id=None, question_key=None):
    """添加重做记录"""
    return mongodb.add_redo_record(user_id, course, week, subtopic, question_obj, correct_answer, attempt_answer, difficulty, batch_id, question_key)

def list_redo_records(user_id, course=None, week=None, subtopic=None):
    """列出重做记录"""
    return mongodb.list_redo_records(user_id, course, week, subtopic)

def delete_redo_record(user_id, record_id):
    """删除重做记录"""
    return mongodb.delete_redo_record(user_id, record_id)

# 重做历史记录（存于 wrong_questions 文档内）
def append_wrong_redo_history(user_id, question_key, attempt_answer, correct_answer=None, difficulty=None):
    """追加错题重做历史记录"""
    return mongodb.append_wrong_redo_history(user_id, question_key, attempt_answer, correct_answer, difficulty)


# 题库（框架版）
def create_question_bank_content(user_id, payload):
    """创建题库内容（单题/试卷）"""
    return mongodb.create_question_bank_content(user_id, payload)


def list_question_bank_contents(user_id=None, include_own=False, mine_only=False, exclude_draft=False, visibility='public', status=None, favorite_only=False, content_type=None, tag=None, limit=20, skip=0):
    """列出题库内容"""
    return mongodb.list_question_bank_contents(
        user_id=user_id,
        include_own=include_own,
        mine_only=mine_only,
        exclude_draft=exclude_draft,
        visibility=visibility,
        status=status,
        favorite_only=favorite_only,
        content_type=content_type,
        tag=tag,
        limit=limit,
        skip=skip,
    )


def get_question_bank_content(content_id):
    """获取题库内容详情"""
    return mongodb.get_question_bank_content(content_id)


def get_question_bank_content_for_user(content_id, user_id=None):
    """获取题库内容详情（包含用户互动状态）"""
    return mongodb.get_question_bank_content(content_id, user_id=user_id)


def update_question_bank_visibility(content_id, user_id, visibility, keep_uploaded=False):
    """更新内容可见性"""
    return mongodb.update_question_bank_visibility(content_id, user_id, visibility, keep_uploaded=keep_uploaded)


def update_question_bank_content(content_id, user_id, payload):
    """更新题库内容"""
    return mongodb.update_question_bank_content(content_id, user_id, payload)


def delete_question_bank_content(content_id, user_id):
    """删除题库内容"""
    return mongodb.delete_question_bank_content(content_id, user_id)


def set_question_bank_vote(content_id, user_id, vote):
    """设置点赞/点踩"""
    return mongodb.set_question_bank_vote(content_id, user_id, vote)


def set_question_bank_favorite(content_id, user_id, favorite=True):
    """设置或取消收藏"""
    return mongodb.set_question_bank_favorite(content_id, user_id, favorite=favorite)


def create_question_bank_report(content_id, user_id, reason, detail=None):
    """提交举报"""
    return mongodb.create_question_bank_report(content_id, user_id, reason, detail)


def list_question_bank_reports(status='open', limit=50, skip=0):
    """管理员查看举报列表"""
    return mongodb.list_question_bank_reports(status=status, limit=limit, skip=skip)


def resolve_question_bank_report(report_id, admin_user_id, action='resolved', note=None):
    """管理员处理举报"""
    return mongodb.resolve_question_bank_report(report_id, admin_user_id, action=action, note=note)


def moderate_question_bank_content(content_id, admin_user_id, action, reason=None):
    """管理员处理内容（隐藏/删除/恢复）"""
    return mongodb.moderate_question_bank_content(content_id, admin_user_id, action, reason=reason)


def generate_question_bank_test(context=None, limit=10, mode='mixed'):
    """按学习上下文生成题库测试卷（先筛选再排序）"""
    return mongodb.generate_question_bank_test(context=context, limit=limit, mode=mode)