import 'package:flutter/widgets.dart';

/// Anchor rect for share sheets. iPad and macOS present the share UI as a
/// popover and crash or misplace it when no origin is given.
Rect shareOriginFor(BuildContext context) {
  final box = context.findRenderObject();
  if (box is RenderBox && box.hasSize && box.size != Size.zero) {
    return box.localToGlobal(Offset.zero) & box.size;
  }
  final size = MediaQuery.sizeOf(context);
  return Rect.fromCenter(
    center: Offset(size.width / 2, size.height / 2),
    width: 1,
    height: 1,
  );
}
