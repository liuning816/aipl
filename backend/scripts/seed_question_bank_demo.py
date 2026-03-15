import argparse
import os
import random
from datetime import datetime, timedelta
from pymongo import MongoClient


def build_client():
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    return MongoClient(uri, serverSelectionTimeoutMS=5000)


def ensure_users(users_col, user_ids):
    now = datetime.utcnow()
    for idx, user_id in enumerate(user_ids):
        users_col.update_one(
            {"user_id": user_id},
            {
                "$setOnInsert": {
                    "user_id": user_id,
                    "username": f"demo_user_{idx+1}",
                    "username_lower": f"demo_user_{idx+1}",
                    "email": f"demo_user_{idx+1}@example.com",
                    "email_lower": f"demo_user_{idx+1}@example.com",
                    "password_hash": "seeded",
                    "avatar_url": "",
                    "bank_quiz_default_count": 15,
                    "created_at": now,
                    "updated_at": now,
                    "is_temporary": False,
                }
            },
            upsert=True,
        )


def rand_tags(pool, k_min=2, k_max=4):
    k = random.randint(k_min, k_max)
    return random.sample(pool, k)


def make_single_question(i, tags):
    return {
        "question": f"示例单题 {i}: 以下哪项最符合 {tags[0]} 的定义？",
        "type": "single_choice",
        "options": [
            "描述A",
            "描述B",
            "描述C",
            "描述D",
        ],
        "answer": "描述B",
        "explanation": "这是用于联调的示例解析。",
        "topic": tags[0],
        "subtopic": tags[-1],
        "text": f"示例单题 {i} 的题干内容。",
    }


def make_paper_items(i, tags):
    items = []
    for j in range(1, random.randint(4, 7) + 1):
        items.append(
            {
                "id": j,
                "question": f"示例试卷 {i} - 第{j}题（{tags[0]}）",
                "type": "single_choice",
                "options": ["选项A", "选项B", "选项C", "选项D"],
                "answer": "选项A",
                "explanation": "示例解析",
                "subtopic": tags[-1],
            }
        )
    return items


def seed_demo_data(db, count=30, reset=False):
    users_col = db["users"]
    contents = db["question_bank_contents"]
    votes = db["question_bank_votes"]
    reports = db["question_bank_reports"]

    seed_marker = "qb_seed_v2"
    demo_users = [f"seed_user_{i}" for i in range(1, 9)]
    ensure_users(users_col, demo_users)

    if reset:
        seed_docs = list(contents.find({"seed_marker": seed_marker}, {"_id": 1}))
        seed_ids = [doc["_id"] for doc in seed_docs]
        if seed_ids:
            votes.delete_many({"content_id": {"$in": seed_ids}})
            reports.delete_many({"content_id": {"$in": seed_ids}})
            contents.delete_many({"_id": {"$in": seed_ids}})

    tag_pool = [
        "python", "flask", "mongodb", "react", "javascript", "算法", "数据库", "网络", "操作系统", "工程实践"
    ]

    created_ids = []
    now = datetime.utcnow()

    for i in range(1, count + 1):
        owner = random.choice(demo_users)
        tags = rand_tags(tag_pool)
        is_paper = (i % 3 == 0)
        visibility = "private" if (i % 7 == 0) else "public"
        status = "draft" if visibility == "private" else "published"

        created_at = now - timedelta(days=random.randint(0, 20), hours=random.randint(0, 23))

        doc = {
            "seed_marker": seed_marker,
            "user_id": owner,
            "title": f"[示例] 题库模板 {i} ({'试卷' if is_paper else '单题'})",
            "description": "用于管理员联调与前端展示的模板数据。",
            "content_type": "paper" if is_paper else "single_question",
            "visibility": visibility,
            "status": status,
            "difficulty": random.choice(["easy", "medium", "hard"]),
            "source": random.choice(["user_original", "ai_generated", "adapted"]),
            "tags": tags,
            "content": make_single_question(i, tags) if not is_paper else {
                "text": f"示例试卷 {i} 的说明。",
                "topic": tags[0],
                "subtopic": tags[-1],
            },
            "items": make_paper_items(i, tags) if is_paper else [],
            "item_count": 0,
            "stats": {"upvotes": 0, "downvotes": 0, "reports": 0},
            "created_at": created_at,
            "updated_at": created_at,
        }
        if is_paper:
            doc["item_count"] = len(doc["items"])

        result = contents.insert_one(doc)
        created_ids.append(result.inserted_id)

    # 投票与举报
    for content_id in created_ids:
        content_doc = contents.find_one({"_id": content_id})
        if not content_doc:
            continue

        voters = random.sample(demo_users, random.randint(1, min(6, len(demo_users))))
        for uid in voters:
            vote_val = random.choice(["upvote", "downvote", "upvote", "upvote"])  # 偏向点赞
            votes.update_one(
                {"content_id": content_id, "user_id": uid},
                {
                    "$set": {"vote": vote_val, "updated_at": now},
                    "$setOnInsert": {"created_at": now, "content_id": content_id, "user_id": uid},
                },
                upsert=True,
            )

        if content_doc.get("visibility") == "public" and random.random() < 0.35:
            reporter = random.choice(demo_users)
            reports.insert_one(
                {
                    "content_id": content_id,
                    "user_id": reporter,
                    "reason": random.choice(["错误答案", "违规内容", "抄袭", "广告或无关"]),
                    "detail": "seed report for admin testing",
                    "status": random.choice(["open", "open", "resolved", "rejected"]),
                    "created_at": now - timedelta(hours=random.randint(1, 72)),
                    "updated_at": now,
                }
            )

    # 回填统计
    for content_id in created_ids:
        upvotes = votes.count_documents({"content_id": content_id, "vote": "upvote"})
        downvotes = votes.count_documents({"content_id": content_id, "vote": "downvote"})
        report_count = reports.count_documents({"content_id": content_id})

        update_doc = {
            "stats.upvotes": int(upvotes),
            "stats.downvotes": int(downvotes),
            "stats.reports": int(report_count),
            "updated_at": datetime.utcnow(),
        }

        current = contents.find_one({"_id": content_id}, {"status": 1}) or {}
        if current.get("status") == "published" and report_count > 0:
            update_doc["status"] = "reported"

        contents.update_one({"_id": content_id}, {"$set": update_doc})

    total_seed_docs = contents.count_documents({"seed_marker": seed_marker})
    open_reports = reports.count_documents({"status": "open"})

    return {
        "created_batch": len(created_ids),
        "seed_marker": seed_marker,
        "total_seed_docs": total_seed_docs,
        "open_reports": open_reports,
    }


def main():
    parser = argparse.ArgumentParser(description="Seed question bank demo data for admin/frontend testing")
    parser.add_argument("--count", type=int, default=40, help="How many demo contents to create in this batch")
    parser.add_argument("--reset", action="store_true", help="Delete previous seeded docs with same marker before seeding")
    args = parser.parse_args()

    client = build_client()
    db = client["aipl_database"]
    summary = seed_demo_data(db, count=max(1, min(args.count, 500)), reset=args.reset)

    print("Seed completed:")
    for k, v in summary.items():
        print(f"- {k}: {v}")


if __name__ == "__main__":
    main()
