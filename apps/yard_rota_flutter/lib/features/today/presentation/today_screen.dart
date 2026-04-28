import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/status_badge.dart';

class TodayScreen extends StatelessWidget {
  const TodayScreen({super.key, required this.shift});

  final ShiftOverview shift;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;

    final statusVariant = switch (shift.status) {
      'On time' => BadgeVariant.success,
      'Delayed' => BadgeVariant.warning,
      'Critical' => BadgeVariant.danger,
      _ => BadgeVariant.info,
    };

    return ListView(
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Current shift',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                shift.title,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '${shift.window} • ${shift.location}',
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.md),
              StatusBadge(label: shift.status, variant: statusVariant),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Quick actions',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: 'Start pre-check',
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Pre-check started.')),
                  );
                },
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                label: 'Report issue',
                variant: AppButtonVariant.secondary,
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Issue report opened.')),
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}
