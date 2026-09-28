import type { Pagination } from '../types/event.js';

export function getOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function buildPagination(page: number, limit: number, total: number): Pagination {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
