import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_scaffold.dart';
import '../../../core/ui/app_toast.dart';
import '../../home/data/stage_one_repository.dart';

class InductionGuideScreen extends StatefulWidget {
  const InductionGuideScreen({super.key, required this.repository});

  final StageOneRepository repository;

  @override
  State<InductionGuideScreen> createState() => _InductionGuideScreenState();
}

class _InductionGuideScreenState extends State<InductionGuideScreen> {
  List<InductionSection>? _sections;
  String? _expandedId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final sections = await widget.repository.loadInductionSections();
      if (mounted) setState(() => _sections = sections);
    } catch (_) {
      if (!mounted) return;
      setState(() => _sections = const <InductionSection>[]);
      AppToast.show(context, 'The guide could not be loaded. Please retry.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final sections = _sections;
    return AppScaffold(
      title: 'Shunter Guide',
      body: sections == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  Text(
                    'Key safety rules and daily yard procedures for shunters.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: context.appColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  if (sections.isEmpty)
                    const AppCard(
                      child: Center(
                        child: Text(
                          'Content is being prepared. Check back soon.',
                        ),
                      ),
                    )
                  else
                    ...sections.map(
                      (section) => Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: _SectionCard(
                          section: section,
                          expanded: section.id == _expandedId,
                          onTap: () => setState(
                            () => _expandedId = _expandedId == section.id
                                ? null
                                : section.id,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.section,
    required this.expanded,
    required this.onTap,
  });

  final InductionSection section;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onTap,
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    section.title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Icon(
                  expanded ? Icons.expand_less : Icons.expand_more,
                  color: colors.textSecondary,
                ),
              ],
            ),
          ),
          if (expanded) ...[
            const SizedBox(height: AppSpacing.md),
            Divider(color: colors.divider),
            const SizedBox(height: AppSpacing.sm),
            SelectableText(
              section.body,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}
