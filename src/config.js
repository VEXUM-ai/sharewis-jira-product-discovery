import dotenv from 'dotenv';

dotenv.config();

const getEnv = (name, fallback = undefined) => {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value;
};

export const config = {
  port: Number(getEnv('PORT', 3000)),
  jira: {
    baseUrl: getEnv('JIRA_BASE_URL'),
    email: getEnv('JIRA_EMAIL'),
    apiToken: getEnv('JIRA_API_TOKEN'),
  },
  openai: {
    apiKey: getEnv('OPENAI_API_KEY'),
    model: getEnv('OPENAI_MODEL', 'gpt-4.1-mini'),
  },
  analysis: {
    concurrency: Number(getEnv('ANALYSIS_CONCURRENCY', 5)),
    defaultStatus: getEnv('DEFAULT_STATUS_FILTER', '未着手'),
    engine: getEnv('AI_ENGINE', 'rule'),
  }
};

export const validateJiraConfig = () => {
  const missing = [];
  if (!config.jira.baseUrl) missing.push('JIRA_BASE_URL');
  if (!config.jira.email) missing.push('JIRA_EMAIL');
  if (!config.jira.apiToken) missing.push('JIRA_API_TOKEN');

  if (missing.length > 0) {
    throw new Error(`Missing required Jira environment variables: ${missing.join(', ')}`);
  }
};

export const isOpenAIEnabled = () => {
  return (config.analysis.engine || '').toLowerCase() === 'openai';
};

export const validateOpenAIConfig = () => {
  if (!isOpenAIEnabled()) return;
  if (!config.openai.apiKey) {
    throw new Error('Missing required environment variable: OPENAI_API_KEY');
  }
};

export const validateConfig = () => {
  validateJiraConfig();
  validateOpenAIConfig();
};

export default config;
