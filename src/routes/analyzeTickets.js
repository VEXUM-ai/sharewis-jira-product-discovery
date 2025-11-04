import pLimit from 'p-limit';
import { fetchAllIssues } from '../services/jiraClient.js';
import { analyzeIssue } from '../services/aiAnalyzer.js';
import config from '../config.js';

const normalizeSummary = (issue) => issue.fields?.summary || '';

export const analyzeTicketsHandler = async (req, res, next) => {
  try {
    const { project_key: projectKey, status_filter: statusFilter, limit } = req.body || {};

    if (!projectKey) {
      return res.status(400).json({ error: 'project_key is required' });
    }

    const status = statusFilter || config.analysis.defaultStatus;
    const issues = await fetchAllIssues({ projectKey, statusFilter: status });

    const normalizedLimit =
      limit && limit !== 'unlimited' ? Math.max(0, Number(limit)) : null;
    const issuesToAnalyze =
      typeof normalizedLimit === 'number' && Number.isFinite(normalizedLimit) && normalizedLimit > 0
        ? issues.slice(0, normalizedLimit)
        : issues;

    const concurrency = Math.max(1, Number(config.analysis.concurrency) || 1);
    const limiter = pLimit(concurrency);

    const analyzed = await Promise.all(
      issuesToAnalyze.map((issue) => limiter(async () => {
        try {
          const aiFields = await analyzeIssue(issue);
          return {
            id: issue.key,
            summary: normalizeSummary(issue),
            ai_fields: {
              ...aiFields,
              ai_last_evaluated_at: new Date().toISOString(),
            },
          };
        } catch (error) {
          return {
            id: issue.key,
            summary: normalizeSummary(issue),
            error: error.message,
          };
        }
      }))
    );

    const successful = analyzed.filter((issue) => !issue.error);
    const response = {
      project_key: projectKey,
      total_issues: issues.length,
      analyzed_count: successful.length,
      limit,
      issues: analyzed,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export default analyzeTicketsHandler;
