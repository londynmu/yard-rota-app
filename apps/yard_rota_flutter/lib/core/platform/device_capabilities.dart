import 'dart:ui' show FlutterView;

import 'package:flutter/foundation.dart';

/// Hardware features that differ between phones and desktop builds.
abstract final class DeviceCapabilities {
  static bool get _isMobileOs =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  /// `image_picker` camera capture works only on Android and iOS; desktop
  /// builds fall back to choosing a file.
  static bool get supportsCameraCapture => _isMobileOs;

  /// `mobile_scanner` supports Android, iOS and macOS.
  static bool get supportsQrScanner =>
      _isMobileOs || (!kIsWeb && defaultTargetPlatform == TargetPlatform.macOS);

  /// Phones are locked to portrait; tablets and desktop windows may rotate
  /// or resize freely.
  static bool isPhone(FlutterView view) {
    final shortestSide = view.physicalSize.shortestSide / view.devicePixelRatio;
    return _isMobileOs && shortestSide < 600;
  }
}
