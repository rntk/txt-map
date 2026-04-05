/**
 * Checks if a topic or any of its parent paths are in the readTopics set.
 * Topic names are assumed to use ">" as a separator (e.g., "Category > Subcategory").
 *
 * @param {string | null | undefined} topicName - The full topic name or path to check.
 * @param {Set<string> | string[] | null | undefined} readTopics - The collection of read topic identifiers.
 * @returns {boolean} - True if the topic or any parent is marked as read.
 */
export function isTopicRead(topicName, readTopics) {
  if (!topicName) {
    return false;
  }

  const readTopicsSet =
    readTopics instanceof Set ? readTopics : new Set(readTopics || []);

  if (readTopicsSet.size === 0) {
    return false;
  }

  const parts = topicName.split(">").map((part) => part.trim());
  let currentPath = "";

  for (let i = 0; i < parts.length; i += 1) {
    currentPath = i === 0 ? parts[i] : `${currentPath}>${parts[i]}`;
    if (readTopicsSet.has(currentPath)) {
      return true;
    }
  }

  return false;
}
