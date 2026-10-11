// Mandate engine: a scoped, expiring spending permission with an agreed checklist.
import crypto from 'node:crypto';

export const round2 = (n) => Math.round(n * 100) / 100;

export function buildMandate(input) {
  const errors = [];
  const total = Number(input.cap);
  if (!input.task || typeof input.task !== 'string') errors.push('task is required');
  if (!(total > 0)) errors.push('cap must be a positive number');
  if (!Array.isArray(input.checklist) || input.checklist.length === 0) errors.push('checklist needs at least one item');

  const checklist = (input.checklist || []).map((c, i) => ({
    id: c.id || `c${i + 1}`,
    text: String(c.text || '').trim(),
    weight: Number(c.weight) > 0 ? Number(c.weight) : 1,
  }));
  if (checklist.some((c) => !c.text)) errors.push('every checklist item needs text');

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + 7 * 864e5);
  if (isNaN(expiresAt) || expiresAt <= new Date()) errors.push('expiresAt must be a future date');
  if (errors.length) return { errors };

  return {
    mandate: {
      id: crypto.randomUUID(),
      task: input.task,
      category: input.category || 'general',
      currency: (input.currency || 'USD').toUpperCase(),
      total: round2(total),
      released: 0,
      checklist,
      sellerEmail: input.sellerEmail || null,
      agreedByBuyer: true,
      agreedBySeller: !!input.agreedBySeller,
      expiresAt: expiresAt.toISOString(),
      status: 'CREATED', // CREATED -> FUNDED -> PARTIAL -> RELEASED | CLOSED
      orderId: null,
      authorizationId: null,
      history: [],
      createdAt: new Date().toISOString(),
    },
  };
}

/** Score is computed in code from per-item pass/fail, never taken from the LLM. */
export function scoreFromItems(checklist, itemResults) {
  const passed = new Map(itemResults.map((r) => [r.id, !!r.passed]));
  const totalWeight = checklist.reduce((s, c) => s + c.weight, 0);
  const gained = checklist.reduce((s, c) => s + (passed.get(c.id) ? c.weight : 0), 0);
  return totalWeight === 0 ? 0 : gained / totalWeight;
}

export function isExpired(m) {
  return new Date(m.expiresAt) <= new Date();
}
