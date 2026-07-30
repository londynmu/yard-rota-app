/**
 * PreCheck audit print helpers — HTML documents for browser print / Save as PDF.
 */

const STATUS_LABELS = {
  ok: 'OK',
  repair_needed: 'Repair',
  completed: 'Completed',
  na: 'N/A',
};

const REPAIR_STATUS_LABELS = {
  open: 'Open',
  reported: 'Reported',
  awaiting_parts: 'Awaiting Parts',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatItemName(name) {
  return (name || '').replace(/_/g, ' ');
}

function getItemLabel(itemKey, checkItemLabels = {}) {
  return checkItemLabels[itemKey] ?? formatItemName(itemKey);
}

function formatShunterName(profiles) {
  if (!profiles) return 'Unknown';
  const name = `${profiles.first_name || ''} ${profiles.last_name || ''}`.trim();
  return name || 'Unknown';
}

function formatCheckDate(checkDate) {
  if (!checkDate) return '—';
  return new Date(`${checkDate}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCheckTime(checkTime, createdAt) {
  const value = checkTime || createdAt;
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrintedAt(date = new Date()) {
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getItemDefectDescription(item, sub) {
  if (item.notes?.trim()) return item.notes.trim();
  const damage = (sub.precheck_damages || []).find((d) => d.item_id === item.id);
  return damage?.description?.trim() || '';
}

/**
 * Normalize a submission into a print-ready record.
 * Mirrors PreCheckList fault/item semantics for consistency.
 */
export function normalizeSubmissionForPrint(sub, checkItemLabels = {}) {
  const items = sub.precheck_items || [];
  const damages = sub.precheck_damages || [];
  const remarksText = sub.remarks || '';

  const performItems = items
    .filter((i) => i.item_category === 'perform')
    .map((item) => ({
      id: item.id,
      label: getItemLabel(item.item_name, checkItemLabels),
      status: item.status,
      statusLabel: STATUS_LABELS[item.status] || item.status || '—',
      notes: item.notes || '',
    }));

  const checkItems = items
    .filter((i) => i.item_category === 'check' || !i.item_category)
    .map((item) => ({
      id: item.id,
      label: getItemLabel(item.item_name, checkItemLabels),
      status: item.status,
      statusLabel: STATUS_LABELS[item.status] || item.status || '—',
      notes: getItemDefectDescription(item, sub),
      isDefect: item.status === 'repair_needed',
    }));

  // If no category split (during_shift or legacy), treat all non-perform as check items
  const allForTable = checkItems.length > 0
    ? checkItems
    : items
      .filter((i) => i.item_category !== 'perform')
      .map((item) => ({
        id: item.id,
        label: getItemLabel(item.item_name, checkItemLabels),
        status: item.status,
        statusLabel: STATUS_LABELS[item.status] || item.status || '—',
        notes: getItemDefectDescription(item, sub),
        isDefect: item.status === 'repair_needed',
      }));

  const faults = [];
  damages.forEach((damage) => {
    const source = damage.source || null;
    const linkedItem = damage.item_id
      ? items.find((i) => i.id === damage.item_id)
      : null;

    let header;
    if (source) {
      if (source === 'check_item' && linkedItem) {
        header = getItemLabel(linkedItem.item_name, checkItemLabels);
      } else if (source === 'remarks') {
        header = 'Remarks';
      } else if (source === 'during_shift') {
        header = 'Damage Report';
      } else if (linkedItem) {
        header = getItemLabel(linkedItem.item_name, checkItemLabels);
      } else {
        header = 'Damage Report';
      }
    } else if (linkedItem) {
      header = getItemLabel(linkedItem.item_name, checkItemLabels);
    } else if (damage.location_on_tug) {
      header = damage.location_on_tug;
    } else if (
      damage.description === remarksText ||
      damage.description === 'Additional photos'
    ) {
      header = sub.check_type === 'during_shift' ? 'Damage Report' : 'Remarks';
    } else {
      const match = damage.description?.match(/^(.+?)\s*-\s*repair needed$/i);
      header = match ? match[1] : 'Damage Report';
    }

    const resolvedSource =
      source ||
      (linkedItem
        ? 'check_item'
        : sub.check_type === 'during_shift'
          ? 'during_shift'
          : 'remarks');

    faults.push({
      id: damage.id,
      source: resolvedSource,
      header,
      description: damage.description || '',
      imageUrls: damage.image_urls || [],
      repairStatus: damage.repair_status,
      repairStatusLabel: REPAIR_STATUS_LABELS[damage.repair_status] || damage.repair_status || null,
      resolvedAt: damage.resolved_at,
      resolvedBy: damage.resolved_profile
        ? `${damage.resolved_profile.first_name || ''} ${damage.resolved_profile.last_name || ''}`.trim()
        : null,
    });
  });

  const hasRemarksRecord = damages.some(
    (d) =>
      d.source === 'remarks' ||
      (!d.source &&
        (d.description === remarksText || d.description === 'Additional photos'))
  );
  if (remarksText && !hasRemarksRecord && sub.check_type !== 'during_shift') {
    faults.push({
      id: `remarks-${sub.id}`,
      source: 'remarks',
      header: 'Remarks',
      description: remarksText,
      imageUrls: [],
      repairStatus: null,
      repairStatusLabel: null,
      resolvedAt: null,
      resolvedBy: null,
    });
  }

  const realDefects = faults.filter((f) => f.source !== 'remarks');
  const remarksFaults = faults.filter((f) => f.source === 'remarks');
  const remarksImages = remarksFaults.flatMap((f) => f.imageUrls || []);

  const exceptions = [];
  allForTable
    .filter((i) => i.isDefect)
    .forEach((i) => {
      exceptions.push(i.notes ? `${i.label}: ${i.notes}` : i.label);
    });
  realDefects.forEach((d) => {
    const alreadyCovered = allForTable.some(
      (i) =>
        i.isDefect &&
        (i.label === d.header ||
          (i.notes && d.description && i.notes === d.description))
    );
    if (!alreadyCovered) {
      exceptions.push(d.description ? `${d.header}: ${d.description}` : d.header);
    }
  });

  const hasIssues = exceptions.length > 0 || realDefects.length > 0;

  const tugDisplay =
    sub.tugs?.display_name || sub.tugs?.tug_number || 'Unknown tug';
  const tugNumber = sub.tugs?.tug_number || '';

  return {
    id: sub.id,
    tugDisplay,
    tugNumber,
    locationName: sub.tugs?.locations?.name || '',
    shunterName: formatShunterName(sub.profiles),
    checkDate: sub.check_date,
    checkDateLabel: formatCheckDate(sub.check_date),
    checkTimeLabel: formatCheckTime(sub.check_time, sub.created_at),
    checkType: sub.check_type,
    checkTypeLabel:
      sub.check_type === 'pre_shift' ? 'Pre-Shift' : 'During Shift',
    remarks: remarksText,
    remarksImages,
    performItems,
    checkItems: allForTable,
    defects: realDefects,
    exceptions,
    hasIssues,
    overallLabel: hasIssues ? 'Issues found' : 'All OK',
  };
}

function renderPhotoGrid(urls) {
  if (!urls?.length) return '';
  return `<div class="photo-grid">${urls
    .map(
      (url) =>
        `<img src="${escapeHtml(url)}" alt="" class="photo-thumb" />`
    )
    .join('')}</div>`;
}

function renderStatusBadge(status, label) {
  const cls =
    status === 'ok' || status === 'completed'
      ? 'badge-ok'
      : status === 'repair_needed'
        ? 'badge-repair'
        : 'badge-na';
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

/**
 * Build HTML for a single check record (one print page block).
 */
export function buildCheckRecordHtml(record, { pageBreakAfter = false } = {}) {
  const pageClass = pageBreakAfter ? 'record page-break' : 'record';

  const exceptionsHtml = record.hasIssues
    ? `<ul class="exceptions">${record.exceptions
        .map((e) => `<li>${escapeHtml(e)}</li>`)
        .join('')}</ul>`
    : '';

  const performHtml =
    record.performItems.length > 0
      ? `<section class="section">
          <h3>Perform the following</h3>
          <ul class="item-list">
            ${record.performItems
              .map(
                (item) =>
                  `<li><span class="tick">✓</span> ${escapeHtml(item.label)}</li>`
              )
              .join('')}
          </ul>
        </section>`
      : '';

  const checkRows =
    record.checkItems.length > 0
      ? record.checkItems
          .map(
            (item) => `<tr class="${item.isDefect ? 'row-defect' : ''}">
              <td>${escapeHtml(item.label)}</td>
              <td>${renderStatusBadge(item.status, item.statusLabel)}</td>
              <td>${escapeHtml(item.notes || '—')}</td>
            </tr>`
          )
          .join('')
      : `<tr><td colspan="3" class="muted">No check items recorded</td></tr>`;

  const defectsHtml =
    record.defects.length > 0
      ? `<section class="section">
          <h3>Defects / damage reports</h3>
          ${record.defects
            .map(
              (d) => `<div class="defect-block">
                <div class="defect-header">
                  <strong>${escapeHtml(d.header)}</strong>
                  ${
                    d.repairStatusLabel
                      ? `<span class="badge badge-repair">${escapeHtml(d.repairStatusLabel)}</span>`
                      : ''
                  }
                </div>
                ${d.description ? `<p>${escapeHtml(d.description)}</p>` : ''}
                ${
                  d.resolvedAt && d.resolvedBy
                    ? `<p class="resolved">Resolved by ${escapeHtml(d.resolvedBy)} on ${escapeHtml(
                        new Date(d.resolvedAt).toLocaleDateString('en-GB')
                      )}</p>`
                    : ''
                }
                ${renderPhotoGrid(d.imageUrls)}
              </div>`
            )
            .join('')}
        </section>`
      : '';

  const remarksHtml =
    record.remarks || record.remarksImages.length > 0
      ? `<section class="section">
          <h3>Remarks</h3>
          ${record.remarks ? `<p>${escapeHtml(record.remarks)}</p>` : ''}
          ${renderPhotoGrid(record.remarksImages)}
        </section>`
      : '';

  const shortId = record.id ? String(record.id).slice(0, 8) : '—';
  const tugLine = record.tugNumber && record.tugDisplay !== record.tugNumber
    ? `${escapeHtml(record.tugDisplay)} (${escapeHtml(record.tugNumber)})`
    : escapeHtml(record.tugDisplay);

  return `<article class="${pageClass}">
    <header class="record-header">
      <div>
        <h2>PreCheck inspection record</h2>
        <p class="printed-at">Printed ${escapeHtml(formatPrintedAt())}</p>
      </div>
      <div class="banner ${record.hasIssues ? 'banner-issues' : 'banner-ok'}">
        <strong>${escapeHtml(record.overallLabel)}</strong>
        ${exceptionsHtml}
      </div>
    </header>

    <dl class="meta-grid">
      <div><dt>Tug</dt><dd>${tugLine}</dd></div>
      <div><dt>Location</dt><dd>${escapeHtml(record.locationName || '—')}</dd></div>
      <div><dt>Shunter</dt><dd>${escapeHtml(record.shunterName)}</dd></div>
      <div><dt>Date</dt><dd>${escapeHtml(record.checkDateLabel)}</dd></div>
      <div><dt>Time</dt><dd>${escapeHtml(record.checkTimeLabel)}</dd></div>
      <div><dt>Type</dt><dd>${escapeHtml(record.checkTypeLabel)}</dd></div>
    </dl>

    ${performHtml}

    <section class="section">
      <h3>Check items</h3>
      <table class="items-table">
        <thead>
          <tr><th>Item</th><th>Status</th><th>Notes</th></tr>
        </thead>
        <tbody>${checkRows}</tbody>
      </table>
    </section>

    ${defectsHtml}
    ${remarksHtml}

    <footer class="record-footer">
      Record ID: ${escapeHtml(shortId)}…
    </footer>
  </article>`;
}

/**
 * Build multi-page audit pack HTML (cover + records).
 */
export function buildAuditPackHtml({ tugLabel, from, to, records }) {
  const withIssues = records.filter((r) => r.hasIssues).length;
  const fromLabel = formatCheckDate(from);
  const toLabel = formatCheckDate(to);

  const cover = `<article class="cover page-break">
    <h1>PreCheck audit pack</h1>
    <dl class="meta-grid cover-meta">
      <div><dt>Tug</dt><dd>${escapeHtml(tugLabel)}</dd></div>
      <div><dt>Date range</dt><dd>${escapeHtml(fromLabel)} – ${escapeHtml(toLabel)}</dd></div>
      <div><dt>Checks</dt><dd>${records.length}</dd></div>
      <div><dt>With issues</dt><dd>${withIssues}</dd></div>
      <div><dt>Printed</dt><dd>${escapeHtml(formatPrintedAt())}</dd></div>
    </dl>
    <p class="muted">Records are listed chronologically (oldest first).</p>
  </article>`;

  const body = records
    .map((record, index) =>
      buildCheckRecordHtml(record, {
        pageBreakAfter: index < records.length - 1,
      })
    )
    .join('');

  return cover + body;
}

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1e293b;
    margin: 0;
    padding: 16px 20px;
    font-size: 12px;
    line-height: 1.4;
  }
  h1 { font-size: 22px; margin: 0 0 16px; }
  h2 { font-size: 16px; margin: 0 0 4px; }
  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #475569;
    margin: 0 0 8px;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4px;
  }
  .printed-at, .muted, .record-footer {
    color: #64748b;
    font-size: 11px;
  }
  .record { max-width: 800px; margin: 0 auto; }
  .cover { max-width: 800px; margin: 0 auto; padding-top: 40px; }
  .page-break { page-break-after: always; break-after: page; }
  .record-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 16px;
  }
  .banner {
    border: 2px solid #334155;
    border-radius: 6px;
    padding: 8px 12px;
    min-width: 180px;
    max-width: 320px;
  }
  .banner-ok { border-color: #166534; background: #f0fdf4; }
  .banner-issues { border-color: #991b1b; background: #fef2f2; }
  .exceptions { margin: 6px 0 0; padding-left: 16px; }
  .exceptions li { margin-bottom: 2px; }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px 12px;
    margin: 0 0 16px;
    padding: 12px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
  }
  .cover-meta { grid-template-columns: repeat(2, 1fr); }
  .meta-grid dt {
    font-size: 10px;
    text-transform: uppercase;
    color: #64748b;
    margin: 0;
  }
  .meta-grid dd {
    margin: 2px 0 0;
    font-weight: 600;
    font-size: 13px;
  }
  .section { margin-bottom: 14px; page-break-inside: avoid; }
  .item-list { list-style: none; padding: 0; margin: 0; columns: 2; }
  .item-list li { padding: 2px 0; }
  .tick { color: #166534; font-weight: bold; margin-right: 4px; }
  .items-table {
    width: 100%;
    border-collapse: collapse;
  }
  .items-table th,
  .items-table td {
    border: 1px solid #cbd5e1;
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
  }
  .items-table th {
    background: #f1f5f9;
    font-size: 11px;
    text-transform: uppercase;
  }
  .row-defect td { background: #fef2f2; }
  .badge {
    display: inline-block;
    border: 1px solid #64748b;
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .badge-ok { border-color: #166534; color: #166534; }
  .badge-repair { border-color: #991b1b; color: #991b1b; }
  .badge-na { border-color: #64748b; color: #64748b; }
  .defect-block {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 8px;
    page-break-inside: avoid;
  }
  .defect-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .defect-block p { margin: 4px 0; }
  .resolved { color: #166534; font-size: 11px; }
  .photo-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .photo-thumb {
    width: 80px;
    height: 80px;
    object-fit: cover;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
  }
  .record-footer {
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f0;
  }
  @media print {
    body { padding: 0; margin: 12mm; }
    .page-break { page-break-after: always; break-after: page; }
    .defect-block, .section { page-break-inside: avoid; }
  }
`;

/**
 * Open a print window with the given HTML body content.
 */
export function openPrintWindow(title, htmlBody) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return false;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  ${htmlBody}
</body>
</html>`);
  printWindow.document.close();

  // Wait for images to load before printing when possible
  const triggerPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // ignore
    }
  };

  const imgs = printWindow.document.images;
  if (!imgs || imgs.length === 0) {
    setTimeout(triggerPrint, 300);
    return true;
  }

  let pending = imgs.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) setTimeout(triggerPrint, 100);
  };
  Array.from(imgs).forEach((img) => {
    if (img.complete) done();
    else {
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    }
  });
  // Safety timeout if images hang
  setTimeout(triggerPrint, 4000);
  return true;
}

/**
 * Print a single precheck submission.
 */
export function printSingleCheck(sub, checkItemLabels = {}) {
  const record = normalizeSubmissionForPrint(sub, checkItemLabels);
  const title = `PreCheck – ${record.tugDisplay} – ${record.checkDateLabel}`;
  const html = buildCheckRecordHtml(record);
  return openPrintWindow(title, html);
}

/**
 * Print an audit pack for multiple normalized records.
 */
export function printAuditPack({ tugLabel, from, to, submissions, checkItemLabels = {} }) {
  const records = submissions.map((sub) =>
    normalizeSubmissionForPrint(sub, checkItemLabels)
  );
  const title = `PreCheck audit pack – ${tugLabel}`;
  const html = buildAuditPackHtml({ tugLabel, from, to, records });
  return openPrintWindow(title, html);
}
