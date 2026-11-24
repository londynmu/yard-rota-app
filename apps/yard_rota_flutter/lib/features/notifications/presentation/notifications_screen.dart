import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_modal_actions.dart';
import '../../../core/ui/app_option_sheet.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/glass_bar_surface.dart';
import '../../../core/ui/nav_pill.dart';
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
  List<PendingJoinRequest> _pendingUsers = const [];
  List<MissingTookPrecheck> _missingTook = const [];
  String? _busyUserId;

  bool get _isAdmin => widget.session.isAdmin;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final notifications = await widget.repository.loadNotifications();
      var pending = const <PendingJoinRequest>[];
      var missing = const <MissingTookPrecheck>[];
      if (_isAdmin) {
        pending = await widget.repository.loadPendingJoinRequests();
        missing = await widget.repository.loadMissingTookPrechecks();
      }
      if (!mounted) return;
      setState(() {
        _notifications = notifications;
        _pendingUsers = pending;
        _missingTook = missing;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _notifications = const <StageOneNotification>[];
        _pendingUsers = const [];
        _missingTook = const [];
      });
      AppToast.error(
        context,
        'Notifications could not be loaded. Please retry.',
      );
    }
  }

  Future<void> _markAllRead() async {
    final current = _notifications ?? const <StageOneNotification>[];
    final unread = current.where((item) => !item.isRead).toList();
    if (unread.isEmpty) return;
    // Keep title/message/shift details — only flip isRead.
    setState(() {
      _notifications = [
        for (final item in current) item.copyWith(isRead: true),
      ];
    });
    try {
      await widget.repository.markNotificationsRead(
        unread.map((item) => item.id).toList(),
      );
      if (mounted) AppToast.success(context, 'Notifications marked as read.');
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'Notifications could not be updated.');
        await _load();
      }
    }
  }

  Future<void> _confirmClearRead() async {
    final current = _notifications ?? const <StageOneNotification>[];
    final readCount = current.where((item) => item.isRead).length;
    if (readCount == 0) return;
    final colors = context.appColors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: colors.bgElevated,
        surfaceTintColor: Colors.transparent,
        shape: appDialogShape(colors),
        title: Text(
          'Clear read notifications',
          style: Theme.of(dialogContext).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w600,
            color: colors.textPrimary,
          ),
        ),
        content: Text(
          readCount == 1
              ? 'Delete 1 read notification? This action cannot be undone.'
              : 'Delete $readCount read notifications? This action cannot be undone.',
          style: Theme.of(dialogContext).textTheme.bodyMedium?.copyWith(
            color: colors.textSecondary,
          ),
        ),
        actions: appDialogActions(
          context: dialogContext,
          onCancel: () => Navigator.of(dialogContext).pop(false),
          onConfirm: () => Navigator.of(dialogContext).pop(true),
          confirmLabel: 'Delete',
        ),
      ),
    );
    if (confirmed == true) {
      await _clearRead();
    }
  }

  Future<void> _clearRead() async {
    final current = _notifications ?? const <StageOneNotification>[];
    final readIds = current
        .where((item) => item.isRead)
        .map((item) => item.id)
        .toList(growable: false);
    if (readIds.isEmpty) return;
    setState(() {
      _notifications = current.where((item) => !item.isRead).toList();
    });
    try {
      await widget.repository.deleteReadNotifications(readIds);
      if (mounted) {
        AppToast.success(context, 'Read notifications cleared.');
      }
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'Read notifications could not be cleared.');
        await _load();
      }
    }
  }

  Future<void> _setApproval(PendingJoinRequest person, String status) async {
    setState(() => _busyUserId = person.id);
    try {
      await widget.repository.setAccountStatus(
        userId: person.id,
        status: status,
      );
      if (!mounted) return;
      AppToast.success(
        context,
        status == 'approved'
            ? '${person.displayName} approved.'
            : '${person.displayName} rejected.',
      );
      await _load();
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'Could not update approval. Please retry.');
      }
    } finally {
      if (mounted) setState(() => _busyUserId = null);
    }
  }

  Future<void> _confirmReject(PendingJoinRequest person) async {
    final colors = context.appColors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: colors.bgElevated,
        surfaceTintColor: Colors.transparent,
        shape: appDialogShape(colors),
        title: Text(
          'Reject user',
          style: Theme.of(dialogContext).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w600,
            color: colors.textPrimary,
          ),
        ),
        content: Text(
          'Are you sure you want to reject ${person.displayName}?',
          style: Theme.of(dialogContext).textTheme.bodyMedium?.copyWith(
            color: colors.textSecondary,
          ),
        ),
        actions: appDialogActions(
          context: dialogContext,
          onCancel: () => Navigator.of(dialogContext).pop(false),
          onConfirm: () => Navigator.of(dialogContext).pop(true),
          confirmLabel: 'Reject',
        ),
      ),
    );
    if (confirmed == true) {
      await _setApproval(person, 'rejected');
    }
  }

  Future<void> _copyMissingTookReminder() async {
    if (_missingTook.isEmpty) return;
    final lines = _missingTook
        .map((person) => '- ${person.displayName} (${person.shiftWindow})')
        .join('\n');
    final intro = _missingTook.length == 1
        ? 'This shunter is on shift and has not completed a pre-shift check:'
        : 'These shunters are on shift and have not completed a pre-shift check:';
    final text = [
      'Pre-shift check reminder',
      '',
      intro,
      '',
      lines,
      '',
      'Please complete your tug check in the app.',
    ].join('\n');
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) AppToast.success(context, 'Reminder copied.');
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    final topInset =
        mq.padding.top + AppComponentTokens.appBarHeight + AppSpacing.md;
    final wallpaperPath = homeBackgroundAssetPath(
      brightness: isDark ? Brightness.dark : Brightness.light,
      lightWallpaper: widget.lightHomeWallpaper,
      darkWallpaper: widget.darkHomeWallpaper,
    );
    final notifications = _notifications;
    final unreadCount =
        notifications?.where((item) => !item.isRead).length ?? 0;
    final readCount =
        notifications?.where((item) => item.isRead).length ?? 0;
    final showAdminEmpty =
        _isAdmin &&
        _pendingUsers.isEmpty &&
        _missingTook.isEmpty &&
        (notifications?.isEmpty ?? false);
    final actionIconColor = bottomNavIconColor(
      colors,
      selected: false,
      isDark: isDark,
    );

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: AppElevation.level0,
        scrolledUnderElevation: AppElevation.level0,
        toolbarHeight: AppComponentTokens.appBarHeight,
        flexibleSpace: const GlassBarSurface(edge: GlassBarEdge.top),
        title: Text(
          'Notifications',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
            color: colors.textPrimary,
            letterSpacing: -0.3,
          ),
        ),
        actions: [
          if (readCount > 0)
            IconButton(
              tooltip: 'Clear read',
              onPressed: _confirmClearRead,
              icon: navBarIcon(
                Icons.delete_outline,
                color: actionIconColor,
                size: AppHomeTabs.segmentIconSize,
              ),
            ),
          if (unreadCount > 0)
            IconButton(
              tooltip: 'Mark all as read',
              onPressed: _markAllRead,
              icon: navBarIcon(
                Icons.done_all,
                color: actionIconColor,
                size: AppHomeTabs.segmentIconSize,
              ),
            ),
        ],
      ),
      body: Stack(
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
          notifications == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  edgeOffset: topInset,
                  child: ListView(
                    padding: EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      topInset,
                      AppSpacing.lg,
                      mq.padding.bottom + AppSpacing.lg,
                    ),
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      if (_isAdmin && _pendingUsers.isNotEmpty) ...[
                        _SectionHeader(
                          title: 'Waiting for approval',
                          count: _pendingUsers.length,
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        for (var i = 0; i < _pendingUsers.length; i++) ...[
                          if (i > 0) const SizedBox(height: AppSpacing.sm),
                          _PendingUserCard(
                            person: _pendingUsers[i],
                            busy: _busyUserId == _pendingUsers[i].id,
                            onApprove: () =>
                                _setApproval(_pendingUsers[i], 'approved'),
                            onReject: () => _confirmReject(_pendingUsers[i]),
                          ),
                        ],
                        const SizedBox(height: AppSpacing.lg),
                      ],
                      if (_isAdmin && _missingTook.isNotEmpty) ...[
                        _SectionHeader(
                          title: 'Missing took pre-checks',
                          count: _missingTook.length,
                          trailing: TextButton(
                            onPressed: _copyMissingTookReminder,
                            child: const Text('Copy'),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        _MissingTookCard(people: _missingTook),
                        const SizedBox(height: AppSpacing.lg),
                      ],
                      if (notifications.isNotEmpty) ...[
                        _SectionHeader(
                          title: 'Recent notifications',
                          count: notifications.length,
                          trailing: readCount > 0
                              ? TextButton(
                                  onPressed: _confirmClearRead,
                                  child: const Text('Clear read'),
                                )
                              : null,
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        for (var i = 0; i < notifications.length; i++) ...[
                          if (i > 0) const SizedBox(height: AppSpacing.sm),
                          _NotificationCard(item: notifications[i]),
                        ],
                      ] else if (!_isAdmin || showAdminEmpty)
                        const _EmptyNotificationsCard(),
                    ],
                  ),
                ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.count,
    this.trailing,
  });

  final String title;
  final int count;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: colors.textPrimary,
            ),
          ),
        ),
        Text(
          '$count',
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: colors.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: AppSpacing.xs),
          trailing!,
        ],
      ],
    );
  }
}

