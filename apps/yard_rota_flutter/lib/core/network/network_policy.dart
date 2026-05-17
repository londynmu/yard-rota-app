class NetworkPolicy {
  const NetworkPolicy._();

  static const Duration requestTimeout = Duration(milliseconds: 1800);

  /// Auth (password grant) can be slower on cold TLS / mobile networks than REST reads.
  static const Duration authRequestTimeout = Duration(seconds: 25);
  static const int maxRetryAttempts = 2;
  static const Duration initialBackoff = Duration(milliseconds: 150);
  static const double backoffMultiplier = 2.0;

  static const Duration loginToHomeSlo = Duration(milliseconds: 800);
  static const Duration monthSwitchCachedSlo = Duration(milliseconds: 100);
  static const Duration startupInteractiveSlo = Duration(milliseconds: 1500);
}

class UnauthorizedException implements Exception {
  const UnauthorizedException(this.message);

  final String message;

  @override
  String toString() => 'UnauthorizedException(message: $message)';
}

class TransientNetworkException implements Exception {
  const TransientNetworkException(this.message);

  final String message;

  @override
  String toString() => 'TransientNetworkException(message: $message)';
}
