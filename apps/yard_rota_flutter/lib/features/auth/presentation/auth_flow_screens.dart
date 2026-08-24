import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';

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
    final passwordError = _passwordError(password);
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
      AppToast.show(
        context,
        result.requiresEmailConfirmation
            ? 'Check your email to confirm your account.'
            : 'Account created. Complete your profile.',
      );
      widget.onBackToLogin();
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'Could not create your account. Try again.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String? _passwordError(String password) {
    if (password.length < 8) return 'Use at least 8 characters.';
    if (!RegExp('[A-Z]').hasMatch(password)) {
      return 'Add an uppercase letter.';
    }
    if (!RegExp('[a-z]').hasMatch(password)) {
      return 'Add a lowercase letter.';
    }
    if (!RegExp('[0-9]').hasMatch(password)) return 'Add a number.';
    if (!RegExp(r'[!@#$%^&*(),.?":{}|<>_\-+=]').hasMatch(password)) {
      return 'Add a special character.';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return _AuthCard(
      title: 'Create account',
      subtitle: 'Sign up to get started with Yard Rota.',
      children: [
        AppTextField(
          label: 'Email',
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: 'Password',
          controller: _password,
          obscureText: true,
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: 'Confirm password',
          controller: _confirmation,
          obscureText: true,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _loading ? null : _submit(),
        ),
        const SizedBox(height: AppSpacing.xl),
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

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_email.text.trim().contains('@')) {
      AppToast.show(context, 'Enter a valid email address.');
      return;
    }
    setState(() => _loading = true);
    try {
      await widget.apiClient.sendPasswordReset(email: _email.text.trim());
    } catch (_) {
      // Keep the response generic so account existence is not disclosed.
    } finally {
      if (mounted) {
        setState(() => _loading = false);
        AppToast.show(
          context,
          'If an account exists, reset instructions are on the way.',
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return _AuthCard(
      title: 'Reset password',
      subtitle: 'We will send a secure reset link to your email.',
      children: [
        AppTextField(
          label: 'Email',
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _loading ? null : _submit(),
        ),
        const SizedBox(height: AppSpacing.xl),
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
    if (_password.text.length < 8) {
      AppToast.show(context, 'Use at least 8 characters.');
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
    return _AuthCard(
      title: 'Set new password',
      subtitle: 'Choose a new password for your account.',
      children: [
        AppTextField(
          label: 'New password',
          controller: _password,
          obscureText: true,
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: 'Confirm password',
          controller: _confirmation,
          obscureText: true,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _loading ? null : _submit(),
        ),
        const SizedBox(height: AppSpacing.xl),
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
    required this.session,
    required this.onRefresh,
    required this.onLogout,
  });

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
    final rejected = widget.session.isRejected;
    return _AuthCard(
      title: rejected ? 'Account access denied' : 'Profile awaiting approval',
      subtitle: rejected
          ? 'Your registration was rejected. Contact an administrator for help.'
          : 'Your profile is complete and waiting for administrator approval.',
      icon: rejected ? Icons.block_outlined : Icons.schedule_outlined,
      children: [
        if (!rejected)
          Text(
            'This page checks your status automatically.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: context.appColors.textSecondary,
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        if (!rejected) ...[
          AppButton(
            label: _refreshing ? 'Checking...' : 'Check status',
            variant: AppButtonVariant.secondary,
            onPressed: _refreshing ? null : _refresh,
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        AppButton(
          label: 'Sign out',
          variant: AppButtonVariant.ghost,
          onPressed: widget.onLogout,
        ),
      ],
    );
  }
}

class _AuthCard extends StatelessWidget {
  const _AuthCard({
    required this.title,
    required this.subtitle,
    required this.children,
    this.icon,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AppCard(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (icon != null) ...[
                      Icon(icon, size: AppSpacing.giant),
                      const SizedBox(height: AppSpacing.md),
                    ],
                    Text(
                      title,
                      textAlign: icon == null
                          ? TextAlign.start
                          : TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      subtitle,
                      textAlign: icon == null
                          ? TextAlign.start
                          : TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: context.appColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    ...children,
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
