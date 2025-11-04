const flattenContent = (content = []) => {
  return content
    .map((node) => {
      if (!node) return '';
      if (typeof node.text === 'string') {
        return node.text;
      }
      if (Array.isArray(node.content)) {
        return flattenContent(node.content);
      }
      return '';
    })
    .join(' ')
    .trim();
};

export const adfToText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.type === 'doc' && Array.isArray(value.content)) {
    return value.content
      .map((node) => {
        if (node.type === 'paragraph') {
          return flattenContent(node.content);
        }
        return flattenContent(node.content);
      })
      .join('\n')
      .trim();
  }
  return '';
};

export const extractCommentBody = (comment) => {
  if (!comment) return '';
  if (typeof comment.body === 'string') return comment.body;
  if (comment.body?.content) {
    return adfToText(comment.body);
  }
  return '';
};

export default {
  adfToText,
  extractCommentBody,
};
