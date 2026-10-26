import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/core/network/precheck_image_urls.dart';

void main() {
  group('extractPrecheckStoragePath', () {
    test('keeps raw paths', () {
      expect(
        extractPrecheckStoragePath('uid/damages/sub/a.jpg'),
        'uid/damages/sub/a.jpg',
      );
    });

    test('parses public URLs', () {
      const url =
          'https://jkjvtvwedjiupxoibpld.supabase.co/storage/v1/object/public/precheck-images/damages/abc/1.jpg';
      expect(extractPrecheckStoragePath(url), 'damages/abc/1.jpg');
    });

    test('parses signed URLs', () {
      const url =
          'https://example.supabase.co/storage/v1/object/sign/precheck-images/uid/temp/s/1.jpg?token=abc';
      expect(extractPrecheckStoragePath(url), 'uid/temp/s/1.jpg');
    });
  });

  group('buildPrecheckImagePath', () {
    test('prefixes user id', () {
      expect(
        buildPrecheckImagePath('u1', <String>['damages', 's1', 'a.jpg']),
        'u1/damages/s1/a.jpg',
      );
    });
  });
}
