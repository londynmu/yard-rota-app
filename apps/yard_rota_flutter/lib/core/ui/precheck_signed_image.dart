import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../network/precheck_image_urls.dart';

/// Loads a precheck storage image via createSignedUrl.
class PrecheckSignedImage extends StatefulWidget {
  const PrecheckSignedImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.height,
    this.width,
    this.borderRadius,
    this.errorBuilder,
  });

  final String url;
  final BoxFit fit;
  final double? height;
  final double? width;
  final BorderRadius? borderRadius;
  final ImageErrorWidgetBuilder? errorBuilder;

  @override
  State<PrecheckSignedImage> createState() => _PrecheckSignedImageState();
}

class _PrecheckSignedImageState extends State<PrecheckSignedImage> {
  String? _src;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  @override
  void didUpdateWidget(covariant PrecheckSignedImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _resolve();
    }
  }

  Future<void> _resolve() async {
    final signed = await createPrecheckSignedUrl(
      Supabase.instance.client,
      widget.url,
    );
    if (!mounted) return;
    setState(() => _src = signed);
  }

  @override
  Widget build(BuildContext context) {
    final src = _src;
    if (src == null) {
      return SizedBox(height: widget.height, width: widget.width);
    }
    final image = Image.network(
      src,
      fit: widget.fit,
      height: widget.height,
      width: widget.width,
      errorBuilder:
          widget.errorBuilder ??
          (_, _, _) => const Center(child: Icon(Icons.broken_image_outlined)),
    );
    if (widget.borderRadius != null) {
      return ClipRRect(borderRadius: widget.borderRadius!, child: image);
    }
    return image;
  }
}
