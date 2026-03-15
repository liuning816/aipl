from flask import Flask, request, make_response, g, jsonify
import logging
import re
import json
import base64
import binascii
import threading
import csv
import io
from datetime import datetime, timedelta
import os
import time
import random
import jwt
import uuid
from werkzeug.security import generate_password_hash, check_password_hash
import roadmap
import quiz
import generativeResources
from flask_cors import CORS
import bilibili_search
import translate
from database import get_or_create_user, save_content, get_content
from database import add_wrong_question, remove_wrong_question, list_wrong_questions, update_wrong_note, check_wrong_membership, add_redo_record, list_redo_records, delete_redo_record, append_wrong_redo_history
import siliconflow_client
import pdfplumber
import docx

api = Flask(__name__)

# ...existing code...
# 上传题库文件并解析题目
@api.route("/api/upload-questions", methods=["POST"])
def upload_questions():
    """接收 PDF/Word 文件，解析题目，返回题目结构"""
    user_id = get_user_id()
    if "file" not in request.files:
        return error_response("未检测到上传文件", 400)
    file = request.files["file"]
    filename = file.filename.lower()
    if filename.endswith(".pdf"):
        try:
            with pdfplumber.open(file) as pdf:
                text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        except Exception as e:
            logger.error(f"PDF解析失败: {e}")
            return error_response("PDF解析失败", 500)
    elif filename.endswith(".docx") or filename.endswith(".doc"):
        try:
            doc = docx.Document(file)
            text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        except Exception as e:
            logger.error(f"Word解析失败: {e}")
            return error_response("Word解析失败", 500)
    else:
        return error_response("仅支持PDF或Word文档", 400)

    # 简单题目分割：按“1.”、“1、”等分割
    pattern = re.compile(r"(?<=\n|^)(\d+)[.、]\s*")
    splits = [m.start() for m in pattern.finditer(text)]
    questions = []
    if splits:
        for i, start in enumerate(splits):
            end = splits[i+1] if i+1 < len(splits) else len(text)
            qtext = text[start:end].strip()
            if qtext:
                questions.append({"content": qtext})
    else:
        # 若未检测到题号，按段落分割
        for para in text.split("\n"):
            if para.strip():
                questions.append({"content": para.strip()})

    return jsonify({"success": True, "questions": questions, "count": len(questions)})
from flask import Flask, request, make_response, g
import logging
import re
import json
import base64
import binascii
import threading
import csv
import io
from datetime import datetime, timedelta
import os
import time
import random
import jwt
import uuid
from werkzeug.security import generate_password_hash, check_password_hash
import roadmap
import quiz
import generativeResources
from flask_cors import CORS
import bilibili_search
import translate
from database import get_or_create_user, save_content, get_content
from database import add_wrong_question, remove_wrong_question, list_wrong_questions, update_wrong_note, check_wrong_membership, add_redo_record, list_redo_records, delete_redo_record, append_wrong_redo_history
import siliconflow_client

api = Flask(__name__)

# 简易日志配置
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
USER_ID_RE = re.compile(r'^[A-Za-z0-9_\-]{1,64}$')

# CORS allowlist: comma-separated origins in env, e.g. http://localhost:3000,https://app.example.com
cors_origins_env = (os.getenv("CORS_ALLOWED_ORIGINS") or "http://localhost:3000,http://127.0.0.1:3000").strip()
cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
CORS(api, resources={r"/api/*": {"origins": cors_origins}}, supports_credentials=True)

JWT_SECRET_KEY = (os.getenv("JWT_SECRET_KEY") or "").strip()
if not JWT_SECRET_KEY:
    runtime_env = (os.getenv("FLASK_ENV") or os.getenv("APP_ENV") or "development").strip().lower()
    if runtime_env == "production":
        raise RuntimeError("JWT_SECRET_KEY is required in production environment")
    JWT_SECRET_KEY = "dev_secret"
    logger.warning("Using fallback JWT secret for non-production environment")

JWT_ALGORITHM = "HS256"
JWT_EXPIRES_DAYS = int(os.getenv("JWT_EXPIRES_DAYS", "7"))
AUTH_COOKIE_NAME = (os.getenv("AUTH_COOKIE_NAME") or "access_token").strip() or "access_token"
AUTH_COOKIE_SAMESITE = (os.getenv("AUTH_COOKIE_SAMESITE") or "Lax").strip() or "Lax"

runtime_env = (os.getenv("FLASK_ENV") or os.getenv("APP_ENV") or "development").strip().lower()
default_cookie_secure = "true" if runtime_env == "production" else "false"
AUTH_COOKIE_SECURE = (os.getenv("AUTH_COOKIE_SECURE", default_cookie_secure) or "false").strip().lower() in {"1", "true", "yes", "on"}
ADMIN_USER_IDS = {
    v.strip()
    for v in (os.getenv("ADMIN_USER_IDS") or "").split(",")
    if v.strip()
}

PUBLIC_ENDPOINTS = {
    "/api/health",
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/logout",
}

RATE_LIMIT_RULES = {
    "prompt_write": {"limit": 30, "window": 60},
    "password_update": {"limit": 5, "window": 600},
    "delete_account": {"limit": 3, "window": 3600},
}
_RATE_BUCKETS = {}
_RATE_LOCK = threading.Lock()


def error_response(message, status=400):
    """构造统一的错误响应体与HTTP状态码。"""
    return {"success": False, "error": message}, status


def _get_request_ip():
    """获取请求来源IP，优先使用反向代理头。"""
    xff = (request.headers.get("X-Forwarded-For") or "").strip()
    if xff:
        return xff.split(",")[0].strip()
    return (request.remote_addr or "unknown").strip() or "unknown"


def _audit_security_event(event, user_id=None, status="ok", detail=None):
    """记录安全审计日志，区分普通与告警级别事件。"""
    payload = {
        "event": event,
        "status": status,
        "user_id": user_id,
        "ip": _get_request_ip(),
        "ua": (request.headers.get("User-Agent") or "").strip()[:256],
        "time": datetime.utcnow().isoformat() + "Z",
    }
    if detail:
        payload["detail"] = str(detail)[:256]

    line = json.dumps(payload, ensure_ascii=False)
    if status in {"denied", "error", "rate_limited"}:
        logger.warning("SECURITY_AUDIT %s", line)
    else:
        logger.info("SECURITY_AUDIT %s", line)


def _consume_rate_limit(action, subject):
    """按 action+subject 消费一次限流配额，返回是否通过和重试秒数。"""
    cfg = RATE_LIMIT_RULES.get(action)
    if not cfg:
        return True, 0

    now = time.time()
    window = int(cfg.get("window", 60))
    limit = int(cfg.get("limit", 10))
    key = f"{action}:{subject}"

    with _RATE_LOCK:
        hits = _RATE_BUCKETS.get(key, [])
        threshold = now - window
        hits = [ts for ts in hits if ts >= threshold]

        if len(hits) >= limit:
            retry_after = int(max(1, window - (now - hits[0])))
            _RATE_BUCKETS[key] = hits
            return False, retry_after

        hits.append(now)
        _RATE_BUCKETS[key] = hits

    return True, 0


def _enforce_rate_limit(action, user_id):
    """对用户请求执行限流校验，命中时返回429错误响应。"""
    subject = f"{user_id}:{_get_request_ip()}"
    ok, retry_after = _consume_rate_limit(action, subject)
    if ok:
        return None

    _audit_security_event(
        event=f"{action}_rate_limit",
        user_id=user_id,
        status="rate_limited",
        detail=f"retry_after={retry_after}s",
    )
    return error_response(f"Too many requests, please retry after {retry_after}s", 429)


def get_json_body():
    """安全读取 JSON 请求体，缺失时返回空字典。"""
    return request.get_json(silent=True) or {}


def parse_pagination(args, default_limit=50, max_limit=100):
    """解析并约束分页参数 limit/skip。"""
    try:
        limit = int(args.get('limit', default_limit))
        skip = int(args.get('skip', 0))
    except Exception:
        limit, skip = default_limit, 0
    limit = max(1, min(max_limit, limit))
    skip = max(0, skip)
    return limit, skip


def _get_bearer_token():
    """从 Authorization 头中提取 Bearer Token。"""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header.replace("Bearer ", "", 1).strip()


def _get_auth_token():
    """获取认证令牌，优先 Bearer，其次 Cookie。"""
    bearer = _get_bearer_token()
    if bearer:
        return bearer
    cookie_token = (request.cookies.get(AUTH_COOKIE_NAME) or "").strip()
    return cookie_token or None


def _set_auth_cookie(response, token):
    """将访问令牌写入 HttpOnly 认证 Cookie。"""
    response.set_cookie(
        AUTH_COOKIE_NAME,
        token,
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite=AUTH_COOKIE_SAMESITE,
        max_age=JWT_EXPIRES_DAYS * 24 * 60 * 60,
        path='/',
    )


def _clear_auth_cookie(response):
    """清理认证 Cookie，用于退出登录。"""
    response.set_cookie(
        AUTH_COOKIE_NAME,
        "",
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite=AUTH_COOKIE_SAMESITE,
        expires=0,
        max_age=0,
        path='/',
    )


def _issue_token(user_id):
    """签发包含用户标识和过期时间的 JWT。"""
    now = datetime.utcnow()
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_EXPIRES_DAYS)).timestamp())
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def _decode_token(token):
    """校验并解码 JWT 令牌。"""
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])


def _normalize_user_id(raw_user_id):
    """校验并规范化 user_id 格式，不合法返回 None。"""
    if raw_user_id and not USER_ID_RE.match(raw_user_id):
        logger.warning('Invalid user id format')
        return None
    return raw_user_id


def get_user_id_optional():
    """从请求中获取用户ID（若缺失则返回None）"""
    return getattr(g, "user_id", None)


@api.route("/api/health", methods=["GET"])
def health():
    """简单健康检查，包含 MongoDB ping"""
    from mongodb import mongodb
    db_status = "ok"
    try:
        mongodb.client.admin.command('ping')
    except Exception as e:
        db_status = f"fail: {e}"
    return {"status": "ok", "db": db_status}

def get_user_id():
    """从请求中获取用户ID"""
    user_id = getattr(g, "user_id", None)
    if not user_id:
        return None
    return user_id


def is_admin_user(user_id):
    """判断用户是否为管理员（单角色：admin）。"""
    if not user_id:
        return False
    if user_id in ADMIN_USER_IDS:
        return True
    try:
        from database import get_user_by_id
        user = get_user_by_id(user_id)
        return bool(user and user.get("is_admin"))
    except Exception:
        return False


def require_admin_user():
    """统一管理员鉴权入口。"""
    user_id = get_user_id()
    if not is_admin_user(user_id):
        return None, error_response("Admin access required", 403)
    return user_id, None


