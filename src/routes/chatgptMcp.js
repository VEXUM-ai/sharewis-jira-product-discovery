import { fetchAllIssues, updateIssueFields } from '../services/jiraClient.js';
import { analyzeIssue } from '../services/aiAnalyzer.js';
import config from '../config.js';
import pLimit from 'p-limit';

/**
 * ChatGPT Custom MCP Server Endpoints
 * Implements MCP protocol over HTTP for ChatGPT integration
 */

/**
 * Handle MCP initialize request
 */
function handleInitialize() {
  return {
    jsonrpc: '2.0',
    result: {
      protocolVersion: '2024-11-05',
      serverInfo: {
        name: 'jira-ai-field-auto',
        version: '1.1.0',
      },
      capabilities: {
        tools: {},
      },
    },
  };
}

/**
 * Handle MCP tools/list request
 */
function handleToolsList() {
  return {
    jsonrpc: '2.0',
    result: {
      tools: [
        {
          name: 'analyze_jira_tickets',
          description: 'Jira Product Discoveryプロジェクトの全チケットをルールベースロジックで分析し、AIフィールド（インパクト、工数、緊急度、優先順位、カテゴリなど）を生成します',
          inputSchema: {
            type: 'object',
            properties: {
              project_key: {
                type: 'string',
                description: 'Jiraプロジェクトキー（例: WD）',
              },
              status_filter: {
                type: 'string',
                description: 'ステータスフィルター（省略可、デフォルト: 未着手）',
              },
              limit: {
                type: 'string',
                description: '分析するチケット数の上限（"unlimited"で全件、省略可）',
                default: 'unlimited',
              },
            },
            required: ['project_key'],
          },
        },
        {
          name: 'update_jira_field',
          description: '単一のJiraチケットにai_接頭辞付きフィールドを更新します',
          inputSchema: {
            type: 'object',
            properties: {
              issue_id: {
                type: 'string',
                description: 'JiraチケットID（例: WD-101）',
              },
              fields: {
                type: 'object',
                description: 'ai_接頭辞付きフィールドとその値のオブジェクト',
              },
              dry_run: {
                type: 'boolean',
                description: 'trueの場合、実際には更新せずプレビューのみ（省略可、デフォルト: false）',
                default: false,
              },
            },
            required: ['issue_id', 'fields'],
          },
        },
        {
          name: 'batch_update_jira_fields',
          description: '複数のJiraチケットにai_接頭辞付きフィールドをバッチ更新します',
          inputSchema: {
            type: 'object',
            properties: {
              issues: {
                type: 'array',
                description: '更新するチケットの配列',
                items: {
                  type: 'object',
                  properties: {
                    issue_id: {
                      type: 'string',
                      description: 'JiraチケットID',
                    },
                    fields: {
                      type: 'object',
                      description: 'ai_接頭辞付きフィールド',
                    },
                  },
                  required: ['issue_id', 'fields'],
                },
              },
              dry_run: {
                type: 'boolean',
                description: 'trueの場合、実際には更新せずプレビューのみ',
                default: false,
              },
            },
            required: ['issues'],
          },
        },
      ],
    },
  };
}

/**
 * Handle MCP tools/call request
 */
async function handleToolCall(params) {
  const { name, arguments: args } = params;

  try {
    switch (name) {
      case 'analyze_jira_tickets': {
        const { project_key, status_filter, limit } = args;

        if (!project_key) {
          throw new Error('project_key is required');
        }

        const status = status_filter || config.analysis.defaultStatus;
        const issues = await fetchAllIssues({ projectKey: project_key, statusFilter: status });

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
                summary: issue.fields?.summary || '',
                ai_fields: {
                  ...aiFields,
                  ai_last_evaluated_at: new Date().toISOString(),
                },
              };
            } catch (error) {
              return {
                id: issue.key,
                summary: issue.fields?.summary || '',
                error: error.message,
              };
            }
          }))
        );

        const successful = analyzed.filter((issue) => !issue.error);

        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  project_key,
                  total_issues: issues.length,
                  analyzed_count: successful.length,
                  limit,
                  issues: analyzed,
                }, null, 2),
              },
            ],
          },
        };
      }

      case 'update_jira_field': {
        const { issue_id, fields, dry_run = false } = args;

        if (!issue_id) {
          throw new Error('issue_id is required');
        }
        if (!fields || Object.keys(fields).length === 0) {
          throw new Error('fields is required');
        }

        const sanitized = Object.fromEntries(
          Object.entries(fields)
            .filter(([key]) => key.startsWith('ai_'))
            .filter(([, value]) => value !== undefined)
        );

        if (Object.keys(sanitized).length === 0) {
          throw new Error('No ai_ fields provided for update');
        }

        if (!dry_run) {
          await updateIssueFields({ issueId: issue_id, fields: sanitized });
        }

        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  updated_count: dry_run ? 0 : 1,
                  status: 'success',
                  dry_run,
                  issue_id,
                  fields_updated: Object.keys(sanitized),
                }, null, 2),
              },
            ],
          },
        };
      }

      case 'batch_update_jira_fields': {
        const { issues, dry_run = false } = args;

        if (!Array.isArray(issues)) {
          throw new Error('issues array is required');
        }

        const concurrency = Math.max(1, Number(config.analysis.concurrency) || 1);
        const limiter = pLimit(concurrency);

        const results = await Promise.all(issues.map((item) => limiter(async () => {
          if (!item.issue_id) {
            return { issue_id: item.issue_id, error: 'issue_id is required' };
          }

          const sanitized = Object.fromEntries(
            Object.entries(item.fields || {})
              .filter(([key]) => key.startsWith('ai_'))
              .filter(([, value]) => value !== undefined)
          );

          if (Object.keys(sanitized).length === 0) {
            return { issue_id: item.issue_id, skipped: true };
          }

          if (!dry_run) {
            try {
              await updateIssueFields({ issueId: item.issue_id, fields: sanitized });
            } catch (error) {
              return { issue_id: item.issue_id, error: error.message };
            }
          }

          return {
            issue_id: item.issue_id,
            fields_updated: Object.keys(sanitized),
            skipped: false,
          };
        })));

        const updatedCount = results.filter((r) => !r.skipped && !r.error).length;

        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  updated_count: updatedCount,
                  status: 'success',
                  dry_run,
                  logs: results,
                }, null, 2),
              },
            ],
          },
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: error.message,
      },
    };
  }
}

