import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/network/models.dart';
import '../../../core/platform/device_capabilities.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/precheck_signed_image.dart';
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
  final TextEditingController _tugSearchController = TextEditingController();

  PreCheckStep _step = PreCheckStep.select;
  PreCheckInitialData? _initialData;
  List<PreCheckTug> _tugs = const <PreCheckTug>[];
  List<PreCheckItemDefinition> _items = const <PreCheckItemDefinition>[];
  Map<String, List<PreCheckKnownDefect>> _defectsByItem =
      const <String, List<PreCheckKnownDefect>>{};
  Map<String, List<PreCheckKnownDefect>> _acknowledgedByItem =
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
  String? _duringShiftFormSessionId;
  String _tugSearchQuery = '';
  String? _expandedTugId;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _tugSearchController.dispose();
    super.dispose();
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
      _acknowledgedByItem = const <String, List<PreCheckKnownDefect>>{};
    });
    try {
      final defects = splitAcknowledgedDefects(
        await widget.repository.fetchKnownDefects(tug.id),
      );
      setState(() {
        _defectsByItem = defects.active;
        _acknowledgedByItem = defects.acknowledged;
        _step = PreCheckStep.form;
        _showValidationWarning = false;
      });
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'Known defects could not be loaded.');
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
          AppToast.error(context, 'Invalid or inactive QR code.');
        }
        return;
      }
      await _startCheck(tug);
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'QR code could not be resolved.');
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
      AppToast.warning(context, 'Please update the app before submitting.');
      return;
    }
    final tug = _selectedTug;
    if (tug == null) {
      AppToast.warning(context, 'Please select a tug.');
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
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'Error submitting PreCheck. Please try again.');
      }
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
      AppToast.warning(context, 'Please describe what happened.');
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
        formSessionId: _duringShiftFormSessionId ??= _newId(),
      );
      setState(() {
        _lastSubmission = submission;
        _lastSubmitType = PreCheckType.duringShift;
        _duringShiftDescription = '';
        _duringShiftPhotos = const <PreCheckPhoto>[];
        _duringShiftFormSessionId = null;
        _step = PreCheckStep.success;
      });
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'Error submitting report. Please try again.');
      }
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
        AppToast.success(context, 'PreCheck queue synced.');
      }
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'PreCheck sync failed.');
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
    final mq = MediaQuery.of(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
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
              alignment: Alignment.center,
              gaplessPlayback: true,
            ),
          ),
          Positioned.fill(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                mq.padding.top + AppSpacing.sm,
                AppSpacing.lg,
                // Sit flush above the shell glass nav (SafeArea + nav height).
                mq.viewPadding.bottom + AppComponentTokens.bottomNavHeight,
              ),
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _buildBody(),
            ),
          ),
        ],
      ),
    );
  }

  /// Vertically centres [child] in the available area; scrolls when taller.
  Widget _centeredScrollBody({required Widget child}) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Center(child: child),
          ),
        );
      },
    );
  }

  Widget _buildBody() {
    if (_errorMessage != null) {
      return _centeredScrollBody(
        child: _MessageCard(
          title: 'PreCheck unavailable',
          message: _errorMessage!,
          actionLabel: 'Retry',
          onAction: _bootstrap,
        ),
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

  List<PreCheckTug> get _filteredTugs {
    final query = _tugSearchQuery.trim().toLowerCase();
    if (query.isEmpty) {
      return _tugs;
    }
    return _tugs.where((tug) {
      final haystack = [
        tug.label,
        tug.tugNumber,
        tug.displayName ?? '',
        tug.secondaryLabel,
        tug.locationName ?? '',
      ].join(' ').toLowerCase();
      return haystack.contains(query);
    }).toList();
  }

  Widget _buildSelectSearchBar() {
    final colors = context.appColors;
    final canScan = DeviceCapabilities.supportsQrScanner;
    return AppCard(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.sm,
        AppSpacing.xxs,
        AppSpacing.xs,
        AppSpacing.xxs,
      ),
      child: Row(
        children: [
          Icon(Icons.search_rounded, size: 18, color: colors.textSecondary),
          const SizedBox(width: AppSpacing.xs),
          Expanded(
            child: TextField(
              controller: _tugSearchController,
              onChanged: (value) => setState(() => _tugSearchQuery = value),
              textInputAction: TextInputAction.search,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.textPrimary,
                fontWeight: FontWeight.w400,
                fontSize: 13,
              ),
              decoration: InputDecoration(
                hintText: 'Search tug',
                hintStyle: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.textTertiary,
                  fontWeight: FontWeight.w400,
                ),
                isDense: true,
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(
                  vertical: AppSpacing.xs,
                ),
              ),
            ),
          ),
          if (canScan)
            Theme(
              data: Theme.of(context).copyWith(
                textButtonTheme: TextButtonThemeData(
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                    textStyle: Theme.of(context).textTheme.labelMedium
                        ?.copyWith(fontWeight: FontWeight.w500),
                  ),
                ),
              ),
              child: AppButton(
                label: 'Scan QR',
                onPressed: _scanQr,
                variant: AppButtonVariant.ghost,
                isExpanded: false,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSelect() {
    final tugs = _filteredTugs;
    final colors = context.appColors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Search + Scan QR stay pinned at the top while the list scrolls.
        _buildSelectSearchBar(),
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: _centeredScrollBody(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _QueueBanner(
                  status: _initialData?.queueStatus,
                  onSync: _syncNow,
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Select Tug',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w500,
                    color: colors.textPrimary,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                if (_tugs.isEmpty)
                  const _MessageCard(
                    title: 'No tugs available',
                    message: 'There are no active tugs available right now.',
                  )
                else if (tugs.isEmpty)
                  const _MessageCard(
                    title: 'No matching tugs',
                    message: 'Try a different search or clear the filter.',
                  )
                else
                  ...tugs.map(
                    (tug) => Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: _TugCard(
                        tug: tug,
                        expanded: _expandedTugId == tug.id,
                        onToggle: () => setState(() {
                          _expandedTugId =
                              _expandedTugId == tug.id ? null : tug.id;
                        }),
                        onStart: () => _startCheck(tug),
                        history: _expandedTugId == tug.id
                            ? _TugCheckHistoryPanel(
                                repository: widget.repository,
                                tugId: tug.id,
                              )
                            : null,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCompleted() {
    final checks =
        _initialData?.shiftChecks ?? const <PreCheckSubmissionSummary>[];
    return _centeredScrollBody(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
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
                    damageEnabled:
                        _initialData?.duringShiftDamageEnabled ?? true,
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
          AppButton(
            label: 'Check Another Tug',
            onPressed: () => setState(() {
              _selectedTug = null;
              _step = PreCheckStep.select;
            }),
            variant: AppButtonVariant.secondary,
          ),
        ],
      ),
    );
  }

  Widget _buildForm() {
    final tug = _selectedTug;
    if (tug == null) {
      return _centeredScrollBody(
        child: _MessageCard(
          title: 'No tug selected',
          message: 'Please go back and select a tug.',
          actionLabel: 'Select Tug',
          onAction: () => setState(() => _step = PreCheckStep.select),
        ),
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

    return _centeredScrollBody(
      child: Column(
        mainAxisSize: MainAxisSize.min,
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
          _TugHeader(
            tug: tug,
            progress: progress,
            onChangeTug: () {
              setState(() {
                _selectedTug = null;
                _step = PreCheckStep.select;
              });
            },
            onMarkAllOk: _submitting ? null : _markAllItemsOk,
          ),
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
          AppButton(
            label: _submitting ? 'Submitting...' : 'Submit Pre-Shift Check',
            onPressed: _submitting ? null : _submitPreShift,
            variant: AppButtonVariant.secondary,
          ),
        ],
      ),
    );
  }

  Future<void> _markAllItemsOk() async {
    final states = Map<String, PreCheckItemState>.from(_draft.itemStates);
    final resolved = <String>{..._draft.markedResolvedDamageIds};

    for (final item in _items) {
      final defects = _defectsByItem[item.key] ?? const <PreCheckKnownDefect>[];
      for (final defect in defects) {
        resolved.add(defect.id);
      }
      if (defects.length <= 1) {
        states[item.key] = const PreCheckItemState(
          status: PreCheckItemStatus.ok,
        );
      } else {
        for (final defect in defects) {
          final key = '${item.key}::${defect.id}';
          states[key] = const PreCheckItemState(status: PreCheckItemStatus.ok);
        }
        states.remove('${item.key}::new');
      }
    }

    await _persistDraft(
      _draft.copyWith(
        itemStates: states,
        markedResolvedDamageIds: resolved.toList(growable: false),
      ),
    );
    if (!mounted) return;
    setState(() => _showValidationWarning = false);
  }

  Widget _buildSection(String title, List<PreCheckItemDefinition> items) {
    final progress = calculatePreCheckProgress(
      items: items,
      draft: _draft,
      defectsByItem: _defectsByItem,
    );
    final colors = context.appColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w500,
                  color: colors.textPrimary,
                ),
              ),
            ),
            Text(
              '${progress.checked}/${progress.total}',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: colors.textSecondary,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        for (final item in items)
          Padding(
            key: _itemKeys.putIfAbsent(item.key, GlobalKey.new),
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: _CheckItemCard(
              item: item,
              draft: _draft,
              defects:
                  _defectsByItem[item.key] ?? const <PreCheckKnownDefect>[],
              acknowledgedDefects:
                  _acknowledgedByItem[item.key] ??
                  const <PreCheckKnownDefect>[],
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
      return _centeredScrollBody(
        child: const _MessageCard(
          title: 'No tug selected',
          message: 'Please select a tug before reporting damage.',
        ),
      );
    }
    if (!(_initialData?.duringShiftDamageEnabled ?? true)) {
      return _centeredScrollBody(
        child: _MessageCard(
          title: 'Damage reporting disabled',
          message:
              'Damage reporting is currently disabled by admin. Please contact your supervisor.',
          actionLabel: 'Back',
          onAction: () => setState(() => _step = PreCheckStep.completed),
        ),
      );
    }
    return _centeredScrollBody(
      child: _ToneCard(
        tone: _Tone.danger,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Damage Report for ${tug.label}',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: Color.alphaBlend(
                  context.appColors.danger.withValues(alpha: 0.55),
                  context.appColors.textPrimary,
                ),
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            TextField(
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                labelText: 'What happened? *',
                hintText: 'Describe the damage or incident...',
              ),
              onChanged: (value) => _duringShiftDescription = value,
            ),
            const SizedBox(height: AppSpacing.sm),
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
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label:
                  _submitting ? 'Submitting...' : 'Submit Damage Report',
              variant: AppButtonVariant.secondary,
              onPressed: _submitting ? null : _submitDuringShift,
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: 'Cancel',
              variant: AppButtonVariant.secondary,
              onPressed: _submitting
                  ? null
                  : () => setState(() => _step = PreCheckStep.completed),
            ),
          ],
        ),
      ),
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

    return _centeredScrollBody(
      child: _ToneCard(
        tone: queued ? _Tone.warning : _Tone.success,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              title,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w500,
                color: context.appColors.textPrimary,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              message,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: context.appColors.textSecondary,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: primaryLabel,
              variant: AppButtonVariant.secondary,
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
              AppButton(
                label: 'Check Another Tug',
                onPressed: () => setState(() {
                  _lastSubmission = null;
                  _lastSubmitType = null;
                  _selectedTug = null;
                  _step = PreCheckStep.select;
                }),
                variant: AppButtonVariant.secondary,
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            AppButton(
              label: 'Back',
              onPressed: () => Navigator.of(context).maybePop(),
              variant: AppButtonVariant.ghost,
            ),
          ],
        ),
      ),
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
      AppToast.warning(context, 'Maximum $maxImages images allowed.');
      return;
    }
    try {
      final useCamera =
          source == ImageSource.camera &&
          DeviceCapabilities.supportsCameraCapture;
      final picked = await _imagePicker.pickImage(
        source: useCamera ? ImageSource.camera : ImageSource.gallery,
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
        AppToast.error(context, 'Unable to open camera or gallery.');
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
    this.acknowledgedDefects = const <PreCheckKnownDefect>[],
  });

  final PreCheckItemDefinition item;
  final PreCheckDraft draft;
  final List<PreCheckKnownDefect> defects;
  final List<PreCheckKnownDefect> acknowledgedDefects;
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

    final Color? borderColor = effective == PreCheckItemStatus.repairNeeded
        ? colors.danger.withValues(alpha: 0.28)
        : hasDefects
        ? colors.warning.withValues(alpha: 0.28)
        : null;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      color: colors.bgElevated,
      borderColor: borderColor,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.item.label,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w500,
              color: colors.textPrimary,
            ),
          ),
          if (widget.item.tooltip?.isNotEmpty ?? false) ...[
            const SizedBox(height: AppSpacing.xxs),
            Text(
              widget.item.tooltip!,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: colors.textSecondary),
            ),
          ],
          if (widget.acknowledgedDefects.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            for (final (index, defect) in widget.acknowledgedDefects.indexed)
              _acknowledgedDefectPanel(
                defect,
                isLast: index == widget.acknowledgedDefects.length - 1,
              ),
          ],
          if (hasDefects) ...[
            const SizedBox(height: AppSpacing.sm),
            ...widget.defects.map(_knownDefectPanel),
          ],
          const SizedBox(height: AppSpacing.sm),
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
                const SizedBox(width: AppSpacing.xs),
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
          else ...[
            if (widget.acknowledgedDefects.isNotEmpty) ...[
              Text(
                'Any other issue apart from this?',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                'If not, tap OK. Tap Issue only for a new problem.',
                textAlign: TextAlign.center,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            _standardActions(state),
          ],
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
    );
  }

  Widget _knownDefectPanel(PreCheckKnownDefect defect) => _defectInfoPanel(
    defect,
    title: 'Known defect',
    accent: context.appColors.warning,
  );

  Widget _acknowledgedDefectPanel(
    PreCheckKnownDefect defect, {
    required bool isLast,
  }) => _defectInfoPanel(
    defect,
    title: 'Already reported – VMU knows about this',
    accent: context.appColors.textSecondary,
    footnote: !isLast
        ? null
        : widget.acknowledgedDefects.length > 1
        ? "If it's one of these problems, you don't need to do anything."
        : "If this is the problem you see, you don't need to do anything.",
  );

  Widget _defectInfoPanel(
    PreCheckKnownDefect defect, {
    required String title,
    required Color accent,
    String? footnote,
  }) {
    final colors = context.appColors;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.xs),
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: colors.bgElevated,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: accent.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: accent, fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'On ${defect.dateLabel}, ${defect.reporterName} reported: ${defect.description}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (defect.imageUrls.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            PrecheckSignedImage(
              url: defect.imageUrls.first,
              fit: BoxFit.cover,
              height: AppPreCheckCard.knownDefectImageHeight,
              width: double.infinity,
              borderRadius: BorderRadius.circular(AppRadius.md),
              errorBuilder: (context, error, stackTrace) =>
                  const SizedBox.shrink(),
            ),
          ],
          if (footnote != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              footnote,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w500),
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
        if (DeviceCapabilities.supportsCameraCapture)
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Take Photo',
                  onPressed: onTakePhoto,
                  variant: AppButtonVariant.secondary,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppButton(
                  label: 'Gallery',
                  onPressed: onAddGallery,
                  variant: AppButtonVariant.secondary,
                ),
              ),
            ],
          )
        else
          AppButton(
            label: 'Choose Photo',
            onPressed: onAddGallery,
            variant: AppButtonVariant.secondary,
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
    final colors = context.appColors;
    return _ToneCard(
      tone: _Tone.neutral,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Remarks',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w500,
              color: colors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
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
          const SizedBox(height: AppSpacing.sm),
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
        AppToast.warning(context, 'Torch is not available on this device.');
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
                child: AppCard(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Point the camera at the tug QR code',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colors.textPrimary,
                          fontWeight: FontWeight.w500,
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
                                child: AppButton(
                                  label: torchOn ? 'Torch on' : 'Torch',
                                  onPressed: torchAvailable
                                      ? _toggleTorch
                                      : null,
                                  variant: AppButtonVariant.secondary,
                                ),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: AppButton(
                                  label: 'Cancel',
                                  onPressed: () =>
                                      Navigator.of(context).maybePop(),
                                  variant: AppButtonVariant.secondary,
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

class _TugHeader extends StatelessWidget {
  const _TugHeader({
    required this.tug,
    required this.progress,
    required this.onChangeTug,
    this.onMarkAllOk,
  });

  final PreCheckTug tug;
  final PreCheckProgress progress;
  final VoidCallback onChangeTug;
  final VoidCallback? onMarkAllOk;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final percent = progress.total == 0
        ? 0.0
        : progress.checked / progress.total;
    return ColoredBox(
      color: Colors.transparent,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
        child: AppCard(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          tug.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                fontWeight: FontWeight.w500,
                                color: colors.textPrimary,
                              ),
                        ),
                        const SizedBox(height: AppSpacing.xxs),
                        LinearProgressIndicator(
                          value: percent,
                          color: colors.textSecondary,
                          backgroundColor: colors.borderDefault,
                        ),
                        const SizedBox(height: AppSpacing.xxs),
                        Text(
                          '${progress.checked}/${progress.total} checked • ${progress.issueCount} issue${progress.issueCount == 1 ? '' : 's'}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(color: colors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppButton(
                    label: 'Change Tug',
                    onPressed: onChangeTug,
                    variant: AppButtonVariant.secondary,
                    isExpanded: false,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                label: 'Mark all OK',
                onPressed: onMarkAllOk,
                variant: AppButtonVariant.secondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TugCard extends StatelessWidget {
  const _TugCard({
    required this.tug,
    required this.expanded,
    required this.onToggle,
    required this.onStart,
    this.history,
  });

  final PreCheckTug tug;
  final bool expanded;
  final VoidCallback onToggle;
  final VoidCallback onStart;
  final Widget? history;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;

    return AppCard(
      padding: EdgeInsets.zero,
      borderColor: expanded ? colors.borderStrong : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Material(
            color: colors.bgElevated,
            child: InkWell(
              onTap: onToggle,
              borderRadius: BorderRadius.circular(AppRadius.lg),
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
                        color: colors.bgSecondary,
                        borderRadius: BorderRadius.circular(AppRadius.md),
                      ),
                      child: Icon(
                        Icons.local_shipping_outlined,
                        color: colors.textSecondary,
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            tug.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(
                                  fontWeight: FontWeight.w500,
                                  color: colors.textPrimary,
                                  fontSize: 14,
                                ),
                          ),
                          if (tug.secondaryLabel.isNotEmpty)
                            Text(
                              tug.secondaryLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: colors.textSecondary,
                                    fontWeight: FontWeight.w400,
                                  ),
                            ),
                        ],
                      ),
                    ),
                    Icon(
                      expanded
                          ? Icons.expand_less_rounded
                          : Icons.expand_more_rounded,
                      color: colors.textSecondary,
                    ),
                    if (expanded) ...[
                      const SizedBox(width: AppSpacing.xs),
                      AppButton(
                        label: 'Start Check',
                        onPressed: onStart,
                        variant: AppButtonVariant.secondary,
                        isExpanded: false,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          if (expanded && history != null) ...[
            Divider(height: 1, color: colors.borderDefault),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.sm,
                AppSpacing.sm,
                AppSpacing.sm,
                AppSpacing.sm,
              ),
              child: history!,
            ),
          ],
        ],
      ),
    );
  }
}

