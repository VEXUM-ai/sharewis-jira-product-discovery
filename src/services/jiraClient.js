import axios from 'axios';
import config, { validateJiraConfig } from '../config.js';

let cachedClient;

const getJiraClient = () => {
  if (cachedClient) return cachedClient;
  validateJiraConfig();

  const baseURL = new URL('/rest/api/3', config.jira.baseUrl).toString();
  const auth = Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString('base64');

  cachedClient = axios.create({
    baseURL,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  return cachedClient;
};

const jiraFields = [
  'summary',
  'description',
  'labels',
  'votes',
  'comment',
  'created',
  'updated',
  'status',
  'Impact',
  'Effort',
  'Confidence',
  'customfield_impact',
  'customfield_effort',
  'customfield_confidence'
].join(',');

export const fetchAllIssues = async ({ projectKey, statusFilter, jql }) => {
  const client = getJiraClient();
  const maxResults = 100;
  let startAt = 0;
  let issues = [];
  let isLast = false;

  const baseJql = jql || [`project=${projectKey}`]
    .concat(statusFilter ? [`status="${statusFilter}"`] : [])
    .join(' AND ');

  while (!isLast) {
    const { data } = await client.get('/search', {
      params: {
        jql: baseJql,
        startAt,
        maxResults,
        fields: jiraFields,
        expand: 'renderedFields,names',
      },
    });

    const batch = data.issues || [];
    issues = issues.concat(batch);
    startAt += batch.length;

    if (typeof data.isLast === 'boolean') {
      isLast = data.isLast;
    } else {
      const total = data.total ?? issues.length;
      isLast = startAt >= total;
    }
  }

  return issues;
};

export const updateIssueFields = async ({ issueId, fields }) => {
  const client = getJiraClient();
  const payload = { fields };
  const endpoint = `/issue/${encodeURIComponent(issueId)}`;
  await client.patch(endpoint, payload);
};

export default getJiraClient;
