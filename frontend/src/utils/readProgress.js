export function calculateReadPercentage(progress) {
  if (!progress || progress.total_count <= 0) {
    return 0;
  }

  return (progress.read_count / progress.total_count) * 100;
}
