import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../network/precheck_image_urls.dart';

/// Loads a precheck storage image via createSignedUrl.
/// Private bucket — never falls back to stored public URLs.
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
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  @override
  void didUpdateWidget(covariant PrecheckSignedImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _failed = false;
      _src = null;
      _resolve();
    }
  }

  Future<void> _resolve() async {
    final path = extractPrecheckStoragePath(widget.url);
    if (path == null || path.isEmpty) {
      // blob/data or unparseable — only allow non-http local-style if not a storage public URL
      if (widget.url.startsWith('blob:') || widget.url.startsWith('data:')) {
        if (!mounted) return;
        setState(() {
          _src = widget.url;
          _failed = false;
        });
        return;
      }
      if (!mounted) return;
      setState(() {
        _src = null;
        _failed = true;
      });
      return;
    }

    try {
      final signed = await createPrecheckSignedUrl(
        Supabase.instance.client,
        widget.url,
      );
      if (!mounted) return;
      if (signed.isEmpty || signed.contains('/object/public/')) {
        setState(() {
          _src = null;
          _failed = true;
        });
        return;
      }
      setState(() {
        _src = signed;
        _failed = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _src = null;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return SizedBox(
        height: widget.height,
        width: widget.width,
        child: const Center(
          child: Icon(Icons.broken_image_outlined, color: Colors.black38),
        ),
      );
    }
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
