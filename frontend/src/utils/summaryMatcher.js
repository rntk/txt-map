const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'that', 'this',
  'these', 'those', 'it', 'its', 'not', 'no', 'so', 'if', 'then',
  'than', 'about', 'also', 'he', 'she', 'they', 'we', 'you', 'i',
  'his', 'her', 'their', 'our', 'your', 'my', 'which', 'who', 'what',
  'when', 'where', 'how', 'all', 'any', 'both', 'each', 'more', 'most',
  'other', 'such', 'up', 'out', 'use', 'used',
]);

const SCORE_THRESHOLD = 0.15;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

export function bagOfWordsScore(query, candidate) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  const querySet = new Set(queryTokens);
  const candidateSet = new Set(tokenize(candidate));
  let intersection = 0;
  for (const token of querySet) {
    if (candidateSet.has(token)) intersection++;
  }
  return intersection / querySet.size;
}

export function matchSummaryToTopics(
  summaryText,
  topics,
  sentencesArray,
  matcherFn = bagOfWordsScore
) {
  const safeSentences = Array.isArray(sentencesArray) ? sentencesArray : [];
  const safeTopics = Array.isArray(topics) ? topics : [];

  // Score each sentence once (1-based index → score)
  const sentenceScores = new Map();
  safeSentences.forEach((sentence, i) => {
    if (typeof sentence !== 'string') return;
    const score = matcherFn(summaryText, sentence);
    if (score >= SCORE_THRESHOLD) {
      sentenceScores.set(i + 1, score);
    }
  });

  const results = [];

  for (const topic of safeTopics) {
    if (!topic?.name || !Array.isArray(topic.sentences) || topic.sentences.length === 0) continue;

    const matchingIndices = [];
    let topScore = 0;

    for (const sentIdx of topic.sentences) {
      const score = sentenceScores.get(sentIdx);
      if (score !== undefined) {
        matchingIndices.push(sentIdx);
        if (score > topScore) topScore = score;
      }
    }

    if (matchingIndices.length > 0) {
      results.push({ topic, score: topScore, sentenceIndices: matchingIndices });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
