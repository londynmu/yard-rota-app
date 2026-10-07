import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/core/config/app_links.dart';

void main() {
  test('tug QR link opens the live web app pre-check page', () {
    expect(
      AppLinks.tugPreCheck('abc123').toString(),
      'https://shunters.net/precheck/tug/abc123',
    );
  });
}
