import 'package:flutter/material.dart';

@immutable
class AppPrimitives {
  const AppPrimitives._();

  static const blue50 = Color(0xFFEFF6FF);
  static const blue100 = Color(0xFFDBEAFE);
  static const blue200 = Color(0xFFBFDBFE);
  static const blue300 = Color(0xFF93C5FD);
  static const blue400 = Color(0xFF60A5FA);
  static const blue500 = Color(0xFF3B82F6);
  static const blue600 = Color(0xFF2563EB);
  static const blue700 = Color(0xFF1D4ED8);
  static const blue800 = Color(0xFF1E40AF);
  static const blue900 = Color(0xFF1E3A8A);

  static const slate50 = Color(0xFFF8FAFC);
  static const slate100 = Color(0xFFF1F5F9);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate300 = Color(0xFFCBD5E1);
  static const slate400 = Color(0xFF94A3B8);
  static const slate500 = Color(0xFF64748B);
  static const slate600 = Color(0xFF475569);
  static const slate700 = Color(0xFF334155);
  static const slate800 = Color(0xFF1E293B);
  static const slate900 = Color(0xFF0F172A);

  static const green50 = Color(0xFFECFDF5);
  static const green100 = Color(0xFFD1FAE5);
  static const green200 = Color(0xFFA7F3D0);
  static const green300 = Color(0xFF6EE7B7);
  static const green400 = Color(0xFF34D399);
  static const green500 = Color(0xFF10B981);
  static const green600 = Color(0xFF059669);
  static const green700 = Color(0xFF047857);
  static const green800 = Color(0xFF065F46);
  static const green900 = Color(0xFF064E3B);

  static const amber50 = Color(0xFFFFFBEB);
  static const amber100 = Color(0xFFFEF3C7);
  static const amber200 = Color(0xFFFDE68A);
  static const amber300 = Color(0xFFFCD34D);
  static const amber400 = Color(0xFFFBBF24);
  static const amber500 = Color(0xFFF59E0B);
  static const amber600 = Color(0xFFD97706);
  static const amber700 = Color(0xFFB45309);
  static const amber800 = Color(0xFF92400E);
  static const amber900 = Color(0xFF78350F);

  static const red50 = Color(0xFFFEF2F2);
  static const red100 = Color(0xFFFEE2E2);
  static const red200 = Color(0xFFFECACA);
  static const red300 = Color(0xFFFCA5A5);
  static const red400 = Color(0xFFF87171);
  static const red500 = Color(0xFFEF4444);
  static const red600 = Color(0xFFDC2626);
  static const red700 = Color(0xFFB91C1C);
  static const red800 = Color(0xFF991B1B);
  static const red900 = Color(0xFF7F1D1D);

  static const cyan50 = Color(0xFFECFEFF);
  static const cyan100 = Color(0xFFCFFAFE);
  static const cyan200 = Color(0xFFA5F3FC);
  static const cyan300 = Color(0xFF67E8F9);
  static const cyan400 = Color(0xFF22D3EE);
  static const cyan500 = Color(0xFF06B6D4);
  static const cyan600 = Color(0xFF0891B2);
  static const cyan700 = Color(0xFF0E7490);
  static const cyan800 = Color(0xFF155E75);
  static const cyan900 = Color(0xFF164E63);

  static const white = Color(0xFFFFFFFF);
  static const black = Color(0xFF000000);
}

@immutable
class AppColorsScheme {
  final Color bgPrimary;
  final Color bgSecondary;
  final Color bgTertiary;
  final Color bgElevated;
  final Color bgInverse;

  final Color textPrimary;
  final Color textSecondary;
  final Color textTertiary;
  final Color textInverse;
  final Color textDisabled;

  final Color borderSubtle;
  final Color borderDefault;
  final Color borderStrong;
  final Color divider;

  final Color primary;
  final Color primaryHover;
  final Color primaryPressed;
  final Color primaryDisabled;
  final Color onPrimary;

  final Color success;
  final Color onSuccess;
  final Color successBg;

  final Color warning;
  final Color onWarning;
  final Color warningBg;

  final Color danger;
  final Color onDanger;
  final Color dangerBg;

