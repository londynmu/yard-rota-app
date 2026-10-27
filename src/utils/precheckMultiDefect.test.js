import { describe, it, expect } from 'vitest';
import {
  isMultiDefectItemReady,
  collectMultiDefectActions,
  normalizeItemDamageActions,
} from './precheckMultiDefect';

describe('precheckMultiDefect', () => {
  const defects = [
    { id: 'damage-1' },
    { id: 'damage-2' },
  ];

  it('requires every existing defect to be answered before ready', () => {
    const checkItems = {
      'tyres::damage-1': { status: 'repair_needed', linkedDamageId: 'damage-1' },
      'tyres::new': { status: 'repair_needed', notes: 'New cut' },
    };
    expect(
      isMultiDefectItemReady('tyres', checkItems, defects, [])
    ).toBe(false);
  });

  it('is ready when both defects answered and optional new has description', () => {
    const checkItems = {
      'tyres::damage-1': { status: 'repair_needed', linkedDamageId: 'damage-1' },
      'tyres::damage-2': { status: 'repair_needed', linkedDamageId: 'damage-2' },
      'tyres::new': { status: 'repair_needed', notes: 'New sidewall damage' },
    };
    expect(
      isMultiDefectItemReady('tyres', checkItems, defects, [])
    ).toBe(true);

    const actions = collectMultiDefectActions('tyres', checkItems, defects);
    expect(actions.sameProblemDamageIds).toEqual(['damage-1', 'damage-2']);
    expect(actions.newDefect?.notes).toBe('New sidewall damage');
  });

  it('is ready when one same-problem and one Fixed? without new defect', () => {
    const checkItems = {
      'tyres::damage-1': { status: 'repair_needed', linkedDamageId: 'damage-1' },
    };
    expect(
      isMultiDefectItemReady('tyres', checkItems, defects, ['damage-2'])
    ).toBe(true);

    const actions = collectMultiDefectActions('tyres', checkItems, defects);
    expect(actions.sameProblemDamageIds).toEqual(['damage-1']);
    expect(actions.newDefect).toBeNull();
  });

  it('rejects new defect without description when existing are handled', () => {
    const checkItems = {
      'tyres::damage-1': { status: 'repair_needed', linkedDamageId: 'damage-1' },
      'tyres::damage-2': { status: 'repair_needed', linkedDamageId: 'damage-2' },
      'tyres::new': { status: 'repair_needed', notes: '   ' },
    };
    expect(
      isMultiDefectItemReady('tyres', checkItems, defects, [])
    ).toBe(false);
  });

  it('normalizes legacy single linkedDamageId and new notes/images', () => {
    expect(
      normalizeItemDamageActions({ linkedDamageId: 'd1' })
    ).toEqual({ sameProblemDamageIds: ['d1'], newDefect: null });

    expect(
      normalizeItemDamageActions({
        sameProblemDamageIds: ['d1', 'd2'],
        newDefect: { notes: 'Extra', images: [] },
      })
    ).toEqual({
      sameProblemDamageIds: ['d1', 'd2'],
      newDefect: { notes: 'Extra', images: [] },
    });

    expect(
      normalizeItemDamageActions({ notes: 'Broken mirror', images: [{ id: '1' }] })
    ).toEqual({
      sameProblemDamageIds: [],
      newDefect: { notes: 'Broken mirror', images: [{ id: '1' }] },
    });
  });
});
