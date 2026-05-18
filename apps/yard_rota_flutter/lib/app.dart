import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/network/api_client.dart';
import 'core/local_db/app_local_database.dart';
import 'core/network/models.dart';
import 'core/network/network_policy.dart';
import 'core/network/perf_metrics.dart';
import 'core/network/retry_executor.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/home_wallpaper.dart';
import 'core/theme/home_wallpaper_storage.dart';
import 'core/ui/app_toast.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/calendar/data/availability_repository.dart';
import 'features/calendar/data/calendar_repository.dart';
import 'features/my_rota/data/my_rota_repository.dart';
import 'features/pre_check/data/pre_check_repository.dart';
import 'features/shell/main_shell.dart';
import 'features/stats/data/stats_repository.dart';
import 'core/theme/theme_mode_storage.dart';

class YardRotaApp extends StatefulWidget {
  const YardRotaApp({
    super.key,
    ApiClient? apiClient,
    AppLocalDatabase? localDb,
    PreCheckRepository? preCheckRepository,
    this.initialThemeMode = ThemeMode.system,
    this.initialLightHomeWallpaper = LightHomeWallpaper.classic,
    this.initialDarkHomeWallpaper = DarkHomeWallpaper.nightMesh,
  }) : _apiClient = apiClient,
       _localDb = localDb,
       _preCheckRepository = preCheckRepository;

  final ApiClient? _apiClient;
  final AppLocalDatabase? _localDb;
  final PreCheckRepository? _preCheckRepository;
  final ThemeMode initialThemeMode;
  final LightHomeWallpaper initialLightHomeWallpaper;
  final DarkHomeWallpaper initialDarkHomeWallpaper;

  @override
  State<YardRotaApp> createState() => _YardRotaAppState();
}

class _YardRotaAppState extends State<YardRotaApp> with WidgetsBindingObserver {
  late final ApiClient _apiClient;
  late final AppLocalDatabase _localDb;
  late final CalendarRepository _calendarRepository;
  late final AvailabilityRepository _availabilityRepository;
  late final MyRotaRepository _myRotaRepository;
  late final StatsRepository _statsRepository;
  late final Stopwatch _startupStopwatch;

  UserSession? _session;

  bool _isBootstrapping = true;
  bool _isLoginLoading = false;
  String? _loginError;
  late ThemeMode _themeMode;
  late LightHomeWallpaper _lightHomeWallpaper;
  late DarkHomeWallpaper _darkHomeWallpaper;

  @override
  void initState() {
    super.initState();
    _themeMode = widget.initialThemeMode;
    _lightHomeWallpaper = widget.initialLightHomeWallpaper;
    _darkHomeWallpaper = widget.initialDarkHomeWallpaper;
    WidgetsBinding.instance.addObserver(this);
    _startupStopwatch = Stopwatch()..start();
    _apiClient = widget._apiClient ?? MockApiClient();
    _localDb = widget._localDb ?? AppLocalDatabase.inMemory();
    _calendarRepository = CalendarRepository(
      apiClient: _apiClient,
      localDb: _localDb,
    );
    _availabilityRepository = AvailabilityRepository(
      apiClient: _apiClient,
      localDb: _localDb,
    );
    _myRotaRepository = MyRotaRepository(apiClient: _apiClient);
    _statsRepository = StatsRepository(
      apiClient: _apiClient,
      localDb: _localDb,
    );
    PerfMetrics.recorder = _recordMetric;
    _bootstrap();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _session != null) {
      _availabilityRepository.flushOutbox();
    }
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
    await _availabilityRepository.flushOutbox();
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
          requestTimeout: NetworkPolicy.authRequestTimeout,
        ),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _session = session;
      });
      await _availabilityRepository.flushOutbox();
      loginStopwatch.stop();
      if (loginStopwatch.elapsed > NetworkPolicy.loginToHomeSlo) {
        _showMessage('Login to home exceeded SLO target.');
      }
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        if (error is UnauthorizedException) {
          final detail = error.message.trim();
          _loginError = detail.isEmpty
              ? 'Sign in failed. Please check your email and password.'
              : detail;
        } else if (error is TimeoutException) {
          _loginError =
              'Request timed out. Check your connection and try again.';
        } else if (error is TransientNetworkException) {
          _loginError =
              'Could not reach the server. Check your connection and try again.';
        } else {
          _loginError = 'Something went wrong. Please try again.';
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
    await _localDb.clearAllUserData();
  }

  Future<void> _handleThemeModeChanged(ThemeMode mode) async {
    await writeSavedThemeMode(mode);
    if (!mounted) {
      return;
    }
    setState(() {
      _themeMode = mode;
    });
  }

  Future<void> _handleLightHomeWallpaperChanged(
    LightHomeWallpaper wallpaper,
  ) async {
    await writeSavedLightHomeWallpaper(wallpaper);
    if (!mounted) {
      return;
    }
    setState(() {
      _lightHomeWallpaper = wallpaper;
    });
  }

  Future<void> _handleDarkHomeWallpaperChanged(
    DarkHomeWallpaper wallpaper,
  ) async {
    await writeSavedDarkHomeWallpaper(wallpaper);
    if (!mounted) {
      return;
    }
    setState(() {
      _darkHomeWallpaper = wallpaper;
    });
  }

  void _recordStartupSlo() {
    _startupStopwatch.stop();
    if (_startupStopwatch.elapsed > NetworkPolicy.startupInteractiveSlo) {
      _showMessage('Startup exceeded SLO target.');
    }
  }

  void _recordMetric(String name, Duration duration) {
    // Perf hook reserved for analytics; avoid surfacing internal SLO thresholds as toasts.
  }

  void _showMessage(String message) {
    AppToast.show(context, message, duration: const Duration(seconds: 4));
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Yard Rota',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: _themeMode,
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

    return MainShell(
      session: _session!,
      calendarRepository: _calendarRepository,
      availabilityRepository: _availabilityRepository,
      myRotaRepository: _myRotaRepository,
      preCheckRepository: _resolvePreCheckRepository(),
      statsRepository: _statsRepository,
      onLogout: _handleLogout,
      themeMode: _themeMode,
      onThemeModeChanged: _handleThemeModeChanged,
      lightHomeWallpaper: _lightHomeWallpaper,
      darkHomeWallpaper: _darkHomeWallpaper,
      onLightHomeWallpaperChanged: _handleLightHomeWallpaperChanged,
      onDarkHomeWallpaperChanged: _handleDarkHomeWallpaperChanged,
    );
  }

  PreCheckRepository? _resolvePreCheckRepository() {
    if (widget._preCheckRepository != null) {
      return widget._preCheckRepository;
    }
    try {
      return PreCheckRepository(
        supabaseClient: Supabase.instance.client,
        localDb: _localDb,
      );
    } catch (_) {
      return null;
    }
  }
}
