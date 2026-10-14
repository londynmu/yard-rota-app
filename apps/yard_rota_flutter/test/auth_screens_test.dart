import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/app.dart';
import 'package:yard_rota_flutter/core/network/models.dart';
import 'package:yard_rota_flutter/core/theme/app_theme.dart';
import 'package:yard_rota_flutter/core/ui/app_toast.dart';
import 'package:yard_rota_flutter/features/auth/domain/password_rules.dart';
import 'package:yard_rota_flutter/features/auth/presentation/auth_flow_screens.dart';

import 'support/mock_api_client.dart';

void main() {
  group('passwordRuleError', () {
    test('accepts a strong password', () {
      expect(passwordRuleError('Yard-Rota1'), isNull);
    });

    test('reports the first missing rule', () {
      expect(passwordRuleError('short'), 'Use at least 8 characters.');
      expect(passwordRuleError('password1!'), 'Add an uppercase letter.');
      expect(passwordRuleError('PASSWORD1!'), 'Add a lowercase letter.');
      expect(passwordRuleError('Password!'), 'Add a number.');
      expect(passwordRuleError('Password1'), 'Add a special character.');
    });
  });

  testWidgets('login shows recovery, sign-up and legal links', (tester) async {
    await tester.pumpWidget(YardRotaApp(apiClient: _SignedOutClient()));
    await tester.pumpAndSettle();

    expect(find.text('Forgot password?'), findsOneWidget);
    expect(find.text('Create account'), findsOneWidget);
    expect(find.text('Privacy Policy'), findsOneWidget);
    expect(find.text('Terms of Use'), findsOneWidget);
  });

  testWidgets('password eye toggle reveals and hides the password', (
    tester,
  ) async {
    await tester.pumpWidget(YardRotaApp(apiClient: _SignedOutClient()));
    await tester.pumpAndSettle();

    TextField passwordField() =>
        tester.widget<TextField>(find.byType(TextField).at(1));

    expect(passwordField().obscureText, isTrue);
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(passwordField().obscureText, isFalse);
    await tester.tap(find.byTooltip('Hide password'));
    await tester.pump();
    expect(passwordField().obscureText, isTrue);
  });

  testWidgets('login fits a small phone with the keyboard open', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(YardRotaApp(apiClient: _SignedOutClient()));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    await tester.drag(
      find.byType(SingleChildScrollView),
      const Offset(0, -600),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Terms of Use').hitTestable(), findsOneWidget);
  });

  testWidgets('create account ends on a check-your-email screen', (
    tester,
  ) async {
    await tester.pumpWidget(YardRotaApp(apiClient: _SignedOutClient()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'new@yardrota.com');
    await tester.enterText(fields.at(1), 'Yard-Rota1');
    await tester.enterText(fields.at(2), 'Yard-Rota1');
    final submit = find.widgetWithText(ElevatedButton, 'Create account');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(find.text('Check your email'), findsOneWidget);
    expect(
      find.text('We sent a confirmation link to new@yardrota.com.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Back to sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in'), findsOneWidget);
  });

  testWidgets('system back on sign-up and reset returns to sign in', (
    tester,
  ) async {
    await tester.pumpWidget(YardRotaApp(apiClient: _SignedOutClient()));
    await tester.pumpAndSettle();

    for (final entry in ['Create account', 'Forgot password?']) {
      await tester.tap(find.text(entry));
      await tester.pumpAndSettle();
      expect(find.text('Sign in'), findsNothing);

      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Sign in'), findsOneWidget);
    }
  });

  testWidgets('expired email link shows a notice on the login screen', (
    tester,
  ) async {
    final client = _SignedOutClient();
    await tester.pumpWidget(YardRotaApp(apiClient: client));
    await tester.pumpAndSettle();

    client.events.addError(Exception('otp_expired'));
    await tester.pumpAndSettle();

    const notice =
        'This link is invalid or has expired. Request a new one below.';
    expect(find.text(notice), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(0), 'user@yardrota.com');
    await tester.enterText(find.byType(TextField).at(1), 'yard123');
    await tester.pump();
    await tester.tap(find.text('Sign in'));
    await tester.pump();
    expect(find.text(notice), findsNothing);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 1));
    AppToast.dismissPending();
  });

  testWidgets('set new password rejects a weak password', (tester) async {
    var completed = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: ResetPasswordScreen(
          apiClient: MockApiClient(),
          onComplete: () => completed = true,
        ),
      ),
    );

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'password1');
    await tester.enterText(fields.at(1), 'password1');
    await tester.tap(find.text('Update password'));
    await tester.pump();

    expect(find.text('Add an uppercase letter.'), findsOneWidget);
    expect(completed, isFalse);
    AppToast.dismissPending();
  });
}

class _SignedOutClient extends MockApiClient {
  final events = StreamController<AuthFlowEvent>.broadcast();

  @override
  Stream<AuthFlowEvent> get authEvents => events.stream;

  @override
  Future<UserSession?> restoreSession() async => null;
}
