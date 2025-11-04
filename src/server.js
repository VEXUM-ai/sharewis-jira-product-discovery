import express from 'express';
import config from './config.js';
import analyzeTicketsHandler from './routes/analyzeTickets.js';
import updateFieldsHandler from './routes/updateFields.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/analyze_tickets', analyzeTicketsHandler);
app.post('/update_fields', updateFieldsHandler);

app.use((err, req, res, next) => {
  const status = err.response?.status || 500;
  const raw = err.response?.data || err.message || 'Internal Server Error';
  const errorMessage = typeof raw === 'string' ? raw : JSON.stringify(raw);
  console.error('Error processing request:', errorMessage);
  res.status(status).json({ error: errorMessage });
});

app.listen(config.port, () => {
  console.log(`jira-ai-field-auto server listening on port ${config.port}`);
});
