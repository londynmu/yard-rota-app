import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/menu_group.dart';
import 'auth_scaffold.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    this.isLoading = false,
    this.errorMessage,
    this.noticeMessage,
    required this.onLogin,
    this.onRegister,
    this.onForgotPassword,
  });

  final bool isLoading;
  final String? errorMessage;

  /// Persistent message above the form, e.g. after an expired email link.
  final String? noticeMessage;
  final Future<void> Function(String email, String password) onLogin;
  final VoidCallback? onRegister;
  final VoidCallback? onForgotPassword;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isSubmitEnabled = false;

  @override
  void didUpdateWidget(LoginScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final message = widget.errorMessage;
    if (message != null && message != oldWidget.errorMessage) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) AppToast.show(context, message);
      });
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      AppToast.show(context, 'Email and password are required.');
      return;
    }

    if (!email.contains('@')) {
      AppToast.show(context, 'Please enter a valid email address.');
      return;
    }

    await widget.onLogin(email, password);
  }

  void _refreshSubmitState() {
    final canSubmit =
        _emailController.text.trim().isNotEmpty &&
        _passwordController.text.isNotEmpty;
    if (_isSubmitEnabled != canSubmit) {
      setState(() {
        _isSubmitEnabled = canSubmit;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final notice = widget.noticeMessage;

    return AuthScaffold(
      title: 'Yard Rota',
      subtitle: 'Sign in to your account.',
      icon: Icons.local_shipping_outlined,
      showLegalFooter: true,
      children: [
        if (notice != null) ...[
          AuthNoticeCard(message: notice, icon: Icons.link_off_rounded),
          const SizedBox(height: AppSpacing.lg),
        ],
        AutofillGroup(
          child: MenuGroup(
            children: [
              MenuFieldRow(
                icon: Icons.mail_outline_rounded,
                label: 'Email',
                hint: 'name@yardrota.com',
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                onChanged: (_) => _refreshSubmitState(),
              ),
              MenuFieldRow(
                icon: Icons.lock_outline_rounded,
                label: 'Password',
                controller: _passwordController,
                obscureText: true,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                onChanged: (_) => _refreshSubmitState(),
                onSubmitted: (_) {
                  if (!widget.isLoading && _isSubmitEnabled) {
                    _submit();
                  }
                },
              ),
            ],
          ),
        ),
        AuthTextAction(
          label: 'Forgot password?',
          onPressed: widget.isLoading ? null : widget.onForgotPassword,
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: widget.isLoading ? 'Signing in...' : 'Sign in',
          onPressed: widget.isLoading || !_isSubmitEnabled ? null : _submit,
        ),
        if (widget.errorMessage != null) ...[
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: 'Try again',
            variant: AppButtonVariant.ghost,
            onPressed: widget.isLoading ? null : _submit,
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        MenuGroup(
          children: [
            MenuTile(
              icon: Icons.person_add_alt_1_outlined,
              title: 'Create account',
              subtitle: 'New to Yard Rota? Request access.',
              onTap: widget.isLoading ? null : widget.onRegister,
            ),
          ],
        ),
      ],
    );
  }
}
