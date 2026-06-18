import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FeedFetchProgress } from '@glean/ui'

describe('FeedFetchProgress queue sections', () => {
  it('renders grouped queue sections inside a fixed-height scroll area', () => {
    render(
      <FeedFetchProgress
        title="Current run"
        statusLabel="Queued"
        stageLabel="Queue wait"
        progressPercent={0}
        queueTitle="Queue activity"
        queueSections={[
          {
            key: 'running',
            title: 'Running (1)',
            items: [
              {
                id: 'run-1',
                title: 'Running feed',
                statusLabel: 'Refreshing',
                statusTone: 'info',
                stageLabel: 'Fetch feed XML',
                metaLabel: 'ETA finish: 4/4/2026, 4:01:30 PM',
              },
            ],
          },
          {
            key: 'queued',
            title: 'Queued (2)',
            items: [
              {
                id: 'run-2',
                title: 'Queued feed one',
                statusLabel: 'Queued',
                statusTone: 'secondary',
                stageLabel: 'Queue wait',
                metaLabel: 'ETA finish: 4/4/2026, 4:06:00 PM',
              },
              {
                id: 'run-3',
                title: 'Queued feed two',
                statusLabel: 'Queued',
                statusTone: 'secondary',
                stageLabel: 'Queue wait',
                metaLabel: 'ETA finish: 4/4/2026, 4:07:00 PM',
              },
            ],
          },
        ]}
      />
    )

    expect(screen.getByText('Queue activity')).toBeTruthy()
    expect(screen.getByText('Running (1)')).toBeTruthy()
    expect(screen.getByText('Queued (2)')).toBeTruthy()
    expect(screen.getByTestId('feed-fetch-queue-scroll').className).toContain('max-h-72')
    expect(screen.getByTestId('feed-fetch-queue-scroll').className).toContain('overflow-y-auto')
  })
})
