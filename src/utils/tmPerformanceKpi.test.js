import { describe, expect, test } from 'vitest';
import {
  aggregateYesterdayPerformance,
  performanceDisplayName,
} from './tmPerformanceKpi';

describe('performanceDisplayName', () => {
  test('uses nested profiles when present', () => {
    expect(
      performanceDisplayName({
        profiles: { first_name: 'Alex', last_name: 'Glover' },
      })
    ).toBe('Alex Glover');
  });

  test('falls back to flat name fields', () => {
    expect(performanceDisplayName({ first_name: 'Sam', last_name: '' })).toBe('Sam');
  });

  test('returns Unknown when empty', () => {
    expect(performanceDisplayName({})).toBe('Unknown');
    expect(performanceDisplayName(null)).toBe('Unknown');
  });
});

describe('aggregateYesterdayPerformance', () => {
  test('returns empty result when no records', () => {
    expect(aggregateYesterdayPerformance([])).toEqual({
      totalMoves: 0,
      best: null,
      worst: null,
      hasData: false,
    });
    expect(aggregateYesterdayPerformance(null)).toEqual({
      totalMoves: 0,
      best: null,
      worst: null,
      hasData: false,
    });
  });

  test('sums moves and picks best and worst', () => {
    const result = aggregateYesterdayPerformance([
      {
        user_id: 'a',
        number_of_moves: 40,
        profiles: { first_name: 'Ann', last_name: 'Best' },
      },
      {
        user_id: 'b',
        number_of_moves: 12,
        profiles: { first_name: 'Bob', last_name: 'Low' },
      },
      {
        user_id: 'c',
        number_of_moves: 25,
        profiles: { first_name: 'Cat', last_name: 'Mid' },
      },
    ]);

    expect(result.hasData).toBe(true);
    expect(result.totalMoves).toBe(77);
    expect(result.best).toEqual({ userId: 'a', name: 'Ann Best', moves: 40 });
    expect(result.worst).toEqual({ userId: 'b', name: 'Bob Low', moves: 12 });
  });

  test('sums multiple rows for the same user', () => {
    const result = aggregateYesterdayPerformance([
      {
        user_id: 'a',
        number_of_moves: 10,
        profiles: { first_name: 'Ann', last_name: 'Best' },
      },
      {
        user_id: 'a',
        number_of_moves: 15,
        profiles: { first_name: 'Ann', last_name: 'Best' },
      },
      {
        user_id: 'b',
        number_of_moves: 8,
        profiles: { first_name: 'Bob', last_name: 'Low' },
      },
    ]);

    expect(result.totalMoves).toBe(33);
    expect(result.best).toEqual({ userId: 'a', name: 'Ann Best', moves: 25 });
    expect(result.worst).toEqual({ userId: 'b', name: 'Bob Low', moves: 8 });
  });

  test('skips rows without user_id', () => {
    const result = aggregateYesterdayPerformance([
      { user_id: null, number_of_moves: 99 },
      {
        user_id: 'a',
        number_of_moves: 5,
        profiles: { first_name: 'Ann', last_name: 'A' },
      },
    ]);
    expect(result.totalMoves).toBe(5);
    expect(result.best.userId).toBe('a');
    expect(result.worst.userId).toBe('a');
  });

  test('treats missing number_of_moves as zero', () => {
    const result = aggregateYesterdayPerformance([
      {
        user_id: 'a',
        number_of_moves: null,
        profiles: { first_name: 'Ann', last_name: 'A' },
      },
      {
        user_id: 'b',
        number_of_moves: 3,
        profiles: { first_name: 'Bob', last_name: 'B' },
      },
    ]);
    expect(result.totalMoves).toBe(3);
    expect(result.worst.moves).toBe(0);
    expect(result.best.moves).toBe(3);
  });
});
