import fieldMapping from '../../config/field-mapping.json' with { type: 'json' };
import { adfToText, extractCommentBody } from '../utils/jira.js';

/**
 * ルールベースのチケット分析
 * OpenAI APIを使わず、シンプルなロジックでAIフィールドを生成
 */

// Impact Score: votesと既存のimpact値から算出 (1-10)
const calculateImpactScore = (issue) => {
  const { fields } = issue;
  const votes = fields?.votes?.votes ?? 0;
  const existingImpact = fields?.customfield_impact ?? fields?.Impact;

  if (existingImpact !== undefined && existingImpact !== null) {
    return Math.max(1, Math.min(10, Number(existingImpact)));
  }

  // votesベースの計算: 0-2票=3, 3-5票=5, 6-10票=7, 11+票=9
  if (votes >= 11) return 9;
  if (votes >= 6) return 7;
  if (votes >= 3) return 5;
  return 3;
};

// Effort Score: 既存のeffort値を使用、なければlabelsとdescriptionから推定 (1-10)
const calculateEffortScore = (issue) => {
  const { fields } = issue;
  const existingEffort = fields?.customfield_effort ?? fields?.Effort;

  if (existingEffort !== undefined && existingEffort !== null) {
    return Math.max(1, Math.min(10, Number(existingEffort)));
  }

  const labels = fields?.labels ?? [];
  const description = adfToText(fields?.description);

  // ラベル数とdescriptionの長さから推定
  const labelCount = labels.length;
  const descLength = description.length;

  if (descLength > 500 || labelCount > 5) return 7;
  if (descLength > 200 || labelCount > 3) return 5;
  return 3;
};

// Urgency Score: 更新日時と作成日時から算出 (1-10)
const calculateUrgencyScore = (issue) => {
  const { fields } = issue;
  const updated = new Date(fields?.updated);
  const created = new Date(fields?.created);
  const now = new Date();

  const daysSinceUpdate = (now - updated) / (1000 * 60 * 60 * 24);
  const daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);

  // 最近更新されたものは緊急度が高い
  if (daysSinceUpdate < 7) return 8;
  if (daysSinceUpdate < 14) return 6;
  if (daysSinceUpdate < 30) return 4;

  // 古いまま放置されているものは緊急度が低い
  if (daysSinceCreation > 90) return 2;
  return 3;
};

// Confidence Level: 既存のconfidence値を使用、なければデータの充実度から判定
const calculateConfidenceLevel = (issue) => {
  const { fields } = issue;
  const existingConfidence = fields?.customfield_confidence ?? fields?.Confidence;

  if (existingConfidence !== undefined && existingConfidence !== null) {
    const val = Number(existingConfidence);
    if (val >= 7) return '高';
    if (val >= 4) return '中';
    return '低';
  }

  const description = adfToText(fields?.description);
  const comments = fields?.comment?.comments ?? [];
  const labels = fields?.labels ?? [];

  // データが充実していれば信頼度が高い
  const dataRichness =
    (description.length > 100 ? 1 : 0) +
    (comments.length > 2 ? 1 : 0) +
    (labels.length > 0 ? 1 : 0);

  if (dataRichness >= 2) return '高';
  if (dataRichness >= 1) return '中';
  return '低';
};

// Theme Category: labelsから判定
const calculateThemeCategory = (issue) => {
  const { fields } = issue;
  const labels = (fields?.labels ?? []).map(l => l.toLowerCase());

  if (labels.some(l => l.includes('bug') || l.includes('バグ') || l.includes('不具合'))) {
    return '品質・安定性';
  }
  if (labels.some(l => l.includes('feature') || l.includes('機能') || l.includes('新機能'))) {
    return '新機能開発';
  }
  if (labels.some(l => l.includes('performance') || l.includes('パフォーマンス') || l.includes('速度'))) {
    return 'パフォーマンス改善';
  }
  if (labels.some(l => l.includes('ui') || l.includes('ux') || l.includes('デザイン'))) {
    return 'UI/UX改善';
  }
  if (labels.some(l => l.includes('security') || l.includes('セキュリティ'))) {
    return 'セキュリティ';
  }
  if (labels.some(l => l.includes('tech') || l.includes('refactor') || l.includes('リファクタ'))) {
    return '技術改善';
  }

  return '一般';
};

// Suggested Next Action: ステータスに基づいて提案
const suggestNextAction = (issue) => {
  const { fields } = issue;
  const status = (fields?.status?.name ?? '').toLowerCase();
  const votes = fields?.votes?.votes ?? 0;

  if (status.includes('未着手') || status.includes('new') || status.includes('open')) {
    if (votes > 5) {
      return '優先度が高いため、早急にレビューして着手を検討してください';
    }
    return 'チームでレビューし、優先順位を決定してください';
  }

  if (status.includes('進行中') || status.includes('in progress') || status.includes('doing')) {
    return '進捗を確認し、ブロッカーがないかチェックしてください';
  }

  if (status.includes('レビュー') || status.includes('review')) {
    return 'レビューを完了させ、フィードバックを反映してください';
  }

  if (status.includes('完了') || status.includes('done') || status.includes('closed')) {
    return 'ステークホルダーへの報告と効果測定を実施してください';
  }

  return 'チームで次のアクションを決定してください';
};

// Analysis Note: 基本情報をまとめた文字列
const generateAnalysisNote = (issue, scores) => {
  const { fields } = issue;
  const votes = fields?.votes?.votes ?? 0;
  const comments = fields?.comment?.comments ?? [];
  const labels = fields?.labels ?? [];

  const notes = [];

  if (votes > 5) {
    notes.push(`${votes}票の支持があり、ユーザーからの注目度が高い`);
  }

  if (comments.length > 5) {
    notes.push(`${comments.length}件のコメントがあり、活発な議論が行われている`);
  }

  if (labels.length > 0) {
    notes.push(`関連ラベル: ${labels.slice(0, 3).join(', ')}`);
  }

  if (scores.impact >= 7 && scores.urgency >= 7) {
    notes.push('高インパクト・高緊急度のため優先的な対応を推奨');
  } else if (scores.impact >= 7) {
    notes.push('高インパクトだが緊急度は中程度');
  } else if (scores.urgency >= 7) {
    notes.push('緊急度が高いため早めの対応を検討');
  }

  if (notes.length === 0) {
    notes.push('標準的な優先度で対応を検討してください');
  }

  return notes.join('。') + '。';
};

// メイン分析関数
export const analyzeIssue = async (issue) => {
  const impactScore = calculateImpactScore(issue);
  const effortScore = calculateEffortScore(issue);
  const urgencyScore = calculateUrgencyScore(issue);

  // Priority Rank: impact × urgency / effort
  const priorityRank = Math.round((impactScore * urgencyScore / effortScore) * 10) / 10;

  const scores = {
    impact: impactScore,
    effort: effortScore,
    urgency: urgencyScore,
  };

  return {
    ai_impact_score: impactScore,
    ai_effort_score: effortScore,
    ai_urgency_score: urgencyScore,
    ai_priority_rank: priorityRank,
    ai_theme_category: calculateThemeCategory(issue),
    ai_confidence_level: calculateConfidenceLevel(issue),
    ai_suggested_next_action: suggestNextAction(issue),
    ai_analysis_note: generateAnalysisNote(issue, scores),
  };
};

export default analyzeIssue;
