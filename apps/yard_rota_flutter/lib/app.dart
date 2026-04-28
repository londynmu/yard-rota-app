import 'package:flutter/material.dart';

import 'core/network/api_client.dart';
import 'core/network/models.dart';
import 'core/network/network_policy.dart';
import 'core/network/perf_metrics.dart';
import 'core/network/retry_executor.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/calendar/data/availability_repository.dart';
import 'features/calendar/data/calendar_repository.dart';
import 'features/calendar/data/month_cache.dart';
import 'features/calendar/presentation/calendar_screen.dart';

class YardRotaApp extends StatefulWidget {
  const YardRotaApp({super.key, ApiClient? apiClient}) : _apiClient = apiClient;

  final ApiClient? _apiClient;

  @override
  State<YardRotaApp> createState() => _YardRotaAppState();
}

class _YardRotaAppState extends State<YardRotaApp> {
  late final ApiClient _apiClient;
  late final CalendarRepository _calendarRepository;
  late final AvailabilityRepository _availabilityRepository;
  late final Stopwatch _startupStopwatch;

  UserSession? _session;

  bool _isBootstrapping = true;
  bool _isLoginLoading = false;
  String? _loginError;

  @override
  void initState() {
    super.initState();
    _startupStopwatch = Stopwatch()..start();
    _apiClient = widget._apiClient ?? MockApiClient();
    _calendarRepository = CalendarRepository(
      apiClient: _apiClient,
      cache: MonthCache(ttl: const Duration(minutes: 10)),
    );
    _availabilityRepository = AvailabilityRepository(
      apiClient: _apiClient,
      ttl: const Duration(minutes: 10),
    );
    PerfMetrics.recorder = _recordMetric;
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final restored = await RetryExecutor.run(
      task: _apiClient.restoreSession,
      retryUnauthorized: false,
    );
    if (!mounted) {
      return;
    }

    if (restored == null) {
      setState(() {
        _isBootstrapping = false;
      });
      _recordStartupSlo();
      return;
    }
    setState(() {
      _session = restored;
      _isBootstrapping = false;
    });
    _recordStartupSlo();
  }

  Future<void> _handleLogin(String email, String password) async {
    setState(() {
      _isLoginLoading = true;
      _loginError = null;
    });

    final loginStopwatch = Stopwatch()..start();

    try {
      final session = await PerfMetrics.track(
        'auth.login',
        () => RetryExecutor.run(
          task: () => _apiClient.login(email: email, password: password),
          retryUnauthorized: false,
        ),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _session = session;
      });
      loginStopwatch.stop();
      if (loginStopwatch.elapsed > NetworkPolicy.loginToCalendarSlo) {
        _showMessage('Login to calendar exceeded SLO target.');
      }
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        if (error is UnauthorizedException) {
          _loginError = 'Invalid credentials. Please try again.';
        } else {
          _loginError = 'Network issue detected. Please retry.';
        }
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoginLoading = false;
        });
      }
    }
  }

  Future<void> _handleLogout() async {
    try {
      await RetryExecutor.run(
        task: _apiClient.signOut,
        retryUnauthorized: false,
      );
    } catch (_) {
      // Local logout still proceeds if remote sign-out fails.
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _session = null;
      _loginError = null;
    });
  }

  void _recordStartupSlo() {
    _startupStopwatch.stop();
    if (_startupStopwatch.elapsed > NetworkPolicy.startupInteractiveSlo) {
      _showMessage('Startup exceeded SLO target.');
    }
  }

  void _recordMetric(String name, Duration duration) {
    if (name == 'calendar.month.fetch' &&
        duration > NetworkPolicy.monthSwitchCachedSlo) {
      _showMessage('Calendar fetch exceeded SLO target.');
    }
  }

  void _showMessage(String message) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Yard Rota',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      home: _resolveHome(),
    );
  }

  Widget _resolveHome() {
    if (_isBootstrapping) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_session == null) {
      return LoginScreen(
        isLoading: _isLoginLoading,
        errorMessage: _loginError,
        onLogin: _handleLogin,
      );
    }

    return CalendarScreen(
      displayName: _session!.displayName,
      calendarRepository: _calendarRepository,
      availabilityRepository: _availabilityRepository,
      onLogout: _handleLogout,
    );
  }
}
