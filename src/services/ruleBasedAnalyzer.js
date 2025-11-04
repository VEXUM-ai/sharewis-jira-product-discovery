import { adfToText, extractCommentBody } from '../utils/jira.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const toNumber = (value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9+\-.]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === 'object') {
    if (value.value !== undefined) {
      const parsed = toNumber(value.value);
      if (parsed !== undefined) return parsed;
    }
    if (value.score !== undefined) {
      const parsed = toNumber(value.score);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
};

const determineTheme = (labels = [], summary = '', description = '') => {
  const text = `${summary} ${description}`.toLowerCase();
  const normalizedLabels = labels.map((label) => String(label).toLowerCase());

  const match = (...keywords) => {
    return keywords.some((keyword) => {
      const lowerKeyword = keyword.toLowerCase();
      return text.includes(lowerKeyword) || normalizedLabels.some((label) => label.includes(lowerKeyword));
    });
  };

  if (match('bug', '障害', 'エラー', '不具合', 'stability')) return '安定性';
  if (match('ux', 'ui', 'デザイン', '体験', '使いやす')) return 'UX改善';
  if (match('performance', '速度', 'レスポンス', 'パフォーマンス', 'スケール')) return 'パフォーマンス';
  if (match('growth', 'マーケ', '集客', '売上', '課金')) return 'ビジネス成長';
  if (match('analytics', 'データ', '分析', '計測')) return '分析・計測';

  return normalizedLabels[0]?.toUpperCase() || 'その他';
};

const buildSuggestedAction = (statusName, theme, urgency) => {
  if (!statusName) return `次のステップとして ${theme} に関する対応案を検討してください。`;
  const status = statusName.toLowerCase();

  if (status.includes('done') || status.includes('完了')) {
    return '完了後の影響確認とフィードバック収集を継続してください。';
  }

  if (urgency >= 8) {
    return '直近のスプリントで優先対応できるよう、担当者アサインと要件の確定を行ってください。';
  }

  if (status.includes('in progress') || status.includes('進行')) {
    return '進行中の作業内容を棚卸しし、次のデリバリープランを更新してください。';
  }

  if (theme === 'UX改善') {
    return 'ユーザビリティテストまたは顧客ヒアリングで改善案の検証を進めてください。';
  }

  if (theme === '安定性') {
    return '原因調査と再発防止策の整理を進め、必要であればホットフィックスを検討してください。';
  }

  return `バックログの優先度を見直し、${theme} に関する次のアクションを決めてください。`;
};

const buildAnalysisNote = ({
  votes,
  commentCount,
  theme,
  daysSinceUpdate,
  impact,
  effort,
  urgency,
}) => {
  const parts = [];
  parts.push(`投票数 ${votes} 件、コメント ${commentCount} 件を参照しました。`);
  parts.push(`最終更新から ${Math.round(daysSinceUpdate)} 日経過しています。`);
  parts.push(`テーマは「${theme}」と推定しました。`);
  parts.push(`インパクト ${impact}、緊急度 ${urgency}、労力 ${effort} を基に優先度を算出しています。`);
  return parts.join(' ');
};

export const analyzeIssueRuleBased = (issue) => {
  const { fields = {} } = issue;
  const summary = fields.summary || '';
  const description = adfToText(fields.description);
  const labels = fields.labels || [];
  const votes = toNumber(fields.votes?.votes ?? fields.votes) || 0;
  const comments = (fields.comment?.comments || []).map((comment) => ({
    author: comment.author?.displayName,
    body: extractCommentBody(comment),
    created: comment.created,
  }));
  const commentCount = comments.length;

  const now = Date.now();
  const updatedAt = fields.updated ? Date.parse(fields.updated) : undefined;
  const daysSinceUpdate = updatedAt ? Math.max((now - updatedAt) / (1000 * 60 * 60 * 24), 0.1) : 90;

  const existingImpact = toNumber(fields.customfield_impact ?? fields.Impact);
  const existingEffort = toNumber(fields.customfield_effort ?? fields.Effort);
  const existingConfidence = toNumber(fields.customfield_confidence ?? fields.Confidence);

  const theme = determineTheme(labels, summary, description);

  let impact = existingImpact;
  if (impact === undefined) {
    const voteComponent = Math.log2(votes + 2) * 2;
    const commentBoost = Math.min(commentCount * 0.6, 3);
    const themeBoost = theme === '安定性' ? 2 : theme === 'ビジネス成長' ? 1.5 : 1;
    impact = clamp(Math.round(3 + voteComponent + commentBoost + themeBoost), 1, 10);
  } else {
    impact = clamp(Number(impact), 1, 10);
  }

  let effort = existingEffort;
  if (effort === undefined) {
    const base = description.length < 200 ? 3 : description.length < 800 ? 5 : 7;
    const complexityBoost = theme === '安定性' ? -1 : theme === 'パフォーマンス' ? 1 : 0;
    effort = clamp(base + complexityBoost, 1, 10);
  } else {
    effort = clamp(Number(effort), 1, 10);
  }

  let urgencyBase = 5;
  if (daysSinceUpdate <= 3) urgencyBase += 2;
  if (daysSinceUpdate >= 30) urgencyBase -= 1;
  urgencyBase += Math.min(commentCount, 5) * 0.6;
  if (theme === '安定性') urgencyBase += 1.5;
  const urgency = clamp(Math.round(urgencyBase), 1, 10);

  const priority = Number(((impact * urgency) / Math.max(effort, 1)).toFixed(2));

  let confidence;
  if (existingConfidence !== undefined) {
    confidence = clamp(Number(existingConfidence) / (Number(existingConfidence) > 1 ? 10 : 1), 0, 1);
  } else {
    const base = 0.6 + Math.min(commentCount * 0.03, 0.15) + Math.min(votes * 0.01, 0.1);
    const stalenessPenalty = Math.min(daysSinceUpdate / 120, 0.25);
    confidence = clamp(Number((base - stalenessPenalty).toFixed(2)), 0.4, 0.9);
  }

  const suggestedAction = buildSuggestedAction(fields.status?.name, theme, urgency);

  const analysisNote = buildAnalysisNote({
    votes,
    commentCount,
    theme,
    daysSinceUpdate,
    impact,
    effort,
    urgency,
  });

  return {
    ai_impact_score: impact,
    ai_effort_score: effort,
    ai_urgency_score: urgency,
    ai_priority_rank: priority,
    ai_theme_category: theme,
    ai_confidence_level: Number(confidence.toFixed(2)),
    ai_suggested_next_action: suggestedAction,
    ai_analysis_note: analysisNote,
  };
};

export default analyzeIssueRuleBased;
