import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/status_badge.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key, required this.notifications});

  final List<NotificationItem> notifications;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;

    return ListView.separated(
      itemCount: notifications.length,
      separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
      itemBuilder: (context, index) {
        final item = notifications[index];
        final variant = switch (item.severity) {
          'warning' => BadgeVariant.warning,
          'danger' => BadgeVariant.danger,
          _ => BadgeVariant.info,
        };

        return AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      item.title,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  StatusBadge(
                    label: item.severity.toUpperCase(),
                    variant: variant,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                item.message,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        );
      },
    );
  }
}
