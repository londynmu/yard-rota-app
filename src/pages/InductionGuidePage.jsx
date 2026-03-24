import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabaseClient';
import { getInductionMarkdownComponents } from '../components/InductionGuide/inductionMarkdownComponents';

const mdComponents = getInductionMarkdownComponents();

export default function InductionGuidePage() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsedSections, setCollapsedSections] = useState({});
  const scrollContainerRef = useRef(null);

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

  useEffect(() => {
    if (!sections.length) return;

    setCollapsedSections((prev) => {
      const next = {};
      sections.forEach((s) => {
        next[s.id] = prev[s.id] ?? true;
      });
      return next;
    });
  }, [sections]);

  const scrollSectionToTop = useCallback((id, behavior = 'smooth') => {
    const target = document.getElementById(`induction-section-${id}`);
    if (!target) return;

    const container = scrollContainerRef.current;
    const canScrollContainer = container && container.scrollHeight > container.clientHeight + 1;

    if (canScrollContainer) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const nextTop = container.scrollTop + (targetRect.top - containerRect.top);
      container.scrollTo({ top: Math.max(0, nextTop), behavior });
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const nextTop = window.scrollY + targetRect.top;
    window.scrollTo({ top: Math.max(0, nextTop), behavior });
  }, []);

  const handleSectionClick = useCallback((id) => {
    setCollapsedSections((prevState) => {
      const isCurrentlyCollapsed = prevState[id] ?? true;

      // Clicking an open card closes it.
      if (!isCurrentlyCollapsed) {
        return {
          ...prevState,
          [id]: true,
        };
      }

      // Clicking a closed card opens only this one.
      const next = { ...prevState };
      Object.keys(next).forEach((key) => {
        next[key] = true;
      });
      next[id] = false;
      return next;
    });

    // Match My Rota pattern: wait for DOM update, then align selected card near top.
    setTimeout(() => {
      requestAnimationFrame(() => {
        scrollSectionToTop(id);
      });
    }, 320);
  }, [scrollSectionToTop]);

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto bg-transparent px-4 py-6 md:px-6 pb-bottom-nav">
      <div className="page-content-inner">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-charcoal">Shunter Guide</h1>
            <p className="text-sm text-slate-600 mt-1">
              Key safety rules and daily yard procedures for shunters.
            </p>
          </div>
        </div>

        {loading && (
          <div className="card-modern p-8 animate-pulse space-y-3 min-h-[min(24rem,55vh)]">
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
          <div className="space-y-6">
            {sections.map((section) => {
              const isCollapsed = !!collapsedSections[section.id];

              return (
                <article
                  key={section.id}
                  id={`induction-section-${section.id}`}
                  className="card-modern p-4 md:p-5 scroll-mt-24"
                >
                  <button
                    type="button"
                    onClick={() => handleSectionClick(section.id)}
                    className={`w-full flex items-center justify-between gap-2 text-left group ${isCollapsed ? '' : 'mb-3 border-b border-slate-200/80 pb-2'}`}
                    aria-expanded={!isCollapsed}
                  >
                    <h2 className="text-sm font-semibold text-charcoal group-hover:text-slate-900 transition-colors">
                      {section.title}
                    </h2>
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-slate-200/90 bg-white text-slate-500 group-hover:text-slate-700 group-hover:border-slate-300 transition-colors shadow-sm">
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? 'rotate-0' : 'rotate-180'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="induction-guide-prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                        {section.body_markdown || ''}
                      </ReactMarkdown>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
