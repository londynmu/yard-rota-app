/// Normalize and validate phone numbers for WhatsApp messaging (E.164).
/// Default country is GB (+44) for UK yard staff. Mirrors `src/utils/phoneE164.js`.
library;

final RegExp _e164Re = RegExp(r'^\+[1-9]\d{7,14}$');

bool isValidPhoneE164(String? value) {
  return value != null && _e164Re.hasMatch(value);
}

/// Empty / whitespace-only → `null`. Invalid non-empty → throws [FormatException]
/// with an English message suitable for toasts.
String? normalizePhoneE164(String? input, {String defaultCountry = 'GB'}) {
  if (input == null) return null;

  final raw = input.trim();
  if (raw.isEmpty) return null;

  var digits = raw.replaceAll(RegExp(r'[\s\-().]'), '');

  if (digits.startsWith('00')) {
    digits = '+${digits.substring(2)}';
  }

  if (!digits.startsWith('+')) {
    if (defaultCountry == 'GB') {
      if (digits.startsWith('0')) {
        digits = '+44${digits.substring(1)}';
      } else if (RegExp(r'^\d{10,11}$').hasMatch(digits)) {
        digits = '+44$digits';
      } else {
        throw const FormatException(
          'Enter a valid UK mobile number (e.g. +447… or 07…)',
        );
      }
    } else {
      throw const FormatException(
        'Phone number must include a country code (e.g. +44…)',
      );
    }
  }

  digits = '+${digits.substring(1).replaceAll(RegExp(r'\D'), '')}';

  if (!isValidPhoneE164(digits)) {
    throw const FormatException(
      'Enter a valid phone number in international format (E.164)',
    );
  }

  return digits;
}
