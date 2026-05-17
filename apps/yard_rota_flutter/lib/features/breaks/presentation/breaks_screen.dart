import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/status_badge.dart';

class BreaksScreen extends StatelessWidget {
  const BreaksScreen({super.key, required this.breaks});

  final List<BreakItem> breaks;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;

    return ListView.separated(
      itemCount: breaks.length,
      separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
      itemBuilder: (context, index) {
        final item = breaks[index];
        return AppCard(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.label,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      item.window,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              StatusBadge(
                label: item.isActive ? 'Active' : 'Upcoming',
                variant: item.isActive
                    ? BadgeVariant.success
                    : BadgeVariant.info,
              ),
            ],
          ),
        );
      },
    );
  }
}
