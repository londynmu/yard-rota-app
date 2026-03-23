import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../../lib/supabaseClient';
import {
  INDUCTION_GUIDE_IMAGE_BUCKET,
  INDUCTION_GUIDE_MAX_IMAGE_BYTES,
} from '../../lib/inductionGuideConstants';
import { getInductionMarkdownComponents } from '../InductionGuide/inductionMarkdownComponents';
import { useToast } from '../ui/ToastContext';
import ConfirmDialog from '../ui/ConfirmDialog';

const mdComponents = getInductionMarkdownComponents();

const emptyForm = () => ({
  title: '',
  body_markdown: '',
  is_published: false,
});

export default function InductionGuideManager() {
  const toast = useToast();
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState('list');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showPreview, setShowPreview] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const bodyRef = useRef(null);
  const fileInputRef = useRef(null);

  const loadSections = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shunter_induction_sections')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setSections(data || []);
    } catch (e) {
      console.error('[InductionGuideManager] load', e);
      toast.error('Failed to load sections');
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  const openCreate = () => {
    setEditingId('new');
    setForm(emptyForm());
    setMode('edit');
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      title: row.title || '',
      body_markdown: row.body_markdown || '',
      is_published: !!row.is_published,
    });
    setMode('edit');
  };

  const backToList = () => {
    setMode('list');
    setEditingId(null);
    setForm(emptyForm());
  };

  const save = async () => {
    const title = form.title.trim();
    if (!title) {
      toast.error('Title is required');
      return;
    }

    setSaving(true);
    try {
      if (editingId === 'new') {
        const maxOrder = sections.reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
        const { error } = await supabase.from('shunter_induction_sections').insert({
          title,
          body_markdown: form.body_markdown,
          is_published: form.is_published,
          sort_order: maxOrder + 10,
        });
        if (error) throw error;
        toast.success('Section created');
      } else {
        const { error } = await supabase
          .from('shunter_induction_sections')
          .update({
            title,
            body_markdown: form.body_markdown,
            is_published: form.is_published,
          })
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Section saved');
      }
      await loadSections();
      backToList();
    } catch (e) {
      console.error('[InductionGuideManager] save', e);
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('shunter_induction_sections').delete().eq('id', deleteTarget);
      if (error) throw error;
      toast.success('Section deleted');
      await loadSections();
      if (editingId === deleteTarget) backToList();
    } catch (e) {
      console.error('[InductionGuideManager] delete', e);
      toast.error(e.message || 'Delete failed');
    } finally {
      setSaving(false);
      setDeleteTarget(null);
    }
  };

  const move = async (id, direction) => {
    const idx = sections.findIndex((s) => s.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;

    const a = sections[idx];
    const b = sections[swapIdx];
    const orderA = a.sort_order;
    const orderB = b.sort_order;

    try {
      const [r1, r2] = await Promise.all([
        supabase.from('shunter_induction_sections').update({ sort_order: orderB }).eq('id', a.id),
        supabase.from('shunter_induction_sections').update({ sort_order: orderA }).eq('id', b.id),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
      await loadSections();
    } catch (e) {
      console.error('[InductionGuideManager] move', e);
      toast.error('Could not reorder');
    }
  };

  const insertImageMarkdown = (markdown) => {
    const ta = bodyRef.current;
    const v = form.body_markdown;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const insert = `\n\n${markdown}\n\n`;
      const next = v.slice(0, start) + insert + v.slice(end);
      setForm((f) => ({ ...f, body_markdown: next }));
      const pos = start + insert.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    } else {
      setForm((f) => ({ ...f, body_markdown: `${v}\n\n${markdown}\n\n` }));
    }
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|png|webp)$/i)) {
      toast.error('Use JPEG, PNG or WebP');
      return;
    }
    if (file.size > INDUCTION_GUIDE_MAX_IMAGE_BYTES) {
      toast.error('Image must be 5 MB or smaller');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg';
      const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
      const path = `${crypto.randomUUID()}.${safeExt}`;

      const { error: upErr } = await supabase.storage
        .from(INDUCTION_GUIDE_IMAGE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });

      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from(INDUCTION_GUIDE_IMAGE_BUCKET).getPublicUrl(path);

      const alt = form.title.trim() || 'Guide image';
      insertImageMarkdown(`![${alt}](${publicUrl})`);
      toast.success('Image inserted');
    } catch (err) {
      console.error('[InductionGuideManager] upload', err);
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading && sections.length === 0) {
    return (
      <div className="max-w-5xl mx-auto p-4">
        <div className="h-8 bg-slate-200 rounded w-48 mb-4 animate-pulse" />
        <div className="h-32 bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={backToList} className="btn-secondary btn-modern text-sm">
            Back to list
          </button>
          <span className="text-sm text-slate-500">
            {editingId === 'new' ? 'New section' : 'Edit section'}
          </span>
        </div>

        <div className="card-modern p-4 md:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-charcoal focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              placeholder="e.g. Site facilities"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-charcoal cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
              />
              Published (visible on yard guide page)
            </label>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="text-sm font-medium text-charcoal">Body (Markdown)</label>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onPickFile}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary btn-modern text-xs py-1.5 px-3"
                >
                  {uploading ? 'Uploading…' : 'Insert image'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview((p) => !p)}
                  className="btn-secondary btn-modern text-xs py-1.5 px-3"
                >
                  {showPreview ? 'Hide preview' : 'Show preview'}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              Place the cursor where you want the photo, then use Insert image. Images are stored in Supabase
              Storage and linked in the text.
            </p>
            <div className={`grid gap-4 ${showPreview ? 'md:grid-cols-2' : ''}`}>
              <textarea
                ref={bodyRef}
                value={form.body_markdown}
                onChange={(e) => setForm((f) => ({ ...f, body_markdown: e.target.value }))}
                rows={18}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono text-charcoal focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                placeholder="Write Markdown here. Use **bold**, lists, and Insert image for photos."
              />
              {showPreview && (
                <div className="rounded-xl border border-slate-200 bg-white/90 p-4 overflow-y-auto max-h-[28rem] text-sm">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Preview</p>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {form.body_markdown || '*Nothing to preview*'}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn-primary btn-modern text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={backToList} className="btn-secondary btn-modern text-sm">
              Cancel
            </button>
            {editingId && editingId !== 'new' && (
              <button
                type="button"
                onClick={() => setDeleteTarget(editingId)}
                className="ml-auto btn-modern text-sm border-2 border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Delete section
              </button>
            )}
          </div>
        </div>

        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          title="Delete this section?"
          message="This cannot be undone."
          confirmText="Delete"
          isDestructive
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-charcoal">Yard induction guide</h2>
        <button type="button" onClick={openCreate} className="btn-primary btn-modern text-sm">
          Add section
        </button>
      </div>

      <p className="text-sm text-slate-600">
        Sections appear on the shunter &quot;Yard induction&quot; page in order. Only published sections are
        visible to drivers.
      </p>

      {sections.length === 0 ? (
        <div className="card-modern p-8 text-center text-slate-600 text-sm">No sections yet. Add one to get started.</div>
      ) : (
        <ul className="space-y-3">
          {sections.map((s, i) => (
            <li key={s.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-charcoal truncate">{s.title}</p>
                <p className="text-xs text-slate-500">
                  {s.is_published ? (
                    <span className="text-emerald-700">Published</span>
                  ) : (
                    <span className="text-amber-700">Draft</span>
)}{' '}
                  · order {s.sort_order}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => move(s.id, 'up')}
                  disabled={i === 0}
                  className="btn-secondary btn-modern text-xs py-1 px-2 disabled:opacity-40"
                  title="Move up"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => move(s.id, 'down')}
                  disabled={i === sections.length - 1}
                  className="btn-secondary btn-modern text-xs py-1 px-2 disabled:opacity-40"
                  title="Move down"
                >
                  Down
                </button>
                <button type="button" onClick={() => openEdit(s)} className="btn-secondary btn-modern text-xs py-1 px-3">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(s.id)}
                  className="btn-modern text-xs py-1 px-3 border-2 border-rose-200 text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete this section?"
        message="This cannot be undone."
        confirmText="Delete"
        isDestructive
      />
    </div>
  );
}