class _TugCheckHistoryPanel extends StatefulWidget {
  const _TugCheckHistoryPanel({
    required this.repository,
    required this.tugId,
  });

  final PreCheckRepository repository;
  final String tugId;

  @override
  State<_TugCheckHistoryPanel> createState() => _TugCheckHistoryPanelState();
}

class _TugCheckHistoryPanelState extends State<_TugCheckHistoryPanel> {
  bool _loading = true;
  bool _showAll = false;
  String? _expandedCheckId;
  List<PreCheckTugHistoryEntry> _checks = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant _TugCheckHistoryPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tugId != widget.tugId) {
      _showAll = false;
      _expandedCheckId = null;
      _load();
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final checks = await widget.repository.fetchTugCheckHistory(widget.tugId);
      if (!mounted) return;
      // Open the newest defective check so problem photos are visible (PWA).
      String? autoExpandId;
      for (final check in checks) {
        if (check.problems.any((problem) => problem.imageUrls.isNotEmpty)) {
          autoExpandId = check.id;
          break;
        }
      }
      autoExpandId ??= checks
          .where((check) => check.hasDefects)
          .map((check) => check.id)
          .firstOrNull;
      setState(() {
        _checks = checks;
        _expandedCheckId = autoExpandId;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _checks = const [];
        _expandedCheckId = null;
        _loading = false;
      });
    }
  }

  String _formatDate(DateTime value) {
    const months = <String>[
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final day = value.day.toString().padLeft(2, '0');
    final month = months[value.month - 1];
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');
    return '$day $month $hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Check History (30 days)',
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: colors.textSecondary,
            fontWeight: FontWeight.w500,
            letterSpacing: 0.4,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: Center(
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          )
        else if (_checks.isEmpty)
          Text(
            'No checks in the last 30 days',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: colors.textSecondary,
            ),
          )
        else ...[
          for (final check in (_showAll ? _checks : _checks.take(5)))
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: _TugHistoryCheckRow(
                entry: check,
                timeLabel: _formatDate(check.checkTime),
                expanded: _expandedCheckId == check.id,
                onToggle: check.hasDefects
                    ? () => setState(() {
                        _expandedCheckId = _expandedCheckId == check.id
                            ? null
                            : check.id;
                      })
                    : null,
              ),
            ),
          if (_checks.length > 5 && !_showAll)
            AppButton(
              label: 'Show all ${_checks.length} entries',
              onPressed: () => setState(() => _showAll = true),
              variant: AppButtonVariant.ghost,
            ),
        ],
      ],
    );
  }
}

