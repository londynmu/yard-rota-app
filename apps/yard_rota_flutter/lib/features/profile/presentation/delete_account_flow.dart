import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/network_policy.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';

/// Asks for the password, deletes the signed-in account, then runs
/// [onDeleted] (sign-out and local data wipe). Returns true when the account
/// was deleted.
Future<bool> confirmAndDeleteAccount(
  BuildContext context, {
  required ApiClient apiClient,
  required Future<void> Function() onDeleted,
}) async {
  final password = await showDialog<String>(
    context: context,
    builder: (_) => const _DeleteAccountDialog(),
  );
  if (password == null || password.isEmpty || !context.mounted) return false;

  try {
    await apiClient.deleteAccount(password: password);
  } on AccountDeletionException catch (error) {
    if (context.mounted) {
      AppToast.show(context, switch (error.reason) {
        AccountDeletionFailure.incorrectPassword =>
          'Incorrect password. Try again.',
        AccountDeletionFailure.reauthRequired =>
          'Please confirm your password again to delete your account.',
        AccountDeletionFailure.lastAdmin =>
          'You are the only administrator. Assign another admin first.',
      });
    }
    return false;
  } catch (_) {
    if (context.mounted) {
      AppToast.show(context, 'Could not delete your account. Try again.');
    }
    return false;
  }

  if (context.mounted) {
    Navigator.of(context).popUntil((route) => route.isFirst);
  }
  await onDeleted();
  return true;
}

class _DeleteAccountDialog extends StatefulWidget {
  const _DeleteAccountDialog();

  @override
  State<_DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<_DeleteAccountDialog> {
  final _password = TextEditingController();

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  void _submit() {
    if (_password.text.isEmpty) return;
    Navigator.pop(context, _password.text);
  }

  @override
  Widget build(BuildContext context) {
    final danger = context.appColors.danger;
    return AlertDialog(
      title: const Text('Delete account'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Your name, email, photo, availability and notes will be '
            'permanently removed and you will be signed out. PreCheck and '
            'safety records stay on file without your name. This cannot be '
            'undone.',
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Confirm your password',
            controller: _password,
            obscureText: true,
            textInputAction: TextInputAction.done,
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _submit(),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        OutlinedButton(
          onPressed: _password.text.isEmpty ? null : _submit,
          style: OutlinedButton.styleFrom(
            foregroundColor: danger,
            side: BorderSide(color: danger),
          ),
          child: const Text('Delete account'),
        ),
      ],
    );
  }
}
