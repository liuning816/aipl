# user_profile.py
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any
from mongodb import mongodb
import statistics

# 动态导入，避免循环依赖
def get_mongodb():
    """延迟导入mongodb，避免循环依赖"""
    from mongodb import mongodb
    return mongodb

class UserProfileAnalyzer:
    """用户画像分析器"""
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.profile_data = {}
        self.mongodb = get_mongodb()  # 延迟获取mongodb实例
        
    def analyze_learning_data(self) -> Dict[str, Any]:
        """分析用户学习数据，构建基础画像"""
        print(f"分析用户 {self.user_id} 的学习数据...")
        
        profile = {
            "user_id": self.user_id,
            "analysis_date": datetime.utcnow().isoformat(),
            "profile_version": 1,
        }
        
        # 1. 学习活跃度分析
        profile.update(self._analyze_learning_activity())
        
        # 2. 知识掌握度分析
        profile.update(self._analyze_knowledge_mastery())
        
        # 3. 学习行为偏好分析
        profile.update(self._analyze_learning_preferences())
        
        # 4. 学习效果分析
        profile.update(self._analyze_learning_effectiveness())
        
        # 5. 生成个性化建议
        profile.update(self._generate_recommendations(profile))
        
        return profile
    
    def _analyze_learning_activity(self) -> Dict[str, Any]:
        """分析学习活跃度"""
        # 获取测验记录
        quiz_records = list(self.mongodb.quiz_records.find({"user_id": self.user_id}))
        
        if not quiz_records:
            return {
                "learning_activity": {
                    "total_quizzes": 0,
                    "total_questions": 0,
                    "quiz_frequency": "unknown",
                    "recent_activity": "inactive",
                    "study_consistency": "unknown"
                }
            }
        
        # 计算最近活动
        recent_records = [r for r in quiz_records
                          if r.get('created_at') and
                          r.get('created_at') > datetime.utcnow() - timedelta(days=7)]
        
        # 计算测验频率
        quiz_dates = [r.get('created_at') for r in quiz_records if r.get('created_at')]
        quiz_dates.sort()
        
        if len(quiz_dates) >= 2:
            intervals = [(quiz_dates[i+1] - quiz_dates[i]).days 
                        for i in range(len(quiz_dates)-1)]
            avg_interval = sum(intervals) / len(intervals) if intervals else 30
        else:
            avg_interval = 30
        
        # 评估频率
        if avg_interval <= 2:
            frequency = "high"
        elif avg_interval <= 7:
            frequency = "medium"
        else:
            frequency = "low"
        
        # 评估活跃度
        recent_count = len(recent_records)
        if recent_count >= 5:
            activity = "very_active"
        elif recent_count >= 2:
            activity = "active"
        elif recent_count == 1:
            activity = "occasional"
        else:
            activity = "inactive"
        
        total_questions = sum(len(r.get('record', {}).get('questions', [])) 
                             for r in quiz_records)
        
        return {
            "learning_activity": {
                "total_quizzes": len(quiz_records),
                "total_questions": total_questions,
                "quiz_frequency": frequency,
                "recent_activity": activity,
                "study_consistency": self._calculate_consistency(quiz_dates),
                "last_quiz_date": quiz_dates[-1].isoformat() if quiz_dates else None,
                "quizzes_last_7_days": recent_count
            }
        }
    
    def _calculate_consistency(self, quiz_dates: List[datetime]) -> str:
        """计算学习连贯性"""
        if len(quiz_dates) < 3:
            return "insufficient_data"
        
        # 计算连续学习天数
        dates_set = {d.date() for d in quiz_dates}
        dates_list = sorted(dates_set)
        
        max_streak = 0
        current_streak = 1
        
        for i in range(1, len(dates_list)):
            if (dates_list[i] - dates_list[i-1]).days == 1:
                current_streak += 1
                max_streak = max(max_streak, current_streak)
            else:
                current_streak = 1
        
        if max_streak >= 7:
            return "high"
        elif max_streak >= 3:
            return "medium"
        else:
            return "low"
    
    def _analyze_knowledge_mastery(self) -> Dict[str, Any]:
        """分析知识掌握度"""
        # 获取测验记录
        quiz_records = list(self.mongodb.quiz_records.find({"user_id": self.user_id}))
        
        if not quiz_records:
            return {
                "knowledge_mastery": {
                    "overall_score": 0,
                    "improvement_trend": "unknown",
                    "strong_areas": [],
                    "weak_areas": [],
                    "score_consistency": "unknown"
                }
            }
        
        # 计算总体分数
        scores = []
        subtopic_scores = {}
        
        for record in quiz_records:
            score_info = record.get('score_info', {})
            score = score_info.get('score_percentage', 0)
            scores.append(score)
            
            # 按子主题统计
            subtopic = record.get('subtopic')
            if subtopic:
                if subtopic not in subtopic_scores:
                    subtopic_scores[subtopic] = []
                subtopic_scores[subtopic].append(score)
        
        # 计算统计指标
        if scores:
            avg_score = sum(scores) / len(scores)
            max_score = max(scores)
            min_score = min(scores)
            score_range = max_score - min_score
        else:
            avg_score = max_score = min_score = score_range = 0
        
        # 计算进步趋势（最近3次与之前3次比较）
        if len(scores) >= 6:
            recent_avg = sum(scores[-3:]) / 3
            previous_avg = sum(scores[-6:-3]) / 3 if len(scores) >= 6 else recent_avg
            improvement = recent_avg - previous_avg
        else:
            improvement = 0
        
        # 识别强弱项
        strong_areas = []
        weak_areas = []
        
        for subtopic, sub_scores in subtopic_scores.items():
            avg_sub_score = sum(sub_scores) / len(sub_scores)
            if avg_sub_score >= 80:
                strong_areas.append({
                    "subtopic": subtopic,
                    "avg_score": round(avg_sub_score, 1),
                    "attempts": len(sub_scores)
                })
            elif avg_sub_score < 60:
                weak_areas.append({
                    "subtopic": subtopic,
                    "avg_score": round(avg_sub_score, 1),
                    "attempts": len(sub_scores)
                })
        
        # 评估分数一致性
        if score_range <= 15:
            consistency = "stable"
        elif score_range <= 30:
            consistency = "moderate"
        else:
            consistency = "variable"
        
        # 评估进步趋势
        if improvement > 5:
            trend = "improving"
        elif improvement > -5:
            trend = "stable"
        else:
            trend = "declining"
        
        return {
            "knowledge_mastery": {
                "overall_score": round(avg_score, 1),
                "best_score": round(max_score, 1),
                "worst_score": round(min_score, 1),
                "improvement_trend": trend,
                "strong_areas": sorted(strong_areas, key=lambda x: x["avg_score"], reverse=True)[:5],
                "weak_areas": sorted(weak_areas, key=lambda x: x["avg_score"])[:5],
                "score_consistency": consistency,
                "total_subtopics_studied": len(subtopic_scores)
            }
        }
    
    def _analyze_learning_preferences(self) -> Dict[str, Any]:
        """分析学习偏好"""
        # 获取错题记录
        wrong_questions = list(self.mongodb.wrong_questions.find({"user_id": self.user_id}))
        
        # 获取学习内容
        contents = list(self.mongodb.contents.find({"user_id": self.user_id}))
        
        # 分析题型偏好（从错题反推）
        question_types = {}
        for wq in wrong_questions:
            q_type = wq.get('type', 'unknown')
            question_types[q_type] = question_types.get(q_type, 0) + 1
        
        # 分析难度偏好
        difficulties = {}
        for wq in wrong_questions:
            difficulty = wq.get('difficulty', 'unknown')
            difficulties[difficulty] = difficulties.get(difficulty, 0) + 1
        
        # 分析资源类型偏好
        content_types = {}
        for content in contents:
            c_type = content.get('content_type', 'unknown')
            content_types[c_type] = content_types.get(c_type, 0) + 1
        
        # 找出最常见的题型
        if question_types:
            most_common_type = max(question_types.items(), key=lambda x: x[1])[0]
            type_diversity = len(question_types)
        else:
            most_common_type = "unknown"
            type_diversity = 0
        
        return {
            "learning_preferences": {
                "common_question_types": question_types,
                "most_common_question_type": most_common_type,
                "question_type_diversity": type_diversity,
                "difficulty_distribution": difficulties,
                "content_type_preferences": content_types,
                "has_roadmaps": content_types.get('roadmap', 0) > 0,
                "has_resources": content_types.get('resource', 0) > 0
            }
        }
    
    def _analyze_learning_effectiveness(self) -> Dict[str, Any]:
        """分析学习效果"""
        # 获取错题和重做记录
        wrong_questions = list(self.mongodb.wrong_questions.find({"user_id": self.user_id}))
        redo_records = list(self.mongodb.redo_records.find({"user_id": self.user_id}))
        
        # 计算错题率
        quiz_records = list(self.mongodb.quiz_records.find({"user_id": self.user_id}))
        total_questions = sum(len(r.get('record', {}).get('questions', [])) 
                             for r in quiz_records)
        
        if total_questions > 0:
            error_rate = len(wrong_questions) / total_questions
        else:
            error_rate = 0
        
        # 计算重做效果
        if wrong_questions:
            redo_rate = len(redo_records) / len(wrong_questions)
        else:
            redo_rate = 0
        
        # 分析错题类型分布
        error_analysis = {}
        for wq in wrong_questions:
            course = wq.get('course', 'unknown')
            if course not in error_analysis:
                error_analysis[course] = 0
            error_analysis[course] += 1
        
        # 评估学习效果
        if error_rate <= 0.2:
            effectiveness = "high"
        elif error_rate <= 0.4:
            effectiveness = "medium"
        else:
            effectiveness = "low"
        
        return {
            "learning_effectiveness": {
                "total_wrong_questions": len(wrong_questions),
                "error_rate": round(error_rate * 100, 1),  # 百分比
                "redo_rate": round(redo_rate * 100, 1),    # 百分比
                "effectiveness_level": effectiveness,
                "error_distribution_by_course": error_analysis,
                "has_redo_habits": redo_rate > 0.3
            }
        }
    
    def _generate_recommendations(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        """生成个性化学习建议"""
        recommendations = []
        
        # 基于活跃度的建议
        activity = profile.get('learning_activity', {}).get('recent_activity')
        if activity in ['inactive', 'occasional']:
            recommendations.append({
                "type": "motivation",
                "priority": "high",
                "suggestion": "增加学习频率，建议每周至少完成2次测验",
                "reason": "学习频率较低"
            })
        
        # 基于掌握度的建议
        weak_areas = profile.get('knowledge_mastery', {}).get('weak_areas', [])
        if weak_areas:
            weak_topics = ", ".join([w['subtopic'] for w in weak_areas[:3]])
            recommendations.append({
                "type": "knowledge_gap",
                "priority": "high",
                "suggestion": f"重点复习薄弱知识点：{weak_topics}",
                "reason": f"检测到{len(weak_areas)}个薄弱知识点"
            })
        
        # 基于错题率的建议
        error_rate = profile.get('learning_effectiveness', {}).get('error_rate', 0)
        if error_rate > 40:
            recommendations.append({
                "type": "review_strategy",
                "priority": "medium",
                "suggestion": "加强错题复习，建议每次测验后回顾所有错题",
                "reason": f"错题率较高 ({error_rate}%)"
            })
        
        # 基于学习效果的建议
        if profile.get('learning_effectiveness', {}).get('has_redo_habits') == False:
            recommendations.append({
                "type": "learning_habit",
                "priority": "medium",
                "suggestion": "养成重做错题的习惯，加强记忆巩固",
                "reason": "重做练习较少"
            })
        
        # 如果没有其他建议，给出通用建议
        if not recommendations:
            recommendations.append({
                "type": "general",
                "priority": "low",
                "suggestion": "继续保持当前学习节奏，定期进行综合测试",
                "reason": "学习状态良好"
            })
        
        return {
            "personalized_recommendations": recommendations
        }


def save_user_profile(user_id: str, profile_data: Dict[str, Any]) -> str:
    """保存用户画像到数据库"""
    # 使用现有数据库连接
    now = datetime.utcnow()
    
    # 准备文档
    doc = {
        "user_id": user_id,
        "profile_data": profile_data,
        "created_at": now,
        "updated_at": now,
        "profile_version": profile_data.get("profile_version", 1)
    }
    
    # 更新或插入
    result = mongodb.user_profiles.update_one(
        {"user_id": user_id},
        {"$set": doc},
        upsert=True
    )
    
    if result.upserted_id:
        return str(result.upserted_id)
    else:
        return "updated"


def get_user_profile(user_id: str) -> Dict[str, Any]:
    """获取用户画像"""
    profile = mongodb.user_profiles.find_one({"user_id": user_id})
    
    if profile:
        # 转换为可序列化格式
        profile['_id'] = str(profile['_id'])
        if 'created_at' in profile:
            profile['created_at'] = profile['created_at'].isoformat()
        if 'updated_at' in profile:
            profile['updated_at'] = profile['updated_at'].isoformat()
        return profile
    else:
        return None


def generate_and_save_profile(user_id: str) -> Dict[str, Any]:
    """生成并保存用户画像"""
    try:
        analyzer = UserProfileAnalyzer(user_id)
        profile = analyzer.analyze_learning_data()
        
        # 保存到数据库
        save_user_profile(user_id, profile)
        
        return {
            "success": True,
            "profile": profile,
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        print(f"生成用户画像失败: {e}")
        return {
            "success": False,
            "error": str(e)
        }