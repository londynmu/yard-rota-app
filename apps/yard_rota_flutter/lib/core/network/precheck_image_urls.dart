import 'package:supabase_flutter/supabase_flutter.dart';

const String precheckImagesBucket = 'precheck-images';

/// Extract a storage object path from a public/signed URL or raw path.
String? extractPrecheckStoragePath(String? urlOrPath) {
  if (urlOrPath == null) return null;
  final trimmed = urlOrPath.trim();
  if (trimmed.isEmpty) return null;

  if (!trimmed.contains('://') && !trimmed.startsWith('/')) {
    return trimmed.replaceFirst(RegExp(r'^/+'), '');
  }

  final uri = Uri.tryParse(trimmed);
  if (uri == null) return null;
  final pathname = uri.path;
  const publicMarker = '/storage/v1/object/public/$precheckImagesBucket/';
  const signMarker = '/storage/v1/object/sign/$precheckImagesBucket/';
  for (final marker in <String>[publicMarker, signMarker]) {
    final idx = pathname.indexOf(marker);
    if (idx != -1) {
      return Uri.decodeComponent(pathname.substring(idx + marker.length));
    }
  }
  final match = RegExp(
    r'/storage/v1/object/(?:public|sign)/precheck-images/(.+)$',
  ).firstMatch(pathname);
  if (match != null) {
    return Uri.decodeComponent(match.group(1)!);
  }
  return null;
}

String buildPrecheckImagePath(String userId, List<String> segments) {
  if (userId.isEmpty) {
    throw ArgumentError('userId is required for precheck image path');
  }
  final parts = segments
      .map((s) => s.replaceAll(RegExp(r'^/+|/+$'), ''))
      .where((s) => s.isNotEmpty)
      .toList(growable: false);
  return <String>[userId, ...parts].join('/');
}

Future<String> createPrecheckSignedUrl(
  SupabaseClient client,
  String urlOrPath, {
  int expiresIn = 3600,
}) async {
  final path = extractPrecheckStoragePath(urlOrPath);
  if (path == null || path.isEmpty) {
    return urlOrPath;
  }
  try {
    final signed = await client.storage
        .from(precheckImagesBucket)
        .createSignedUrl(path, expiresIn);
    if (signed.isEmpty) {
      throw StateError('empty signed URL for $path');
    }
    return signed;
  } catch (_) {
    // Private bucket: public/object URLs always 403 — do not fall back.
    rethrow;
  }
}

Future<List<String>> resolvePrecheckImageUrls(
  SupabaseClient client,
  List<String> urls, {
  int expiresIn = 3600,
}) async {
  final out = <String>[];
  for (final url in urls) {
    try {
      out.add(await createPrecheckSignedUrl(client, url, expiresIn: expiresIn));
    } catch (_) {
      // Skip unsignable URLs (private bucket).
    }
  }
  return out;
}
