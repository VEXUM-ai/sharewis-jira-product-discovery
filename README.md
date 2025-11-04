# Jira Product Discovery AI自動フィールド設定サーバー

Jira Product Discoveryのチケットを**ルールベースロジック**で分析し、AI接頭辞付きカスタムフィールドを自動生成する**MCPサーバー**です。

## 特徴

- **MCPプロトコル対応** - Claude Desktop、Slackなどのクライアントから直接使用可能
- **3つのMCPツール**を提供：
  - `analyze_jira_tickets` - プロジェクト全体のチケット分析
  - `update_jira_field` - 単一チケットのフィールド更新
  - `batch_update_jira_fields` - 複数チケットのバッチ更新
- **HTTP REST API**も利用可能（ExpressサーバーとしてHTTPリクエストにも対応）
- **外部AI API不要** - votes、labels、status、dates、既存フィールドに基づくインテリジェントなルールベースロジック
- 設定可能な並行処理数（デフォルト`5`）でスループットとAPI負荷のバランスを調整

## 分析ロジック

サーバーはルールベースアルゴリズムを使用してAIフィールドを生成します：

- **ai_impact_score** (1-10): votesと既存のimpactフィールドから算出
- **ai_effort_score** (1-10): 既存のeffortフィールド、ラベル数、説明文の長さに基づく
- **ai_urgency_score** (1-10): 更新日と作成日から判定
- **ai_priority_rank**: `(impact × urgency) / effort`で計算
- **ai_theme_category**: ラベルから分類（例: "品質・安定性"、"新機能開発"、"UI/UX改善"）
- **ai_confidence_level**: データの充実度に基づく判定（"高"/"中"/"低"）
- **ai_suggested_next_action**: 現在のステータスに基づく推奨アクション
- **ai_analysis_note**: 主要指標と推奨事項のサマリー

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.example`を参考に`.env`ファイルを作成し、必要な環境変数を設定してください。

### 3. サーバーの起動

#### MCPサーバーとして起動（推奨）
```bash
npm start
```
または
```bash
node src/mcp-server.js
```

MCPクライアント（Claude Desktopなど）から使用する場合、クライアントの設定ファイルに以下を追加してください：

**Claude Desktopの場合** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "jira-ai-field-auto": {
      "command": "node",
      "args": ["/path/to/sharewis-jira-product-discovery/src/mcp-server.js"],
      "env": {
        "JIRA_BASE_URL": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

**注意**: `/path/to/`は実際のプロジェクトパスに置き換えてください。

#### HTTP REST APIサーバーとして起動
```bash
npm run start:http
```
または
```bash
node src/server.js
```

HTTPサーバーはポート3000で起動し、REST APIエンドポイントを提供します。

## 環境変数

| 変数名 | 説明 |
| --- | --- |
| `PORT` | Expressサーバーのポート番号（デフォルト: `3000`） |
| `JIRA_BASE_URL` | JiraインスタンスのベースURL（例: `https://your-domain.atlassian.net`） |
| `JIRA_EMAIL` | API認証に使用するJiraアカウントのメールアドレス |
| `JIRA_API_TOKEN` | 上記アカウントのJira APIトークン |
| `ANALYSIS_CONCURRENCY` | 分析の並行処理数（デフォルト: `5`） |
| `DEFAULT_STATUS_FILTER` | 指定がない場合に適用されるデフォルトのステータスフィルター（デフォルト: `未着手`） |

## 使用例

### MCPツールの使用（Claude Desktopなど）

MCPクライアントから以下の3つのツールを使用できます：

#### 1. `analyze_jira_tickets` - チケット分析

```
Jiraプロジェクト WD の未着手チケットを全件分析してください
```

MCPクライアントは自動的に以下のパラメータでツールを呼び出します：
- `project_key`: "WD"
- `status_filter`: "未着手"
- `limit`: "unlimited"

#### 2. `update_jira_field` - 単一チケット更新

```
WD-101チケットのai_impact_scoreを8、ai_priority_rankを14.4に更新してください
```

#### 3. `batch_update_jira_fields` - バッチ更新

```
以下のチケットを一括更新してください（dry-runモード）：
- WD-101: ai_impact_score=8
- WD-102: ai_impact_score=6
```

### HTTP REST API の使用

MCPではなくHTTP APIとして使用する場合（`npm run start:http`で起動）：

#### チケット分析

```bash
curl -X POST http://localhost:3000/analyze_tickets \
  -H 'Content-Type: application/json' \
  -d '{
    "project_key": "WD",
    "status_filter": "未着手",
    "limit": "unlimited"
  }'
```

レスポンス例：

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
        "ai_theme_category": "品質・安定性",
        "ai_suggested_next_action": "優先度が高いため、早急にレビューして着手を検討してください",
        "ai_analysis_note": "8票の支持があり、ユーザーからの注目度が高い。高インパクト・高緊急度のため優先的な対応を推奨。",
        "ai_last_evaluated_at": "2024-05-18T01:23:45.678Z"
      }
    }
  ]
}
```

### フィールド更新（バッチ処理）

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

## フィールドマッピング

すべてのAI生成フィールドと、それらが参照するJiraフィールドは`config/field-mapping.json`で定義されています。Jiraカスタムフィールドとの同期が容易です。

## 注意事項

- `/update_fields`では`ai_`接頭辞付きフィールドのみが更新されます（既存のJiraデータを保護）
- 分析は完全にルールベースロジックで実行されます - 外部AI APIコールなし、コストゼロ
- チケットごとの分析エラーはレスポンスに含まれるため、手動レビューや再試行が可能
- `dry_run`フラグを使用すると、Jira APIを呼び出さずに変更をプレビューできます
- ルールベースロジックは`src/services/aiAnalyzer.js`でカスタマイズ可能（チームの優先順位付け基準に合わせて調整）

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。