  final Color info;
  final Color onInfo;
  final Color infoBg;

  final Color focusRing;
  final Color overlay;
  final Color shadow;

  const AppColorsScheme({
    required this.bgPrimary,
    required this.bgSecondary,
    required this.bgTertiary,
    required this.bgElevated,
    required this.bgInverse,
    required this.textPrimary,
    required this.textSecondary,
    required this.textTertiary,
    required this.textInverse,
    required this.textDisabled,
    required this.borderSubtle,
    required this.borderDefault,
    required this.borderStrong,
    required this.divider,
    required this.primary,
    required this.primaryHover,
    required this.primaryPressed,
    required this.primaryDisabled,
    required this.onPrimary,
    required this.success,
    required this.onSuccess,
    required this.successBg,
    required this.warning,
    required this.onWarning,
    required this.warningBg,
    required this.danger,
    required this.onDanger,
    required this.dangerBg,
    required this.info,
    required this.onInfo,
    required this.infoBg,
    required this.focusRing,
    required this.overlay,
    required this.shadow,
  });

  static const light = AppColorsScheme(
    bgPrimary: AppPrimitives.white,
    bgSecondary: AppPrimitives.slate50,
    bgTertiary: AppPrimitives.slate100,
    bgElevated: AppPrimitives.white,
    bgInverse: AppPrimitives.slate900,
    textPrimary: AppPrimitives.slate900,
    textSecondary: AppPrimitives.slate700,
    textTertiary: AppPrimitives.slate500,
    textInverse: AppPrimitives.white,
    textDisabled: AppPrimitives.slate400,
    borderSubtle: AppPrimitives.slate100,
    borderDefault: AppPrimitives.slate200,
    borderStrong: AppPrimitives.slate300,
    divider: AppPrimitives.slate200,
    primary: AppPrimitives.blue600,
    primaryHover: AppPrimitives.blue700,
    primaryPressed: AppPrimitives.blue800,
    primaryDisabled: AppPrimitives.blue200,
    onPrimary: AppPrimitives.white,
    success: AppPrimitives.green600,
    onSuccess: AppPrimitives.white,
    successBg: AppPrimitives.green50,
    warning: AppPrimitives.amber600,
    onWarning: AppPrimitives.white,
    warningBg: AppPrimitives.amber50,
    danger: AppPrimitives.red600,
    onDanger: AppPrimitives.white,
    dangerBg: AppPrimitives.red50,
    info: AppPrimitives.cyan600,
    onInfo: AppPrimitives.white,
    infoBg: AppPrimitives.cyan50,
    focusRing: AppPrimitives.blue400,
    overlay: Color(0x660F172A),
    shadow: Color(0x1A0F172A),
  );

  static const dark = AppColorsScheme(
    bgPrimary: AppPrimitives.slate900,
    bgSecondary: AppPrimitives.slate800,
    bgTertiary: AppPrimitives.slate700,
    bgElevated: Color(0xFF111827),
    bgInverse: AppPrimitives.white,
    textPrimary: AppPrimitives.slate50,
    textSecondary: AppPrimitives.slate200,
    textTertiary: AppPrimitives.slate400,
    textInverse: AppPrimitives.slate900,
    textDisabled: AppPrimitives.slate500,
    borderSubtle: Color(0xFF1F2937),
    borderDefault: AppPrimitives.slate700,
    borderStrong: AppPrimitives.slate600,
    divider: AppPrimitives.slate700,
    primary: AppPrimitives.blue400,
    primaryHover: AppPrimitives.blue300,
    primaryPressed: AppPrimitives.blue200,
    primaryDisabled: Color(0xFF334155),
    onPrimary: AppPrimitives.slate900,
    success: AppPrimitives.green400,
    onSuccess: AppPrimitives.slate900,
    successBg: Color(0xFF052E1C),
    warning: AppPrimitives.amber400,
    onWarning: AppPrimitives.slate900,
    warningBg: Color(0xFF3F2A05),
    danger: AppPrimitives.red400,
    onDanger: AppPrimitives.slate900,
    dangerBg: Color(0xFF3A0B0B),
    info: AppPrimitives.cyan400,
    onInfo: AppPrimitives.slate900,
    infoBg: Color(0xFF083344),
    focusRing: AppPrimitives.blue300,
    overlay: Color(0xB30F172A),
    shadow: Color(0x66000000),
  );
}

