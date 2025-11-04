import OpenAI from 'openai';
import config, { validateOpenAIConfig } from '../config.js';
import fieldMapping from '../../config/field-mapping.json' assert { type: 'json' };
import { extractJson } from '../utils/json.js';
import { adfToText, extractCommentBody } from '../utils/jira.js';

let cachedClient;

const getClient = () => {
  if (cachedClient) return cachedClient;
  validateOpenAIConfig();
  cachedClient = new OpenAI({ apiKey: config.openai.apiKey });
  return cachedClient;
};

const buildPrompt = (issue) => {
  const { key, fields } = issue;

  const existing = {
    impact: fields?.customfield_impact ?? fields?.Impact,
    effort: fields?.customfield_effort ?? fields?.Effort,
    confidence: fields?.customfield_confidence ?? fields?.Confidence,
  };

  const description = adfToText(fields?.description);

  const comments = (fields?.comment?.comments || []).map((comment) => ({
    author: comment.author?.displayName,
    body: extractCommentBody(comment),
    created: comment.created,
  }));

  const context = {
    summary: fields?.summary ?? '',
    description,
    labels: fields?.labels ?? [],
    votes: fields?.votes?.votes ?? 0,
    comments,
    status: fields?.status?.name ?? '',
    created: fields?.created,
    updated: fields?.updated,
    existing,
  };

  const fieldList = Object.keys(fieldMapping.ai_fields).join(', ');

  return `You are an AI assistant helping product discovery teams prioritize work. ` +
    `Analyze the following Jira Product Discovery idea and output a JSON object with keys: ${fieldList}.\n\n` +
    `Idea key: ${key}\n` +
    `Summary: ${context.summary}\n` +
    `Description: ${context.description}\n` +
    `Labels: ${context.labels.join(', ')}\n` +
    `Votes: ${context.votes}\n` +
    `Status: ${context.status}\n` +
    `Created: ${context.created}\n` +
    `Updated: ${context.updated}\n` +
    `Existing Impact: ${existing.impact}\n` +
    `Existing Effort: ${existing.effort}\n` +
    `Existing Confidence: ${existing.confidence}\n` +
    `Recent Comments: ${context.comments.map((c) => `${c.author}: ${c.body}`).join('\n')}\n\n` +
    `Only respond with valid JSON.`;
};

export const analyzeIssue = async (issue) => {
  const prompt = buildPrompt(issue);
  const client = getClient();

  const response = await client.responses.create({
    model: config.openai.model,
    input: prompt,
    temperature: 0.2,
  });

  const text = response?.output?.[0]?.content?.[0]?.text ?? response?.output_text;
  if (!text) {
    throw new Error('AI response did not include text output.');
  }

  const parsed = extractJson(text);

  return parsed;
};

export default analyzeIssue;
