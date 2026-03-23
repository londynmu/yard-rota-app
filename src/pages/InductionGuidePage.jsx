import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabaseClient';
import { getInductionMarkdownComponents } from '../components/InductionGuide/inductionMarkdownComponents';

const mdComponents = getInductionMarkdownComponents();

export default function InductionGuidePage() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: qErr } = await supabase
        .from('shunter_induction_sections')
        .select('id, sort_order, title, body_markdown, updated_at')
        .eq('is_published', true)
        .order('sort_order', { ascending: true });

      if (qErr) throw qErr;
      setSections(data || []);
    } catch (e) {
      console.error('[InductionGuidePage]', e);
      setError('Could not load the guide. Please try again later.');
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full overflow-y-auto bg-transparent px-4 py-6 md:px-6 pb-bottom-nav">
      <div className="page-content-inner">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-charcoal">Shunter yard induction</h1>
            <p className="text-sm text-slate-600 mt-1">
              Essential rules, procedures and yard organisation for shunters on site.
            </p>
          </div>
          <Link
            to="/calendar"
            className="btn-secondary btn-modern text-sm shrink-0 self-start"
          >
            Back to main page
          </Link>
        </div>

        {loading && (
          <div className="card-modern p-8 animate-pulse space-y-3">
            <div className="h-6 bg-slate-100 rounded w-1/2" />
            <div className="h-4 bg-slate-100 rounded w-full" />
            <div className="h-4 bg-slate-100 rounded w-5/6" />
          </div>
        )}

        {!loading && error && (
          <div className="card-modern p-6 border border-rose-200 bg-rose-50/50 text-rose-800 text-sm">{error}</div>
        )}

        {!loading && !error && sections.length === 0 && (
          <div className="card-modern p-8 text-center text-slate-600 text-sm">
            Content is being prepared. Check back soon.
          </div>
        )}

        {!loading && !error && sections.length > 0 && (
          <nav className="card-modern p-4 mb-6" aria-label="Guide sections">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">On this page</p>
            <ul className="flex flex-wrap gap-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#induction-section-${s.id}`}
                    className="inline-flex items-center rounded-lg px-2.5 py-1 text-sm text-blue-700 bg-blue-50/80 border border-blue-100 hover:bg-blue-100/80 transition-colors"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="space-y-6">
          {sections.map((section) => (
            <article
              key={section.id}
              id={`induction-section-${section.id}`}
              className="card-modern p-5 md:p-6 scroll-mt-24"
            >
              <h2 className="text-xl font-bold text-charcoal mb-4 border-b border-slate-200/80 pb-2">
                {section.title}
              </h2>
              <div className="induction-guide-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {section.body_markdown || ''}
                </ReactMarkdown>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
