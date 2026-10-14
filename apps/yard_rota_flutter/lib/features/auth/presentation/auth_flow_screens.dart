import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/menu_group.dart';
import '../../profile/presentation/delete_account_flow.dart';
import '../domain/password_rules.dart';
import 'auth_scaffold.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({
    super.key,
    required this.apiClient,
    required this.onBackToLogin,
  });

  final ApiClient apiClient;
  final VoidCallback onBackToLogin;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  bool _loading = false;
  String? _confirmationSentTo;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (!email.contains('@')) {
      AppToast.show(context, 'Enter a valid email address.');
      return;
    }
    final passwordError = passwordRuleError(password);
    if (passwordError != null) {
      AppToast.show(context, passwordError);
      return;
    }
    if (password != _confirmation.text) {
      AppToast.show(context, 'Passwords do not match.');
      return;
    }
    setState(() => _loading = true);
    try {
      final result = await widget.apiClient.register(
        email: email,
        password: password,
      );
      if (!mounted) return;
      if (result.requiresEmailConfirmation) {
        setState(() => _confirmationSentTo = email);
      } else {
        AppToast.show(context, 'Account created. Complete your profile.');
        widget.onBackToLogin();
      }
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'Could not create your account. Try again.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sentTo = _confirmationSentTo;
    if (sentTo != null) {
      return _CheckEmailScreen(
        subtitle: 'We sent a confirmation link to $sentTo.',
        steps: const [
          'Open the email on this phone and tap the link to continue.',
          'Already confirmed on another device? Just sign in.',
          'No email after a few minutes? Check your spam folder.',
        ],
        onBackToLogin: widget.onBackToLogin,
      );
    }

    return AuthScaffold(
      title: 'Create account',
      subtitle: 'Sign up to get started with Yard Rota.',
      icon: Icons.person_add_alt_1_outlined,
      showLegalFooter: true,
      children: [
        AutofillGroup(
          child: MenuGroup(
            children: [
              MenuFieldRow(
                icon: Icons.mail_outline_rounded,
                label: 'Email',
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
              ),
              MenuFieldRow(
                icon: Icons.lock_outline_rounded,
                label: 'Password',
                controller: _password,
                obscureText: true,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.newPassword],
              ),
              MenuFieldRow(
                icon: Icons.lock_reset_rounded,
                label: 'Confirm password',
                controller: _confirmation,
                obscureText: true,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.newPassword],
                onSubmitted: (_) => _loading ? null : _submit(),
              ),
            ],
          ),
        ),
        const _FieldHint(passwordRulesHint),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: _loading ? 'Creating account...' : 'Create account',
          onPressed: _loading ? null : _submit,
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: 'Back to sign in',
          variant: AppButtonVariant.ghost,
          onPressed: _loading ? null : widget.onBackToLogin,
        ),
      ],
    );
  }
}

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({
    super.key,
    required this.apiClient,
    required this.onBackToLogin,
  });

  final ApiClient apiClient;
  final VoidCallback onBackToLogin;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _email = TextEditingController();
  bool _loading = false;
  String? _sentTo;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    if (!email.contains('@')) {
      AppToast.show(context, 'Enter a valid email address.');
      return;
    }
    setState(() => _loading = true);
    try {
      await widget.apiClient.sendPasswordReset(email: email);
    } catch (_) {
      // Keep the response generic so account existence is not disclosed.
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _sentTo = email;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final sentTo = _sentTo;
    if (sentTo != null) {
      return _CheckEmailScreen(
        subtitle:
            'If an account exists for $sentTo, a reset link is on its way.',
        steps: const [
          'Open the email on this phone and tap the link.',
          'You will then choose a new password.',
          'No email after a few minutes? Check your spam folder.',
        ],
        onBackToLogin: widget.onBackToLogin,
        onResend: () => setState(() => _sentTo = null),
      );
    }

    return AuthScaffold(
      title: 'Reset password',
      subtitle: 'We will send a secure reset link to your email.',
      icon: Icons.lock_reset_rounded,
      showLegalFooter: true,
      children: [
        MenuGroup(
          children: [
            MenuFieldRow(
              icon: Icons.mail_outline_rounded,
              label: 'Email',
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.email],
              onSubmitted: (_) => _loading ? null : _submit(),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: _loading ? 'Sending...' : 'Send reset instructions',
          onPressed: _loading ? null : _submit,
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: 'Back to sign in',
          variant: AppButtonVariant.ghost,
          onPressed: widget.onBackToLogin,
        ),
      ],
    );
  }
}