@immutable
class AppSpacing {
  const AppSpacing._();

  static const xxs = 2.0;
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 24.0;
  static const xxxl = 32.0;
  static const huge = 40.0;
  static const giant = 48.0;
}

@immutable
class AppRadius {
  const AppRadius._();

  static const xs = 6.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const full = 999.0;
}

@immutable
class AppElevation {
  const AppElevation._();

  static const level0 = 0.0;
  static const level1 = 1.0;
  static const level2 = 2.0;
  static const level3 = 4.0;
  static const level4 = 8.0;
  static const level5 = 12.0;
}

@immutable
class AppStroke {
  const AppStroke._();

  static const hairline = 0.5;
  static const thin = 1.0;
  static const medium = 1.5;
  static const thick = 2.0;
}

@immutable
class AppOpacity {
  const AppOpacity._();

  static const disabled = 0.38;
  static const muted = 0.60;
  static const subtle = 0.72;
  static const overlayLight = 0.32;
  static const overlayStrong = 0.70;

  /// M3 segmented-button track scrim over wallpaper (Figma M3 kit — Segmented button).
  static const segmentedTrackFill = 0.5;
}

/// Material 3 Design Kit (Community) — baseline segmented button, density 0.
/// Source: `…/Material-3-Design-Kit--Community-` → Segmented button (e.g. 3 segments, 48×310).
@immutable
class AppM3SegmentedButton {
  const AppM3SegmentedButton._();

  static const double trackCornerRadius = 28;
  static const double slotCornerRadius = 20;
  static const double slotAdjacentCornerTightRatio = 0.35;
  static const double slotMiddleCornerRatio = 0.45;
  static const double trackHeight = 48;
  static const double trackPadding = 4;
  static const double iconSize = 20;
  static const double selectionCheckIconSize = 18;
  static const double selectedShadowBlur = 8;
  static const double selectedShadowOffsetY = 2;
  static const double selectedShadowAlpha = 0.14;
}

/// Material 3 Design Kit (Community) — Carousel + Building blocks (card items).
/// Figma: Carousel / Full screen + item corners `extra-large` 28px; track `gap` 8 for multi-item layouts.
@immutable
class AppM3Carousel {
  const AppM3Carousel._();

  /// M3 shape corner extra-large on carousel page cards (matches kit building blocks).
  static const double pageCardRadius = 28;

  /// Horizontal gap between carousel items in multi-item kit layouts (peek v2).
  static const double pageGap = 8;

  /// Left/right padding on each My Rota day page; pair sums to [pageGap] between cards.
  static const double pageCardHorizontalPadding = 4;
}

/// Figma: Luxury Gradients (Community) — Home card gradient windows.
@immutable
class AppLuxuryHomeGradient {
  const AppLuxuryHomeGradient._();

  static const double cardHeight = 78;
  static const double virtualHeight = 620;
  static const double sliceStride = 82;
  static const double iconSurfaceAlpha = 0.18;
  static const double contentOverlayStartAlpha = 0.08;
  static const double contentOverlayEndAlpha = 0.42;
  static const double borderAlpha = 0.24;
  static const double textShadowAlpha = 0.38;
  static const double textEntranceSlideX = 0.35;
  static const textEntrancePerCard = Duration(milliseconds: 130);
  static const darkContent = Color(0xFFFFFFFF);
  static const lightContent = Color(0xFF172033);

  static const darkColors = [
    Color(0xFF070B18),
    Color(0xFF10182B),
    Color(0xFF1D2946),
    Color(0xFF25385A),
    Color(0xFF284B5E),
    Color(0xFF1B3652),
    Color(0xFF090D1A),
  ];

  static const lightColors = [
    Color(0xFFFBF8EF),
    Color(0xFFF6EFD9),
    Color(0xFFE9EFF7),
    Color(0xFFD7EAF5),
    Color(0xFFE7DCAE),
    Color(0xFFEAF4F7),
    Color(0xFFF8F5EC),
  ];

