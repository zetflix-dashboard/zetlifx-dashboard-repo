// Pure workspace comparison and recovery helpers; no DOM or chart-specific logic.
const key = (widget) => widget.instanceId;

export function summarizeWorkspaceChanges(before, after) {
  const result = {
    spaces: 0,
    added: 0,
    removed: 0,
    moved: 0,
    resized: 0,
    updated: 0,
  };
  const previous = new Map((before?.spaces || []).map((space) => [space.id, space]));
  const current = new Map((after?.spaces || []).map((space) => [space.id, space]));
  for (const id of new Set([...previous.keys(), ...current.keys()])) {
    const oldSpace = previous.get(id);
    const nextSpace = current.get(id);
    if (JSON.stringify(oldSpace) === JSON.stringify(nextSpace)) continue;
    result.spaces++;
    const oldWidgets = new Map((oldSpace?.widgets || []).map((widget) => [key(widget), widget]));
    const nextWidgets = new Map((nextSpace?.widgets || []).map((widget) => [key(widget), widget]));
    for (const widgetId of new Set([...oldWidgets.keys(), ...nextWidgets.keys()])) {
      const oldWidget = oldWidgets.get(widgetId);
      const nextWidget = nextWidgets.get(widgetId);
      if (!oldWidget) {
        result.added++;
      } else if (!nextWidget) {
        result.removed++;
      } else if (oldWidget.type !== nextWidget.type || oldWidget.chartId !== nextWidget.chartId) {
        result.added++;
        result.removed++;
      } else {
        if (oldWidget.x !== nextWidget.x || oldWidget.y !== nextWidget.y) result.moved++;
        if (oldWidget.w !== nextWidget.w || oldWidget.h !== nextWidget.h) result.resized++;
        if (
          oldWidget.title !== nextWidget.title ||
          JSON.stringify(oldWidget.localFilters || {}) !== JSON.stringify(nextWidget.localFilters || {})
        ) result.updated++;
      }
    }
  }
  return result;
}

export function recoverSelectedSpaces(published, oldDraft, selectedIds) {
  const selected = new Set(selectedIds);
  const draftSpaces = new Map(oldDraft.spaces.map((space) => [space.id, space]));
  const spaces = published.spaces.map((space) =>
    selected.has(space.id) && draftSpaces.has(space.id)
      ? structuredClone(draftSpaces.get(space.id))
      : structuredClone(space),
  );
  const existing = new Set(spaces.map((space) => space.id));
  for (const space of oldDraft.spaces) {
    if (selected.has(space.id) && !existing.has(space.id)) {
      spaces.push(structuredClone(space));
      existing.add(space.id);
    }
  }
  return {
    version: published.version,
    activeId: spaces.some((space) => space.id === oldDraft.activeId)
      ? oldDraft.activeId
      : (spaces[0]?.id ?? null),
    spaces,
  };
}