class _PendingUserCard extends StatelessWidget {
  const _PendingUserCard({
    required this.person,
    required this.busy,
    required this.onApprove,
    required this.onReject,
  });

  final PendingJoinRequest person;
  final bool busy;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = AppAvailabilityTones.note(isDark: isDark);
    final wash = AppAvailabilityTones.noteBg(isDark: isDark);
    final registered = person.createdAt == null
        ? null
        : '${person.createdAt!.day.toString().padLeft(2, '0')}/'
              '${person.createdAt!.month.toString().padLeft(2, '0')}/'
              '${person.createdAt!.year}';

    return AppCard(
      padding: EdgeInsets.zero,
      color: Color.alphaBlend(
        wash.withValues(alpha: isDark ? 0.45 : 0.7),
        colors.bgElevated,
      ),
      borderColor: accent.withValues(alpha: isDark ? 0.35 : 0.28),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              person.displayName,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.textPrimary,
              ),
            ),
            if (person.email.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xxs),
              Text(
                person.email,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.textSecondary,
                ),
              ),
            ],
            if (registered != null) ...[
              const SizedBox(height: AppSpacing.xxs),
              Text(
                'Registered $registered',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.textTertiary,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : onReject,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colors.danger,
                      side: BorderSide(color: colors.danger),
                    ),
                    child: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : onApprove,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppAvailabilityTones.available(colors),
                      side: BorderSide(
                        color: AppAvailabilityTones.available(colors),
                      ),
                    ),
                    child: const Text('Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MissingTookCard extends StatelessWidget {
  const _MissingTookCard({required this.people});

  final List<MissingTookPrecheck> people;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = AppAvailabilityTones.note(isDark: isDark);
    final wash = AppAvailabilityTones.noteBg(isDark: isDark);

    return AppCard(
      padding: EdgeInsets.zero,
      color: Color.alphaBlend(
        wash.withValues(alpha: isDark ? 0.45 : 0.7),
        colors.bgElevated,
      ),
      borderColor: accent.withValues(alpha: isDark ? 0.35 : 0.28),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'No took pre-check',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.textPrimary,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            for (var i = 0; i < people.length; i++) ...[
              if (i > 0) const SizedBox(height: AppSpacing.xs),
              Text(
                '${people[i].displayName} (${people[i].shiftWindow})',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.textSecondary,
                ),
              ),
            ],
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
    return AppCard(
      surfaceOpacity: AppOpacity.subtle,
      borderColor: colors.borderSubtle,
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Text(
        'No notifications right now.',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: colors.textSecondary,
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
                          // List shows push body only — never "Yard Rota" / "Rota update".
                          item.message.isNotEmpty ? item.message : item.title,
                          style: Theme.of(context).textTheme.titleSmall
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
                  if (item.shiftDetails.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xs),
                    for (var i = 0; i < item.shiftDetails.length; i++) ...[
                      if (i > 0) const SizedBox(height: AppSpacing.xxs),
                      Text(
                        item.shiftDetails[i].label,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colors.textSecondary,
                          fontWeight: FontWeight.w400,
                          height: 1.35,
                        ),
                      ),
                    ],
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
    'warning' || 'break_reminder' || 'precheck_reminder' => _NotificationTone(
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
    'success' || 'rota_assignment_digest' => _NotificationTone(
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
