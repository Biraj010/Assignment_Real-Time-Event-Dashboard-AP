import { describe, expect, it } from 'vitest';
import { buildPagination, getOffset } from '../../src/utils/pagination.js';

describe('getOffset', () => {
  it.each([
    [1, 20, 0],
    [2, 20, 20],
    [3, 10, 20],
    [5, 1, 4],
    [10, 100, 900],
  ])('page %i with limit %i starts at offset %i', (page, limit, expected) => {
    expect(getOffset(page, limit)).toBe(expected);
  });
});

describe('buildPagination', () => {
  it('reports 0 total pages when there are no results', () => {
    expect(buildPagination(1, 20, 0)).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it.each([
    [1, 1],
    [19, 1],
    [20, 1],
    [21, 2],
    [40, 2],
    [41, 3],
    [1000, 50],
  ])('total %i at limit 20 gives %i pages', (total, totalPages) => {
    expect(buildPagination(1, 20, total).totalPages).toBe(totalPages);
  });

  it('echoes page and limit even beyond the last page', () => {
    expect(buildPagination(9, 3, 7)).toEqual({ page: 9, limit: 3, total: 7, totalPages: 3 });
  });

  it('handles a limit of 1', () => {
    expect(buildPagination(1, 1, 5).totalPages).toBe(5);
  });
});
