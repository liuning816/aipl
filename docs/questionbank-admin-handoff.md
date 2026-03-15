# Question Bank Admin Handoff

## Current status
- Vote API exists: `POST /api/question-bank/contents/<content_id>/vote` (`upvote|downvote|none`).
- Report API exists: `POST /api/question-bank/contents/<content_id>/report`.
- Admin report list exists: `GET /api/admin/question-bank/reports`.
- Admin report resolve exists: `POST /api/admin/question-bank/reports/<report_id>/resolve`.
- Admin content moderate exists: `POST /api/admin/question-bank/content/<content_id>/moderate`.

## Data collections used
- `question_bank_contents`: both draft and published content.
  - draft: `visibility=private`, `status=draft`
  - published: `visibility=public`, `status=published`
  - reported: `status=reported`
- `question_bank_votes`: vote records (`content_id`, `user_id`, `vote`).
- `question_bank_reports`: report records (`reason`, `detail`, `status`).

## Seed script for test data
- Script path: `backend/scripts/seed_question_bank_demo.py`
- Default target DB: `aipl_database`
- Marker field: `seed_marker=qb_seed_v2`

### Usage
```bash
# from workspace root
python backend/scripts/seed_question_bank_demo.py --count 60 --reset
```

### Expected output
- Number of docs created in current batch
- Total docs with seed marker
- Number of open reports

## Why this helps
- Provides stable template data for frontend/admin integration.
- Keeps field naming and status transitions aligned with current APIs.
- Gives enough report/vote samples for moderation workflow debugging.

## Postman quick start
- Collection: `docs/postman-questionbank-admin.collection.json`
- Environment: `docs/postman-questionbank-admin.environment.json`

### Import order
1. Import environment JSON and select it as active environment.
2. Import collection JSON.
3. Fill environment variable `token` with a valid JWT.
4. Run `Admin Status` first, then `List Reports (Open)` to fetch `reportId`.
5. Fill `contentId`/`reportId` and continue moderation API debugging.
