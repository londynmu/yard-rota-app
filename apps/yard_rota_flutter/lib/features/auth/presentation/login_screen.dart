import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_text_field.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    this.isLoading = false,
    this.errorMessage,
    required this.onLogin,
  });

  final bool isLoading;
  final String? errorMessage;
  final Future<void> Function(String email, String password) onLogin;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  String? _validationError;
  bool _isSubmitEnabled = false;

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
      setState(() {
        _validationError = 'Email and password are required.';
      });
      return;
    }

    if (!email.contains('@')) {
      setState(() {
        _validationError = 'Please enter a valid email address.';
      });
      return;
    }

    setState(() {
      _validationError = null;
    });

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
    final colors = context.appColors;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: AppCard(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Yard Rota',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      'Sign in to continue your shift.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    AppTextField(
                      label: 'Email',
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      hint: 'name@yardrota.com',
                      onChanged: (_) => _refreshSubmitState(),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      label: 'Password',
                      controller: _passwordController,
                      obscureText: true,
                      textInputAction: TextInputAction.done,
                      onChanged: (_) => _refreshSubmitState(),
                      onSubmitted: (_) {
                        if (!widget.isLoading && _isSubmitEnabled) {
                          _submit();
                        }
                      },
                    ),
                    if (_validationError != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        _validationError!,
                        style: Theme.of(
                          context,
                        ).textTheme.bodyMedium?.copyWith(color: colors.warning),
                      ),
                    ],
                    if (widget.errorMessage != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        widget.errorMessage!,
                        style: Theme.of(
                          context,
                        ).textTheme.bodyMedium?.copyWith(color: colors.danger),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.xl),
                    AppButton(
                      label: widget.isLoading ? 'Signing in...' : 'Sign in',
                      onPressed: widget.isLoading || !_isSubmitEnabled
                          ? null
                          : _submit,
                    ),
                    if (widget.errorMessage != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      AppButton(
                        label: 'Try again',
                        variant: AppButtonVariant.ghost,
                        onPressed: widget.isLoading ? null : _submit,
                      ),
                    ],
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