@api.before_request
def require_authentication():
    """全局鉴权钩子：放行公开接口，其余接口校验令牌并写入 g.user_id。"""
    if request.method == "OPTIONS":
        return None
    if not request.path.startswith("/api/"):
        return None
    if request.path in PUBLIC_ENDPOINTS:
        return None

    token = _get_auth_token()
    if not token:
        return error_response("Unauthorized", 401)

    try:
        payload = _decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return error_response("Unauthorized", 401)
        from database import get_user_by_id
        user = get_user_by_id(user_id)
        if not user:
            return error_response("Unauthorized", 401)
        g.user_id = user_id
    except jwt.ExpiredSignatureError:
        return error_response("Token expired", 401)
    except jwt.InvalidTokenError:
        return error_response("Unauthorized", 401)


USERNAME_RE = re.compile(r"^[A-Za-z0-9_\-]{3,32}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_username(username):
    """校验用户名格式是否合法。"""
    if not username or not USERNAME_RE.match(username):
        return False
    return True


def _validate_email(email):
    """校验邮箱格式是否合法。"""
    if not email or not EMAIL_RE.match(email):
        return False
    return True


def _validate_password(password):
    """校验密码强度（至少8位且包含字母和数字）。"""
    if not password or len(password) < 8:
        return False
    has_alpha = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    return has_alpha and has_digit


def _parse_bool(value, default=False):
    """将不同类型输入解析为布尔值。"""
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "on"}:
        return True
    if text in {"false", "0", "no", "off", ""}:
        return False
    return bool(default)


def _validate_avatar_url(avatar_url):
    """校验头像字段是否为合法 URL 或 data:image base64。"""
    if avatar_url is None:
        return True
    if not isinstance(avatar_url, str):
        return False
    text = avatar_url.strip()
    if text == "":
        return True
    if text.startswith("http://") or text.startswith("https://"):
        return len(text) <= 512
    if text.startswith("data:image/") and ";base64," in text:
        if len(text) > 3000000:
            return False
        try:
            header, encoded = text.split(",", 1)
            if re.match(r"^data:image\/[A-Za-z0-9.+\-]+(?:;[A-Za-z0-9=._+\-]+)*;base64$", header) is None:
                return False
            compact = re.sub(r"\s+", "", encoded)
            try:
                base64.b64decode(compact, validate=True)
            except binascii.Error:
                normalized = compact.replace("-", "+").replace("_", "/")
                padding = len(normalized) % 4
                if padding:
                    normalized += "=" * (4 - padding)
                base64.b64decode(normalized, validate=False)
            return True
        except (ValueError, binascii.Error):
            return False
    return False


def _get_avatar_validation_error(avatar_url):
    """返回头像校验的可读错误信息；合法时返回 None。"""
    if avatar_url is None:
        return None
    if not isinstance(avatar_url, str):
        return "头像数据格式错误"

    text = avatar_url.strip()
    if text == "":
        return None

    if text.startswith("http://") or text.startswith("https://"):
        if len(text) > 512:
            return "头像链接过长，请缩短后重试"
        return None

    lower_text = text.lower()
    if lower_text.startswith("data:image/") and ";base64," in lower_text:
        if len(text) > 3000000:
            return "头像图片过大，请选择更小的图片（建议小于2MB）"
        try:
            header, encoded = text.split(",", 1)
            if re.match(r"^data:image\/[A-Za-z0-9.+\-]+(?:;[A-Za-z0-9=._+\-]+)*;base64$", header, re.IGNORECASE) is None:
                return "头像图片格式不受支持"

            compact = re.sub(r"\s+", "", encoded)
            try:
                base64.b64decode(compact, validate=True)
            except binascii.Error:
                normalized = compact.replace("-", "+").replace("_", "/")
                padding = len(normalized) % 4
                if padding:
                    normalized += "=" * (4 - padding)
                base64.b64decode(normalized, validate=False)
            return None
        except (ValueError, binascii.Error):
            return "头像图片编码无效，请重新选择图片"

    return "头像必须是 http(s) 链接或本地上传图片"


@api.route("/api/auth/register", methods=["POST"])
def register_user():
    """注册新用户并返回登录态（Token + Cookie）。"""
    req = get_json_body()
    username = (req.get("username") or "").strip()
    email = (req.get("email") or "").strip()
    password = req.get("password") or ""

    if not _validate_username(username):
        return error_response("Invalid username", 400)
    if not _validate_email(email):
        return error_response("Invalid email", 400)
    if not _validate_password(password):
        return error_response("Invalid password", 400)

    from database import create_user, get_user_by_identifier

    if get_user_by_identifier(username):
        return error_response("Username already exists", 409)
    if get_user_by_identifier(email):
        return error_response("Email already exists", 409)

    password_hash = generate_password_hash(password)
    try:
        user_id = create_user(username, email, password_hash)
    except Exception as e:
        logger.error("注册失败: %s", e)
        return error_response("Registration failed", 500)

    token = _issue_token(user_id)
    payload = {
        "success": True,
        "token": token,
        "user": {
            "user_id": user_id,
            "username": username,
            "email": email,
            "avatar_url": ""
        }
    }
    response = make_response(payload)
    _set_auth_cookie(response, token)
    return response


@api.route("/api/auth/login", methods=["POST"])
def login_user():
    """用户登录并签发新的认证令牌。"""
    req = get_json_body()
    identifier = (req.get("identifier") or "").strip()
    password = req.get("password") or ""

    if not identifier or not password:
        return error_response("Identifier and password required", 400)

    from database import get_user_by_identifier, update_last_login
    user = get_user_by_identifier(identifier)
    if not user:
        return error_response("Invalid credentials", 401)

    if not check_password_hash(user.get("password_hash", ""), password):
        return error_response("Invalid credentials", 401)

    update_last_login(user.get("user_id"))
    token = _issue_token(user.get("user_id"))
    payload = {
        "success": True,
        "token": token,
        "user": {
            "user_id": user.get("user_id"),
            "username": user.get("username"),
            "email": user.get("email"),
            "avatar_url": user.get("avatar_url", "")
        }
    }
    response = make_response(payload)
    _set_auth_cookie(response, token)
    return response


@api.route("/api/auth/logout", methods=["POST"])
def logout_user():
    """退出登录并清理认证 Cookie。"""
    response = make_response({"success": True})
    _clear_auth_cookie(response)
    return response


@api.route("/api/auth/session", methods=["GET"])
def auth_session():
    """获取当前会话对应的用户基础信息。"""
    user_id = get_user_id()
    from database import get_user_by_id
    user = get_user_by_id(user_id)
    if not user:
        return error_response("Unauthorized", 401)
    return {
        "success": True,
        "user": {
            "user_id": user.get("user_id"),
            "username": user.get("username"),
            "email": user.get("email"),
            "avatar_url": user.get("avatar_url", ""),
        },
    }


@api.route("/api/user/settings", methods=["GET"])
def get_user_settings_api():
    """读取当前用户设置。"""
    user_id = get_user_id()
    from database import get_user_settings

    try:
        settings = get_user_settings(user_id)
        if not settings:
            return error_response("User not found", 404)
        return {"success": True, "settings": settings}
    except Exception as e:
        logger.error("获取用户设置失败: %s", e)
        return error_response("Failed to load settings", 500)


@api.route("/api/user/settings", methods=["PUT"])
def update_user_settings_api():
    """更新当前用户的用户名和头像设置。"""
    user_id = get_user_id()
    req = get_json_body()
    username = req.get("username")
    avatar_url = req.get("avatar_url")
    bank_quiz_default_count = req.get("bank_quiz_default_count")

    if username is not None:
        username = str(username).strip()
        if not _validate_username(username):
            return error_response("Invalid username", 400)

    avatar_error = _get_avatar_validation_error(avatar_url)
    if avatar_error:
        return error_response(avatar_error, 400)

    if bank_quiz_default_count is not None:
        try:
            bank_quiz_default_count = int(bank_quiz_default_count)
        except Exception:
            return error_response("Invalid bank_quiz_default_count", 400)
        if bank_quiz_default_count < 1 or bank_quiz_default_count > 50:
            return error_response("bank_quiz_default_count must be between 1 and 50", 400)

    from database import update_user_settings, get_user_by_identifier, get_user_by_id

    try:
        if username is not None:
            exists = get_user_by_identifier(username)
            if exists and exists.get("user_id") != user_id:
                return error_response("Username already exists", 409)

        avatar_clean = avatar_url.strip() if isinstance(avatar_url, str) else avatar_url
        update_user_settings(
            user_id,
            username=username,
            avatar_url=avatar_clean,
            bank_quiz_default_count=bank_quiz_default_count,
        )
        user = get_user_by_id(user_id)
        return {
            "success": True,
            "user": {
                "user_id": user_id,
                "username": user.get("username"),
                "email": user.get("email"),
                "avatar_url": user.get("avatar_url", ""),
                "bank_quiz_default_count": int(user.get("bank_quiz_default_count") or 15),
            },
        }
    except Exception as e:
        logger.error("更新用户设置失败: %s", e)
        return error_response("Failed to update settings", 500)


@api.route("/api/user/password", methods=["PUT"])
def update_user_password_api():
    """修改当前用户密码，并记录安全审计日志。"""
    user_id = get_user_id()
    limited = _enforce_rate_limit("password_update", user_id)
    if limited:
        return limited

    req = get_json_body()
    current_password = req.get("current_password") or ""
    new_password = req.get("new_password") or ""

    if not current_password or not new_password:
        return error_response("Current password and new password required", 400)
    if not _validate_password(new_password):
        return error_response("Invalid password", 400)

    from database import get_user_by_id, update_user_password_hash

    try:
        user = get_user_by_id(user_id)
        if not user:
            _audit_security_event("password_update", user_id=user_id, status="denied", detail="user_not_found")
            return error_response("User not found", 404)

        if not check_password_hash(user.get("password_hash", ""), current_password):
            _audit_security_event("password_update", user_id=user_id, status="denied", detail="wrong_current_password")
            return error_response("Current password is incorrect", 401)

        update_user_password_hash(user_id, generate_password_hash(new_password))
        _audit_security_event("password_update", user_id=user_id, status="ok")
        return {"success": True}
    except Exception as e:
        _audit_security_event("password_update", user_id=user_id, status="error", detail=e)
        logger.error("修改密码失败: %s", e)
        return error_response("Failed to update password", 500)


@api.route("/api/user/delete-account", methods=["POST"])
def delete_user_account_api():
    """校验密码后执行账号及关联数据注销。"""
    user_id = get_user_id()
    limited = _enforce_rate_limit("delete_account", user_id)
    if limited:
        return limited

    req = get_json_body()
    password = req.get("password") or ""

    if not password:
        return error_response("Password required", 400)

    from database import get_user_by_id, delete_user_account_data

    try:
        user = get_user_by_id(user_id)
        if not user:
            _audit_security_event("delete_account", user_id=user_id, status="denied", detail="user_not_found")
            return error_response("User not found", 404)

        if not check_password_hash(user.get("password_hash", ""), password):
            _audit_security_event("delete_account", user_id=user_id, status="denied", detail="wrong_password")
            return error_response("Current password is incorrect", 401)

        result = delete_user_account_data(user_id)
        _audit_security_event("delete_account", user_id=user_id, status="ok", detail=result.get("deletion_mode"))
        return {"success": True, "result": result}
    except Exception as e:
        _audit_security_event("delete_account", user_id=user_id, status="error", detail=e)
        logger.exception("注销账号失败: %s", e)
        return error_response("Failed to delete account", 500)


