export function getSegmentIndices(segment) {
  const indices = Array.isArray(segment?.position_indices)
    ? segment.position_indices
    : Array.isArray(segment?.sentence_indices)
      ? segment.sentence_indices
      : [];

  return [...indices].sort((a, b) => a - b);
}

export function getNestedIndices(value, positionKey, sentenceKey) {
  const indices = Array.isArray(value?.[positionKey])
    ? value[positionKey]
    : Array.isArray(value?.[sentenceKey])
      ? value[sentenceKey]
      : [];

  return [...indices].sort((a, b) => a - b);
}

export function getItemIndex(item) {
  if (!item) return null;
  if (item.position_index != null) return item.position_index;
  if (item.sentence_index != null) return item.sentence_index;
  return null;
}

export function getTextByIndex(units, index) {
  if (!Array.isArray(units) || index == null || index < 1) return '';
  return units[index - 1] || '';
}
