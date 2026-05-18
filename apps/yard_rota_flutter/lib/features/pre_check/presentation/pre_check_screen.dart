import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_toast.dart';
import '../data/pre_check_repository.dart';
import '../domain/pre_check_models.dart';

class PreCheckScreen extends StatefulWidget {
  const PreCheckScreen({
    super.key,
    required this.repository,
    required this.session,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
  });

  final PreCheckRepository repository;
  final UserSession session;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;

  @override
  State<PreCheckScreen> createState() => _PreCheckScreenState();
}

class _PreCheckScreenState extends State<PreCheckScreen> {
  final ImagePicker _imagePicker = ImagePicker();
  final Map<String, GlobalKey> _itemKeys = <String, GlobalKey>{};

  PreCheckStep _step = PreCheckStep.select;
  PreCheckInitialData? _initialData;
  List<PreCheckTug> _tugs = const <PreCheckTug>[];
  List<PreCheckItemDefinition> _items = const <PreCheckItemDefinition>[];
  Map<String, List<PreCheckKnownDefect>> _defectsByItem =
      const <String, List<PreCheckKnownDefect>>{};
  PreCheckDraft _draft = PreCheckDraft(formSessionId: _newId());
  PreCheckTug? _selectedTug;
  PreCheckSubmissionSummary? _lastSubmission;
  PreCheckType? _lastSubmitType;
  PreCheckSchemaStatus _schemaStatus = PreCheckSchemaStatus.checking;
  bool _remarksEnabled = true;
  bool _loading = true;
  bool _submitting = false;
  bool _showValidationWarning = false;
  String? _errorMessage;
  String _duringShiftDescription = '';
  List<PreCheckPhoto> _duringShiftPhotos = const <PreCheckPhoto>[];

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });
    try {
      await widget.repository.flushQueue();
      final results = await Future.wait<dynamic>([
        widget.repository.loadInitial(userId: widget.session.userId),
        widget.repository.fetchActiveTugs(),
        widget.repository.fetchCheckItems(),
        widget.repository.schemaStatus(),
        widget.repository.remarksEnabled(),
        widget.repository.readDraft(),
      ]);
      final initial = results[0] as PreCheckInitialData;
      final tugs = results[1] as List<PreCheckTug>;
      final savedDraft = results[5] as PreCheckDraft?;
      setState(() {
        _initialData = initial;
        _tugs = tugs;
        _items = results[2] as List<PreCheckItemDefinition>;
        _schemaStatus = results[3] as PreCheckSchemaStatus;
        _remarksEnabled = results[4] as bool;
        if (savedDraft != null && savedDraft.formSessionId.isNotEmpty) {
          _draft = savedDraft;
        }
        _step = initial.shiftChecks.isNotEmpty
            ? PreCheckStep.completed
            : PreCheckStep.select;
      });
    } catch (error) {
      setState(() {
        _errorMessage = 'PreCheck could not be loaded. Please retry.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _startCheck(PreCheckTug tug) async {
    setState(() {
      _loading = true;
      _selectedTug = tug;
      _defectsByItem = const <String, List<PreCheckKnownDefect>>{};
    });
    try {
      final defects = await widget.repository.fetchKnownDefects(tug.id);
      setState(() {
        _defectsByItem = defects;
        _step = PreCheckStep.form;
        _showValidationWarning = false;
      });
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'Known defects could not be loaded.');
      }
      setState(() {
        _step = PreCheckStep.form;
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _scanQr() async {
    final token = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(builder: (context) => const _QrScannerScreen()),
    );
    if (token == null || token.isEmpty) {
      return;
    }
    try {
      final tug = await widget.repository.fetchTugByQrToken(token);
      if (tug == null) {
        if (mounted) {
          AppToast.show(context, 'Invalid or inactive QR code.');
        }
        return;
      }
      await _startCheck(tug);
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'QR code could not be resolved.');
      }
    }
  }

  Future<void> _persistDraft(PreCheckDraft draft) async {
    setState(() {
      _draft = draft;
    });
    await widget.repository.writeDraft(draft);
  }

  Future<void> _submitPreShift() async {
    final validation = validatePreCheckDraft(
      items: _items,
      draft: _draft,
      defectsByItem: _defectsByItem,
    );
    if (!validation.isValid) {
      setState(() {
        _showValidationWarning = true;
      });
      final key = validation.firstInvalidItemKey;
      if (key != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final context = _itemKeys[key]?.currentContext;
          if (context != null) {
            Scrollable.ensureVisible(
              context,
              duration: AppMotion.normal,
              curve: AppMotion.emphasized,
              alignment: 0.2,
            );
          }
        });
      }
      return;
    }
    if (_schemaStatus == PreCheckSchemaStatus.mismatch) {
      AppToast.show(context, 'Please update the app before submitting.');
      return;
    }
    final tug = _selectedTug;
    if (tug == null) {
      AppToast.show(context, 'Please select a tug.');
      return;
    }
    setState(() {
      _submitting = true;
    });
    try {
      final submission = await widget.repository.submitPreShift(
        userId: widget.session.userId,
        tug: tug,
        items: _items,
        defectsByItem: _defectsByItem,
        draft: _draft,
        remarksEnabled: _remarksEnabled,
      );
      setState(() {
        _lastSubmission = submission;
        _lastSubmitType = PreCheckType.preShift;
        _initialData = _initialDataWithSubmission(submission);
        _step = PreCheckStep.success;
        _draft = PreCheckDraft(formSessionId: _newId());
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  Future<void> _submitDuringShift() async {
    final tug = _selectedTug;
    if (tug == null) {
      return;
    }
    if (_duringShiftDescription.trim().isEmpty) {
      AppToast.show(context, 'Please describe what happened.');
      return;
    }
    setState(() {
      _submitting = true;
    });
    try {
      final submission = await widget.repository.submitDuringShift(
        userId: widget.session.userId,
        tug: tug,
        description: _duringShiftDescription,
        photos: _duringShiftPhotos,
      );
      setState(() {
        _lastSubmission = submission;
        _lastSubmitType = PreCheckType.duringShift;
        _duringShiftDescription = '';
        _duringShiftPhotos = const <PreCheckPhoto>[];
        _step = PreCheckStep.success;
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  Future<void> _syncNow() async {
    try {
      await widget.repository.flushQueue();
      final status = await widget.repository.queueStatus();
      setState(() {
        _initialData = PreCheckInitialData(
          userLocationId: _initialData?.userLocationId,
          shiftChecks: _initialData?.shiftChecks ?? const [],
          duringShiftDamageEnabled:
              _initialData?.duringShiftDamageEnabled ?? true,
          queueStatus: status,
        );
      });
      if (mounted) {
        AppToast.show(context, 'PreCheck queue synced.');
      }
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'PreCheck sync failed.');
      }
    }
  }

  PreCheckInitialData _initialDataWithSubmission(
    PreCheckSubmissionSummary submission,
  ) {
    final current = _initialData;
    final shiftChecks = current?.shiftChecks ?? const [];
    final exists = shiftChecks.any((check) => check.id == submission.id);
    final nextChecks = exists
        ? shiftChecks
        : <PreCheckSubmissionSummary>[submission, ...shiftChecks];
    return PreCheckInitialData(
      userLocationId: current?.userLocationId,
      shiftChecks: nextChecks,
      duringShiftDamageEnabled: current?.duringShiftDamageEnabled ?? true,
      queueStatus: current?.queueStatus ?? const PreCheckQueueStatus(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final colors = context.appColors;
    final mq = MediaQuery.of(context);
    final topInset = mq.padding.top + kToolbarHeight;

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('PreCheck'),
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
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
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: Image.asset(
              homeBackgroundAssetPath(
                brightness: isDark ? Brightness.dark : Brightness.light,
                lightWallpaper: widget.lightHomeWallpaper,
                darkWallpaper: widget.darkHomeWallpaper,
              ),
              fit: BoxFit.cover,
            ),
          ),
          Positioned.fill(
            child: SafeArea(
              top: false,
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  topInset,
                  AppSpacing.lg,
                  mq.padding.bottom + AppSpacing.lg,
                ),
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _buildBody(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_errorMessage != null) {
      return _MessageCard(
        title: 'PreCheck unavailable',
        message: _errorMessage!,
        actionLabel: 'Retry',
        onAction: _bootstrap,
      );
    }
    return switch (_step) {
      PreCheckStep.select => _buildSelect(),
      PreCheckStep.form => _buildForm(),
      PreCheckStep.completed => _buildCompleted(),
      PreCheckStep.duringShift => _buildDuringShift(),
      PreCheckStep.success => _buildSuccess(),
    };
  }

  Widget _buildSelect() {
    final tugs = _tugs;

    return ListView(
      children: [
        _QueueBanner(status: _initialData?.queueStatus, onSync: _syncNow),
        const SizedBox(height: AppSpacing.md),
        _PreCheckSolidButton(label: 'Scan QR Code', onPressed: _scanQr),
        const SizedBox(height: AppSpacing.md),
        Text('Select Tug', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: AppSpacing.md),
        if (tugs.isEmpty)
          const _MessageCard(
            title: 'No tugs available',
            message: 'There are no active tugs available right now.',
          )
        else
          ...tugs.map(
            (tug) => Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: _TugCard(tug: tug, onStart: () => _startCheck(tug)),
            ),
          ),
      ],
    );
  }

  Widget _buildCompleted() {
    final checks =
        _initialData?.shiftChecks ?? const <PreCheckSubmissionSummary>[];
    return ListView(
      children: [
        _QueueBanner(status: _initialData?.queueStatus, onSync: _syncNow),
        const SizedBox(height: AppSpacing.md),
        _ToneCard(
          tone: _Tone.success,
          child: Column(
            children: [
              for (var i = 0; i < checks.length; i++)
                _CompletedRow(
                  check: checks[i],
                  showDivider: i > 0,
                  damageEnabled: _initialData?.duringShiftDamageEnabled ?? true,
                  onReportDamage: () {
                    _selectedTug = PreCheckTug(
                      id: checks[i].tugId,
                      tugNumber: checks[i].tugNumber,
                      displayName: checks[i].tugDisplayName,
                    );
                    setState(() => _step = PreCheckStep.duringShift);
                  },
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        _PreCheckSolidButton(
          label: 'Check Another Tug',
          onPressed: () => setState(() {
            _selectedTug = null;
            _step = PreCheckStep.select;
          }),
        ),
      ],
    );
  }

  Widget _buildForm() {
    final tug = _selectedTug;
    if (tug == null) {
      return _MessageCard(
        title: 'No tug selected',
        message: 'Please go back and select a tug.',
        actionLabel: 'Select Tug',
        onAction: () => setState(() => _step = PreCheckStep.select),
      );
    }
    final outside = _items.where((item) => item.category == 'outside').toList();
    final inside = _items.where((item) => item.category == 'inside').toList();
    final progress = calculatePreCheckProgress(
      items: _items,
      draft: _draft,
      defectsByItem: _defectsByItem,
    );
    final validation = validatePreCheckDraft(
      items: _items,
      draft: _draft,
      defectsByItem: _defectsByItem,
    );

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _QueueBanner(status: _initialData?.queueStatus, onSync: _syncNow),
              if (_schemaStatus == PreCheckSchemaStatus.mismatch) ...[
                const SizedBox(height: AppSpacing.sm),
                const _WarningCard(
                  title: 'Your app is outdated',
                  message:
                      'Please update the app before submitting this PreCheck.',
                ),
              ] else if (_schemaStatus == PreCheckSchemaStatus.error) ...[
                const SizedBox(height: AppSpacing.sm),
                const _WarningCard(
                  title: 'Version check unavailable',
                  message:
                      'The latest form version could not be verified. Your current form will be used.',
                ),
              ],
              const SizedBox(height: AppSpacing.sm),
            ],
          ),
        ),
        SliverPersistentHeader(
          pinned: true,
          delegate: _StickyHeaderDelegate(
            child: _TugHeader(
              tug: tug,
              progress: progress,
              onChangeTug: () {
                setState(() {
                  _selectedTug = null;
                  _step = PreCheckStep.select;
                });
              },
            ),
          ),
        ),
        SliverList.list(
          children: [
            const SizedBox(height: AppSpacing.lg),
            _buildSection('Outside Check', outside),
            const SizedBox(height: AppSpacing.lg),
            _buildSection('Inside Check', inside),
            if (_remarksEnabled) ...[
              const SizedBox(height: AppSpacing.lg),
              _RemarksCard(
                remarks: _draft.remarks,
                photos: _draft.remarksPhotos,
                onRemarksChanged: (value) =>
                    _persistDraft(_draft.copyWith(remarks: value)),
                onAddPhoto: () => _addPhotos(
                  current: _draft.remarksPhotos,
                  maxImages: 3,
                  source: ImageSource.gallery,
                  onChanged: (photos) =>
                      _persistDraft(_draft.copyWith(remarksPhotos: photos)),
                ),
                onTakePhoto: () => _addPhotos(
                  current: _draft.remarksPhotos,
                  maxImages: 3,
                  source: ImageSource.camera,
                  onChanged: (photos) =>
                      _persistDraft(_draft.copyWith(remarksPhotos: photos)),
                ),
                onRemovePhoto: (photo) => _persistDraft(
                  _draft.copyWith(
                    remarksPhotos: _draft.remarksPhotos
                        .where((entry) => entry.id != photo.id)
                        .toList(),
                  ),
                ),
              ),
            ],
            if (_showValidationWarning && !validation.isValid) ...[
              const SizedBox(height: AppSpacing.lg),
              _ValidationWarning(result: validation),
            ],
            const SizedBox(height: AppSpacing.lg),
            _PreCheckSolidButton(
              label: _submitting ? 'Submitting...' : 'Submit Pre-Shift Check',
              onPressed: _submitting ? null : _submitPreShift,
            ),
            const SizedBox(height: AppSpacing.giant),
          ],
        ),
      ],
    );
  }

  Widget _buildSection(String title, List<PreCheckItemDefinition> items) {
    final progress = calculatePreCheckProgress(
      items: items,
      draft: _draft,
      defectsByItem: _defectsByItem,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(title, style: Theme.of(context).textTheme.titleLarge),
            ),
            Text(
              '${progress.checked}/${progress.total}',
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: context.appColors.textSecondary,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        for (final item in items)
          Padding(
            key: _itemKeys.putIfAbsent(item.key, GlobalKey.new),
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: _CheckItemCard(
              item: item,
              draft: _draft,
              defects:
                  _defectsByItem[item.key] ?? const <PreCheckKnownDefect>[],
              onDraftChanged: _persistDraft,
              onAddPhoto: (stateKey, source) =>
                  _addItemPhoto(item, stateKey, source),
            ),
          ),
      ],
    );
  }

  Widget _buildDuringShift() {
    final tug = _selectedTug;
    if (tug == null) {
      return const _MessageCard(
        title: 'No tug selected',
        message: 'Please select a tug before reporting damage.',
      );
    }
    if (!(_initialData?.duringShiftDamageEnabled ?? true)) {
      return _MessageCard(
        title: 'Damage reporting disabled',
        message:
            'Damage reporting is currently disabled by admin. Please contact your supervisor.',
        actionLabel: 'Back',
        onAction: () => setState(() => _step = PreCheckStep.completed),
      );
    }
    return ListView(
      children: [
        _ToneCard(
          tone: _Tone.danger,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Damage Report for ${tug.label}',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: context.appColors.danger,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                minLines: 3,
                maxLines: 6,
                decoration: const InputDecoration(
                  labelText: 'What happened? *',
                  hintText: 'Describe the damage or incident...',
                ),
                onChanged: (value) => _duringShiftDescription = value,
              ),
              const SizedBox(height: AppSpacing.md),
              _PhotoActions(
                photos: _duringShiftPhotos,
                maxImages: 5,
                onTakePhoto: () => _addPhotos(
                  current: _duringShiftPhotos,
                  maxImages: 5,
                  source: ImageSource.camera,
                  onChanged: (photos) =>
                      setState(() => _duringShiftPhotos = photos),
                ),
                onAddGallery: () => _addPhotos(
                  current: _duringShiftPhotos,
                  maxImages: 5,
                  source: ImageSource.gallery,
                  onChanged: (photos) =>
                      setState(() => _duringShiftPhotos = photos),
                ),
                onRemove: (photo) => setState(
                  () => _duringShiftPhotos = _duringShiftPhotos
                      .where((entry) => entry.id != photo.id)
                      .toList(),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              _PreCheckSolidButton(
                label: _submitting ? 'Submitting...' : 'Submit Damage Report',
                tone: _Tone.danger,
                onPressed: _submitting ? null : _submitDuringShift,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSuccess() {
    final submission = _lastSubmission;
    final queued = submission?.queued ?? false;
    final isDamageReport = _lastSubmitType == PreCheckType.duringShift;
    final tugLabel = submission?.tugLabel ?? _selectedTug?.label ?? 'this tug';
    final title = isDamageReport
        ? (queued
              ? 'Damage report saved offline'
              : 'Thank you for reporting the damage')
        : (queued
              ? 'PreCheck saved offline for $tugLabel'
              : 'PreCheck completed for $tugLabel');
    final message = isDamageReport
        ? (queued
              ? 'The report for $tugLabel will upload automatically when you are online.'
              : 'The damage report for $tugLabel has been submitted successfully.')
        : (queued
              ? 'Upload will resume automatically when you are online.'
              : 'The check has been submitted successfully.');
    final primaryLabel = isDamageReport
        ? "Back to today's checks"
        : "Back to today's checks";

    return ListView(
      children: [
        _ToneCard(
          tone: queued ? _Tone.warning : _Tone.success,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: AppSpacing.sm),
              Text(message),
              const SizedBox(height: AppSpacing.lg),
              _PreCheckSolidButton(
                label: primaryLabel,
                onPressed: () => setState(() {
                  _lastSubmission = null;
                  _lastSubmitType = null;
                  if (isDamageReport) {
                    _step = _initialData?.shiftChecks.isNotEmpty ?? false
                        ? PreCheckStep.completed
                        : PreCheckStep.select;
                  } else {
                    _selectedTug = null;
                    _step = PreCheckStep.completed;
                  }
                }),
              ),
              const SizedBox(height: AppSpacing.sm),
              if (!isDamageReport) ...[
                _PreCheckSolidButton(
                  label: 'Check Another Tug',
                  onPressed: () => setState(() {
                    _lastSubmission = null;
                    _lastSubmitType = null;
                    _selectedTug = null;
                    _step = PreCheckStep.select;
                  }),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
              _PreCheckSolidButton(
                label: 'Back',
                onPressed: () => Navigator.of(context).maybePop(),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _addItemPhoto(
    PreCheckItemDefinition item,
    String stateKey,
    ImageSource source,
  ) async {
    final current =
        _draft.itemStates[stateKey]?.photos ?? const <PreCheckPhoto>[];
    await _addPhotos(
      current: current,
      maxImages: 2,
      source: source,
      onChanged: (photos) {
        final states = Map<String, PreCheckItemState>.from(_draft.itemStates);
        states[stateKey] = (states[stateKey] ?? const PreCheckItemState())
            .copyWith(photos: photos);
        _persistDraft(_draft.copyWith(itemStates: states));
      },
    );
  }

  Future<void> _addPhotos({
    required List<PreCheckPhoto> current,
    required int maxImages,
    required ImageSource source,
    required ValueChanged<List<PreCheckPhoto>> onChanged,
  }) async {
    if (current.length >= maxImages) {
      AppToast.show(context, 'Maximum $maxImages images allowed.');
      return;
    }
    try {
      final picked = source == ImageSource.camera
          ? await _imagePicker.pickImage(
              source: ImageSource.camera,
              imageQuality: 70,
              maxWidth: 1200,
            )
          : await _imagePicker.pickImage(
              source: ImageSource.gallery,
              imageQuality: 70,
              maxWidth: 1200,
            );
      if (picked == null) {
        return;
      }
      final next = <PreCheckPhoto>[
        ...current,
        PreCheckPhoto(
          id: _newId(),
          path: picked.path,
          name: picked.name,
          contentType: picked.mimeType ?? 'image/jpeg',
        ),
      ];
      onChanged(next);
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'Unable to open camera or gallery.');
      }
    }
  }
}

class _CheckItemCard extends StatefulWidget {
  const _CheckItemCard({
    required this.item,
    required this.draft,
    required this.defects,
    required this.onDraftChanged,
    required this.onAddPhoto,
  });

  final PreCheckItemDefinition item;
  final PreCheckDraft draft;
  final List<PreCheckKnownDefect> defects;
  final ValueChanged<PreCheckDraft> onDraftChanged;
  final void Function(String stateKey, ImageSource source) onAddPhoto;

  @override
  State<_CheckItemCard> createState() => _CheckItemCardState();
}

class _CheckItemCardState extends State<_CheckItemCard> {
  bool _showKnownDefectActions = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final hasDefects = widget.defects.isNotEmpty;
    final effective = effectiveStatusForItem(
      item: widget.item,
      draft: widget.draft,
      defectsByItem: {widget.item.key: widget.defects},
    );
    final state =
        widget.draft.itemStates[widget.item.key] ?? const PreCheckItemState();

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.bgElevated.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(
          color: effective == PreCheckItemStatus.repairNeeded
              ? colors.danger.withValues(alpha: 0.5)
              : hasDefects
              ? colors.warning.withValues(alpha: 0.5)
              : colors.borderDefault,
          width: AppStroke.medium,
        ),
        boxShadow: [
          BoxShadow(
            color: colors.shadow.withValues(alpha: 0.12),
            blurRadius: AppElevation.level4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppPreCheckCard.cardPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.item.label,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (widget.item.tooltip?.isNotEmpty ?? false) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                widget.item.tooltip!,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: colors.textSecondary),
              ),
            ],
            if (hasDefects) ...[
              const SizedBox(height: AppSpacing.md),
              ...widget.defects.map(_knownDefectPanel),
            ],
            const SizedBox(height: AppSpacing.md),
            if (hasDefects && !_showKnownDefectActions)
              Row(
                children: [
                  Expanded(
                    child: _ActionPill(
                      label: 'Fixed?',
                      tone: _Tone.success,
                      onTap: () => _markAllFixed(),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: _ActionPill(
                      label: 'Still exists',
                      tone: _Tone.warning,
                      onTap: () =>
                          setState(() => _showKnownDefectActions = true),
                    ),
                  ),
                ],
              )
            else if (hasDefects)
              _knownDefectActions()
            else
              _standardActions(state),
            if (effective == PreCheckItemStatus.repairNeeded &&
                state.linkedDamageId == null)
              _IssueDetails(
                stateKey: widget.item.key,
                state: state,
                onNotesChanged: (value) =>
                    _updateState(widget.item.key, state.copyWith(notes: value)),
                onTakePhoto: () =>
                    widget.onAddPhoto(widget.item.key, ImageSource.camera),
                onAddGallery: () =>
                    widget.onAddPhoto(widget.item.key, ImageSource.gallery),
                onRemovePhoto: (photo) => _updateState(
                  widget.item.key,
                  state.copyWith(
                    photos: state.photos
                        .where((entry) => entry.id != photo.id)
                        .toList(),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _knownDefectPanel(PreCheckKnownDefect defect) {
    final colors = context.appColors;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.bgSecondary.withValues(alpha: 0.74),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: colors.warning.withValues(alpha: 0.34)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Known defect',
            style: Theme.of(
              context,
            ).textTheme.labelLarge?.copyWith(color: colors.warning),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'On ${defect.dateLabel}, ${defect.reporterName} reported: ${defect.description}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (defect.imageUrls.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.md),
              child: Image.network(
                defect.imageUrls.first,
                fit: BoxFit.cover,
                height: 120,
                width: double.infinity,
                errorBuilder: (context, error, stackTrace) =>
                    const SizedBox.shrink(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _knownDefectActions() {
    if (widget.defects.length >= 2) {
      final newKey = '${widget.item.key}::new';
      final newState =
          widget.draft.itemStates[newKey] ?? const PreCheckItemState();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final defect in widget.defects)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Row(
                children: [
                  Expanded(
                    child: _ActionPill(
                      label: 'Fixed?',
                      tone: _Tone.success,
                      onTap: () => _markFixed(defect.id),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: _ActionPill(
                      label: 'Same problem',
                      tone: _Tone.warning,
                      onTap: () => _sameProblem(defect),
                    ),
                  ),
                ],
              ),
            ),
          _ActionPill(
            label: 'New problem',
            tone: _Tone.danger,
            onTap: () => _updateState(
              newKey,
              newState.copyWith(
                status: PreCheckItemStatus.repairNeeded,
                clearLinkedDamageId: true,
              ),
            ),
          ),
          if (newState.status == PreCheckItemStatus.repairNeeded)
            _IssueDetails(
              stateKey: newKey,
              state: newState,
              onNotesChanged: (value) =>
                  _updateState(newKey, newState.copyWith(notes: value)),
              onTakePhoto: () => widget.onAddPhoto(newKey, ImageSource.camera),
              onAddGallery: () =>
                  widget.onAddPhoto(newKey, ImageSource.gallery),
              onRemovePhoto: (photo) => _updateState(
                newKey,
                newState.copyWith(
                  photos: newState.photos
                      .where((entry) => entry.id != photo.id)
                      .toList(),
                ),
              ),
            ),
        ],
      );
    }
    final defect = widget.defects.first;
    return Row(
      children: [
        Expanded(
          child: _ActionPill(
            label: 'Same problem',
            tone: _Tone.warning,
            onTap: () => _sameProblem(defect),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: _ActionPill(
            label: 'New problem',
            tone: _Tone.danger,
            onTap: () {
              final state =
                  widget.draft.itemStates[widget.item.key] ??
                  const PreCheckItemState();
              _updateState(
                widget.item.key,
                state.copyWith(
                  status: PreCheckItemStatus.repairNeeded,
                  clearLinkedDamageId: true,
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _standardActions(PreCheckItemState state) {
    return Row(
      children: [
        Expanded(
          child: _ActionPill(
            label: 'Issue',
            tone: _Tone.danger,
            selected: state.status == PreCheckItemStatus.repairNeeded,
            onTap: () => _updateState(
              widget.item.key,
              state.copyWith(
                status: state.status == PreCheckItemStatus.repairNeeded
                    ? PreCheckItemStatus.ok
                    : PreCheckItemStatus.repairNeeded,
                clearLinkedDamageId: true,
              ),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: _ActionPill(
            label: 'N/A',
            tone: _Tone.neutral,
            selected: state.status == PreCheckItemStatus.na,
            enabled: widget.item.allowNa,
            onTap: () => _updateState(
              widget.item.key,
              state.copyWith(
                status: state.status == PreCheckItemStatus.na
                    ? PreCheckItemStatus.blank
                    : PreCheckItemStatus.na,
                clearLinkedDamageId: true,
              ),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: _ActionPill(
            label: 'OK',
            tone: _Tone.success,
            selected: state.status == PreCheckItemStatus.ok,
            onTap: () => _updateState(
              widget.item.key,
              state.copyWith(
                status: PreCheckItemStatus.ok,
                clearLinkedDamageId: true,
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _markAllFixed() {
    for (final defect in widget.defects) {
      _markFixed(defect.id);
    }
  }

  void _markFixed(String damageId) {
    final ids = widget.draft.markedResolvedDamageIds.contains(damageId)
        ? widget.draft.markedResolvedDamageIds
        : <String>[...widget.draft.markedResolvedDamageIds, damageId];
    widget.onDraftChanged(widget.draft.copyWith(markedResolvedDamageIds: ids));
  }

  void _sameProblem(PreCheckKnownDefect defect) {
    final key = widget.defects.length >= 2
        ? '${widget.item.key}::${defect.id}'
        : widget.item.key;
    final state = widget.draft.itemStates[key] ?? const PreCheckItemState();
    _updateState(
      key,
      state.copyWith(
        status: PreCheckItemStatus.repairNeeded,
        linkedDamageId: defect.id,
      ),
    );
  }

  void _updateState(String key, PreCheckItemState state) {
    final states = Map<String, PreCheckItemState>.from(widget.draft.itemStates);
    states[key] = state;
    widget.onDraftChanged(widget.draft.copyWith(itemStates: states));
  }
}

class _IssueDetails extends StatelessWidget {
  const _IssueDetails({
    required this.stateKey,
    required this.state,
    required this.onNotesChanged,
    required this.onTakePhoto,
    required this.onAddGallery,
    required this.onRemovePhoto,
  });

  final String stateKey;
  final PreCheckItemState state;
  final ValueChanged<String> onNotesChanged;
  final VoidCallback onTakePhoto;
  final VoidCallback onAddGallery;
  final ValueChanged<PreCheckPhoto> onRemovePhoto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            minLines: 3,
            maxLines: 6,
            controller: TextEditingController(text: state.notes)
              ..selection = TextSelection.collapsed(offset: state.notes.length),
            decoration: const InputDecoration(
              labelText: "What's wrong? *",
              hintText: 'Describe the issue...',
            ),
            onChanged: onNotesChanged,
          ),
          const SizedBox(height: AppSpacing.sm),
          _PhotoActions(
            photos: state.photos,
            maxImages: 2,
            onTakePhoto: onTakePhoto,
            onAddGallery: onAddGallery,
            onRemove: onRemovePhoto,
          ),
        ],
      ),
    );
  }
}

class _PhotoActions extends StatelessWidget {
  const _PhotoActions({
    required this.photos,
    required this.maxImages,
    required this.onTakePhoto,
    required this.onAddGallery,
    required this.onRemove,
  });

  final List<PreCheckPhoto> photos;
  final int maxImages;
  final VoidCallback onTakePhoto;
  final VoidCallback onAddGallery;
  final ValueChanged<PreCheckPhoto> onRemove;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: _PreCheckSolidButton(
                label: 'Take Photo',
                onPressed: onTakePhoto,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: _PreCheckSolidButton(
                label: 'Gallery',
                onPressed: onAddGallery,
              ),
            ),
          ],
        ),
        if (photos.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final photo in photos)
                Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                      child: Image(
                        image: ResizeImage(
                          FileImageFromPath(photo.path),
                          width: 144,
                          height: 144,
                        ),
                        width: 72,
                        height: 72,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Container(
                          width: 72,
                          height: 72,
                          color: context.appColors.bgTertiary,
                        ),
                      ),
                    ),
                    Positioned(
                      right: 2,
                      top: 2,
                      child: InkWell(
                        onTap: () => onRemove(photo),
                        child: Container(
                          padding: const EdgeInsets.all(3),
                          decoration: BoxDecoration(
                            color: context.appColors.danger,
                            borderRadius: BorderRadius.circular(AppRadius.full),
                          ),
                          child: Icon(
                            Icons.close,
                            size: 14,
                            color: context.appColors.onDanger,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xs),
          child: Text(
            '${photos.length}/$maxImages photos',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: context.appColors.textSecondary,
            ),
          ),
        ),
      ],
    );
  }
}

class FileImageFromPath extends FileImage {
  FileImageFromPath(String path) : super(File(path));
}

class _RemarksCard extends StatelessWidget {
  const _RemarksCard({
    required this.remarks,
    required this.photos,
    required this.onRemarksChanged,
    required this.onTakePhoto,
    required this.onAddPhoto,
    required this.onRemovePhoto,
  });

  final String remarks;
  final List<PreCheckPhoto> photos;
  final ValueChanged<String> onRemarksChanged;
  final VoidCallback onTakePhoto;
  final VoidCallback onAddPhoto;
  final ValueChanged<PreCheckPhoto> onRemovePhoto;

  @override
  Widget build(BuildContext context) {
    return _ToneCard(
      tone: _Tone.neutral,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Remarks', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.md),
          TextField(
            minLines: 2,
            maxLines: 4,
            controller: TextEditingController(text: remarks)
              ..selection = TextSelection.collapsed(offset: remarks.length),
            decoration: const InputDecoration(
              hintText: 'Any additional notes or observations...',
            ),
            onChanged: onRemarksChanged,
          ),
          const SizedBox(height: AppSpacing.md),
          _PhotoActions(
            photos: photos,
            maxImages: 3,
            onTakePhoto: onTakePhoto,
            onAddGallery: onAddPhoto,
            onRemove: onRemovePhoto,
          ),
        ],
      ),
    );
  }
}

class _QrScannerScreen extends StatefulWidget {
  const _QrScannerScreen();

  @override
  State<_QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<_QrScannerScreen> {
  late final MobileScannerController _controller;
  bool _hasResolvedScan = false;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      facing: CameraFacing.back,
    );
  }

  @override
  void dispose() {
    unawaited(_controller.dispose());
    super.dispose();
  }

  void _handleDetect(BarcodeCapture capture) {
    if (_hasResolvedScan) {
      return;
    }
    final value = capture.barcodes.isEmpty
        ? null
        : capture.barcodes.first.rawValue;
    if (value == null) {
      return;
    }
    final token = _extractQrToken(value);
    if (token == null) {
      return;
    }
    _hasResolvedScan = true;
    Navigator.of(context).pop(token);
  }

  Future<void> _toggleTorch() async {
    try {
      await _controller.toggleTorch();
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'Torch is not available on this device.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Scan Tug QR'),
        backgroundColor: Colors.black.withValues(alpha: 0.28),
        surfaceTintColor: Colors.transparent,
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (context, state, child) {
              final torchAvailable = state.torchState != TorchState.unavailable;
              final torchOn = state.torchState == TorchState.on;
              return IconButton(
                tooltip: torchOn ? 'Turn torch off' : 'Turn torch on',
                onPressed: torchAvailable ? _toggleTorch : null,
                icon: Icon(
                  torchOn ? Icons.flashlight_on : Icons.flashlight_off,
                ),
              );
            },
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(controller: _controller, onDetect: _handleDetect),
          IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.36),
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.44),
                  ],
                ),
              ),
            ),
          ),
          Center(
            child: Container(
              width: AppPreCheckCard.qrFrameSize,
              height: AppPreCheckCard.qrFrameSize,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppRadius.xl),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.82),
                  width: AppStroke.thick,
                ),
              ),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: colors.bgElevated.withValues(alpha: 0.88),
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                    border: Border.all(
                      color: colors.borderDefault.withValues(alpha: 0.6),
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Point the camera at the tug QR code',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: colors.textPrimary,
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        ValueListenableBuilder<MobileScannerState>(
                          valueListenable: _controller,
                          builder: (context, state, child) {
                            final torchAvailable =
                                state.torchState != TorchState.unavailable;
                            final torchOn = state.torchState == TorchState.on;
                            return Row(
                              children: [
                                Expanded(
                                  child: _PreCheckSolidButton(
                                    label: torchOn ? 'Torch on' : 'Torch',
                                    icon: torchOn
                                        ? Icons.flashlight_on
                                        : Icons.flashlight_off,
                                    onPressed: torchAvailable
                                        ? _toggleTorch
                                        : null,
                                  ),
                                ),
                                const SizedBox(width: AppSpacing.sm),
                                Expanded(
                                  child: _PreCheckSolidButton(
                                    label: 'Cancel',
                                    onPressed: () =>
                                        Navigator.of(context).maybePop(),
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String? _extractQrToken(String value) {
  final match = RegExp(
    r'/precheck/tug/([a-f0-9]+)',
    caseSensitive: false,
  ).firstMatch(value);
  return match?.group(1);
}

class _StickyHeaderDelegate extends SliverPersistentHeaderDelegate {
  _StickyHeaderDelegate({required this.child});

  final Widget child;

  @override
  double get maxExtent => AppPreCheckCard.stickyHeaderExtent;

  @override
  double get minExtent => AppPreCheckCard.stickyHeaderExtent;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return child;
  }

  @override
  bool shouldRebuild(covariant _StickyHeaderDelegate oldDelegate) {
    return child != oldDelegate.child;
  }
}

class _TugHeader extends StatelessWidget {
  const _TugHeader({
    required this.tug,
    required this.progress,
    required this.onChangeTug,
  });

  final PreCheckTug tug;
  final PreCheckProgress progress;
  final VoidCallback onChangeTug;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final percent = progress.total == 0
        ? 0.0
        : progress.checked / progress.total;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      color: Colors.transparent,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.bgElevated.withValues(alpha: 0.95),
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: colors.borderDefault),
          boxShadow: [
            BoxShadow(
              color: colors.shadow.withValues(alpha: 0.14),
              blurRadius: AppElevation.level4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tug.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    LinearProgressIndicator(value: percent),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      '${progress.checked}/${progress.total} checked • ${progress.issueCount} issue${progress.issueCount == 1 ? '' : 's'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ],
                ),
              ),
              _PreCheckSolidButton(
                label: 'Change Tug',
                onPressed: onChangeTug,
                expanded: false,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TugCard extends StatelessWidget {
  const _TugCard({required this.tug, required this.onStart});

  final PreCheckTug tug;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return _ToneCard(
      tone: _Tone.neutral,
      child: Row(
        children: [
          Container(
            width: AppPreCheckCard.tugAvatarSize,
            height: AppPreCheckCard.tugAvatarSize,
            decoration: BoxDecoration(
              color: colors.bgSecondary,
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(color: colors.borderDefault),
            ),
            child: Icon(
              Icons.local_shipping_outlined,
              color: colors.textSecondary,
              size: 20,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tug.label, style: Theme.of(context).textTheme.titleMedium),
                if (tug.secondaryLabel.isNotEmpty)
                  Text(
                    tug.secondaryLabel,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          SizedBox(
            width: 84,
            child: _PreCheckSolidButton(
              label: 'Start',
              onPressed: onStart,
              expanded: false,
            ),
          ),
        ],
      ),
    );
  }
}

class _QueueBanner extends StatelessWidget {
  const _QueueBanner({required this.status, required this.onSync});

  final PreCheckQueueStatus? status;
  final VoidCallback onSync;

  @override
  Widget build(BuildContext context) {
    final queue = status;
    if (queue == null || queue.total == 0) {
      return const SizedBox.shrink();
    }
    return _WarningCard(
      title: queue.failed > 0
          ? '${queue.failed} upload(s) failed'
          : '${queue.pending} upload(s) pending',
      message: 'Saved PreChecks will sync when you are online.',
      actionLabel: 'Sync now',
      onAction: onSync,
    );
  }
}

class _CompletedRow extends StatelessWidget {
  const _CompletedRow({
    required this.check,
    required this.showDivider,
    required this.damageEnabled,
    required this.onReportDamage,
  });

  final PreCheckSubmissionSummary check;
  final bool showDivider;
  final bool damageEnabled;
  final VoidCallback onReportDamage;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Column(
      children: [
        if (showDivider) Divider(color: colors.borderDefault),
        Row(
          children: [
            Icon(Icons.check_circle_outline, color: colors.success),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                check.tugLabel,
                style: Theme.of(context).textTheme.titleSmall,
              ),
            ),
            if (damageEnabled)
              _PreCheckSolidButton(
                label: 'Report Damage',
                onPressed: onReportDamage,
                tone: _Tone.danger,
                expanded: false,
              ),
          ],
        ),
      ],
    );
  }
}

class _ValidationWarning extends StatelessWidget {
  const _ValidationWarning({required this.result});

  final PreCheckValidationResult result;

  @override
  Widget build(BuildContext context) {
    return _WarningCard(
      title: result.uncheckedCount > 0
          ? '${result.uncheckedCount} item${result.uncheckedCount == 1 ? '' : 's'} not checked yet'
          : '${result.missingDescriptionCount} issue${result.missingDescriptionCount == 1 ? '' : 's'} missing description',
      message: result.uncheckedCount > 0
          ? 'You must check every item before submitting.'
          : "Please describe what's wrong for each item marked with a warning.",
    );
  }
}

class _WarningCard extends StatelessWidget {
  const _WarningCard({
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return _ToneCard(
      tone: _Tone.warning,
      child: Row(
        children: [
          Icon(Icons.warning_amber_rounded, color: colors.warning),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleSmall),
                Text(message, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          if (actionLabel != null)
            _PreCheckSolidButton(
              label: actionLabel!,
              onPressed: onAction,
              tone: _Tone.warning,
              expanded: false,
            ),
        ],
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return _ToneCard(
      tone: _Tone.neutral,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: AppSpacing.sm),
          Text(message),
          if (actionLabel != null) ...[
            const SizedBox(height: AppSpacing.lg),
            _PreCheckSolidButton(label: actionLabel!, onPressed: onAction),
          ],
        ],
      ),
    );
  }
}

enum _Tone { neutral, success, warning, danger }

class _PreCheckSolidButton extends StatelessWidget {
  const _PreCheckSolidButton({
    required this.label,
    this.onPressed,
    this.tone = _Tone.neutral,
    this.icon,
    this.expanded = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final _Tone tone;
  final IconData? icon;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final foreground = switch (tone) {
      _Tone.success => colors.success,
      _Tone.warning => colors.warning,
      _Tone.danger => colors.danger,
      _Tone.neutral => colors.textPrimary,
    };
    final background = switch (tone) {
      _Tone.success => colors.successBg,
      _Tone.warning => colors.warningBg,
      _Tone.danger => colors.dangerBg,
      _Tone.neutral => colors.bgSecondary,
    };
    final border = switch (tone) {
      _Tone.success => colors.success.withValues(alpha: 0.34),
      _Tone.warning => colors.warning.withValues(alpha: 0.34),
      _Tone.danger => colors.danger.withValues(alpha: 0.34),
      _Tone.neutral => colors.borderDefault,
    };
    final child = icon == null
        ? Text(label)
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18),
              const SizedBox(width: AppSpacing.xs),
              Text(label),
            ],
          );
    final button = FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: background,
        disabledBackgroundColor: colors.bgTertiary,
        foregroundColor: foreground,
        disabledForegroundColor: colors.textDisabled,
        minimumSize: const Size(0, AppComponentTokens.buttonHeightSm),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          side: BorderSide(color: border),
        ),
        textStyle: AppTypography.labelLarge,
        elevation: 0,
      ),
      child: child,
    );
    if (!expanded) {
      return button;
    }
    return SizedBox(width: double.infinity, child: button);
  }
}

class _ToneCard extends StatelessWidget {
  const _ToneCard({required this.tone, required this.child});

  final _Tone tone;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final toneColor = switch (tone) {
      _Tone.success => colors.success,
      _Tone.warning => colors.warning,
      _Tone.danger => colors.danger,
      _Tone.neutral => colors.borderDefault,
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.bgElevated.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(
          color: tone == _Tone.neutral
              ? colors.borderDefault
              : toneColor.withValues(alpha: 0.34),
        ),
        boxShadow: [
          BoxShadow(
            color: colors.shadow.withValues(alpha: 0.12),
            blurRadius: AppElevation.level4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppPreCheckCard.cardPadding),
        child: child,
      ),
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({
    required this.label,
    required this.tone,
    required this.onTap,
    this.selected = false,
    this.enabled = true,
  });

  final String label;
  final _Tone tone;
  final VoidCallback onTap;
  final bool selected;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final color = switch (tone) {
      _Tone.success => colors.success,
      _Tone.warning => colors.warning,
      _Tone.danger => colors.danger,
      _Tone.neutral => colors.textSecondary,
    };
    return Opacity(
      opacity: enabled ? 1 : AppOpacity.disabled,
      child: Material(
        color: selected
            ? color.withValues(alpha: 0.14)
            : colors.bgSecondary.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              vertical: AppPreCheckCard.actionVerticalPadding,
              horizontal: AppSpacing.sm,
            ),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: enabled ? color : colors.textDisabled,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _newId() {
  final random = Random();
  return '${DateTime.now().millisecondsSinceEpoch}-${random.nextInt(1 << 32)}';
}