@api.route("/api/user/avatar", methods=["POST"])
def upload_user_avatar_api():
    """上传头像文件并转为 data URL 保存。"""
    user_id = get_user_id()

    if "avatar" not in request.files:
        return error_response("No avatar file provided", 400)

    avatar_file = request.files.get("avatar")
    if not avatar_file or not avatar_file.filename:
        return error_response("Invalid avatar file", 400)

    mime_type = (avatar_file.mimetype or "").strip().lower()
    if not mime_type.startswith("image/"):
        return error_response("Avatar must be an image", 400)

    try:
        raw_bytes = avatar_file.read()
        if not raw_bytes:
            return error_response("Empty avatar file", 400)
        if len(raw_bytes) > 2 * 1024 * 1024:
            return error_response("Avatar file too large (max 2MB)", 413)

        data_url = f"data:{mime_type};base64,{base64.b64encode(raw_bytes).decode('ascii')}"

        from database import update_user_settings, get_user_by_id

        update_user_settings(user_id, avatar_url=data_url)
        user = get_user_by_id(user_id)
        return {
            "success": True,
            "user": {
                "user_id": user_id,
                "username": user.get("username"),
                "email": user.get("email"),
                "avatar_url": user.get("avatar_url", ""),
            },
        }
    except Exception as e:
        logger.exception("上传头像失败: %s", e)
        return error_response(f"Avatar upload failed: {str(e)}", 500)


@api.route("/api/user/prompts", methods=["GET"])
def list_user_prompts_api():
    """列出用户保存的提示词模板。"""
    user_id = get_user_id()
    from database import list_prompt_templates

    try:
        prompts = list_prompt_templates(user_id)
        return {"success": True, "prompts": prompts}
    except Exception as e:
        logger.error("获取提示词失败: %s", e)
        return error_response("Failed to load prompts", 500)


@api.route("/api/user/prompts", methods=["POST"])
def upsert_user_prompt_api():
    """创建或更新用户提示词模板。"""
    user_id = get_user_id()
    limited = _enforce_rate_limit("prompt_write", user_id)
    if limited:
        return limited

    req = get_json_body()
    prompt_id = (req.get("id") or "").strip() or f"prompt_{uuid.uuid4().hex}"
    title = (req.get("title") or "").strip()
    content = (req.get("content") or "").strip()
    enabled = _parse_bool(req.get("enabled"), True)
    description = (req.get("description") or "").strip()
    favorite = _parse_bool(req.get("favorite"), False)

    raw_tags = req.get("tags", [])
    if isinstance(raw_tags, str):
        raw_tags = [part.strip() for part in raw_tags.split(",") if part.strip()]
    if not isinstance(raw_tags, list):
        raw_tags = []
    tags = []
    for item in raw_tags:
        tag = str(item or "").strip()
        if not tag:
            continue
        if len(tag) > 20:
            tag = tag[:20]
        if tag not in tags:
            tags.append(tag)
        if len(tags) >= 8:
            break

    if not title:
        return error_response("Prompt title required", 400)
    if not content:
        return error_response("Prompt content required", 400)
    if len(title) > 80:
        return error_response("Prompt title too long (max 80)", 400)
    if len(description) > 240:
        return error_response("Prompt description too long (max 240)", 400)
    if len(content) > 8000:
        return error_response("Prompt content too long (max 8000)", 400)

    from database import upsert_prompt_template

    try:
        saved_id = upsert_prompt_template(
            user_id,
            prompt_id,
            title,
            content,
            enabled=enabled,
            description=description,
            favorite=favorite,
            tags=tags,
        )
        _audit_security_event("prompt_upsert", user_id=user_id, status="ok", detail=saved_id)
        return {"success": True, "id": saved_id}
    except Exception as e:
        if isinstance(e, ValueError):
            _audit_security_event("prompt_upsert", user_id=user_id, status="denied", detail=e)
            return error_response(str(e), 400)
        _audit_security_event("prompt_upsert", user_id=user_id, status="error", detail=e)
        logger.error("保存提示词失败: %s", e)
        return error_response("Failed to save prompt", 500)


@api.route("/api/user/prompts/<prompt_id>", methods=["DELETE"])
def delete_user_prompt_api(prompt_id):
    """删除指定的用户提示词模板。"""
    user_id = get_user_id()
    limited = _enforce_rate_limit("prompt_write", user_id)
    if limited:
        return limited

    from database import delete_prompt_template

    if not prompt_id:
        return error_response("Prompt id required", 400)

    try:
        modified = delete_prompt_template(user_id, prompt_id)
        _audit_security_event("prompt_delete", user_id=user_id, status="ok", detail=f"deleted={modified}")
        return {"success": True, "deleted": modified}
    except Exception as e:
        _audit_security_event("prompt_delete", user_id=user_id, status="error", detail=e)
        logger.error("删除提示词失败: %s", e)
        return error_response("Failed to delete prompt", 500)

@api.route("/api/roadmap", methods=["POST"])
def get_roadmap():
    """生成学习路线图，支持按用户与主题读取/写入缓存。"""
    req = get_json_body()
    user_id = get_user_id_optional()

    # 检查是否需要重新生成
    regenerate = req.get("regenerate", False)
    topic = req.get("topic", "Machine Learning")

    # 如果不是重新生成，尝试从数据库获取
    if not regenerate and user_id:
        try:
            existing = get_content(user_id, topic, "roadmap")
            if existing:
                return existing["content_data"]
        except Exception as e:
            logger.error('[DBError] roadmap cache read failed: %s', e)  # 如果数据库出错，继续生成新的

    # 生成新的路线图
    response_body = roadmap.create_roadmap(
        topic=topic,
        time=req.get("time", "4 weeks"),
        knowledge_level=req.get("knowledge_level", "Absolute Beginner"),
        user_id=user_id,
    )

    # 保存到数据库
    try:
        if user_id:
            save_content(user_id, topic, "roadmap", response_body)
    except Exception as e:
        logger.error('[DBError] roadmap cache save failed: %s', e)  # 如果数据库出错，仍然返回结果

    return response_body


@api.route("/api/quiz", methods=["POST"])
def get_quiz():
    """根据课程上下文与用户画像生成测验题。"""
    req = get_json_body()
    user_id = get_user_id()

    course = req.get("course")
    topic = req.get("topic")
    subtopic = req.get("subtopic")
    description = req.get("description") or ""

    # 读取用户画像（用于个性化题目）
    user_profile = None
    try:
        from database import get_user_profile_db
        profile_doc = get_user_profile_db(user_id)
        if profile_doc:
            user_profile = profile_doc.get('profile_data') or {}
    except Exception as e:
        logger.warning('获取用户画像失败，将生成通用测验: %s', e)

    # 兼容空描述，使用子主题或主题作为描述
    if not description:
        description = subtopic or topic or ""

    if not (course and topic and subtopic):
        return error_response("Required Fields not provided", 400)

    # 生成测验
    response_body = quiz.get_quiz(course, topic, subtopic, description, user_profile=user_profile, user_id=user_id)
    return response_body

@api.route("/api/quiz-score", methods=["POST"])
def save_quiz_score():
    """保存测验成绩"""
    req = get_json_body()
    user_id = get_user_id()

    topic = req.get("topic")
    score = req.get("score")

    if not topic or score is None:
        return error_response("Required Fields not provided", 400)

    from database import update_quiz_score
    update_quiz_score(user_id, topic, score)

    return {"success": True}


@api.route("/api/evaluate-question", methods=["POST"])
def evaluate_question():
    """评估单个题目的分数"""
    req = get_json_body()
    user_id = get_user_id()

    question = req.get("question")
    user_answer = req.get("user_answer")

    if not (question and user_answer is not None):
        return error_response("Required Fields not provided", 400)

    try:
        # 从question对象中提取必要信息
        course = question.get("course", "未知课程")
        topic = question.get("topic", "未知主题")
        subtopic = question.get("subtopic", "未知子主题")
        question_type = question.get("type", "short_answer")
        
        result = quiz.evaluate_question_score(course, topic, subtopic, question, user_answer, question_type, user_id=user_id)
        return {"success": True, "evaluation": result}
    except Exception as e:
        logger.error('评估题目失败: %s', e)
        return error_response(str(e), 500)


