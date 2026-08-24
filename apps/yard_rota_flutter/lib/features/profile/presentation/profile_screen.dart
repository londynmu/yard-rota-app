import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/models.dart';
import '../../../core/network/my_rota_models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.apiClient,
    required this.session,
    required this.onProfileSaved,
    this.onLogout,
    this.isRequired = false,
  });

  final ApiClient apiClient;
  final UserSession session;
  final ValueChanged<UserProfile> onProfileSaved;
  final Future<void> Function()? onLogout;
  final bool isRequired;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  String _shift = 'day';
  String? _startTime;
  String? _location;
  String? _agencyId;
  String? _avatarUrl;
  bool _loading = true;
  bool _saving = false;
  List<LocationOption> _locations = const [];
  List<AgencyOption> _agencies = const [];
  List<AttendanceHistoryItem> _attendance = const [];
  List<ViolationHistoryItem> _violations = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait<Object>([
        widget.apiClient.getProfile(),
        widget.apiClient.getActiveLocations(),
        widget.apiClient.getActiveAgencies(),
        if (!widget.isRequired) widget.apiClient.getOwnAttendanceHistory(),
        if (!widget.isRequired) widget.apiClient.getOwnViolationHistory(),
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
          _attendance = results[3] as List<AttendanceHistoryItem>;
          _violations = results[4] as List<ViolationHistoryItem>;
        }
      });
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'Could not load your profile. Try again.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
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
      if (mounted) AppToast.show(context, 'Choose an image smaller than 7 MB.');
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
      if (mounted) AppToast.show(context, 'Could not upload the image.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _save() async {
    if (_firstName.text.trim().isEmpty ||
        _lastName.text.trim().isEmpty ||
        _startTime == null ||
        _location == null ||
        _agencyId == null) {
      AppToast.show(context, 'Complete all required profile fields.');
      return;
    }
    setState(() => _saving = true);
    try {
      final profile = await widget.apiClient.updateProfile(
        request: UpdateProfileRequest(
          firstName: _capitalize(_firstName.text),
          lastName: _capitalize(_lastName.text),
          shiftPreference: _shift,
          customStartTime: _startTime!,
          preferredLocation: _location!,
          agencyId: _agencyId!,
          avatarUrl: _avatarUrl,
          completeProfile: widget.isRequired,
        ),
      );
      if (!mounted) return;
      widget.onProfileSaved(profile);
      AppToast.show(
        context,
        widget.isRequired
            ? 'Profile completed and sent for approval.'
            : 'Profile updated successfully.',
      );
      if (!widget.isRequired) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not save your profile.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _capitalize(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return trimmed;
    return '${trimmed[0].toUpperCase()}${trimmed.substring(1)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.isRequired ? null : AppBar(title: const Text('Profile')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  if (widget.isRequired) ...[
                    Text(
                      'Complete your profile',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      'All fields below are required before approval.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: context.appColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],
                  _identityCard(),
                  const SizedBox(height: AppSpacing.md),
                  _preferencesCard(),
                  if (!widget.isRequired) ...[
                    const SizedBox(height: AppSpacing.md),
                    _historyCard(),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  AppButton(
                    label: _saving
                        ? 'Saving...'
                        : widget.isRequired
                        ? 'Complete profile'
                        : 'Save profile',
                    onPressed: _saving ? null : _save,
                  ),
                  if (widget.onLogout != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(
                      label: 'Sign out',
                      variant: AppButtonVariant.ghost,
                      onPressed: _saving ? null : widget.onLogout,
                    ),
                  ],
                ],
              ),
      ),
    );
  }

  Widget _identityCard() {
    final colors = context.appColors;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: AppSpacing.xxxl,
                backgroundColor: colors.infoBg,
                backgroundImage: _avatarUrl == null
                    ? null
                    : NetworkImage(_avatarUrl!),
                child: _avatarUrl == null
                    ? Icon(Icons.person_outline, color: colors.info)
                    : null,
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
                    AppButton(
                      label: 'Change profile photo',
                      variant: AppButtonVariant.secondary,
                      isExpanded: false,
                      onPressed: _saving ? null : _pickAvatar,
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

  Widget _preferencesCard() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Work preferences',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.md),
          _dropdown(
            label: 'Shift preference',
            value: _shift,
            items: const {
              'day': 'Day',
              'afternoon': 'Afternoon',
              'night': 'Night',
            },
            onChanged: (value) => setState(() => _shift = value!),
          ),
          const SizedBox(height: AppSpacing.md),
          _dropdown(
            label: 'Preferred start time',
            value: _startTime,
            items: {
              for (var index = 0; index < 96; index++)
                '${(index ~/ 4).toString().padLeft(2, '0')}:${((index % 4) * 15).toString().padLeft(2, '0')}':
                    '${(index ~/ 4).toString().padLeft(2, '0')}:${((index % 4) * 15).toString().padLeft(2, '0')}',
            },
            onChanged: (value) => setState(() => _startTime = value),
          ),
          const SizedBox(height: AppSpacing.md),
          _dropdown(
            label: 'Preferred location',
            value: _validValue(_location, _locations.map((item) => item.name)),
            items: {for (final item in _locations) item.name: item.name},
            onChanged: (value) => setState(() => _location = value),
          ),
          const SizedBox(height: AppSpacing.md),
          _dropdown(
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

  Widget _dropdown({
    required String label,
    required String? value,
    required Map<String, String> items,
    required ValueChanged<String?> onChanged,
  }) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(labelText: label),
      isExpanded: true,
      items: items.entries
          .map(
            (entry) => DropdownMenuItem<String>(
              value: entry.key,
              child: Text(entry.value, overflow: TextOverflow.ellipsis),
            ),
          )
          .toList(growable: false),
      onChanged: onChanged,
    );
  }

  Widget _historyCard() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Attendance & disciplinary',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.md),
          Text('Attendance', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: AppSpacing.xs),
          if (_attendance.isEmpty)
            const Text('No attendance records.')
          else
            ..._attendance.map(
              (item) => ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(item.status.replaceAll('_', ' ')),
                trailing: Text(item.dateYmd),
              ),
            ),
          const Divider(),
          Text(
            'Disciplinary notes',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: AppSpacing.xs),
          if (_violations.isEmpty)
            const Text('You have no disciplinary notes.')
          else
            ..._violations.map(
              (item) => ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(item.body),
                subtitle: item.category == null ? null : Text(item.category!),
                trailing: Text(
                  '${item.createdAt.day.toString().padLeft(2, '0')}/'
                  '${item.createdAt.month.toString().padLeft(2, '0')}/'
                  '${item.createdAt.year}',
                ),
              ),
            ),
        ],
      ),
    );
  }
}
