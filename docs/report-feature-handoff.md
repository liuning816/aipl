# 举报功能现状清单（可直接转发）

## 用户侧

### 1. 提交举报
- 接口: `POST /api/question-bank/contents/<content_id>/report`
- 鉴权: 需要登录（用户 token）
- 请求体示例:

```json
{
  "reason": "错误答案",
  "detail": "可选补充说明"
}
```

- `reason` 允许值:
  - `错误答案`
  - `违规内容`
  - `抄袭`
  - `广告或无关`

### 2. 前端入口
- 文件: `src/pages/questionbank/questionbank.js`
- 现状: 在非“已上传”视图显示举报按钮并支持提交举报。

## 管理员侧

### 1. 查看举报列表
- 接口: `GET /api/admin/question-bank/reports?status=open&limit=50&skip=0`

### 2. 处理举报
- 接口: `POST /api/admin/question-bank/reports/<report_id>/resolve`
- 请求体示例:

```json
{
  "action": "resolved",
  "note": "可选处理说明"
}
```

- `action` 可选值:
  - `resolved`
  - `rejected`

### 3. 内容处置
- 接口: `POST /api/admin/question-bank/content/<content_id>/moderate`
- 请求体示例:

```json
{
  "action": "hide",
  "reason": "可选原因"
}
```

- `action` 可选值:
  - `hide`
  - `delete`
  - `restore`

### 4. 管理员身份验证
- 接口: `GET /api/admin/status`
- 规则: 仅当返回 `is_admin=true` 时可调用管理员举报相关接口。

## 数据层

### 1. 举报记录存储
- 集合: `question_bank_reports`

### 2. 被举报内容状态联动
- 集合: `question_bank_contents`
- 行为: 举报提交后会更新内容统计，并可能将状态标记为 `reported`。

## 备注
- 当前举报链路为“用户提交举报 -> 管理员查看与处理 -> 管理员执行内容处置”。
- 已有 Postman 文件可直接联调:
  - `docs/postman-questionbank-admin.collection.json`
  - `docs/postman-questionbank-admin.environment.json`
