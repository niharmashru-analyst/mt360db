import React, { useEffect, useMemo, useState } from 'react';

// columns: [{ key, label, format?, align?, defaultVisible?: boolean }]
// Sort cycle: Ascending -> Descending -> Normal.
export default function DataTable({
  columns = [], rows = [], defaultSortKey, defaultSortDesc = true,
  pageSize = 15, onRowClick, rowClassName, compact = false,
}) {
  const [sortKey, setSortKey] = useState(defaultSortKey || columns[0]?.key);
  const [sortState, setSortState] = useState(defaultSortKey ? (defaultSortDesc ? 2 : 1) : 0);
  const [page, setPage] = useState(0);
  const [showColumns, setShowColumns] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(() => new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key)));
  const [orderedKeys, setOrderedKeys] = useState(() => columns.map(c => c.key));

  useEffect(() => {
    setVisibleKeys(new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key)));
    setOrderedKeys(columns.map(c => c.key));
    setSortKey(defaultSortKey || columns[0]?.key);
    setSortState(defaultSortKey ? (defaultSortDesc ? 2 : 1) : 0);
    setPage(0);
  }, [columns.map(c => c.key).join('|'), defaultSortKey, defaultSortDesc]);

  const columnMap = useMemo(() => Object.fromEntries(columns.map(c => [c.key, c])), [columns]);
  const activeColumns = orderedKeys.map(k => columnMap[k]).filter(Boolean).filter(c => visibleKeys.has(c.key));

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortState === 0 || !sortKey) return copy;
    copy.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const an = Number(av), bn = Number(bv);
      let cmp;
      if (Number.isFinite(an) && Number.isFinite(bn) && typeof av !== 'boolean' && typeof bv !== 'boolean') cmp = an - bn;
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortState === 2 ? -cmp : cmp;
    });
    return copy;
  }, [rows, sortKey, sortState]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function handleSort(key) {
    if (key !== sortKey) {
      setSortKey(key);
      setSortState(1);
    } else {
      setSortState(s => s === 0 ? 1 : s === 1 ? 2 : 0);
    }
    setPage(0);
  }

  function toggleColumn(key) {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return next;
        next.delete(key);
      } else next.add(key);
      return next;
    });
  }

  function moveColumn(key, direction) {
    setOrderedKeys(prev => {
      const next = [...prev];
      const i = next.indexOf(key), j = i + direction;
      if (i < 0 || j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  if (rows.length === 0) return <div className="empty-state">No rows match the current filters.</div>;

  return (
    <div className={`data-table-wrap ${compact ? 'data-table-compact' : ''}`}>
      <div className="data-table-toolbar">
        <span className="table-result-count">{rows.length.toLocaleString('en-IN')} rows</span>
        <button type="button" className="table-columns-btn" onClick={() => setShowColumns(v => !v)}>⚙ Columns</button>
        {showColumns && (
          <div className="table-columns-menu">
            <div className="table-columns-title">Visible & order</div>
            {orderedKeys.map((key, i) => {
              const col = columnMap[key];
              if (!col) return null;
              return (
                <div className="table-column-item" key={key}>
                  <label><input type="checkbox" checked={visibleKeys.has(key)} onChange={() => toggleColumn(key)} /> {col.label}</label>
                  <span>
                    <button type="button" disabled={i === 0} onClick={() => moveColumn(key, -1)}>←</button>
                    <button type="button" disabled={i === orderedKeys.length - 1} onClick={() => moveColumn(key, 1)}>→</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="data-table-scroll">
        <table className="data-table">
          <thead><tr>
            {activeColumns.map(col => (
              <th key={col.key} onClick={() => handleSort(col.key)} className={col.align === 'right' ? 'align-right' : ''}>
                {col.label}{sortKey === col.key && <span className="sort-state">{sortState === 1 ? ' ↑' : sortState === 2 ? ' ↓' : ' ↕'}</span>}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={row.key || row.id || i} className={`${onRowClick ? 'data-row-clickable ' : ''}${rowClassName ? rowClassName(row) : ''}`} onClick={() => onRowClick?.(row)}>
                {activeColumns.map(col => (
                  <td key={col.key} className={col.align === 'right' ? 'align-right' : ''}>{col.format ? col.format(row[col.key], row) : row[col.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <div className="table-pagination">
        <button disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Prev</button>
        <span>Page {safePage + 1} of {totalPages}</span>
        <button disabled={safePage >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>Next →</button>
      </div>}
    </div>
  );
}