/**
 * GET /mcp - Return server info and available tools
 * For ChatGPT to discover the server capabilities
 */
export function handleChatGPTMCPGet(req, res) {
  res.json({
    protocolVersion: '2024-11-05',
    serverInfo: {
      name: 'jira-ai-field-auto',
      version: '1.1.0',
      description: 'Jira Product Discovery AI Field Auto-Population MCP Server',
    },
    capabilities: {
      tools: {},
    },
    tools: [
      {
        name: 'analyze_jira_tickets',
        description: 'Jira Product Discoveryプロジェクトの全チケットをルールベースロジックで分析し、AIフィールド（インパクト、工数、緊急度、優先順位、カテゴリなど）を生成します',
        inputSchema: {
          type: 'object',
          properties: {
            project_key: {
              type: 'string',
              description: 'Jiraプロジェクトキー（例: WD）',
            },
            status_filter: {
              type: 'string',
              description: 'ステータスフィルター（省略可、デフォルト: 未着手）',
            },
            limit: {
              type: 'string',
              description: '分析するチケット数の上限（"unlimited"で全件、省略可）',
              default: 'unlimited',
            },
          },
          required: ['project_key'],
        },
      },
      {
        name: 'update_jira_field',
        description: '単一のJiraチケットにai_接頭辞付きフィールドを更新します',
        inputSchema: {
          type: 'object',
          properties: {
            issue_id: {
              type: 'string',
              description: 'JiraチケットID（例: WD-101）',
            },
            fields: {
              type: 'object',
              description: 'ai_接頭辞付きフィールドとその値のオブジェクト',
            },
            dry_run: {
              type: 'boolean',
              description: 'trueの場合、実際には更新せずプレビューのみ（省略可、デフォルト: false）',
              default: false,
            },
          },
          required: ['issue_id', 'fields'],
        },
      },
      {
        name: 'batch_update_jira_fields',
        description: '複数のJiraチケットにai_接頭辞付きフィールドをバッチ更新します',
        inputSchema: {
          type: 'object',
          properties: {
            issues: {
              type: 'array',
              description: '更新するチケットの配列',
              items: {
                type: 'object',
                properties: {
                  issue_id: {
                    type: 'string',
                    description: 'JiraチケットID',
                  },
                  fields: {
                    type: 'object',
                    description: 'ai_接頭辞付きフィールド',
                  },
                },
                required: ['issue_id', 'fields'],
              },
            },
            dry_run: {
              type: 'boolean',
              description: 'trueの場合、実際には更新せずプレビューのみ',
              default: false,
            },
          },
          required: ['issues'],
        },
      },
    ],
  });
}

/**
 * Main MCP endpoint handler for ChatGPT
 * POST /mcp - Handle JSON-RPC requests and direct tool calls
 */
export async function handleChatGPTMCP(req, res) {
  try {
    const body = req.body;

    // Check if it's a JSON-RPC request
    if (body.jsonrpc === '2.0') {
      const { method, params, id } = body;

      let response;

      switch (method) {
        case 'initialize':
          response = handleInitialize();
          break;

        case 'tools/list':
          response = handleToolsList();
          break;

        case 'tools/call':
          response = await handleToolCall(params);
          break;

        default:
          response = {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }

      // Add request id if provided
      if (id !== undefined) {
        response.id = id;
      }

      res.json(response);
    } else if (body.name && body.arguments) {
      // Direct tool call (non JSON-RPC)
      const result = await handleToolCall(body);
      if (result.error) {
        res.status(500).json(result);
      } else {
        res.json(result.result || result);
      }
    } else {
      res.status(400).json({
        error: 'Invalid request format. Expected JSON-RPC 2.0 or tool call format.',
      });
    }
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message || 'Internal error',
      },
      id: req.body?.id,
    });
  }
}