  static const stops = [0.0, 0.17, 0.34, 0.52, 0.68, 0.84, 1.0];
}

/// My Rota — compact vertical rhythm for shift lists (`MyRotaScreen` / day details).
@immutable
class AppMyRotaListSpacing {
  const AppMyRotaListSpacing._();

  static const double sectionBottom = AppSpacing.xs;
  static const double timeInlineIconSize = 14;

  /// Fixed width for time+icon column so follow-up rows (same slot time) align without repeating time.
  static const double timeColumnFixedWidth = 118;
  static const double dayHeaderWeekdayColumnWidth = 82;
  static const double dayHeaderDateColumnWidth = 34;
  static const double locationInlineIconSize = 14;

  /// Vertical padding per person row (tighter list).
  static const double slotRowVertical = AppSpacing.xxs;
  static const double slotRowHorizontal = AppSpacing.sm;
  static const double dayCardBottom = AppSpacing.sm;
  static const double dayCardHeaderAll = AppSpacing.sm;

  /// Inset for weekday+date line from card inner edge (My Rota day header).
  static const double dayCardHeaderTextLeadInset = 6;
  static const double chipWrapSpacing = AppSpacing.xxs;
  static const double chipWrapRunSpacing = AppSpacing.xxs;
  static const double emptyStateInset = AppSpacing.sm;
  static const double personTaskGap = AppSpacing.xxs;
}

@immutable
class AppStatsChart {
  const AppStatsChart._();

  static const double chartHeight = 148;
  static const double barRadius = 6;
  static const double minBarHeight = 4;
}

@immutable
class AppStatsCard {
  const AppStatsCard._();

  static const double metricMinHeight = 70;
  static const double leaderboardAvatarSize = 44;
  static const double compactRankBadgeSize = 46;
  static const double compactRowMinHeight = 34;
  static const double compactRowHorizontalPadding = 10;
  static const double compactRowVerticalPadding = 6;
}

@immutable
class AppPreCheckCard {
  const AppPreCheckCard._();

  static const double cardPadding = AppSpacing.md;
  static const double accentStripWidth = 4;
  static const double actionVerticalPadding = AppSpacing.sm;
  static const double tugAvatarSize = 38;
  static const double stickyHeaderExtent = 82;
  static const double qrFrameSize = 236;
}

@immutable
class AppMotion {
  const AppMotion._();

  static const fast = Duration(milliseconds: 120);
  static const normal = Duration(milliseconds: 200);
  static const slow = Duration(milliseconds: 300);

  static const ease = Curves.easeInOut;
  static const emphasized = Curves.easeOutCubic;
}

@immutable
class AppTypography {
  const AppTypography._();

  static const displayLarge = TextStyle(
    fontSize: 40,
    fontWeight: FontWeight.w700,
    height: 1.15,
    letterSpacing: -0.5,
  );

  static const displayMedium = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w700,
    height: 1.2,
    letterSpacing: -0.3,
  );

  static const headlineLarge = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.w700,
    height: 1.2,
  );

  static const headlineMedium = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    height: 1.25,
  );

  static const titleLarge = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    height: 1.3,
  );

  static const titleMedium = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    height: 1.35,
  );

  static const bodyLarge = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.45,
  );

  static const bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.45,
  );

  static const labelLarge = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w600,
    height: 1.3,
  );

  static const labelMedium = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w600,
    height: 1.3,
  );

  static const caption = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w500,
    height: 1.3,
  );
}

@immutable
class AppComponentTokens {
  const AppComponentTokens._();

  static const minTouchTarget = 44.0;

  static const buttonHeightSm = 40.0;
  static const buttonHeightMd = 48.0;
  static const buttonHeightLg = 56.0;

  static const inputHeight = 48.0;
  static const inputHorizontalPadding = 14.0;
  static const inputVerticalPadding = 12.0;

  static const cardPadding = 16.0;
  static const cardGap = 12.0;

  static const listItemMinHeight = 56.0;
  static const listItemVerticalPadding = 10.0;

  static const appBarHeight = 60.0;
  static const bottomNavHeight = 68.0;
}
