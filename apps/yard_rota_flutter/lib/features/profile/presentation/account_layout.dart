import 'package:flutter/material.dart';

/// Tablet portrait (≥700) or landscape phone/tablet (≥600 wide).
bool accountIsWideLayout(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  final landscape = size.width > size.height;
  if (landscape && size.width >= 600) {
    return true;
  }
  return size.width >= 700;
}
