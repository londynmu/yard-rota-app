import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/status_badge.dart';
import '../../home/data/stage_one_repository.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({
    super.key,
    required this.repository,
    required this.session,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
  });

  final StageOneRepository repository;
  final UserSession session;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;

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
      AppToast.error(
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
      if (mounted) AppToast.success(context, 'Notifications marked as read.');
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'Notifications could not be updated.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    final wallpaperPath = homeBackgroundAssetPath(
      brightness: isDark ? Brightness.dark : Brightness.light,
      lightWallpaper: widget.lightHomeWallpaper,
      darkWallpaper: widget.darkHomeWallpaper,
    );
    final notifications = _notifications;
    final unreadCount =
        notifications?.where((item) => !item.isRead).length ?? 0;

    // Wallpaper behind Scaffold (same idea as AuthTheme): body then starts
    // directly under the AppBar — no manual statusBar + toolbar inset.
    return Stack(
      fit: StackFit.expand,
      children: [
        Positioned.fill(
          child: Image.asset(
            wallpaperPath,
            fit: BoxFit.cover,
            alignment: Alignment.center,
            gaplessPlayback: true,
          ),
        ),
        Scaffold(
          backgroundColor: Colors.transparent,
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 0,
            flexibleSpace: ClipRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: isDark
                          ? [
                              colors.bgPrimary.withValues(alpha: 0.0),
                              colors.bgPrimary.withValues(alpha: 0.28),
                            ]
                          : [
                              Colors.white.withValues(alpha: 0.0),
                              Colors.white.withValues(alpha: 0.42),
                            ],
                    ),
                  ),
                ),
              ),
            ),
            title: const Text('Notifications'),
            actions: [
              if (unreadCount > 0)
                IconButton(
                  tooltip: 'Mark all as read',
                  onPressed: _markAllRead,
                  icon: const Icon(Icons.done_all),
                ),
            ],
          ),
          body: Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              mq.padding.bottom + AppSpacing.lg,
            ),
            child: notifications == null
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      padding: EdgeInsets.zero,
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        if (widget.session.isAdmin &&
                            _pendingApprovals > 0) ...[
                          _PendingApprovalsBanner(count: _pendingApprovals),
                          const SizedBox(height: AppSpacing.md),
                        ],
                        if (notifications.isEmpty)
                          const _EmptyNotificationsCard()
                        else
                          for (var i = 0; i < notifications.length; i++) ...[
                            if (i > 0) const SizedBox(height: AppSpacing.md),
                            _NotificationCard(item: notifications[i]),
                          ],
                      ],
                    ),
                  ),
          ),
        ),
      ],
    );
  }
}

class _PendingApprovalsBanner extends StatelessWidget {
  const _PendingApprovalsBanner({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = AppAvailabilityTones.note(isDark: isDark);
    final wash = AppAvailabilityTones.noteBg(isDark: isDark);
    final border = accent.withValues(alpha: isDark ? 0.35 : 0.28);
    final titleFg = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.45 : 0.35),
      colors.textPrimary,
    );

    return AppCard(
      padding: EdgeInsets.zero,
      color: Color.alphaBlend(
        wash.withValues(alpha: isDark ? 0.45 : 0.7),
        colors.bgElevated,
      ),
      borderColor: border,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: isDark ? 0.22 : 0.14),
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Icon(
                Icons.admin_panel_settings_outlined,
                size: 20,
                color: accent,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                '$count user${count == 1 ? '' : 's'} pending approval',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: titleFg,
                  height: 1.2,
                ),
              ),
            ),
            StatusBadge(
              label: '$count',
              variant: BadgeVariant.warning,
              compact: true,
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyNotificationsCard extends StatelessWidget {
  const _EmptyNotificationsCard();

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = colors.info;
    final wash = colors.infoBg;
    final border = accent.withValues(alpha: isDark ? 0.35 : 0.28);

    return AppCard(
      padding: EdgeInsets.zero,
      color: Color.alphaBlend(
        wash.withValues(alpha: isDark ? 0.45 : 0.7),
        colors.bgElevated,
      ),
      borderColor: border,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.lg,
        ),
        child: Center(
          child: Text(
            'No notifications.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w400,
            ),
          ),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final tone = _toneFor(item.type, colors: colors, isDark: isDark);
    // Same tinted AppCard shell as Info / Breaks / calendar over wallpaper.
    final washAlpha = item.isRead
        ? (isDark ? 0.35 : 0.55)
        : (isDark ? 0.45 : 0.7);
    final border = tone.accent.withValues(alpha: isDark ? 0.35 : 0.28);
    final titleFg = Color.alphaBlend(
      tone.accent.withValues(alpha: isDark ? 0.45 : 0.35),
      colors.textPrimary,
    );

    return AppCard(
      padding: EdgeInsets.zero,
      color: Color.alphaBlend(
        tone.wash.withValues(alpha: washAlpha),
        colors.bgElevated,
      ),
      borderColor: border,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: tone.accent.withValues(alpha: isDark ? 0.22 : 0.14),
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Icon(tone.icon, size: 20, color: tone.accent),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          item.title,
                          style: Theme.of(context)
                              .textTheme
                              .titleSmall
                              ?.copyWith(
                                fontWeight: FontWeight.w600,
                                color: titleFg,
                                height: 1.2,
                              ),
                        ),
                      ),
                      if (!item.isRead) ...[
                        const SizedBox(width: AppSpacing.sm),
                        StatusBadge(
                          label: 'New',
                          variant: tone.badge,
                          compact: true,
                        ),
                      ],
                    ],
                  ),
                  if (item.message.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      item.message,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.textSecondary,
                        fontWeight: FontWeight.w400,
                        height: 1.35,
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    _dateLabel(item.createdAt),
                    style: AppTypography.labelMedium.copyWith(
                      color: colors.textTertiary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _dateLabel(DateTime date) =>
      '${date.day.toString().padLeft(2, '0')}/'
      '${date.month.toString().padLeft(2, '0')}/${date.year} '
      '${date.hour.toString().padLeft(2, '0')}:'
      '${date.minute.toString().padLeft(2, '0')}';
}

class _NotificationTone {
  const _NotificationTone({
    required this.accent,
    required this.wash,
    required this.icon,
    required this.badge,
  });

  final Color accent;
  final Color wash;
  final IconData icon;
  final BadgeVariant badge;
}

_NotificationTone _toneFor(
  String type, {
  required AppColorsScheme colors,
  required bool isDark,
}) {
  return switch (type) {
    'warning' => _NotificationTone(
      accent: AppAvailabilityTones.note(isDark: isDark),
      wash: AppAvailabilityTones.noteBg(isDark: isDark),
      icon: Icons.warning_amber_outlined,
      badge: BadgeVariant.warning,
    ),
    'danger' || 'error' => _NotificationTone(
      accent: colors.danger,
      wash: colors.dangerBg,
      icon: Icons.error_outline,
      badge: BadgeVariant.danger,
    ),
    'success' => _NotificationTone(
      accent: AppAvailabilityTones.available(colors),
      wash: AppAvailabilityTones.availableBg(colors),
      icon: Icons.check_circle_outline,
      badge: BadgeVariant.success,
    ),
    _ => _NotificationTone(
      accent: colors.info,
      wash: colors.infoBg,
      icon: Icons.notifications_none_outlined,
      badge: BadgeVariant.info,
    ),
  };
}
