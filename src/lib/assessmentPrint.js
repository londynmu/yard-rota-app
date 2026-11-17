/**
 * Driver assessment print helpers — header/summary + photos (not fault checklist).
 */

import { supabase } from './supabaseClient';
import { escapeHtml, openPrintWindow } from './precheckPrint';
import { resolveAssessmentImageUrls } from '../utils/assessmentImageUrl';

function formatDateLabel(value) {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTimeLabel(value) {
  if (!value) return '—';
  const raw = String(value);
  // Postgres time may arrive as HH:MM:SS
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
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

function snapshotName(snapshot = {}) {
  const name = `${snapshot.first_name || ''} ${snapshot.last_name || ''}`.trim();
  return name || 'Unknown';
}

/**
 * Build print HTML for one assessment (summary fields + paper photos).
 */
export function buildAssessmentPrintHtml(assessment, signedImageUrls = []) {
  const snap = assessment.profile_snapshot || {};
  const name = snapshotName(snap);
  const photos = (signedImageUrls || [])
    .map(
      (src) =>
        `<figure class="photo-cell"><img src="${escapeHtml(src)}" alt="Assessment form photo" /></figure>`,
    )
    .join('');

  return `<article class="record">
    <header class="record-header">
      <div>
        <h1>Driver Assessment Report</h1>
        <p class="muted">Yard Rota · paper form summary</p>
      </div>
      <div class="banner">
        <div><strong>Next due</strong></div>
        <div>${escapeHtml(formatDateLabel(assessment.next_due_date))}</div>
      </div>
    </header>

    <dl class="meta-grid">
      <div><dt>Name</dt><dd>${escapeHtml(name)}</dd></div>
      <div><dt>Licence No. (Yard System ID)</dt><dd>${escapeHtml(snap.yard_system_id || '—')}</dd></div>
      <div><dt>Agency</dt><dd>${escapeHtml(snap.agency_name || '—')}</dd></div>
      <div><dt>Location</dt><dd>${escapeHtml(snap.preferred_location || snap.location || '—')}</dd></div>
      <div><dt>Date</dt><dd>${escapeHtml(formatDateLabel(assessment.assessment_date))}</dd></div>
      <div><dt>Duration</dt><dd>${escapeHtml(assessment.duration || '—')}</dd></div>
      <div><dt>Time from</dt><dd>${escapeHtml(formatTimeLabel(assessment.time_from))}</dd></div>
      <div><dt>Time to</dt><dd>${escapeHtml(formatTimeLabel(assessment.time_to))}</dd></div>
      <div><dt>Printed</dt><dd>${escapeHtml(formatPrintedAt())}</dd></div>
    </dl>

    ${
      assessment.notes?.trim()
        ? `<section class="section">
            <h3>General comments</h3>
            <p style="white-space:pre-wrap">${escapeHtml(assessment.notes.trim())}</p>
          </section>`
        : ''
    }

    <section class="section">
      <h3>Paper form photos</h3>
      ${
        photos
          ? `<div class="photo-grid">${photos}</div>`
          : '<p class="muted">No photos attached.</p>'
      }
    </section>
  </article>`;
}

/**
 * Print one assessment with signed photo URLs.
 */
export async function printAssessment(assessment) {
  const signed = await resolveAssessmentImageUrls(
    supabase,
    assessment.image_paths || [],
  );
  const name = snapshotName(assessment.profile_snapshot);
  const title = `Assessment – ${name} – ${formatDateLabel(assessment.assessment_date)}`;
  const html = buildAssessmentPrintHtml(assessment, signed);
  return openPrintWindow(title, html);
}
