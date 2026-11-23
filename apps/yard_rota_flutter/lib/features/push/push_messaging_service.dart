import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Android notification channel used for foreground FCM display.
const String kPushChannelId = 'yard_rota_breaks';
const String kPushChannelName = 'Break reminders';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background isolate — Firebase may need init before other plugins.
  try {
    await Firebase.initializeApp();
  } catch (_) {}
}

/// Registers FCM on Android, syncs tokens to `device_tokens`, shows foreground
/// notifications via [flutter_local_notifications].
class PushMessagingService {
  /// [client] may be null in widget tests (no Supabase). Production passes a
  /// client or relies on [Supabase.instance] after [Supabase.initialize].
  PushMessagingService({SupabaseClient? client}) : _clientOverride = client;

  final SupabaseClient? _clientOverride;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool _ready = false;
  String? _currentToken;

  bool get isReady => _ready;

  SupabaseClient? get _client {
    if (_clientOverride != null) return _clientOverride;
    try {
      return Supabase.instance.client;
    } catch (_) {
      return null;
    }
  }

  Future<void> initialize() async {
    if (kIsWeb || !Platform.isAndroid) {
      return;
    }
    try {
      await Firebase.initializeApp();
    } catch (error, stack) {
      debugPrint('Firebase.initializeApp failed: $error\n$stack');
      return;
    }

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _local.initialize(
      const InitializationSettings(android: androidInit),
    );
    await _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            kPushChannelId,
            kPushChannelName,
            description: 'Reminders when your break is due',
            importance: Importance.high,
          ),
        );

    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);
    await messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    FirebaseMessaging.onMessage.listen(_showForegroundNotification);
    messaging.onTokenRefresh.listen((token) {
      _currentToken = token;
      _upsertToken(token);
    });

    _ready = true;
    await syncTokenForCurrentUser();
  }

  Future<void> syncTokenForCurrentUser() async {
    if (!_ready) return;
    final client = _client;
    final userId = client?.auth.currentUser?.id;
    if (client == null || userId == null) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null || token.isEmpty) return;
      _currentToken = token;
      await _upsertToken(token);
    } catch (error) {
      debugPrint('FCM getToken/upsert failed: $error');
    }
  }

  Future<void> clearTokenForCurrentUser() async {
    final client = _client;
    final userId = client?.auth.currentUser?.id;
    final token = _currentToken;
    if (client == null || userId == null) return;
    try {
      if (token != null && token.isNotEmpty) {
        await client
            .from('device_tokens')
            .delete()
            .eq('user_id', userId)
            .eq('token', token);
      } else {
        await client.from('device_tokens').delete().eq('user_id', userId);
      }
    } catch (error) {
      debugPrint('FCM token delete failed: $error');
    }
    try {
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
    _currentToken = null;
  }

  Future<bool> fetchPushOptIn() async {
    final client = _client;
    final userId = client?.auth.currentUser?.id;
    if (client == null || userId == null) return true;
    final row = await client
        .from('profiles')
        .select('push_opt_in')
        .eq('id', userId)
        .maybeSingle();
    final value = row?['push_opt_in'];
    if (value is bool) return value;
    return true;
  }

  Future<void> setPushOptIn(bool enabled) async {
    final client = _client;
    final userId = client?.auth.currentUser?.id;
    if (client == null || userId == null) {
      throw StateError('Not signed in');
    }
    await client
        .from('profiles')
        .update(<String, dynamic>{
          'push_opt_in': enabled,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', userId);
    if (enabled) {
      await syncTokenForCurrentUser();
    } else if (_currentToken != null) {
      await client
          .from('device_tokens')
          .delete()
          .eq('user_id', userId)
          .eq('token', _currentToken!);
    }
  }

  Future<void> _upsertToken(String token) async {
    final client = _client;
    final userId = client?.auth.currentUser?.id;
    if (client == null || userId == null) return;
    final now = DateTime.now().toUtc().toIso8601String();
    await client.from('device_tokens').upsert(
      <String, dynamic>{
        'user_id': userId,
        'token': token,
        'platform': 'android',
        'updated_at': now,
      },
      onConflict: 'token',
    );
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    final notification = message.notification;
    final title = notification?.title ?? message.data['title']?.toString();
    final body = notification?.body ?? message.data['body']?.toString();
    if (title == null && body == null) return;

    await _local.show(
      message.hashCode,
      title ?? 'Yard Rota',
      body ?? '',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          kPushChannelId,
          kPushChannelName,
          channelDescription: 'Reminders when your break is due',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: message.data['break_id']?.toString(),
    );
  }
}
