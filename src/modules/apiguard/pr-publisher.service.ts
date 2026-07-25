import { Injectable } from '@nitrostack/core';
import type { Assessment } from '../../domain/types.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class PrPublisherService {
  async publish(assessment: Assessment, prUrl: string, idempotencyKey: string) {
    // In a real implementation, we would use GitHub API to post a comment
    // using the idempotencyKey to update an existing comment if it exists.
    
    const summary = `
## APIGuard Release Assessment: ${assessment.overallSeverity}
**Status:** ${assessment.analysisStatus}
**Decision:** ${assessment.decisionStatus}

### Semantic Changes
- Total: ${assessment.changes.length}

### Consumer Impact
- Confirmed Impact: ${assessment.evidence.filter(e => e.classification === 'CONFIRMED_IMPACT').length}
- Potential Impact: ${assessment.evidence.filter(e => e.classification === 'LIKELY_IMPACT').length}
    `;

    return {
      publishedId: `pub_${randomUUID().slice(0, 8)}`,
      prUrl,
      idempotencyKey,
      publishedAt: new Date().toISOString(),
      summary
    };
  }
}
