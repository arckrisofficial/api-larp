import { Injectable } from '@nitrostack/core';
import type { Assessment } from '../../domain/types.js';

@Injectable()
export class AssessmentRepository {
  private readonly assessments = new Map<string, Assessment>();
  create(assessment: Assessment): Assessment { this.assessments.set(assessment.id, structuredClone(assessment)); return structuredClone(assessment); }
  get(id: string): Assessment | undefined { const value = this.assessments.get(id); return value ? structuredClone(value) : undefined; }
  update(assessment: Assessment): Assessment { if (!this.assessments.has(assessment.id)) throw new Error(`Assessment ${assessment.id} does not exist.`); this.assessments.set(assessment.id, structuredClone(assessment)); return structuredClone(assessment); }
}
