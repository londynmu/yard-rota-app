import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/core/network/phone_e164.dart';

void main() {
  group('normalizePhoneE164', () {
    test('returns null for empty input', () {
      expect(normalizePhoneE164(null), isNull);
      expect(normalizePhoneE164(''), isNull);
      expect(normalizePhoneE164('   '), isNull);
    });

    test('accepts UK national and E.164 forms', () {
      expect(normalizePhoneE164('07123456789'), '+447123456789');
      expect(normalizePhoneE164('+44 7123 456789'), '+447123456789');
      expect(normalizePhoneE164('00447123456789'), '+447123456789');
    });

    test('rejects invalid numbers', () {
      expect(() => normalizePhoneE164('123'), throwsFormatException);
      expect(() => normalizePhoneE164('+44'), throwsFormatException);
    });
  });
}