void _openHistoryPhoto(BuildContext context, String url) {
  showDialog<void>(
    context: context,
    builder: (dialogContext) {
      return Dialog(
        insetPadding: const EdgeInsets.all(AppSpacing.lg),
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            InteractiveViewer(
              child: Center(
                child: PrecheckSignedImage(
                  url: url,
                  fit: BoxFit.contain,
                ),
              ),
            ),
            Positioned(
              top: AppSpacing.sm,
              right: AppSpacing.sm,
              child: IconButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
          ],
        ),
      );
    },
  );
}

class _TugHistoryCheckRow extends StatelessWidget {
  const _TugHistoryCheckRow({
    required this.entry,
    required this.timeLabel,
    required this.expanded,
    this.onToggle,
  });

  final PreCheckTugHistoryEntry entry;
  final String timeLabel;
  final bool expanded;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final accent = entry.hasDefects ? colors.danger : colors.success;
    final wash = entry.hasDefects ? colors.dangerBg : colors.successBg;
    final isPreShift = entry.checkType == PreCheckType.preShift;

    return AppCard(
      padding: EdgeInsets.zero,
      color: Color.alphaBlend(
        wash.withValues(alpha: 0.28),
        colors.bgElevated,
      ),
      borderColor: accent.withValues(alpha: 0.22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          entry.checkerName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                fontWeight: FontWeight.w500,
                                color: colors.textPrimary,
                              ),
                        ),
                        Text(
                          timeLabel,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: colors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: AppSpacing.xxs,
                    ),
                    decoration: BoxDecoration(
                      color: colors.bgSecondary,
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      border: Border.all(color: colors.borderDefault),
                    ),
                    child: Text(
                      isPreShift ? 'Pre-Shift' : 'During Shift',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: colors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  if (entry.hasDefects) ...[
                    const SizedBox(width: AppSpacing.xs),
                    Icon(
                      expanded
                          ? Icons.expand_less_rounded
                          : Icons.expand_more_rounded,
                      size: 18,
                      color: colors.textSecondary,
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (expanded && entry.hasDefects) ...[
            Divider(height: 1, color: colors.borderDefault),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Problems',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: colors.textSecondary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  for (final problem in entry.problems)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                      child: AppCard(
                        padding: const EdgeInsets.all(AppSpacing.sm),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              problem.itemName,
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.w500,
                                    color: colors.textPrimary,
                                  ),
                            ),
                            if (problem.description.isNotEmpty)
                              Text(
                                problem.description,
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: colors.textSecondary),
                              ),
                            if (problem.imageUrls.isNotEmpty) ...[
                              const SizedBox(height: AppSpacing.sm),
                              Wrap(
                                spacing: AppSpacing.sm,
                                runSpacing: AppSpacing.sm,
                                children: [
                                  for (final url in problem.imageUrls)
                                    Material(
                                      color: colors.bgSecondary,
                                      borderRadius: BorderRadius.circular(
                                        AppRadius.sm,
                                      ),
                                      clipBehavior: Clip.antiAlias,
                                      child: InkWell(
                                        onTap: () => _openHistoryPhoto(
                                          context,
                                          url,
                                        ),
                                        child: PrecheckSignedImage(
                                          url: url,
                                          width: 72,
                                          height: 72,
                                          fit: BoxFit.cover,
                                          borderRadius: BorderRadius.circular(
                                            AppRadius.sm,
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
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
            Icon(
              Icons.check_circle_outline,
              color: Color.alphaBlend(
                colors.success.withValues(alpha: 0.55),
                colors.textSecondary,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                check.tugLabel,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500),
              ),
            ),
            if (damageEnabled)
              AppButton(
                label: 'Report Damage',
                onPressed: onReportDamage,
                variant: AppButtonVariant.secondary,
                isExpanded: false,
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
          Icon(
            Icons.warning_amber_rounded,
            color: Color.alphaBlend(
              colors.warning.withValues(alpha: 0.55),
              colors.textSecondary,
            ),
            size: 20,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                    color: colors.textPrimary,
                  ),
                ),
                Text(
                  message,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          if (actionLabel != null) ...[
            const SizedBox(width: AppSpacing.sm),
            AppButton(
              label: actionLabel!,
              onPressed: onAction,
              variant: AppButtonVariant.secondary,
              isExpanded: false,
            ),
          ],
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
    final colors = context.appColors;
    return _ToneCard(
      tone: _Tone.neutral,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w500,
              color: colors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            message,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: colors.textSecondary,
            ),
          ),
          if (actionLabel != null) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: actionLabel!,
              onPressed: onAction,
              variant: AppButtonVariant.secondary,
            ),
          ],
        ],
      ),
    );
  }
}

enum _Tone { neutral, success, warning, danger }

class _ToneCard extends StatelessWidget {
  const _ToneCard({required this.tone, required this.child});

