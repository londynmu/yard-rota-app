import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_scaffold.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/status_badge.dart';
import '../../home/data/stage_one_repository.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({
    super.key,
    required this.repository,
    required this.session,
  });

  final StageOneRepository repository;
  final UserSession session;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<StageOneNotification>? _notifications;
  int _pendingApprovals = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final notifications = await widget.repository.loadNotifications();
      final pending = widget.session.isAdmin
          ? await widget.repository.pendingApprovalsCount()
          : 0;
      if (!mounted) return;
      setState(() {
        _notifications = notifications;
        _pendingApprovals = pending;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _notifications = const <StageOneNotification>[]);
      AppToast.show(
        context,
        'Notifications could not be loaded. Please retry.',
      );
    }
  }

  Future<void> _markAllRead() async {
    final unread = (_notifications ?? const <StageOneNotification>[])
        .where((item) => !item.isRead)
        .map((item) => item.id)
        .toList();
    if (unread.isEmpty) return;
    try {
      await widget.repository.markNotificationsRead(unread);
      await _load();
      if (mounted) AppToast.show(context, 'Notifications marked as read.');
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'Notifications could not be updated.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final notifications = _notifications;
    final unreadCount =
        notifications?.where((item) => !item.isRead).length ?? 0;
    return AppScaffold(
      title: 'Notifications',
      actions: [
        if (unreadCount > 0)
          IconButton(
            tooltip: 'Mark all as read',
            onPressed: _markAllRead,
            icon: const Icon(Icons.done_all),
          ),
      ],
      body: notifications == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  if (widget.session.isAdmin && _pendingApprovals > 0) ...[
                    AppCard(
                      child: Row(
                        children: [
                          Icon(
                            Icons.admin_panel_settings_outlined,
                            color: context.appColors.warning,
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Text(
                              '$_pendingApprovals user'
                              '${_pendingApprovals == 1 ? '' : 's'} pending approval',
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                          ),
                          StatusBadge(
                            label: '$_pendingApprovals',
                            variant: BadgeVariant.warning,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  if (notifications.isEmpty)
                    const AppCard(
                      child: Center(child: Text('No notifications.')),
                    )
                  else
                    ...notifications.map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: _NotificationCard(item: item),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({required this.item});

  final StageOneNotification item;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final variant = switch (item.type) {
      'warning' => BadgeVariant.warning,
      'danger' || 'error' => BadgeVariant.danger,
      'success' => BadgeVariant.success,
      _ => BadgeVariant.info,
    };
    return AppCard(
      surfaceOpacity: item.isRead ? AppOpacity.subtle : null,
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
              if (!item.isRead) StatusBadge(label: 'New', variant: variant),
            ],
          ),
          if (item.message.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              item.message,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          Text(
            _dateLabel(item.createdAt),
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: colors.textTertiary),
          ),
        ],
      ),
    );
  }

  String _dateLabel(DateTime date) =>
      '${date.day.toString().padLeft(2, '0')}/'
      '${date.month.toString().padLeft(2, '0')}/${date.year} '
      '${date.hour.toString().padLeft(2, '0')}:'
      '${date.minute.toString().padLeft(2, '0')}';
}
