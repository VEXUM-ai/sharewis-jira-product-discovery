import pLimit from 'p-limit';
import { updateIssueFields } from '../services/jiraClient.js';
import config from '../config.js';

const sanitizeFields = (fields = {}) => Object.fromEntries(
  Object.entries(fields)
    .filter(([key]) => key.startsWith('ai_'))
    .filter(([, value]) => value !== undefined)
);

export const updateFieldsHandler = async (req, res, next) => {
  try {
    const { issue_id: issueId, fields, batch = false, dry_run: dryRun = false, issues } = req.body || {};

    if (batch) {
      if (!Array.isArray(issues)) {
        return res.status(400).json({ error: 'issues array is required when batch=true' });
      }

      const concurrency = Math.max(1, Number(config.analysis.concurrency) || 1);
      const limiter = pLimit(concurrency);
      const results = await Promise.all(issues.map((item) => limiter(async () => {
        if (!item.issue_id) {
          return { issue_id: item.issue_id, error: 'issue_id is required' };
        }

        const sanitized = sanitizeFields(item.fields);
        if (!sanitized || Object.keys(sanitized).length === 0) {
          return { issue_id: item.issue_id, skipped: true };
        }
        if (!dryRun) {
          await updateIssueFields({ issueId: item.issue_id, fields: sanitized });
        }
        return {
          issue_id: item.issue_id,
          fields_updated: Object.keys(sanitized),
          skipped: false,
        };
      })));

      const updatedCount = results.filter((r) => !r.skipped && !r.error).length;
      return res.json({
        updated_count: updatedCount,
        skipped_existing_values: 0,
        status: 'success',
        dry_run: dryRun,
        logs: results,
      });
    }

    if (!issueId) {
      return res.status(400).json({ error: 'issue_id is required' });
    }

    const sanitizedFields = sanitizeFields(fields);
    if (Object.keys(sanitizedFields).length === 0) {
      return res.status(400).json({ error: 'No ai_ fields provided for update' });
    }

    if (!dryRun) {
      await updateIssueFields({ issueId: issueId, fields: sanitizedFields });
    }

    res.json({
      updated_count: dryRun ? 0 : 1,
      skipped_existing_values: 0,
      status: 'success',
      dry_run: dryRun,
      logs: [
        {
          issue_id: issueId,
          fields_updated: Object.keys(sanitizedFields),
        },
      ],
    });
  } catch (error) {
    next(error);
  }
};

export default updateFieldsHandler;
