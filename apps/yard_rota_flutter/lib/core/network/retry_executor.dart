import 'dart:async';

import 'network_policy.dart';

typedef TaskRunner<T> = Future<T> Function();

class RetryExecutor {
  const RetryExecutor._();

  static Future<T> run<T>({
    required TaskRunner<T> task,
    bool retryUnauthorized = false,
  }) async {
    var attempt = 0;
    Duration backoff = NetworkPolicy.initialBackoff;

    while (true) {
      attempt += 1;

      try {
        return await task().timeout(NetworkPolicy.requestTimeout);
      } on UnauthorizedException {
        if (!retryUnauthorized || attempt > NetworkPolicy.maxRetryAttempts) {
          rethrow;
        }
      } on TimeoutException {
        if (attempt > NetworkPolicy.maxRetryAttempts) {
          rethrow;
        }
      } on TransientNetworkException {
        if (attempt > NetworkPolicy.maxRetryAttempts) {
          rethrow;
        }
      }

      await Future<void>.delayed(backoff);
      backoff = Duration(
        milliseconds: (backoff.inMilliseconds * NetworkPolicy.backoffMultiplier)
            .round(),
      );
    }
  }
}
