import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/models.dart';
import '../../../core/network/my_rota_models.dart';
import '../../../core/network/phone_e164.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/home_wallpaper_storage.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/glass_bar_surface.dart';
import '../../../core/ui/menu_group.dart';
import '../../auth/presentation/auth_scaffold.dart';
import '../../push/push_messaging_service.dart';
import 'delete_account_flow.dart';
import 'account_layout.dart';
import 'profile_option_sheet.dart';

enum _ProfileTab { details, record }

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.apiClient,
    required this.session,
    required this.onProfileSaved,
    this.onLogout,
    this.isRequired = false,
    this.pushMessaging,
    this.lightHomeWallpaper = kDefaultLightHomeWallpaper,
    this.darkHomeWallpaper = DarkHomeWallpaper.nightMesh,
  });

  final ApiClient apiClient;
  final UserSession session;
  final ValueChanged<UserProfile> onProfileSaved;
  final Future<void> Function()? onLogout;
  final bool isRequired;
  final PushMessagingService? pushMessaging;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _phone = TextEditingController();
  late final PushMessagingService _pushMessaging;
  String _shift = 'day';
  String? _startTime;
  String? _location;
  String? _agencyId;
  String? _avatarUrl;
  bool _whatsappOptIn = false;
  bool _loading = true;
  bool _saving = false;
  bool _pushOptIn = true;
  bool _pushBusy = false;
  _ProfileTab _tab = _ProfileTab.details;
  List<LocationOption> _locations = const [];
  List<AgencyOption> _agencies = const [];
  List<AttendanceHistoryItem> _attendance = const [];
  List<ViolationHistoryItem> _violations = const [];

  @override
  void initState() {
    super.initState();
    _pushMessaging = widget.pushMessaging ?? PushMessagingService();
    _load();
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait<Object>([
        widget.apiClient.getProfile(),
        widget.apiClient.getActiveLocations(),
        widget.apiClient.getActiveAgencies(),
        if (!widget.isRequired) widget.apiClient.getOwnMessaging(),
        if (!widget.isRequired) widget.apiClient.getOwnAttendanceHistory(),
        if (!widget.isRequired) widget.apiClient.getOwnViolationHistory(),
        if (!widget.isRequired) _pushMessaging.fetchPushOptIn(),
      ]);
      if (!mounted) return;
      final profile = results[0] as UserProfile;
      _firstName.text = profile.firstName;
      _lastName.text = profile.lastName;
      setState(() {
        _shift = profile.shiftPreference;
        _startTime = profile.customStartTime;
        _location = profile.preferredLocation;
        _agencyId = profile.agencyId;
        _avatarUrl = profile.avatarUrl;
        _locations = results[1] as List<LocationOption>;
        _agencies = results[2] as List<AgencyOption>;
        if (!widget.isRequired) {
          final messaging = results[3] as WhatsAppMessaging;
          _phone.text = messaging.phoneE164 ?? '';
          _whatsappOptIn = messaging.whatsappOptIn;
          _attendance = results[4] as List<AttendanceHistoryItem>;
          _violations = results[5] as List<ViolationHistoryItem>;
          _pushOptIn = results[6] as bool;
        }
      });
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'Could not load your profile. Try again.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _setPushOptIn(bool enabled) async {
    setState(() {
      _pushBusy = true;
      _pushOptIn = enabled;
    });
    try {
      await _pushMessaging.setPushOptIn(enabled);
      if (mounted) {
        AppToast.success(
          context,
          enabled
              ? 'Push notifications enabled.'
              : 'Push notifications disabled.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _pushOptIn = !enabled);
        AppToast.error(context, 'Could not update push settings.');
      }
    } finally {
      if (mounted) setState(() => _pushBusy = false);
    }
  }

  Future<void> _pickAvatar() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;
    final bytes = await picked.readAsBytes();
    if (bytes.length > 7 * 1024 * 1024) {
      if (mounted) {
        AppToast.warning(context, 'Choose an image smaller than 7 MB.');
      }
      return;
    }
    final extension = picked.name.split('.').last.toLowerCase();
    final contentType = switch (extension) {
      'png' => 'image/png',
      'webp' => 'image/webp',
      _ => 'image/jpeg',
    };
    setState(() => _saving = true);
    try {
      final url = await widget.apiClient.uploadAvatar(
        upload: AvatarUpload(
          bytes: bytes,
          fileExtension: extension,
          contentType: contentType,
        ),
      );
      if (mounted) setState(() => _avatarUrl = url);
    } catch (_) {
      if (mounted) AppToast.error(context, 'Could not upload the image.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _save() async {
    if (_firstName.text.trim().isEmpty ||
        _lastName.text.trim().isEmpty ||
        _location == null ||
        _agencyId == null) {
      AppToast.warning(context, 'Complete all required profile fields.');
      return;
    }

    String? normalizedPhone;
    var updateMessaging = false;
    if (!widget.isRequired) {
      try {
        normalizedPhone = normalizePhoneE164(_phone.text);
      } on FormatException catch (error) {
        AppToast.warning(context, error.message);
        return;
      }
      if (_whatsappOptIn && normalizedPhone == null) {
        AppToast.warning(
          context,
          'Add a phone number to enable WhatsApp reminders',
        );
        return;
      }
      updateMessaging = true;
    }

    setState(() => _saving = true);
    try {
      final profile = await widget.apiClient.updateProfile(
        request: UpdateProfileRequest(
          firstName: _capitalize(_firstName.text),
          lastName: _capitalize(_lastName.text),
          shiftPreference: _shift,
          customStartTime: _startTime,
          preferredLocation: _location!,
          agencyId: _agencyId!,
          avatarUrl: _avatarUrl,
          completeProfile: widget.isRequired,
          phoneE164: normalizedPhone,
          whatsappOptIn: updateMessaging
              ? (_whatsappOptIn && normalizedPhone != null)
              : null,
          updateMessaging: updateMessaging,
        ),
      );
      if (!mounted) return;
      widget.onProfileSaved(profile);
      AppToast.success(
        context,
        widget.isRequired
            ? 'Profile completed and sent for approval.'
            : 'Profile updated successfully.',
      );
      if (!widget.isRequired) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) AppToast.error(context, 'Could not save your profile.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteAccount() async {
    final onLogout = widget.onLogout;
    if (onLogout == null) return;
    setState(() => _saving = true);
    final deleted = await confirmAndDeleteAccount(
      context,
      apiClient: widget.apiClient,
      onDeleted: onLogout,
    );
    if (!deleted && mounted) setState(() => _saving = false);
  }

  String _capitalize(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return trimmed;
    return '${trimmed[0].toUpperCase()}${trimmed.substring(1)}';
  }

  /// Soft pre-fill only: day → 06:00, night → 17:00.
  /// Not required — the user can change or clear start time afterward.
  void _onShiftPreferenceChanged(String value) {
    setState(() {
      _shift = value;
      final suggestedStart = switch (value) {
        'day' => '06:00',
        'night' => '17:00',
        _ => null,
      };
      if (suggestedStart != null) {
        _startTime = suggestedStart;
      }
    });
  }

  String get _displayName {
    final name = '${_firstName.text.trim()} ${_lastName.text.trim()}'.trim();
    return name.isEmpty ? 'Your profile' : name;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isRequired) return _buildOnboarding();
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    // Use viewPadding so Scaffold's AppBar inset is not counted twice.
    final topInset =
        mq.viewPadding.top + AppComponentTokens.appBarHeight + AppSpacing.md;
    final wallpaperPath = homeBackgroundAssetPath(
      brightness: isDark ? Brightness.dark : Brightness.light,
      lightWallpaper: widget.lightHomeWallpaper,
      darkWallpaper: widget.darkHomeWallpaper,
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
          'Profile',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
            color: colors.textPrimary,
            letterSpacing: -0.3,
          ),
        ),
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
          MediaQuery.removePadding(
            context: context,
            removeTop: true,
            removeBottom: true,
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _buildProfileBody(
                    context,
                    topInset: topInset,
                    bottomInset: mq.viewPadding.bottom + AppSpacing.lg,
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildProfileBody(
    BuildContext context, {
    required double topInset,
    required double bottomInset,
  }) {
    final colors = context.appColors;
    final hero = AppCard(
      surfaceOpacity: AppOpacity.subtle,
      padding: const EdgeInsets.all(AppSpacing.md),
      child: _hero(),
    );
    final tabs = _tabTrack();
    final detailsActions = <Widget>[
      _detailsCard(),
      const SizedBox(height: AppSpacing.md),
      AppButton(
        label: _saving ? 'Saving...' : 'Save profile',
        onPressed: _saving ? null : _save,
      ),
      if (widget.onLogout != null) ...[
        const SizedBox(height: AppSpacing.sm),
        SizedBox(
          width: double.infinity,
          height: AppComponentTokens.buttonHeightMd,
          child: OutlinedButton(
            onPressed: _saving ? null : _deleteAccount,
            style: OutlinedButton.styleFrom(
              foregroundColor: colors.danger,
              disabledForegroundColor: colors.textTertiary,
              side: BorderSide(
                color: _saving ? colors.borderDefault : colors.danger,
                width: AppStroke.medium,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
            ),
            child: const Text('Delete account'),
          ),
        ),
      ],
    ];
    final mainPane = _tab == _ProfileTab.details
        ? detailsActions
        : <Widget>[_recordCard()];

    // Wide: hero + tabs left; form/record right.
    if (accountIsWideLayout(context)) {
      return Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.lg,
          topInset,
          AppSpacing.lg,
          bottomInset,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 2,
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  hero,
                  const SizedBox(height: AppSpacing.md),
                  tabs,
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              flex: 3,
              child: CustomScrollView(
                slivers: [
                  SliverList.list(children: mainPane),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.lg,
            topInset,
            AppSpacing.lg,
            bottomInset,
          ),
          sliver: SliverList.list(
            children: [
              hero,
              const SizedBox(height: AppSpacing.md),
              tabs,
              const SizedBox(height: AppSpacing.md),
              ...mainPane,
            ],
          ),
        ),
      ],
    );
  }

  /// First screen after the email is confirmed. Uses [AuthScaffold] so it
  /// matches sign-in / register (host still wraps in [AuthTheme] once).
  Widget _buildOnboarding() {
    if (_loading) {
      return const Scaffold(
        backgroundColor: Colors.transparent,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return AuthScaffold(
      title: 'Welcome to Yard Rota',
      subtitle:
          'Complete your profile so an admin can approve your access.',
      icon: Icons.badge_outlined,
      alignToTop: true,
      children: [
        const MenuSectionLabel('Your details'),
        _identityCard(),
        const MenuSectionLabel('Your shifts'),
        _preferencesCard(),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: _saving ? 'Saving...' : 'Complete profile',
          onPressed: _saving ? null : _save,
        ),
        if (widget.onLogout != null) ...[
          const SizedBox(height: AppSpacing.xl),
          MenuGroup(
            children: [
              MenuTile(
                icon: Icons.logout,
                title: 'Sign out',
                subtitle: 'Finish your profile later',
                onTap: _saving ? null : widget.onLogout,
              ),
              MenuTile(
                icon: Icons.delete_outline_rounded,
                title: 'Delete account',
                subtitle: 'Permanently remove your account and data',
                isDestructive: true,
                onTap: _saving ? null : _deleteAccount,
              ),
            ],
          ),
        ],
      ],
    );
  }

  double? get _cardOpacity => widget.isRequired ? AppOpacity.subtle : null;

  Widget _hero() {
    final colors = context.appColors;
    final textTheme = Theme.of(context).textTheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: _saving ? null : _pickAvatar,
            customBorder: const CircleBorder(),
            child: CircleAvatar(
              radius: AppSpacing.xxxl,
              backgroundColor: colors.infoBg,
              backgroundImage:
                  _avatarUrl == null ? null : NetworkImage(_avatarUrl!),
              child: _avatarUrl == null
                  ? Icon(Icons.person_outline, color: colors.info, size: 36)
                  : null,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: colors.textPrimary,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                'Tap photo to change',
                style: textTheme.bodySmall?.copyWith(
                  color: colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _tabTrack() {
    final colors = context.appColors;
    return Container(
      height: AppHomeTabs.segmentHeight + AppHomeTabs.trackPadding * 2,
      padding: const EdgeInsets.all(AppHomeTabs.trackPadding),
      decoration: BoxDecoration(
        color: colors.bgPrimary.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(
          color: colors.borderDefault.withValues(alpha: 0.45),
          width: AppStroke.thin,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: _ProfileTabChip(
              label: 'My details',
              selected: _tab == _ProfileTab.details,
              onTap: () => setState(() => _tab = _ProfileTab.details),
            ),
          ),
          Expanded(
            child: _ProfileTabChip(
              label: 'My record',
              selected: _tab == _ProfileTab.record,
              onTap: () => setState(() => _tab = _ProfileTab.record),
            ),
          ),
        ],
      ),
    );
  }

  Widget _detailsCard() {
    return AppCard(
      surfaceOpacity: AppOpacity.subtle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppTextField(label: 'First name', controller: _firstName),
          const SizedBox(height: AppSpacing.md),
          AppTextField(label: 'Last name', controller: _lastName),
          const SizedBox(height: AppSpacing.md),
          ProfileOptionField(
            label: 'Shift preference',
            value: _shift,
            items: const {
              'day': 'Day',
              'afternoon': 'Afternoon',
              'night': 'Night',
            },
            onChanged: (value) {
              if (value != null) _onShiftPreferenceChanged(value);
            },
          ),
          const SizedBox(height: AppSpacing.md),
          ProfileOptionField(
            label: 'Start time',
            value: _startTime,
            allowClear: true,
            placeholder: 'Optional',
            items: {
              for (var index = 0; index < 96; index++)
                '${(index ~/ 4).toString().padLeft(2, '0')}:${((index % 4) * 15).toString().padLeft(2, '0')}':
                    '${(index ~/ 4).toString().padLeft(2, '0')}:${((index % 4) * 15).toString().padLeft(2, '0')}',
            },
            onChanged: (value) => setState(() => _startTime = value),
          ),
          const SizedBox(height: AppSpacing.md),
          ProfileOptionField(
            label: 'Location',
            value: _validValue(_location, _locations.map((item) => item.name)),
            items: {for (final item in _locations) item.name: item.name},
            onChanged: (value) => setState(() => _location = value),
          ),
          const SizedBox(height: AppSpacing.md),
          ProfileOptionField(
            label: 'Agency',
            value: _validValue(_agencyId, _agencies.map((item) => item.id)),
            items: {for (final item in _agencies) item.id: item.name},
            onChanged: (value) => setState(() => _agencyId = value),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Phone (WhatsApp)',
            controller: _phone,
            keyboardType: TextInputType.phone,
            hint: '+447…',
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Phone is required so we can confirm your shifts and send '
            'operational reminders about PreCheck and breaks. UK numbers OK '
            'as 07… or +44….',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: context.appColors.textSecondary,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          _whatsappToggle(),
          const SizedBox(height: AppSpacing.md),
          _pushNotificationsToggle(),
        ],
      ),
    );
  }

  Widget _identityCard() {
    final colors = context.appColors;
    return AppCard(
      surfaceOpacity: _cardOpacity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: _saving ? null : _pickAvatar,
                  customBorder: const CircleBorder(),
                  child: CircleAvatar(
                    radius: AppSpacing.xxxl,
                    backgroundColor: colors.infoBg,
                    backgroundImage: _avatarUrl == null
                        ? null
                        : NetworkImage(_avatarUrl!),
                    child: _avatarUrl == null
                        ? Icon(Icons.person_outline, color: colors.info)
                        : null,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.session.email,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      'Tap photo to change · Optional, max 7MB',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(label: 'First name', controller: _firstName),
          const SizedBox(height: AppSpacing.md),
          AppTextField(label: 'Last name', controller: _lastName),
        ],
      ),
    );
  }

  Widget _whatsappToggle() {
    final colors = context.appColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.bgSecondary.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: colors.borderDefault, width: AppStroke.thin),
      ),
      child: SwitchListTile.adaptive(
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
        title: Text(
          'WhatsApp reminders',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(
          _whatsappOptIn
              ? 'On — you get WhatsApp notifications.'
              : 'Off — you will not get WhatsApp notifications.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: colors.textSecondary,
          ),
        ),
        value: _whatsappOptIn,
        onChanged: _saving
            ? null
            : (value) => setState(() => _whatsappOptIn = value),
      ),
    );
  }

  Widget _pushNotificationsToggle() {
    final colors = context.appColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.bgSecondary.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: colors.borderDefault, width: AppStroke.thin),
      ),
      child: SwitchListTile.adaptive(
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
        title: Text(
          'Push notifications',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(
          _pushOptIn
              ? 'On — break reminders on this device.'
              : 'Off — you will not get break push alerts.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: colors.textSecondary,
          ),
        ),
        value: _pushOptIn,
        onChanged: (_saving || _pushBusy) ? null : _setPushOptIn,
      ),
    );
  }

  Widget _preferencesCard() {
    return AppCard(
      surfaceOpacity: _cardOpacity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProfileOptionField(
            label: 'Shift preference',
            value: _shift,
            items: const {
              'day': 'Day',
              'afternoon': 'Afternoon',
              'night': 'Night',
            },
            onChanged: (value) {
              if (value != null) _onShiftPreferenceChanged(value);
            },
          ),
          const SizedBox(height: AppSpacing.md),
          ProfileOptionField(
            label: 'Preferred start time',
            value: _startTime,
            allowClear: true,
            placeholder: 'Optional',
            items: {
              for (var index = 0; index < 96; index++)
                '${(index ~/ 4).toString().padLeft(2, '0')}:${((index % 4) * 15).toString().padLeft(2, '0')}':
                    '${(index ~/ 4).toString().padLeft(2, '0')}:${((index % 4) * 15).toString().padLeft(2, '0')}',
            },
            onChanged: (value) => setState(() => _startTime = value),
          ),
          const SizedBox(height: AppSpacing.md),
          ProfileOptionField(
            label: 'Preferred location',
            value: _validValue(_location, _locations.map((item) => item.name)),
            items: {for (final item in _locations) item.name: item.name},
            onChanged: (value) => setState(() => _location = value),
          ),
          const SizedBox(height: AppSpacing.md),
          ProfileOptionField(
            label: 'Agency',
            value: _validValue(_agencyId, _agencies.map((item) => item.id)),
            items: {for (final item in _agencies) item.id: item.name},
            onChanged: (value) => setState(() => _agencyId = value),
          ),
        ],
      ),
    );
  }

  String? _validValue(String? value, Iterable<String> options) {
    return value != null && options.contains(value) ? value : null;
  }

  Widget _recordCard() {
    final colors = context.appColors;
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          surfaceOpacity: AppOpacity.subtle,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Attendance',
                style: textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: colors.textPrimary,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              if (_attendance.isEmpty)
                Text(
                  'No attendance records.',
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.textSecondary,
                  ),
                )
              else
                ..._attendance.map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                    child: Row(
                      children: [
                        Text(
                          item.dateYmd,
                          style: textTheme.bodySmall?.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Text(
                            item.status.replaceAll('_', ' '),
                            style: textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                              color: colors.textPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppCard(
          surfaceOpacity: AppOpacity.subtle,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Notes from management',
                style: textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: colors.textPrimary,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              if (_violations.isEmpty)
                Text(
                  'No notes yet.',
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.textSecondary,
                  ),
                )
              else
                ..._violations.map((item) {
                  final categoryLabel = _violationCategoryLabel(item.category);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: colors.bgSecondary.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(AppRadius.md),
                        border: Border.all(
                          color: colors.borderDefault,
                          width: AppStroke.thin,
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.sm),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              [
                                '${item.createdAt.day.toString().padLeft(2, '0')}/'
                                    '${item.createdAt.month.toString().padLeft(2, '0')}/'
                                    '${item.createdAt.year}',
                                ?categoryLabel,
                              ].join(' · '),
                              style: textTheme.bodySmall?.copyWith(
                                color: colors.textSecondary,
                              ),
                            ),
                            const SizedBox(height: AppSpacing.xs),
                            Text(
                              item.body,
                              style: textTheme.bodyMedium?.copyWith(
                                color: colors.textPrimary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  String? _violationCategoryLabel(String? category) {
    return switch (category) {
      'trailer_check' => 'Trailer not checked',
      'radio' => 'Not listening to radio',
      'other' => 'Other',
      null || '' => null,
      _ => category,
    };
  }
}

class _ProfileTabChip extends StatelessWidget {
  const _ProfileTabChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Material(
      color: selected ? colors.bgElevated : Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadius.full),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.full),
        child: Center(
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              color: selected ? colors.textPrimary : colors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
