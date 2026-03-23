import React, { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabaseClient';
import { getInductionMarkdownComponents } from '../components/InductionGuide/inductionMarkdownComponents';

const mdComponents = getInductionMarkdownComponents();

export default function InductionGuidePage() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem('yard_guide_nav_collapsed') === 'true');
  const [collapsedSections, setCollapsedSections] = useState({});

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
    localStorage.setItem('yard_guide_nav_collapsed', String(navCollapsed));
  }, [navCollapsed]);

  useEffect(() => {
    if (!sections.length) return;

    setCollapsedSections((prev) => {
      const next = {};
      sections.forEach((s) => {
        next[s.id] = prev[s.id] ?? true;
      });
      return next;
    });

    if (!activeSectionId) {
      setActiveSectionId(sections[0].id);
    }
  }, [sections, activeSectionId]);

  useEffect(() => {
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = visible[0].target.getAttribute('data-section-id');
          if (id) setActiveSectionId(id);
        }
      },
      {
        root: null,
        // Keep active section stable while reading inside section content.
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0.1, 0.25, 0.5],
      }
    );

    sections.forEach((section) => {
      const el = document.getElementById(`induction-section-${section.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  const goToSection = useCallback((id) => {
    const target = document.getElementById(`induction-section-${id}`);
    if (target) {
      setCollapsedSections((prev) => ({ ...prev, [id]: false }));
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSectionId(id);
    }
  }, []);

  const renderNavItems = () => (
    <ul className="space-y-2">
      {sections.map((s, idx) => {
        const isActive = activeSectionId === s.id;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => goToSection(s.id)}
              className={`w-full text-left rounded-lg border px-2.5 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-blue-200 bg-blue-50/80 text-blue-800'
                  : 'border-slate-200/80 bg-white/70 text-slate-700 hover:bg-slate-50'
              }`}
              aria-current={isActive ? 'true' : undefined}
            >
              <span className="inline-flex items-center gap-2">
                <span className="text-xs text-slate-500">{idx + 1}.</span>
                <span className="truncate">{s.title}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="h-full overflow-y-auto bg-transparent px-4 py-6 md:px-6 pb-bottom-nav">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-charcoal">Shunter yard induction</h1>
            <p className="text-sm text-slate-600 mt-1">
              Essential rules, procedures and yard organisation for shunters on site.
            </p>
          </div>
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
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
            <div className="space-y-6">
              {sections.map((section, idx) => {
                const isCollapsed = !!collapsedSections[section.id];
                const prev = idx > 0 ? sections[idx - 1] : null;
                const next = idx < sections.length - 1 ? sections[idx + 1] : null;

                return (
                  <article
                    key={section.id}
                    id={`induction-section-${section.id}`}
                    data-section-id={section.id}
                    className="card-modern p-5 md:p-6 scroll-mt-24"
                  >
                    <div className="flex items-center justify-between gap-2 mb-4 border-b border-slate-200/80 pb-2">
                      <h2 className="text-xl font-bold text-charcoal">{section.title}</h2>
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedSections((prevState) => ({
                            ...prevState,
                            [section.id]: !prevState[section.id],
                          }))
                        }
                        className="btn-secondary btn-modern text-xs py-1 px-2.5"
                        aria-expanded={!isCollapsed}
                      >
                        {isCollapsed ? 'Expand' : 'Collapse'}
                      </button>
                    </div>

                    {!isCollapsed && (
                      <>
                        <div className="induction-guide-prose">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                            {section.body_markdown || ''}
                          </ReactMarkdown>
                        </div>
                        <div className="mt-6 pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
                          {prev ? (
                            <button
                              type="button"
                              onClick={() => goToSection(prev.id)}
                              className="btn-secondary btn-modern text-xs py-1.5 px-3"
                            >
                              Previous section
                            </button>
                          ) : (
                            <span />
                          )}
                          {next ? (
                            <button
                              type="button"
                              onClick={() => goToSection(next.id)}
                              className="btn-secondary btn-modern text-xs py-1.5 px-3"
                            >
                              Next section
                            </button>
                          ) : (
                            <span />
                          )}
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>

            <aside className="hidden lg:block sticky top-20">
              <nav className="card-modern p-4 max-h-[calc(100vh-7rem)] overflow-y-auto" aria-label="Guide sections">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sections</p>
                  <button
                    type="button"
                    onClick={() => setNavCollapsed((prev) => !prev)}
                    className="btn-secondary btn-modern text-xs py-1 px-2"
                    aria-expanded={!navCollapsed}
                  >
                    {navCollapsed ? 'Expand' : 'Collapse'}
                  </button>
                </div>
                {!navCollapsed && renderNavItems()}
              </nav>
            </aside>
          </div>
        )}

      </div>
    </div>
  );
}