def _async_finalize_quiz(record_id, user_id, course, week, subtopic, record):
    """后台完成评分、错题归档与画像更新"""
    try:
        logger.info('后台评分开始: record_id=%s user=%s course=%s week=%s subtopic=%s', record_id, user_id, course, week, subtopic)
        questions = record.get('questions', [])
        user_answers = record.get('userAnswers', {})

        question_scores = {}
        total_score = 0

        for idx, q in enumerate(questions):
            qid = str(idx)
            question_type = q.get('type', 'short_answer')
            ua_entry = user_answers.get(qid) or user_answers.get(idx)

            if question_type in ['single_choice', 'multiple_choice', 'true_false']:
                selected = ua_entry.get('selectedOptions', []) if ua_entry else []
            else:
                user_answer_text = ua_entry.get('text', '') if ua_entry else ''

            try:
                evaluation_result = quiz.evaluate_question_score(
                    course=course,
                    topic=q.get('topic', ''),
                    subtopic=subtopic,
                    question=q,
                    user_answer=selected if question_type in ['single_choice', 'multiple_choice', 'true_false'] else user_answer_text,
                    question_type=question_type,
                    user_id=user_id,
                )

                question_scores[qid] = {
                    'score': evaluation_result.get('score', 0),
                    'is_correct': evaluation_result.get('is_correct', False),
                    'question_type': question_type,
                    'feedback': evaluation_result.get('feedback', '')
                }
                total_score += evaluation_result.get('score', 0)
            except Exception as e:
                logger.error('评估题目 %s 失败: %s', qid, e)
                question_scores[qid] = {
                    'score': 0,
                    'is_correct': False,
                    'question_type': question_type,
                    'error': str(e)
                }

        record['question_scores'] = question_scores
        record['total_score'] = total_score
        record['max_possible_score'] = len(questions) * 10
        record['score_percentage'] = (total_score / (len(questions) * 10)) * 100 if questions else 0

        score_info = {
            "total_score": record.get('total_score', 0),
            "max_possible_score": record.get('max_possible_score', 0),
            "score_percentage": record.get('score_percentage', 0),
            "question_count": len(questions),
            "question_scores": question_scores,
        }

        from database import update_quiz_record, update_profile_on_quiz_completion
        update_quiz_record(record_id, record, score_info)
        try:
            update_profile_on_quiz_completion(user_id, record_id)
        except Exception as e:
            logger.warning('更新用户画像失败: %s', e)

        # 自动将错误的选择题加入错题集
        def normalize_options(q):
            opts = q.get('options')
            if not opts:
                return []
            if isinstance(opts, list):
                return [str(o) for o in opts]
            if isinstance(opts, str):
                lines = [l.strip() for l in opts.split('\n') if l.strip()]
                if len(lines) > 1:
                    return lines
                parts = [p.strip() for p in re.split('[,;]', opts) if p.strip()]
                if len(parts) > 1:
                    return parts
                return [opts]
            return []

        def parse_correct_indices(q, opts):
            raw = q.get('correctAnswer') if 'correctAnswer' in q else (q.get('answerIndex') if 'answerIndex' in q else q.get('answer'))
            out = []
            if raw is None:
                return out
            def push(val):
                if isinstance(val, int):
                    if 0 <= val < len(opts):
                        out.append(val)
                elif isinstance(val, str):
                    s = val.strip()
                    if not s:
                        return
                    if re.match('^[A-Za-z]', s):
                        idx = ord(s[0].upper()) - 65
                        if 0 <= idx < len(opts):
                            out.append(idx)
                            return
                    found = next((i for i,o in enumerate(opts) if o and (o.strip() == s or o.strip().startswith(s) or s.startswith(o.strip()))), None)
                    if found is not None:
                        out.append(found)
            if isinstance(raw, list):
                for r in raw:
                    push(r)
            else:
                push(raw)
            return list(dict.fromkeys(out))

        for idx, q in enumerate(questions):
            opts = normalize_options(q)
            if not opts:
                continue
            ua_entry = user_answers.get(str(idx)) or user_answers.get(idx)
            if not ua_entry:
                continue
            selected = ua_entry.get('selectedOptions') or []
            correct_indices = parse_correct_indices(q, opts)
            if not correct_indices:
                continue
            if set(selected) == set(correct_indices):
                continue
            try:
                user_answer_text = ', '.join([opts[i] for i in selected if 0 <= i < len(opts)]) if selected else (ua_entry.get('text') or '')
                correct_answer_text = ', '.join([opts[i] for i in correct_indices if 0 <= i < len(opts)])
                add_wrong_question(
                    user_id,
                    course,
                    week,
                    subtopic,
                    q,
                    user_answer=user_answer_text,
                    correct_answer=correct_answer_text,
                    difficulty=q.get('difficulty'),
                    source='auto',
                    note=None
                )
            except Exception as e:
                logger.error('写入错题失败: %s', e)
    except Exception as e:
        logger.error('后台评分失败: %s', e)
    finally:
        logger.info('后台评分结束: record_id=%s', record_id)


