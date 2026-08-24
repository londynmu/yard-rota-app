import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/network/models.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/home_wallpaper.dart';
import '../../core/ui/connectivity_banner.dart';
import '../calendar/data/availability_repository.dart';
import '../calendar/data/calendar_repository.dart';
import '../home/presentation/home_hub_screen.dart';
import '../home/data/stage_one_repository.dart';
import '../my_rota/data/my_rota_repository.dart';
import '../pre_check/data/pre_check_repository.dart';
import '../stats/data/stats_repository.dart';
import '../stage_three/data/stage_three_repository.dart';
import '../stage_two/data/stage_two_repository.dart';

/// Root shell after sign-in. Home acts as the hub for full-screen features.
class MainShell extends StatelessWidget {
  const MainShell({
    super.key,
    required this.apiClient,
    required this.session,
    required this.calendarRepository,
    required this.availabilityRepository,
    required this.myRotaRepository,
    this.preCheckRepository,
    required this.statsRepository,
    this.stageOneRepository,
    this.stageTwoRepository,
    this.stageThreeRepository,
    required this.onLogout,
    required this.onProfileSaved,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
    required this.onLightHomeWallpaperChanged,
    required this.onDarkHomeWallpaperChanged,
  });

  final UserSession session;
  final ApiClient apiClient;
  final CalendarRepository calendarRepository;
  final AvailabilityRepository availabilityRepository;
  final MyRotaRepository myRotaRepository;
  final PreCheckRepository? preCheckRepository;
  final StatsRepository statsRepository;
  final StageOneRepository? stageOneRepository;
  final StageTwoRepository? stageTwoRepository;
  final StageThreeRepository? stageThreeRepository;
  final Future<void> Function() onLogout;
  final ValueChanged<UserProfile> onProfileSaved;
  final ThemeMode themeMode;
  final Future<void> Function(ThemeMode mode) onThemeModeChanged;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;
  final Future<void> Function(LightHomeWallpaper wallpaper)
  onLightHomeWallpaperChanged;
  final Future<void> Function(DarkHomeWallpaper wallpaper)
  onDarkHomeWallpaperChanged;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final overlay = isDark
        ? const SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarBrightness: Brightness.dark,
            statusBarIconBrightness: Brightness.light,
            systemNavigationBarColor: Colors.transparent,
            systemNavigationBarIconBrightness: Brightness.light,
            systemNavigationBarDividerColor: Colors.transparent,
          )
        : const SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            // iOS: light status bar surface → dark clock / icons.
            statusBarBrightness: Brightness.light,
            statusBarIconBrightness: Brightness.dark,
            systemNavigationBarColor: Colors.transparent,
            systemNavigationBarIconBrightness: Brightness.dark,
            systemNavigationBarDividerColor: Colors.transparent,
          );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlay,
      child: ConnectivityBanner(
        child: HomeHubScreen(
          apiClient: apiClient,
          themeMode: themeMode,
          onThemeModeChanged: onThemeModeChanged,
          lightHomeWallpaper: lightHomeWallpaper,
          darkHomeWallpaper: darkHomeWallpaper,
          onLightHomeWallpaperChanged: onLightHomeWallpaperChanged,
          onDarkHomeWallpaperChanged: onDarkHomeWallpaperChanged,
          onLogout: onLogout,
          onProfileSaved: onProfileSaved,
          session: session,
          calendarRepository: calendarRepository,
          availabilityRepository: availabilityRepository,
          myRotaRepository: myRotaRepository,
          preCheckRepository: preCheckRepository,
          statsRepository: statsRepository,
          stageOneRepository: stageOneRepository,
          stageTwoRepository: stageTwoRepository,
          stageThreeRepository: stageThreeRepository,
        ),
      ),
    );
  }
}
