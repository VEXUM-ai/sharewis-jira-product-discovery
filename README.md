# jira-ai-field-auto MCP サーバー

Node.js 製の MCP サーバーで、ルールベース方式（既定）または OpenAI を利用して Jira Product Discovery のアイデアを解析し、`ai_` プレフィックス付きのカスタムフィールド値を自動生成・更新します。

## 主な機能

- `POST /analyze_tickets` で Jira のページネーションを使いながら対象プロジェクトの全アイデアを取得し、AI スコア・カテゴリ・推奨アクションをまとめて生成します。
- `POST /update_fields` で `ai_` フィールドを Jira 側へ書き戻します。単一アイデア更新とバッチ更新、ドライランの切り替えに対応しています。
- 解析処理の同時実行数を環境変数で調整でき、デフォルトでは 5 並列で動作します。
- AI 出力と Jira 側のカスタムフィールドキーを対応付ける設定を `config/field-mapping.json` に集約しています。
- 動作確認用に `/health` エンドポイントを用意しています。

## セットアップ手順

1. **依存パッケージのインストール**
   ```bash
   npm install
   ```
2. **環境変数の設定**（`.env.example` を参照して `.env` を作成）
3. **サーバーの起動**
   ```bash
   npm start
   ```

## 環境変数一覧

| 変数名 | 説明 |
| --- | --- |
| `PORT` | Express サーバーの待ち受けポート（既定値 `3000`）。 |
| `JIRA_BASE_URL` | Jira インスタンスのベース URL（例: `https://your-domain.atlassian.net`）。 |
| `JIRA_EMAIL` | Jira API 認証に使用するアカウントのメールアドレス。 |
| `JIRA_API_TOKEN` | 上記アカウントの Jira API トークン。 |
| `OPENAI_API_KEY` | 解析に使用する OpenAI API キー。`AI_ENGINE=openai` の場合のみ必須です。 |
| `OPENAI_MODEL` | オプションの OpenAI モデル名（既定値 `gpt-4.1-mini`）。 |
| `AI_ENGINE` | `rule`（既定）または `openai`。`openai` を指定すると OpenAI 連携が有効になります。 |
| `ANALYSIS_CONCURRENCY` | AI 解析の並列実行数（既定値 `5`）。 |
| `DEFAULT_STATUS_FILTER` | ステータス未指定時に適用するデフォルトのフィルター（既定値 `未着手`）。 |

## LLM を使わないルールベースモード

外部の LLM を利用したくない場合は、既定の `AI_ENGINE=rule` のまま利用してください。このモードでは、投票数・コメント数・更新日時・ラベルなどのメタデータをもとに、ヒューリスティックな計算で AI フィールド値を生成します。

- `AI_ENGINE=rule`（既定値）
- `OPENAI_API_KEY` と `OPENAI_MODEL` は不要（設定していなくてもエラーになりません）
- 解析結果には `ai_analysis_note` として使用した指標が日本語で記録されます

ルールベース解析では、インパクト・労力・緊急度を 1〜10 の範囲で算出し、`(impact × urgency) ÷ effort` で優先度を求めます。ラベルやテキストに含まれるキーワードからテーマ分類を推定し、ステータスに応じた次アクションの雛形を返します。

## Render.com でのデプロイ手順

Render の Web Service（Node.js）としてデプロイする場合の手順例です。対象のダッシュボードは [https://dashboard.render.com/project/prj-d40n52uuk2gs73bapnog/environment/evm-d44mb9i4d50c73ek5b60/web/new](https://dashboard.render.com/project/prj-d40n52uuk2gs73bapnog/environment/evm-d44mb9i4d50c73ek5b60/web/new) を想定しています。

1. **New Web Service を作成**
   - GitHub リポジトリを選択し、ブランチを指定します。
   - Runtime は「Node」に設定し、Node バージョンは 20 以上を推奨します。
2. **Build & Start コマンドを指定**
   - Build Command: `npm install`
   - Start Command: `npm start`
3. **Environment Variables を登録**
   - `PORT` は Render が自動で割り当てるため設定不要です。
   - Jira API 接続に必要な `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` を追加します。
   - ルールベース解析（既定設定）の場合、`AI_ENGINE` は変更不要で OpenAI 関連の変数も未設定で問題ありません。
   - OpenAI を利用する場合のみ `AI_ENGINE=openai` とあわせて `OPENAI_API_KEY`, `OPENAI_MODEL` を設定してください。
4. **スケールとリージョンを選択してデプロイを開始**
5. デプロイ後、Render ダッシュボードの「Logs」で `Server running` ログが表示され、ヘルスチェックとして `GET /health` が `200 OK` を返すことを確認します。

Render では Web Service のヘルスチェック URL を `https://<service-name>.onrender.com/health` に設定しておくと、自動的に稼働状況が監視されます。

## リクエスト例

### チケット解析

```bash
curl -X POST http://localhost:3000/analyze_tickets \
  -H 'Content-Type: application/json' \
  -d '{
    "project_key": "WD",
    "status_filter": "未着手",
    "limit": "unlimited"
  }'
```

レスポンス例（抜粋）:

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

### フィールド更新（バッチ）

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

## 補足

- 既存フィールドを保護するため、`/update_fields` が更新対象とするのは `ai_` で始まるフィールドのみです。
- 各アイデアごとの AI 解析エラーはレスポンスに含められるため、失敗したアイテムだけを再実行できます。
- Jira API へ実際に送信せず挙動を確認したい場合は、`dry_run` フラグを `true` に設定してください。