@api.route("/api/save-quiz-record", methods=["POST"])
def save_quiz_record():
    """保存单次测验的完整记录到数据库"""
    req = get_json_body()
    user_id = get_user_id()

    course = req.get('course')
    week = str(req.get('week')) if req.get('week') is not None else None
    subtopic = str(req.get('subtopic')) if req.get('subtopic') is not None else None
    quiz_type = (req.get('quiz_type') or 'ai').strip().lower()
    if quiz_type not in ['ai', 'bank']:
        return error_response("Invalid quiz_type", 400)
    record = req.get('record')

    if not (course and week and subtopic and record is not None):
        return error_response("Required Fields not provided", 400)

    # 轻量结构校验：要求存在 questions 数组
    if not isinstance(record, dict) or not isinstance(record.get('questions', []), list):
        return {"success": False, "error": "Invalid record: questions must be a list"}, 400

    # 体积限制，避免超大文档
    try:
        record_size = len(json.dumps(record, ensure_ascii=False))
        if record_size > 524288:  # 512KB
            return {"success": False, "error": "Record too large"}, 413
    except Exception:
        pass

    try:
        questions = record.get('questions', [])
        user_answers = record.get('userAnswers', {})
        completed = bool(record.get('completedAt'))

        from database import save_quiz_record as db_save
        logger.info("保存测验记录: user=%s course=%s week=%s subtopic=%s questions=%s", user_id, course, week, subtopic, len(questions))
        record_id = db_save(user_id, course, week, subtopic, record, quiz_type=quiz_type)

        if completed:
            threading.Thread(
                target=_async_finalize_quiz,
                args=(record_id, user_id, course, week, subtopic, record),
                daemon=True
            ).start()

        return {"success": True, "record_id": record_id, "scoring_started": completed}
    except Exception as e:
        logger.error('保存测验记录失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/quiz-records", methods=["GET"])
def get_quiz_records():
    """返回用户的测验记录；支持按 course/week/subtopic 过滤"""
    user_id = get_user_id()
    course = request.args.get('course')
    week = str(request.args.get('week')) if request.args.get('week') is not None else None
    subtopic = str(request.args.get('subtopic')) if request.args.get('subtopic') is not None else None
    quiz_type = (request.args.get('quiz_type') or '').strip().lower() or None
    if quiz_type and quiz_type not in ['ai', 'bank']:
        return error_response("Invalid quiz_type", 400)
    # 分页参数
    limit, skip = parse_pagination(request.args)

    from database import get_quiz_records as db_get
    from database import count_quiz_records as db_count
    try:
        logger.info(f"查询测验记录: user={user_id} course={course} week={week} subtopic={subtopic} quiz_type={quiz_type} limit={limit} skip={skip}")
        records = db_get(user_id, course=course, week=week, subtopic=subtopic, quiz_type=quiz_type, limit=limit, skip=skip)
        total = db_count(user_id, course=course, week=week, subtopic=subtopic, quiz_type=quiz_type)
        logger.info(f"返回记录数: {len(records)} total={total}")
        return {"success": True, "records": records, "pagination": {"total": total, "limit": limit, "skip": skip}}
    except Exception as e:
        logger.error('获取测验记录失败: %s', e)
        return {"success": False, "error": str(e)}, 500


@api.route("/api/delete-quiz-records", methods=["POST"])
def delete_quiz_records():
    """删除用户的测验记录；可按 course/week/subtopic 过滤"""
    req = get_json_body()
    user_id = get_user_id()
    course = req.get('course')
    week = str(req.get('week')) if req.get('week') is not None else None
    subtopic = str(req.get('subtopic')) if req.get('subtopic') is not None else None
    quiz_type = (req.get('quiz_type') or '').strip().lower() or None
    if quiz_type and quiz_type not in ['ai', 'bank']:
        return error_response("Invalid quiz_type", 400)

    from database import delete_quiz_records as db_delete
    try:
        logger.info("删除测验记录: user=%s course=%s week=%s subtopic=%s quiz_type=%s", user_id, course, week, subtopic, quiz_type)
        result = db_delete(user_id, course=course, week=week, subtopic=subtopic, quiz_type=quiz_type)
        return {"success": True, "deleted": result.get("deleted_count", 0)}
    except Exception as e:
        logger.error('删除测验记录失败: %s', e)
        return {"success": False, "error": str(e)}, 500


@api.route("/api/user-data", methods=["GET"])
def get_user_data():
    """获取用户的所有学习数据"""
    user_id = get_user_id()
    # 分页参数（可选）
    limit, skip = parse_pagination(request.args)

    # 获取用户的所有内容
    from database import get_user_contents, count_user_contents
    contents = get_user_contents(user_id, limit=limit, skip=skip)
    total = count_user_contents(user_id)

    return {
        "user_id": user_id,
        "contents": contents,
        "pagination": {"total": total, "limit": limit, "skip": skip}
    }


@api.route("/api/cancel-course", methods=["POST"])
def cancel_course():
    """取消学习某课程并删除数据库中与该课程相关的所有数据"""
    req = get_json_body()
    user_id = get_user_id()

    topic = req.get("course") or req.get("topic")
    if not topic:
        return error_response("Required Fields not provided", 400)

    from database import cancel_course as db_cancel
    result = db_cancel(user_id, topic)

    return {"success": True, "result": result}

@api.route("/api/translate", methods=["POST"])
def get_translations():
    """批量翻译文本数组到目标语言。"""
    req = get_json_body()

    text = req.get("textArr")
    toLang = req.get("toLang")

    if not text or not toLang:
        return error_response("Required Fields not provided", 400)

    logger.info(f"Translating to {toLang}: { text}")
    translated_text = translate.translate_text_arr(text_arr=text, target=toLang)
    return translated_text


@api.route("/api/generate-resource", methods=["POST"])
def generative_resource():
    """生成学习资源，支持缓存读取与回写。"""
    req = get_json_body()
    user_id = get_user_id()

    # 检查是否需要重新生成
    regenerate = req.get("regenerate", False)
    course = req.get("course")

    if not regenerate:
        # 尝试从数据库获取现有资源
        try:
            existing = get_content(user_id, course, "resource")
            if existing:
                return existing["content_data"]
        except Exception as e:
            logger.error('[DBError] resource cache read failed: %s', e)

    # 验证必需字段
    req_data = {
        "course": req.get("course"),
        "knowledge_level": req.get("knowledge_level"),
        "description": req.get("description"),
        "time": req.get("time"),
        "user_id": user_id,
    }

    for key, value in req_data.items():
        if not value:
            return error_response("Required Fields not provided", 400)
    
    # 生成新的资源
    resources = generativeResources.generate_resources(**req_data)

    # 保存到数据库
    try:
        save_content(user_id, course, "resource", resources)
    except Exception as e:
        logger.error('[DBError] resource cache save failed: %s', e)

    return resources


@api.route("/api/search-bilibili", methods=["POST"])
def search_bilibili():
    """按主题关键词搜索 B 站课程并做相关性过滤。"""
    req = get_json_body()

    subtopic = req.get("subtopic", "")
    course = req.get("course", "")
    week_topic = req.get("week_topic", "")
    extra_keyword = (req.get("extra_keyword") or "").strip()
    extra_keyword_cn = extra_keyword
    refresh = _parse_bool(req.get("refresh"), False)
    raw_page = req.get("page")
    try:
        page = int(raw_page)
    except (TypeError, ValueError):
        page = 1
    if page < 1 or page > 10:
        page = 1
    if refresh and page == 1:
        page = random.randint(2, 6)

    # 将英文关键词翻译成中文
    try:
        subtopic_cn = translate.translate_text_arr([subtopic], target="zh-CN", user_id=get_user_id_optional())[0] if subtopic else ""
        course_cn = translate.translate_text_arr([course], target="zh-CN", user_id=get_user_id_optional())[0] if course else ""
        week_topic_cn = translate.translate_text_arr([week_topic], target="zh-CN", user_id=get_user_id_optional())[0] if week_topic else ""
        if extra_keyword:
            extra_keyword_cn = translate.translate_text_arr([extra_keyword], target="zh-CN", user_id=get_user_id_optional())[0]
        logger.info("Translated: %s -> %s, %s -> %s, %s -> %s", subtopic, subtopic_cn, course, course_cn, week_topic, week_topic_cn)
    except Exception as e:
        logger.warning("Translation error: %s, using original keywords", e)
        subtopic_cn = subtopic
        course_cn = course
        week_topic_cn = week_topic
        extra_keyword_cn = extra_keyword

    def _keyword_terms(text):
        raw = (text or "").strip().lower()
        if not raw:
            return []
        # 保留完整短语和拆分词条以提高匹配的稳健性
        parts = [seg for seg in re.split(r"[\s,，;；/|]+", raw) if seg]
        terms = [raw]
        for seg in parts:
            if seg not in terms:
                terms.append(seg)
        return terms

    def _filter_courses_by_terms(courses_list, terms):
        if not terms:
            return courses_list

        scored = []
        for item in courses_list or []:
            title = str(item.get("title") or "").lower()
            desc = str(item.get("description") or "").lower()
            text = f"{title} {desc}"
            score = sum(1 for term in terms if term and term in text)
            if score > 0:
                scored.append((score, item))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [item for _, item in scored]

    keyword_terms = _keyword_terms(extra_keyword_cn)

    keyword_candidates = []
    if extra_keyword_cn:
        keyword_candidates.extend(
            [
                f"{subtopic_cn} {extra_keyword_cn} 教程".strip(),
                f"{course_cn} {week_topic_cn} {subtopic_cn} {extra_keyword_cn}".strip(),
                f"{course_cn} {subtopic_cn} {extra_keyword_cn}".strip(),
                f"{course_cn} {week_topic_cn} {extra_keyword_cn}".strip(),
                f"{course_cn} {extra_keyword_cn}".strip(),
                f"{extra_keyword_cn} 教程".strip(),
            ]
        )
    else:
        keyword_candidates.extend(
            [
                f"{subtopic_cn} 教程".strip(),
                f"{course_cn} {week_topic_cn} {subtopic_cn}".strip(),
                f"{course_cn} {subtopic_cn}".strip(),
                f"{course_cn} {week_topic_cn}".strip(),
                f"{course_cn}".strip(),
            ]
        )

    # 去重并去空
    deduped_keywords = []
    for kw in keyword_candidates:
        safe_kw = " ".join((kw or "").split())
        if safe_kw and safe_kw not in deduped_keywords:
            deduped_keywords.append(safe_kw)

    courses = []
    keyword = deduped_keywords[0] if deduped_keywords else ""
    for kw in deduped_keywords:
        logger.info("Searching Bilibili for: %s (page=%s, refresh=%s)", kw, page, refresh)
        keyword = kw
        # 当提供关键词时，尝试搜索邻近页面并优先保留关键词匹配的结果
        trial_pages = [page]
        if keyword_terms:
            trial_pages.extend([p for p in [page + 1, page + 2] if 1 <= p <= 10])

        for trial_page in trial_pages:
            raw_courses = bilibili_search.search_bilibili_courses(kw, page=trial_page)
            filtered_courses = _filter_courses_by_terms(raw_courses, keyword_terms)

            # 优先使用严格的关键词匹配结果；仅在没有关键词条时回退到原始列表。
            if filtered_courses:
                courses = filtered_courses[:10]
                page = trial_page
                break
            if raw_courses and not keyword_terms:
                courses = raw_courses[:10]
                page = trial_page
                break

        if courses:
            break

    return {
        "courses": courses,
        "keyword": keyword,
        "extra_keyword": extra_keyword,
        "extra_keyword_cn": extra_keyword_cn,
        "page": page,
        "refresh": refresh,
    }


# -------------------- 错题集与重做 --------------------

@api.route("/api/wrong-questions", methods=["GET"])
def list_wrong_questions_route():
    """按条件查询当前用户错题列表。"""
    user_id = get_user_id()
    course = request.args.get('course')
    week = request.args.get('week')
    subtopic = request.args.get('subtopic')
    difficulty = request.args.get('difficulty')
    try:
        docs = list_wrong_questions(user_id, course=course, week=week, subtopic=subtopic, difficulty=difficulty)
        return {"success": True, "records": docs}
    except Exception as e:
        logger.error('获取错题集失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/wrong-questions/toggle", methods=["POST"])
def toggle_wrong_question_route():
    """在错题集内切换题目状态（加入或移除）。"""
    from mongodb import mongodb  # 复用统一的 key 生成逻辑

    user_id = get_user_id()
    data = get_json_body()
    course = data.get('course')
    week = data.get('week')
    subtopic = data.get('subtopic')
    question = data.get('question')
    user_answer = data.get('user_answer')
    correct_answer = data.get('correct_answer')
    difficulty = data.get('difficulty')

    if not (course and week is not None and subtopic is not None and question):
        return error_response("Required Fields not provided", 400)

    try:
        qkey = mongodb._question_key(question, course, str(week), str(subtopic))
        exists = check_wrong_membership(user_id, [question], course, str(week), str(subtopic))
        if exists:
            removed = remove_wrong_question(user_id, qkey)
            return {"success": True, "inWrong": False, "deleted": removed, "question_key": qkey}
        else:
            added_key = add_wrong_question(user_id, course, str(week), str(subtopic), question, user_answer, correct_answer, difficulty, source='manual')
            return {"success": True, "inWrong": True, "question_key": added_key}
    except Exception as e:
        logger.error('切换错题状态失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/wrong-questions/note", methods=["POST"])
def update_wrong_note_route():
    """更新错题备注内容。"""
    user_id = get_user_id()
    data = get_json_body()
    qkey = data.get('question_key')
    note = data.get('note', '')
    if not qkey:
        return error_response("question_key required", 400)
    try:
        modified = update_wrong_note(user_id, qkey, note)
        return {"success": True, "modified": modified}
    except Exception as e:
        logger.error('更新错题笔记失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/wrong-questions/delete", methods=["POST"])
def delete_wrong_question_route():
    """删除一条错题记录。"""
    user_id = get_user_id()
    data = get_json_body()
    qkey = data.get('question_key')
    if not qkey:
        return error_response("question_key required", 400)
    try:
        deleted = remove_wrong_question(user_id, qkey)
        return {"success": True, "deleted": deleted}
    except Exception as e:
        logger.error('删除错题失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/wrong-questions/check", methods=["POST"])
def check_wrong_membership_route():
    """批量检查题目是否已在错题集中。"""
    user_id = get_user_id()
    data = get_json_body()
    course = data.get('course')
    week = data.get('week')
    subtopic = data.get('subtopic')
    questions = data.get('questions') or []
    if not (course and week is not None and subtopic is not None and isinstance(questions, list)):
        return error_response("Required Fields not provided", 400)
    try:
        indices = check_wrong_membership(user_id, questions, course, str(week), str(subtopic))
        return {"success": True, "indices": indices}
    except Exception as e:
        logger.error('检查错题 membership 失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/redo-records", methods=["POST"])
def create_redo_records_route():
    """批量创建错题重做记录。"""
    user_id = get_user_id()
    data = get_json_body()
    course = data.get('course')
    week = data.get('week')
    subtopic = data.get('subtopic')
    items = data.get('items') or []
    batch_id = data.get('batch_id')
    if not (course and week is not None and subtopic is not None and isinstance(items, list) and items):
        return error_response("Required Fields not provided", 400)
    ids = []
    try:
        for it in items:
            raw_q = it.get('question')
            # 兼容 question 传入字符串（仅题干）的情况
            q = raw_q if isinstance(raw_q, dict) else ({'question': raw_q} if raw_q else {})
            cid = add_redo_record(
                user_id,
                course,
                str(week),
                str(subtopic),
                q,
                it.get('correct_answer'),
                it.get('attempt_answer'),
                it.get('difficulty'),
                batch_id,
                it.get('question_key')
            )
            ids.append(cid)
        return {"success": True, "ids": ids}
    except Exception as e:
        logger.error('创建重做记录失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/redo-records", methods=["GET"])
def list_redo_records_route():
    """查询用户的重做记录列表。"""
    user_id = get_user_id()
    course = request.args.get('course')
    week = request.args.get('week')
    subtopic = request.args.get('subtopic')
    try:
        docs = list_redo_records(user_id, course=course, week=week, subtopic=subtopic)
        return {"success": True, "records": docs}
    except Exception as e:
        logger.error('获取重做记录失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/redo-records/<record_id>", methods=["DELETE"])
def delete_redo_record_route(record_id):
    """删除一条重做记录。"""
    user_id = get_user_id()
    try:
        deleted = delete_redo_record(user_id, record_id)
        return {"success": True, "deleted": deleted}
    except Exception as e:
        logger.error('删除重做记录失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/wrong-questions/redo-log", methods=["POST"])
def append_wrong_redo_history_route():
    """为错题追加一条重做记录（不进入重做列表，最多20条，先进先出）。"""
    user_id = get_user_id()
    data = get_json_body()
    qkey = data.get('question_key')
    attempt_answer = data.get('attempt_answer')
    correct_answer = data.get('correct_answer')
    difficulty = data.get('difficulty')
    if not qkey or attempt_answer is None:
        return error_response("question_key and attempt_answer required", 400)
    try:
        modified = append_wrong_redo_history(user_id, qkey, attempt_answer, correct_answer, difficulty)
        return {"success": True, "modified": modified}
    except Exception as e:
        logger.error('追加重做记录失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/user-profile", methods=["GET"])
def get_user_profile_api():
    """获取用户画像"""
    user_id = get_user_id()
    regenerate = str(request.args.get('regenerate', '0')).lower() in ['1', 'true', 'yes']

    from database import get_user_profile_db, generate_user_profile

    profile_doc = None
    if not regenerate:
        try:
            profile_doc = get_user_profile_db(user_id)
        except Exception as e:
            logger.warning('获取用户画像失败，将尝试重新生成: %s', e)

    if regenerate or not profile_doc:
        result = generate_user_profile(user_id)
        if not result or not result.get('success'):
            return {"success": False, "error": result.get('error') if result else 'profile generation failed'}, 500
        return {
            "success": True,
            "profile": result.get('profile', {}),
            "generated_at": result.get('generated_at')
        }

    profile_data = profile_doc.get('profile_data') or {}
    return {
        "success": True,
        "profile": profile_data,
        "meta": {
            "created_at": profile_doc.get('created_at'),
            "updated_at": profile_doc.get('updated_at'),
            "profile_version": profile_doc.get('profile_version')
        }
    }


@api.route("/api/user-profile/refresh", methods=["POST"])
def refresh_user_profile():
    """强制刷新用户画像"""
    user_id = get_user_id()
    
    try:
        from database import generate_user_profile
        result = generate_user_profile(user_id)
        
        if result.get('success'):
            return {
                "success": True,
                "message": "用户画像已更新",
                "profile": result.get('profile')
            }
        else:
            return error_response(result.get('error', '更新失败'), 500)
            
    except Exception as e:
        logger.error('刷新用户画像失败: %s', e)
        return error_response(str(e), 500)


@api.route("/api/user-profile/summary", methods=["GET"])
def get_profile_summary():
    """获取简化的用户画像摘要"""
    user_id = get_user_id()
    
    try:
        from database import get_user_profile_db
        profile_doc = get_user_profile_db(user_id)
        
        if not profile_doc:
            return {"success": True, "summary": {"has_profile": False}}
        
        profile = profile_doc.get('profile_data', {})
        
        # 提取关键指标
        summary = {
            "has_profile": True,
            "learning_activity": {
                "total_quizzes": profile.get('learning_activity', {}).get('total_quizzes', 0),
                "recent_activity": profile.get('learning_activity', {}).get('recent_activity', 'unknown'),
                "quiz_frequency": profile.get('learning_activity', {}).get('quiz_frequency', 'unknown')
            },
            "knowledge_mastery": {
                "overall_score": profile.get('knowledge_mastery', {}).get('overall_score', 0),
                "improvement_trend": profile.get('knowledge_mastery', {}).get('improvement_trend', 'unknown'),
                "strong_areas_count": len(profile.get('knowledge_mastery', {}).get('strong_areas', [])),
                "weak_areas_count": len(profile.get('knowledge_mastery', {}).get('weak_areas', []))
            },
            "learning_effectiveness": {
                "error_rate": profile.get('learning_effectiveness', {}).get('error_rate', 0),
                "effectiveness_level": profile.get('learning_effectiveness', {}).get('effectiveness_level', 'unknown')
            },
            "recommendations_count": len(profile.get('personalized_recommendations', [])),
            "last_updated": profile_doc.get('updated_at')
        }
        
        return {"success": True, "summary": summary}
        
    except Exception as e:
        logger.error('获取画像摘要失败: %s', e)
        # 返回基础信息
        return {
            "success": True,
            "summary": {
                "has_profile": False,
                "message": "用户画像正在生成中..."
            }
        }


@api.route("/api/user-profile/subjects-overview", methods=["GET"])
def get_subjects_overview_api():
    """获取画像中的学科总览数据。"""
    user_id = get_user_id()
    search_text = request.args.get("q")
    sort_mode = (request.args.get("sort") or "recent").strip().lower()
    if sort_mode not in ["recent", "custom"]:
        sort_mode = "recent"

    try:
        from database import get_subjects_overview
        subjects = get_subjects_overview(user_id, search_text=search_text, sort_mode=sort_mode)
        return {"success": True, "subjects": subjects}
    except Exception as e:
        logger.error("获取学科总览失败: %s", e)
        return error_response(str(e), 500)


@api.route("/api/user-profile/subjects-order", methods=["POST"])
def set_subjects_order_api():
    """保存用户自定义的学科展示顺序。"""
    user_id = get_user_id()
    data = get_json_body()
    order = data.get("order") or []
    if not isinstance(order, list):
        return error_response("order must be a list", 400)

    try:
        from database import set_subject_order
        saved = set_subject_order(user_id, order)
        return {"success": True, "order": saved}
    except Exception as e:
        logger.error("保存学科排序失败: %s", e)
        return error_response(str(e), 500)


@api.route("/api/user-profile/subject-detail", methods=["GET"])
def get_subject_detail_api():
    """获取指定学科的画像详情。"""
    user_id = get_user_id()
    subject = (request.args.get("subject") or "").strip()
    if not subject:
        return error_response("subject required", 400)

    try:
        from database import get_subject_detail
        detail = get_subject_detail(user_id, subject)
        return {"success": True, "detail": detail}
    except Exception as e:
        logger.error("获取学科详情失败: %s", e)
        return error_response(str(e), 500)


def _append_csv_row(rows, section, key, value):
    """向导出行列表追加一条标准化 CSV 记录。"""
    rows.append({
        "section": section,
        "key": key,
        "value": value
    })


def _profile_to_csv(profile):
    """将画像字典扁平化并序列化为 CSV 文本。"""
    rows = []

    activity = profile.get("learning_activity", {})
    mastery = profile.get("knowledge_mastery", {})
    preferences = profile.get("learning_preferences", {})
    effectiveness = profile.get("learning_effectiveness", {})
    recommendations = profile.get("personalized_recommendations", [])

    for key, value in activity.items():
        _append_csv_row(rows, "learning_activity", key, value)

    for key, value in mastery.items():
        if isinstance(value, (list, dict)):
            value = json.dumps(value, ensure_ascii=False)
        _append_csv_row(rows, "knowledge_mastery", key, value)

    for key, value in preferences.items():
        if isinstance(value, (list, dict)):
            value = json.dumps(value, ensure_ascii=False)
        _append_csv_row(rows, "learning_preferences", key, value)

    for key, value in effectiveness.items():
        if isinstance(value, (list, dict)):
            value = json.dumps(value, ensure_ascii=False)
        _append_csv_row(rows, "learning_effectiveness", key, value)

    for idx, rec in enumerate(recommendations):
        rec_key = f"recommendation_{idx + 1}"
        rec_value = json.dumps(rec, ensure_ascii=False)
        _append_csv_row(rows, "personalized_recommendations", rec_key, rec_value)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["section", "key", "value"])
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def _parse_profile_value(raw_value):
    """将 CSV 中的字符串值尽量还原为原始类型。"""
    if raw_value is None:
        return None

    if isinstance(raw_value, (dict, list, int, float, bool)):
        return raw_value

    text = str(raw_value).strip()
    if text == "":
        return ""

    lowered = text.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered == "null":
        return None

    if re.fullmatch(r"-?\d+", text):
        try:
            return int(text)
        except Exception:
            pass

    if re.fullmatch(r"-?\d+\.\d+", text):
        try:
            return float(text)
        except Exception:
            pass

    if text.startswith("{") or text.startswith("["):
        try:
            return json.loads(text)
        except Exception:
            return text

    return text


def _csv_to_profile(csv_text):
    """将画像 CSV 文本解析回结构化画像对象。"""
    reader = csv.DictReader(io.StringIO(csv_text))
    expected = {"section", "key", "value"}
    found = set(reader.fieldnames or [])
    if not expected.issubset(found):
        raise ValueError("CSV 需要包含列: section,key,value")

    profile = {}
    recommendation_items = []
    row_count = 0

    for row in reader:
        row_count += 1
        section = str((row.get("section") or "")).strip()
        key = str((row.get("key") or "")).strip()
        value = _parse_profile_value(row.get("value"))

        if not section:
            continue

        if section == "personalized_recommendations":
            if isinstance(value, dict):
                recommendation_items.append(value)
            elif value is not None and str(value).strip() != "":
                recommendation_items.append({"content": value})
            continue

        if not key:
            continue

        if section not in profile or not isinstance(profile.get(section), dict):
            profile[section] = {}
        profile[section][key] = value

    if recommendation_items:
        profile["personalized_recommendations"] = recommendation_items

    profile.setdefault("analysis_date", datetime.utcnow().isoformat())
    if "profile_version" not in profile:
        profile["profile_version"] = 1

    return profile, row_count


@api.route("/api/user-profile/export", methods=["GET"])
def export_user_profile():
    """导出用户画像统计特征（CSV/JSON）"""
    user_id = get_user_id()
    export_format = str(request.args.get("format", "csv")).lower()
    regenerate = str(request.args.get("regenerate", "0")).lower() in ["1", "true", "yes"]

    from database import get_user_profile_db, generate_user_profile

    profile_doc = None
    if not regenerate:
        try:
            profile_doc = get_user_profile_db(user_id)
        except Exception as e:
            logger.warning("获取用户画像失败，将尝试重新生成: %s", e)

    if regenerate or not profile_doc:
        result = generate_user_profile(user_id)
        if not result or not result.get("success"):
            return {"success": False, "error": result.get("error") if result else "profile generation failed"}, 500
        profile_data = result.get("profile", {})
        meta = {"generated_at": result.get("generated_at")}
    else:
        profile_data = profile_doc.get("profile_data") or {}
        meta = {
            "created_at": profile_doc.get("created_at"),
            "updated_at": profile_doc.get("updated_at"),
            "profile_version": profile_doc.get("profile_version")
        }

    if export_format == "json":
        return {"success": True, "profile": profile_data, "meta": meta}

    csv_body = _profile_to_csv(profile_data)
    filename = f"user_profile_stats_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    response = make_response(csv_body)
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


@api.route("/api/user-profile/import", methods=["POST"])
def import_user_profile():
    """导入用户画像统计特征（CSV/JSON）"""
    user_id = get_user_id()

    upload = request.files.get("file")
    if not upload:
        return error_response("请上传 CSV 或 JSON 文件", 400)

    filename = str(upload.filename or "").strip().lower()
    try:
        payload_bytes = upload.read()
    except Exception:
        return error_response("读取上传文件失败", 400)

    if not payload_bytes:
        return error_response("上传文件为空", 400)
    if len(payload_bytes) > 1024 * 1024:
        return error_response("文件过大，请上传 1MB 以内文件", 413)

    try:
        text = payload_bytes.decode("utf-8-sig")
    except Exception:
        return error_response("文件编码不支持，请使用 UTF-8", 400)

    try:
        if filename.endswith(".json"):
            obj = json.loads(text)
            if isinstance(obj, dict) and isinstance(obj.get("profile"), dict):
                profile_data = obj.get("profile")
            elif isinstance(obj, dict):
                profile_data = obj
            else:
                return error_response("JSON 格式无效，需为对象", 400)
            imported_rows = 1
        else:
            profile_data, imported_rows = _csv_to_profile(text)
    except ValueError as ve:
        return error_response(str(ve), 400)
    except json.JSONDecodeError:
        return error_response("JSON 解析失败，请检查文件内容", 400)
    except Exception as e:
        logger.error("解析导入文件失败: %s", e)
        return error_response("导入文件解析失败", 400)

    if not isinstance(profile_data, dict) or not profile_data:
        return error_response("导入内容为空或格式不正确", 400)

    profile_data["analysis_date"] = datetime.utcnow().isoformat()
    if not isinstance(profile_data.get("profile_version"), int):
        profile_data["profile_version"] = 1

    try:
        from database import save_user_profile_db
        save_user_profile_db(user_id, profile_data)
    except Exception as e:
        logger.error("保存导入画像失败: %s", e)
        return error_response("导入成功但保存失败", 500)

    sections = [k for k in profile_data.keys() if isinstance(k, str)]
    return {
        "success": True,
        "message": "用户画像导入成功",
        "imported_rows": imported_rows,
        "sections": sections,
        "meta": {
            "updated_at": datetime.utcnow().isoformat()
        }
    }


@api.route("/api/personalized-explanation", methods=["POST"])
def get_personalized_explanation():
    """根据用户回答生成个性化解析"""
    req = get_json_body()

    question = req.get("question")
    user_answer = req.get("userAnswer")
    correct_answer = req.get("correctAnswer")
    question_type = req.get("questionType")
    course = req.get("course")
    topic = req.get("topic")
    subtopic = req.get("subtopic")
    knowledge_level = req.get("KnowledgeLevel")

    if not question or not user_answer:
        return {"error": "Required Fields not provided"}, 400

    logger.info("=== 个性化解析请求 ===")
    logger.info("题目: %s...", question[:100])
    logger.info("用户答案: %s", user_answer[:100] if len(user_answer) > 100 else user_answer)
    logger.info("正确答案: %s", correct_answer)
    logger.info("题目类型: %s", question_type)

    # 系统指令 - 简单直接版本
    system_instruction =  """你是专业的学科导师和教育评估专家，擅长根据学生的具体错误提供有针对性的学习指导。

请严格遵循以下要求生成个性化解析：

【核心任务】
1. 分析学生答案与正确答案的差异，找出具体错误点
2. 根据错误类型（概念混淆、计算错误、理解偏差等）提供针对性解释
3. 用温和鼓励的语气帮助学生建立信心
4. 根据学生水平提供针对性的指导
解析框架（深度分析维度）：
1. 知识掌握度分析
   - 哪些概念掌握了，哪些有误解
   - 知识点的联系是否建立
   - 记忆、理解、应用层面的表现

2. 思维过程分析
   - 解题思路的合理性
   - 逻辑推理的严密性
   - 问题拆解能力

3. 学习习惯分析
   - 回答中反映的学习方法
   - 常见错误模式
   - 需要培养的学习策略

4. 情感态度分析（如有信息）
   - 回答体现的学习态度
   - 信心水平和学习动力

指导原则：
- 语气：温和、鼓励、建设性，保护学生自信
- 重点：不仅指出错误，更要解释"为什么"会错
- 方法：提供具体的、可操作的学习策略
- 视角：从学生当前水平出发，设定可达成的下一步目标

【输出要求】
1. 必须使用以下JSON格式，不添加任何额外文本
2. 各字段内容要求：
{
  "analysis": "200-500字，详细分析错误原因，体现个性化",
  "correction": "对错误部分的纠正说明,清晰指出正确思路，避免简单复述答案，根据学生的个人情况和水平举出一些具体的例子，或者从高层的理论上进行解释",
  "suggestion": "具体可行的学习行动建议，比如推荐阅读可以指出可以去阅读哪些书哪些内容，推荐写代码可以给出具体的题目等，总之一定要是切实可行的，结合题目类型和知识点,添加一句适用于该学生个性化的鼓励的话",
}
【教学原则】
- 先肯定学生的努力，再指出问题
- 错误分析要具体，避免泛泛而谈
- 建议要可执行，如"建议练习3道同类题目"
- 适当使用类比、示例帮助学生理解

请生成专业、温暖、有指导价值的个性化解析"""
        
    # 用户提示 - 简单直接
    user_prompt = f"""请分析以下学生回答并提供个性化解析：

【题目】
{question}

【题目类型】
{question_type}

【学生回答】
{user_answer}

【正确答案】
{correct_answer}

【课程背景】
{course} - {topic}
知识点：{topic} - {subtopic}
学生知识水平：{knowledge_level}
【分析重点】
1. 请分析学生答案中的具体错误点（概念、步骤、理解等）
2. 结合题目类型（{question_type}）提供针对性指导
3. 根据学生的知识水平（{knowledge_level}）调整解释深度
4. 针对{topic}知识点提供学习建议

请基于以上信息生成个性化学习解析，帮助学生理解错误并改进学习。"""

    try:
        client = siliconflow_client.get_client()
        
        # 使用 generate_text 方法，然后手动解析 JSON
        response = client.generate_text(
            system_instruction=system_instruction,
            user_prompt=user_prompt,
            temperature=0.7,
            top_p=0.9,
            max_tokens=2000,
            user_id=get_user_id_optional(),
            scenario="explanation",
        )
        
        logger.info("原始响应: %s...", response[:500])
        
        # 尝试提取 JSON
        import json
        import re
        
        # 尝试直接解析
        try:
            result = json.loads(response)
            logger.info("直接解析成功")
            return result
        except json.JSONDecodeError:
            # 尝试提取 JSON 块
            json_match = re.search(r'```json\s*([\s\S]*?)\s*```', response)
            if json_match:
                try:
                    result = json.loads(json_match.group(1))
                    logger.info("从代码块中解析成功")
                    return result
                except json.JSONDecodeError:
                    pass
            
            # 尝试提取花括号中的内容
            brace_match = re.search(r'\{[\s\S]*\}', response)
            if brace_match:
                try:
                    result = json.loads(brace_match.group(0))
                    logger.info("从花括号中解析成功")
                    return result
                except json.JSONDecodeError:
                    pass
        
        # 如果所有解析都失败，返回结构化错误
        logger.warning("无法解析 JSON，返回默认响应")
        return {
            "analysis": f"很遗憾，你的回答与正确答案有所偏差。",
            "correction": f"正确答案是：{correct_answer}",
            "suggestion": "建议回顾相关知识点，加强理解后再尝试类似题目。",
            
        }
        
    except Exception as e:
        logger.exception("个性化解析生成失败: %s", e)
        return {
            "analysis": f"很遗憾，你的回答与正确答案有所偏差。",
            "correction": f"正确答案是：{correct_answer}",
            "suggestion": "建议回顾相关知识点，加强理解后再尝试类似题目。",
            
        }

@api.route("/api/quiz-followup", methods=["POST"])
def quiz_followup():
    """处理用户对题目的追问，支持多轮对话"""
    req = get_json_body()
    
    question = req.get("question")
    correct_answer = req.get("correctAnswer")
    user_answer = req.get("userAnswer")
    question_type = req.get("questionType")
    course = req.get("course")
    topic = req.get("topic")
    subtopic = req.get("subtopic")
    conversation_history = req.get("conversationHistory", [])
    user_question = req.get("userQuestion")
    
    if not question or not user_question:
        return {"error": "缺少必要参数"}, 400
    
    logger.info("=== 题目追问请求 ===")
    logger.info("题目: %s...", question[:100])
    logger.info("用户追问: %s", user_question)
    logger.info("对话历史: %s 轮", len(conversation_history))
    
    # 构建对话历史
    history_text = ""
    for i, (q, a) in enumerate(conversation_history):
        history_text += f"\n[对话 {i+1}] 用户: {q}\n[对话 {i+1}] AI: {a}"
    
    system_instruction = """你是一位专业的学习辅导老师。学生做完题目后可能会有各种疑问，你需要：

1. 耐心解答学生关于这道题目的任何问题
2. 可以扩展讲解相关的知识点
3. 提供更多例子帮助学生理解
4. 如果学生问的是关于答案为什么对/错，要清晰解释
5. 语气要温和鼓励，保护学生的学习热情

请直接回答学生的问题，不要重复题目内容，答案要简洁明了。"""

    user_prompt = f"""请回答学生关于这道题目的追问：

【题目信息】
- 题目类型：{question_type}
- 正确答案：{correct_answer}
- 学生答案：{user_answer}
- 课程：{course}
- 主题：{topic}
{f"- 子主题：{subtopic}" if subtopic else ""}

【之前的对话】{history_text}

【学生的新问题】
{user_question}

请直接回答学生的问题。如果问题与题目或知识点无关，请礼貌地引导学生回到学习上来。"""

    try:
        client = siliconflow_client.get_client()
        response = client.generate_text(
            system_instruction=system_instruction,
            user_prompt=user_prompt,
            temperature=0.7,
            top_p=0.9,
            max_tokens=1500,
            user_id=get_user_id_optional(),
            scenario="quiz_followup",
        )
        
        logger.info("追问回答: %s...", response[:200])
        return {"answer": response}
        
    except Exception as e:
        logger.exception("追问回答生成失败: %s", e)
        return {"error": "生成回答失败，请稍后重试"}, 500


@api.route("/api/resource-qa", methods=["POST"])
def resource_qa():
    """处理用户对学习资源的问题，支持多轮对话"""
    req = get_json_body()
    
    topic = req.get("topic")
    subtopic = req.get("subtopic")
    resource_content = req.get("resourceContent")
    user_question = req.get("userQuestion")
    conversation_history = req.get("conversationHistory", [])
    
    if not user_question:
        return {"error": "问题不能为空"}, 400
    
    logger.info("=== 学习资源问答请求 ===")
    logger.info("主题: %s - %s", topic, subtopic)
    logger.info("用户问题: %s", user_question)
    logger.info("对话历史: %s 轮", len(conversation_history))
    
    history_text = ""
    for i, (q, a) in enumerate(conversation_history):
        history_text += f"\n[对话 {i+1}] 用户: {q}\n[对话 {i+1}] AI: {a}"
    
    system_instruction = """你是一位专业的学习导师。用户正在学习特定的学习资源内容，你需要：

1. 根据提供的学习资源内容回答用户的问题
2. 如果问题超出资源范围，基于你的知识给出合理回答
3. 回答要简洁明了，易于理解
4. 适当举例子帮助解释概念
5. 语气要温和鼓励，保护学生的学习热情
6. 如果用户问的是作业或练习，可以给出解题思路但不要直接给答案

请直接回答问题，答案要简洁明了。"""

    user_prompt = f"""用户正在学习以下内容：
- 主题：{topic}
- 子主题：{subtopic}

【学习资源内容】
{resource_content[:3000]}

【之前的对话】{history_text}

【用户的新问题】
{user_question}

请根据学习资源内容回答用户的问题。如果问题超出资源范围，可以基于你的知识给出回答，但要在回答开始时说明这一点。"""

    try:
        client = siliconflow_client.get_client()
        response = client.generate_text(
            system_instruction=system_instruction,
            user_prompt=user_prompt,
            temperature=0.7,
            top_p=0.9,
            max_tokens=1500,
            user_id=get_user_id_optional(),
            scenario="resource_qa",
        )
        
        logger.info("问答回答: %s...", response[:200])
        return {"answer": response}
        
    except Exception as e:
        logger.exception("问答回答生成失败: %s", e)
        return {"error": "生成回答失败，请稍后重试"}, 500


@api.route("/api/question-bank/contents", methods=["POST"])
def create_question_bank_content_api():
    """创建题库内容（框架版）。"""
    user_id = get_user_id()
    req = get_json_body()

    content_type = (req.get("content_type") or "single_question").strip()
    visibility = (req.get("visibility") or "private").strip()
    title = (req.get("title") or "").strip()
    tags = req.get("tags") if isinstance(req.get("tags"), list) else []

    if content_type not in {"single_question", "paper"}:
        return error_response("Invalid content_type", 400)
    if visibility not in {"private", "public"}:
        return error_response("Invalid visibility", 400)
    if not title:
        return error_response("title is required", 400)
    if len(title) > 120:
        return error_response("title is too long", 400)
    if not tags:
        return error_response("At least one tag is required", 400)
    if len(tags) > 12:
        return error_response("too many tags", 400)

    clean_tags = []
    for tag in tags:
        t = str(tag).strip()
        if not t:
            continue
        if len(t) > 30:
            return error_response("tag is too long", 400)
        clean_tags.append(t)
    if not clean_tags:
        return error_response("At least one valid tag is required", 400)

    description = (req.get("description") or "").strip()
    if len(description) > 1000:
        return error_response("description is too long", 400)

    content_obj = req.get("content") if isinstance(req.get("content"), dict) else {}
    content_text = (content_obj.get("text") or "").strip()

    if content_type == "paper":
        items = req.get("items") if isinstance(req.get("items"), list) else []
        if len(items) <= 3:
            return error_response("paper requires more than 3 questions", 400)
    elif not content_text:
        return error_response("content.text is required for single_question", 400)

    req["tags"] = clean_tags
    req["description"] = description

    # 兼容部分环境对 /contents/<id> 更新方法限制：
    # 允许通过 POST /contents 携带 operation=update_draft + content_id 执行原位更新。
    operation = (req.get("operation") or "").strip()
    content_id = (req.get("content_id") or "").strip()
    if operation == "update_draft" and content_id:
        from database import update_question_bank_content
        doc = update_question_bank_content(content_id, user_id, req)
        if not doc:
            return error_response("Content not found or no permission", 404)
        return {"success": True, "data": doc}

    from database import create_question_bank_content
    doc = create_question_bank_content(user_id, req)
    return {"success": True, "data": doc}


@api.route("/api/question-bank/contents", methods=["GET"])
def list_question_bank_contents_api():
    """列出题库内容（支持公共库和用户私有内容）。"""
    user_id = get_user_id_optional()
    include_own = str(request.args.get("includeOwn", "false")).lower() in {"1", "true", "yes", "on"}
    mine_only = str(request.args.get("mineOnly", "false")).lower() in {"1", "true", "yes", "on"}
    exclude_draft = str(request.args.get("excludeDraft", "false")).lower() in {"1", "true", "yes", "on"}
    favorite_only = str(request.args.get("favoriteOnly", "false")).lower() in {"1", "true", "yes", "on"}
    visibility = (request.args.get("visibility") or "public").strip()
    status = (request.args.get("status") or "").strip() or None
    content_type = (request.args.get("content_type") or "").strip() or None
    tag = (request.args.get("tag") or "").strip() or None
    limit, skip = parse_pagination(request.args, default_limit=20, max_limit=100)

    from database import list_question_bank_contents
    payload = list_question_bank_contents(
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
    return {"success": True, "data": payload}


@api.route("/api/question-bank/contents/<content_id>", methods=["GET"])
def get_question_bank_content_api(content_id):
    """获取题库内容详情。"""
    from database import get_question_bank_content_for_user
    user_id = get_user_id()
    doc = get_question_bank_content_for_user(content_id, user_id=user_id)
    if not doc:
        return error_response("Content not found", 404)

    if doc.get("visibility") == "private" and doc.get("user_id") != user_id and not is_admin_user(user_id):
        return error_response("Forbidden", 403)
    return {"success": True, "data": doc}


@api.route("/api/question-bank/contents/<content_id>/visibility", methods=["PATCH"])
def update_question_bank_visibility_api(content_id):
    """更新题库内容可见性。"""
    user_id = get_user_id()
    req = get_json_body()
    visibility = (req.get("visibility") or "").strip()
    keep_uploaded = bool(req.get("keep_uploaded", False))
    if visibility not in {"private", "public"}:
        return error_response("Invalid visibility", 400)

    from database import update_question_bank_visibility
    changed = update_question_bank_visibility(content_id, user_id, visibility, keep_uploaded=keep_uploaded)
    if not changed:
        return error_response("Content not found or no permission", 404)
    return {"success": True}


@api.route("/api/question-bank/contents/<content_id>", methods=["PATCH", "POST"])
def update_question_bank_content_api(content_id):
    """更新题库内容。"""
    user_id = get_user_id()
    req = get_json_body()

    content_type = (req.get("content_type") or "single_question").strip()
    visibility = (req.get("visibility") or "private").strip()
    title = (req.get("title") or "").strip()
    tags = req.get("tags") if isinstance(req.get("tags"), list) else []

    if content_type not in {"single_question", "paper"}:
        return error_response("Invalid content_type", 400)
    if visibility not in {"private", "public"}:
        return error_response("Invalid visibility", 400)
    if not title:
        return error_response("title is required", 400)
    if len(title) > 120:
        return error_response("title is too long", 400)
    if not tags:
        return error_response("At least one tag is required", 400)
    if len(tags) > 12:
        return error_response("too many tags", 400)

    clean_tags = []
    for tag in tags:
        t = str(tag).strip()
        if not t:
            continue
        if len(t) > 30:
            return error_response("tag is too long", 400)
        clean_tags.append(t)
    if not clean_tags:
        return error_response("At least one valid tag is required", 400)

    description = (req.get("description") or "").strip()
    if len(description) > 1000:
        return error_response("description is too long", 400)

    content_obj = req.get("content") if isinstance(req.get("content"), dict) else {}
    content_text = (content_obj.get("text") or "").strip()

    if content_type == "paper":
        items = req.get("items") if isinstance(req.get("items"), list) else []
        if len(items) <= 3:
            return error_response("paper requires more than 3 questions", 400)
    elif not content_text:
        return error_response("content.text is required for single_question", 400)

    req["tags"] = clean_tags
    req["description"] = description

    from database import update_question_bank_content
    doc = update_question_bank_content(content_id, user_id, req)
    if not doc:
        return error_response("Content not found or no permission", 404)
    return {"success": True, "data": doc}


@api.route("/api/question-bank/contents/<content_id>", methods=["DELETE"])
def delete_question_bank_content_api(content_id):
    """删除题库内容。"""
    user_id = get_user_id()
    from database import delete_question_bank_content
    deleted = delete_question_bank_content(content_id, user_id)
    if not deleted:
        return error_response("Content not found or no permission", 404)
    return {"success": True}


@api.route("/api/question-bank/contents/<content_id>/vote", methods=["POST"])
def vote_question_bank_content_api(content_id):
    """点赞/点踩/撤销接口。"""
    user_id = get_user_id()
    req = get_json_body()
    vote = (req.get("vote") or "").strip()
    if vote not in {"upvote", "downvote", "none"}:
        return error_response("Invalid vote", 400)

    from database import set_question_bank_vote
    stats = set_question_bank_vote(content_id, user_id, vote)
    if not stats:
        return error_response("Content not found", 404)
    return {"success": True, "data": stats}


@api.route("/api/question-bank/contents/<content_id>/favorite", methods=["POST"])
def favorite_question_bank_content_api(content_id):
    """收藏/取消收藏接口。"""
    user_id = get_user_id()
    req = get_json_body()
    favorite = _parse_bool(req.get("favorite"), True)

    from database import set_question_bank_favorite
    result = set_question_bank_favorite(content_id, user_id, favorite=favorite)
    if not result:
        return error_response("Content not found", 404)
    return {"success": True, "data": result}


@api.route("/api/question-bank/contents/<content_id>/report", methods=["POST"])
def report_question_bank_content_api(content_id):
    """举报题库内容接口。"""
    user_id = get_user_id()
    req = get_json_body()
    reason = (req.get("reason") or "").strip()
    detail = (req.get("detail") or "").strip()
    allowed = {"违规内容", "错误答案", "抄袭", "广告或无关"}
    if reason not in allowed:
        return error_response("Invalid report reason", 400)

    from database import create_question_bank_report
    ok = create_question_bank_report(content_id, user_id, reason, detail=detail)
    if not ok:
        return error_response("Content not found", 404)
    return {"success": True}


@api.route("/api/question-bank/tests/generate", methods=["POST"])
def generate_question_bank_test_api():
    """生成题库测试卷：先按当前学习内容相关题过滤，再按点赞排序取前N。"""
    req = get_json_body()
    try:
        limit = int(req.get("limit", 10))
    except Exception:
        limit = 10
    limit = max(1, min(50, limit))

    mode = (req.get("mode") or "mixed").strip().lower()
    if mode not in {"mixed", "single"}:
        return error_response("Invalid mode", 400)

    context = {
        "course": (req.get("course") or "").strip(),
        "topic": (req.get("topic") or "").strip(),
        "subtopic": (req.get("subtopic") or "").strip(),
        "tags": req.get("tags") if isinstance(req.get("tags"), list) else [],
    }

    from database import generate_question_bank_test
    payload = generate_question_bank_test(context=context, limit=limit, mode=mode)
    return {"success": True, "data": payload}


@api.route("/api/admin/status", methods=["GET"])
def admin_status_api():
    """管理员状态查询（单角色）。"""
    user_id = get_user_id()
    return {
        "success": True,
        "data": {
            "user_id": user_id,
            "is_admin": is_admin_user(user_id),
            "role": "admin" if is_admin_user(user_id) else "user",
        },
    }


@api.route("/api/admin/question-bank/reports", methods=["GET"])
def admin_list_reports_api():
    """管理员查看举报列表。"""
    _, err = require_admin_user()
    if err:
        return err

    status = (request.args.get("status") or "open").strip()
    limit, skip = parse_pagination(request.args, default_limit=50, max_limit=200)
    from database import list_question_bank_reports
    rows = list_question_bank_reports(status=status, limit=limit, skip=skip)
    return {"success": True, "data": rows}


@api.route("/api/admin/question-bank/reports/<report_id>/resolve", methods=["POST"])
def admin_resolve_report_api(report_id):
    """管理员处理举报（框架版）。"""
    admin_user_id, err = require_admin_user()
    if err:
        return err

    req = get_json_body()
    action = (req.get("action") or "resolved").strip()
    note = (req.get("note") or "").strip()
    if action not in {"resolved", "rejected"}:
        return error_response("Invalid action", 400)

    from database import resolve_question_bank_report
    changed = resolve_question_bank_report(report_id, admin_user_id, action=action, note=note)
    if not changed:
        return error_response("Report not found", 404)
    return {"success": True}


@api.route("/api/admin/question-bank/content/<content_id>/moderate", methods=["POST"])
def admin_moderate_content_api(content_id):
    """管理员处理内容（隐藏/删除/恢复）。"""
    admin_user_id, err = require_admin_user()
    if err:
        return err

    req = get_json_body()
    action = (req.get("action") or "").strip()
    reason = (req.get("reason") or "").strip()
    if action not in {"hide", "delete", "restore"}:
        return error_response("Invalid action", 400)

    from database import moderate_question_bank_content
    changed = moderate_question_bank_content(content_id, admin_user_id, action=action, reason=reason)
    if not changed:
        return error_response("Content not found", 404)
    return {"success": True}


if __name__ == "__main__":
    api.run(host="0.0.0.0", port=5000, debug=True)
