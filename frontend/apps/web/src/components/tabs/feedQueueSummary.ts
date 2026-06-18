export function formatFeedQueueSummary(
  runningCount: number,
  queuedCount: number
) {
  return `${runningCount} 个进行中 · ${queuedCount} 个排队中`
}
