/// Shown under password fields so users know the rules before submitting.
const String passwordRulesHint =
    'Use at least 8 characters with upper and lower case letters, a number '
    'and a special character.';

/// Returns the first unmet rule as a user-facing message, or `null` when the
/// password is strong enough. Shared by sign-up and password reset.
String? passwordRuleError(String password) {
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
