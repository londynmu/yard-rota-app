/**
 * Helpers for PreCheck items that have multiple open defects on one check point.
 */

/**
 * Whether a multi-defect check item is ready to submit.
 * Every existing defect must be answered (same problem or Fixed?).
 * A new defect is optional; if started (repair_needed), it needs a description.
 */
export function isMultiDefectItemReady(itemKey, checkItems, defects, markedResolvedDamageIds = []) {
  if (!defects || defects.length < 2) return false;

  const allDefectsHandled = defects.every((d) => {
    const sk = `${itemKey}::${d.id}`;
    const ci = checkItems[sk];
    if (ci?.status === 'repair_needed' && ci?.linkedDamageId) return true;
    return markedResolvedDamageIds.includes(d.id);
  });
  if (!allDefectsHandled) return false;

  const newKey = `${itemKey}::new`;
  const newCi = checkItems[newKey];
  if (newCi?.status === 'repair_needed') {
    return Boolean(newCi.notes?.trim());
  }
  return true;
}

/**
 * Collect same-problem damage ids and optional new defect from item form state.
 * Used when building the submit payload for multi-defect items.
 */
export function collectMultiDefectActions(itemKey, checkItems, defects) {
  const sameProblemDamageIds = [];
  for (const d of defects || []) {
    const sk = `${itemKey}::${d.id}`;
    const ci = checkItems[sk];
    if (ci?.status === 'repair_needed' && ci?.linkedDamageId) {
      sameProblemDamageIds.push(ci.linkedDamageId);
    }
  }

  const newKey = `${itemKey}::new`;
  const newCi = checkItems[newKey];
  const newDefect =
    newCi?.status === 'repair_needed'
      ? {
          notes: newCi.notes || '',
          images: newCi.images || [],
        }
      : null;

  return { sameProblemDamageIds, newDefect };
}

/**
 * Normalize payload item into confirmation ids + optional new defect payload.
 * Supports legacy single linkedDamageId / notes / images fields.
 */
export function normalizeItemDamageActions(item) {
  const fromList = Array.isArray(item.sameProblemDamageIds)
    ? item.sameProblemDamageIds.filter(Boolean)
    : [];
  const sameProblemDamageIds =
    fromList.length > 0
      ? fromList
      : item.linkedDamageId
        ? [item.linkedDamageId]
        : [];

  if (item.newDefect && (item.newDefect.notes?.trim() || (item.newDefect.images || []).length > 0)) {
    return { sameProblemDamageIds, newDefect: item.newDefect };
  }

  if (
    sameProblemDamageIds.length === 0 &&
    (item.notes?.trim() || (item.images || []).length > 0)
  ) {
    return {
      sameProblemDamageIds,
      newDefect: { notes: item.notes || '', images: item.images || [] },
    };
  }

  return { sameProblemDamageIds, newDefect: null };
}