class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({
    super.key,
    required this.apiClient,
    required this.onComplete,
  });

  final ApiClient apiClient;
  final VoidCallback onComplete;

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final passwordError = passwordRuleError(_password.text);
    if (passwordError != null) {
      AppToast.show(context, passwordError);
      return;
    }
    if (_password.text != _confirmation.text) {
      AppToast.show(context, 'Passwords do not match.');
      return;
    }
    setState(() => _loading = true);
    try {
      await widget.apiClient.updatePassword(password: _password.text);
      if (!mounted) return;
      AppToast.show(context, 'Password updated successfully.');
      widget.onComplete();
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'The reset link is invalid or has expired.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: 'Set new password',
      subtitle: 'Choose a new password for your account.',
      icon: Icons.password_rounded,
      children: [
        AutofillGroup(
          child: MenuGroup(
            children: [
              MenuFieldRow(
                icon: Icons.lock_outline_rounded,
                label: 'New password',
                controller: _password,
                obscureText: true,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.newPassword],
              ),
              MenuFieldRow(
                icon: Icons.lock_reset_rounded,
                label: 'Confirm password',
                controller: _confirmation,
                obscureText: true,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.newPassword],
                onSubmitted: (_) => _loading ? null : _submit(),
              ),
            ],
          ),
        ),
        const _FieldHint(passwordRulesHint),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: _loading ? 'Updating...' : 'Update password',
          onPressed: _loading ? null : _submit,
        ),
      ],
    );
  }
}

class WaitingForApprovalScreen extends StatefulWidget {
  const WaitingForApprovalScreen({
    super.key,
    required this.apiClient,
    required this.session,
    required this.onRefresh,
    required this.onLogout,
  });

  final ApiClient apiClient;
  final UserSession session;
  final Future<UserSession?> Function() onRefresh;
  final Future<void> Function() onLogout;

  @override
  State<WaitingForApprovalScreen> createState() =>
      _WaitingForApprovalScreenState();
}

class _WaitingForApprovalScreenState extends State<WaitingForApprovalScreen> {
  Timer? _timer;
  bool _refreshing = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    setState(() => _refreshing = true);
    try {
      await widget.onRefresh();
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'Could not refresh your account status.');
      }
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // AuthScaffold forces dark, while this context still has the app theme.
    const colors = AppColorsScheme.dark;
    final rejected = widget.session.isRejected;
    return AuthScaffold(
      title: rejected ? 'Account access denied' : 'Profile awaiting approval',
      subtitle: rejected
          ? 'Your registration was rejected. Contact an administrator for help.'
          : 'Your profile is complete and waiting for administrator approval.',
      icon: rejected ? Icons.block_outlined : Icons.schedule_outlined,
      iconForeground: rejected ? colors.danger : colors.warning,
      iconBackground: rejected ? colors.dangerBg : colors.warningBg,
      children: [
        MenuGroup(
          children: [
            if (!rejected)
              MenuTile(
                icon: Icons.refresh_rounded,
                title: _refreshing ? 'Checking...' : 'Check status',
                subtitle: 'This page also checks automatically.',
                onTap: _refreshing ? null : _refresh,
              ),
            MenuTile(
              icon: Icons.logout,
              title: 'Sign out',
              subtitle: 'Return to the sign in screen',
              onTap: widget.onLogout,
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        MenuGroup(
          children: [
            MenuTile(
              icon: Icons.delete_outline_rounded,
              title: 'Delete account',
              subtitle: 'Permanently remove your account and data',
              isDestructive: true,
              onTap: () => confirmAndDeleteAccount(
                context,
                apiClient: widget.apiClient,
                onDeleted: widget.onLogout,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Confirmation shown after an email with a link was sent.
class _CheckEmailScreen extends StatelessWidget {
  const _CheckEmailScreen({
    required this.subtitle,
    required this.steps,
    required this.onBackToLogin,
    this.onResend,
  });

  final String subtitle;
  final List<String> steps;
  final VoidCallback onBackToLogin;
  final VoidCallback? onResend;

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: 'Check your email',
      subtitle: subtitle,
      icon: Icons.mark_email_read_outlined,
      children: [
        AppCard(
          surfaceOpacity: AppOpacity.subtle,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < steps.length; i++) ...[
                if (i > 0) const SizedBox(height: AppSpacing.md),
                _StepRow(number: i + 1, text: steps[i]),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(label: 'Back to sign in', onPressed: onBackToLogin),
        if (onResend != null) ...[
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: 'Use a different email',
            variant: AppButtonVariant.ghost,
            onPressed: onResend,
          ),
        ],
      ],
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({required this.number, required this.text});

  final int number;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final textTheme = Theme.of(context).textTheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: AppSpacing.xxl,
          height: AppSpacing.xxl,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: colors.primary.withValues(
              alpha: AppOpacity.overlayLight / 2,
            ),
            borderRadius: BorderRadius.circular(AppRadius.full),
          ),
          child: Text(
            '$number',
            style: textTheme.labelMedium?.copyWith(color: colors.primary),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xxs),
            child: Text(
              text,
              style: textTheme.bodyMedium?.copyWith(color: colors.textPrimary),
            ),
          ),
        ),
      ],
    );
  }
}

class _FieldHint extends StatelessWidget {
  const _FieldHint(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xs,
        AppSpacing.sm,
        AppSpacing.xs,
        0,
      ),
      child: Text(
        text,
        style: Theme.of(
          context,
        ).textTheme.bodySmall?.copyWith(color: context.appColors.textSecondary),
      ),
    );
  }
}
