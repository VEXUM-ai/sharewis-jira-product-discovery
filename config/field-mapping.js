const fieldMapping = {
  ai_fields: {
    ai_impact_score: 'AI Impact Score',
    ai_effort_score: 'AI Effort Score',
    ai_urgency_score: 'AI Urgency Score',
    ai_priority_rank: 'AI Priority Rank',
    ai_theme_category: 'AI Theme Category',
    ai_confidence_level: 'AI Confidence Level',
    ai_suggested_next_action: 'AI Suggested Next Action',
    ai_analysis_note: 'AI Analysis Note',
    ai_last_evaluated_at: 'AI Last Evaluated At',
  },
  references: {
    impact: ['Impact', 'customfield_impact'],
    effort: ['Effort', 'customfield_effort'],
    confidence: ['Confidence', 'customfield_confidence'],
    status: ['status'],
    updated: ['updated'],
    votes: ['votes'],
    labels: ['labels'],
    summary: ['summary'],
    description: ['description'],
    comments: ['comment'],
  },
};

export default fieldMapping;