  final _Tone tone;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = switch (tone) {
      _Tone.success => colors.success,
      _Tone.warning => colors.warning,
      _Tone.danger => colors.danger,
      _Tone.neutral => colors.borderDefault,
    };
    final wash = switch (tone) {
      _Tone.success => colors.successBg,
      _Tone.warning => colors.warningBg,
      _Tone.danger => colors.dangerBg,
      _Tone.neutral => colors.bgElevated,
    };
    final fill = tone == _Tone.neutral
        ? null
        : Color.alphaBlend(
            wash.withValues(alpha: isDark ? 0.28 : 0.32),
            colors.bgElevated,
          );
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      color: fill,
      borderColor: tone == _Tone.neutral
          ? null
          : accent.withValues(alpha: 0.22),
      child: child,
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final raw = switch (tone) {
      _Tone.success => colors.success,
      _Tone.warning => colors.warning,
      _Tone.danger => colors.danger,
      _Tone.neutral => colors.textSecondary,
    };
    // Mute selected accents so pills stay quiet like Home / My Rota.
    final color = Color.alphaBlend(
      raw.withValues(alpha: 0.5),
      colors.textPrimary,
    );
    return Opacity(
      opacity: enabled ? 1 : AppOpacity.disabled,
      child: Material(
        color: selected
            ? color.withValues(alpha: isDark ? 0.14 : 0.08)
            : Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          side: selected
              ? BorderSide(color: color.withValues(alpha: 0.28))
              : BorderSide.none,
        ),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              vertical: AppSpacing.xs,
              horizontal: AppSpacing.sm,
            ),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: enabled
                    ? (selected ? color : colors.textPrimary)
                    : colors.textDisabled,
                fontWeight: selected ? FontWeight.w500 : FontWeight.w400,
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
