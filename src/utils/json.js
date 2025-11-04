export const extractJson = (text) => {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Unable to locate JSON object in AI response.');
  }

  const json = trimmed.slice(start, end + 1);
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`Failed to parse AI response as JSON: ${error.message}`);
  }
};

export default extractJson;
