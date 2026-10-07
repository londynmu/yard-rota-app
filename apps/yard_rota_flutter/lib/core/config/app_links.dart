import 'package:flutter/widgets.dart';
import 'package:url_launcher/url_launcher.dart';

import '../ui/app_toast.dart';

/// Public URLs required by App Store / Google Play listings. Pages live in the
/// web app's `public/` folder (served at shunters.net).
abstract final class AppLinks {
  static const String siteUrl = String.fromEnvironment(
    'SITE_URL',
    defaultValue: 'https://shunters.net',
  );

  static const String supportEmail = String.fromEnvironment(
    'SUPPORT_EMAIL',
    defaultValue: 'support@shunters.net',
  );

  static Uri get privacyPolicy => Uri.parse('$siteUrl/privacy-policy.html');
  static Uri get termsOfUse => Uri.parse('$siteUrl/terms.html');
  static Uri get accountDeletion => Uri.parse('$siteUrl/delete-account.html');

  /// Printed on tug QR stickers, so it must open in a phone camera, not only
  /// in the app scanner.
  static Uri tugPreCheck(String qrToken) =>
      Uri.parse('$siteUrl/precheck/tug/$qrToken');
  static Uri get support => Uri(
    scheme: 'mailto',
    path: supportEmail,
    queryParameters: {'subject': 'Yard Rota support'},
  );
}

Future<void> openAppLink(BuildContext context, Uri uri) async {
  final opened = await launchUrl(
    uri,
    mode: LaunchMode.externalApplication,
  ).catchError((_) => false);
  if (!opened && context.mounted) {
    AppToast.show(context, 'Could not open the link. Try again later.');
  }
}
