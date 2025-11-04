# jira-ai-field-auto MCP Server

A Node.js MCP server that analyzes Jira Product Discovery tickets with OpenAI and automatically prepares AI-prefixed custom fields for Jira updates.

## Features

- `POST /analyze_tickets` fetches every ticket in the target project (using Jira pagination) and generates AI scores, categories, and recommendations.
- `POST /update_fields` writes `ai_` fields back to Jira, either one issue at a time or in batches with optional dry-run mode.
- Configurable concurrency limit (default `5`) to balance throughput and API load.
- Central field mapping JSON keeps AI outputs aligned with Jira custom field keys.
- Includes `/health` endpoint for basic monitoring.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Set environment variables** (see `.env.example`)
3. **Start the server**
   ```bash
   npm start
   ```

## Environment Variables

| Variable | Description |
| --- | --- |
| `PORT` | Port for the Express server (defaults to `3000`). |
| `JIRA_BASE_URL` | Base URL of the Jira instance (e.g., `https://your-domain.atlassian.net`). |
| `JIRA_EMAIL` | Jira account email used for API authentication. |
| `JIRA_API_TOKEN` | Jira API token for the account above. |
| `OPENAI_API_KEY` | OpenAI API key used for analysis. |
| `OPENAI_MODEL` | Optional OpenAI model name (`gpt-4o-mini` by default). |
| `ANALYSIS_CONCURRENCY` | Optional concurrency limit for AI analysis (defaults to `5`). |
| `DEFAULT_STATUS_FILTER` | Default status filter applied when none is provided (defaults to `未着手`). |

## Example Requests

### Analyze Tickets

```bash
curl -X POST http://localhost:3000/analyze_tickets \
  -H 'Content-Type: application/json' \
  -d '{
    "project_key": "WD",
    "status_filter": "未着手",
    "limit": "unlimited"
  }'
```

Example response snippet:

```json
{
  "project_key": "WD",
  "total_issues": 214,
  "analyzed_count": 214,
  "issues": [
    {
      "id": "WD-101",
      "summary": "ログイン画面でのセッション切断問題",
      "ai_fields": {
        "ai_impact_score": 8,
        "ai_priority_rank": 14.4,
        "ai_theme_category": "安定性",
        "ai_suggested_next_action": "セッション管理ミドルウェアの更新を検討",
        "ai_analysis_note": "顧客影響度が高く、直近コメントでも複数の障害報告がある。",
        "ai_last_evaluated_at": "2024-05-18T01:23:45.678Z"
      }
    }
  ]
}
```

### Update Fields (batch)

```bash
curl -X POST http://localhost:3000/update_fields \
  -H 'Content-Type: application/json' \
  -d '{
    "batch": true,
    "dry_run": false,
    "issues": [
      {
        "issue_id": "WD-101",
        "fields": {
          "ai_impact_score": 8,
          "ai_priority_rank": 14.4
        }
      }
    ]
  }'
```

## Field Mapping

All AI-generated fields and the Jira references they rely on are defined in `config/field-mapping.json` for easy synchronization with Jira custom fields.

## Notes

- Only `ai_` prefixed fields will be updated via `/update_fields` to protect existing Jira data.
- AI analysis errors per issue are captured in the response, allowing for manual review or retries.
- Use the `dry_run` flag when testing updates to preview changes without calling the Jira API.
