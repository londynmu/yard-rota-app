import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_tokens.dart';
import 'theme_extensions.dart';

class AppTheme {
  const AppTheme._();

  static ThemeData light() =>
      _buildTheme(brightness: Brightness.light, colors: AppColorsScheme.light);

  static ThemeData dark() =>
      _buildTheme(brightness: Brightness.dark, colors: AppColorsScheme.dark);

  static ThemeData _buildTheme({
    required Brightness brightness,
    required AppColorsScheme colors,
  }) {
    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: colors.primary,
      onPrimary: colors.onPrimary,
      secondary: colors.info,
      onSecondary: colors.onInfo,
      tertiary: colors.success,
      onTertiary: colors.onSuccess,
      error: colors.danger,
      onError: colors.onDanger,
      surface: colors.bgPrimary,
      onSurface: colors.textPrimary,
    );

    final textTheme = const TextTheme(
      displayLarge: AppTypography.displayLarge,
      displayMedium: AppTypography.displayMedium,
      headlineLarge: AppTypography.headlineLarge,
      headlineMedium: AppTypography.headlineMedium,
      titleLarge: AppTypography.titleLarge,
      titleMedium: AppTypography.titleMedium,
      bodyLarge: AppTypography.bodyLarge,
      bodyMedium: AppTypography.bodyMedium,
      labelLarge: AppTypography.labelLarge,
      labelMedium: AppTypography.labelMedium,
    ).apply(bodyColor: colors.textPrimary, displayColor: colors.textPrimary);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      splashFactory: InkRipple.splashFactory,
      scaffoldBackgroundColor: colors.bgPrimary,
      textTheme: textTheme,
      extensions: [AppColorsExtension(colors)],

      appBarTheme: AppBarTheme(
        elevation: AppElevation.level0,
        toolbarHeight: AppComponentTokens.appBarHeight,
        backgroundColor: colors.bgPrimary,
        foregroundColor: colors.textPrimary,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: AppTypography.titleLarge.copyWith(
          color: colors.textPrimary,
        ),
        // Transparent AppBars still need explicit style so status icons match
        // the theme (especially light mode over mesh backgrounds).
        systemOverlayStyle: brightness == Brightness.light
            ? const SystemUiOverlayStyle(
                statusBarColor: Colors.transparent,
                statusBarBrightness: Brightness.light,
                statusBarIconBrightness: Brightness.dark,
                systemNavigationBarColor: Colors.transparent,
                systemNavigationBarIconBrightness: Brightness.dark,
                systemNavigationBarDividerColor: Colors.transparent,
              )
            : const SystemUiOverlayStyle(
                statusBarColor: Colors.transparent,
                statusBarBrightness: Brightness.dark,
                statusBarIconBrightness: Brightness.light,
                systemNavigationBarColor: Colors.transparent,
                systemNavigationBarIconBrightness: Brightness.light,
                systemNavigationBarDividerColor: Colors.transparent,
              ),
      ),

      cardTheme: CardThemeData(
        elevation: AppElevation.level1,
        color: colors.bgElevated,
        margin: EdgeInsets.zero,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          side: BorderSide(color: colors.borderDefault, width: AppStroke.thin),
        ),
      ),

      dividerTheme: DividerThemeData(
        color: colors.divider,
        thickness: AppStroke.thin,
        space: 1,
      ),

      inputDecorationTheme: InputDecorationTheme(
        isDense: true,
        filled: true,
        fillColor: colors.bgSecondary,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppComponentTokens.inputHorizontalPadding,
          vertical: AppComponentTokens.inputVerticalPadding,
        ),
        hintStyle: AppTypography.bodyMedium.copyWith(
          color: colors.textTertiary,
        ),
        labelStyle: AppTypography.labelLarge.copyWith(
          color: colors.textSecondary,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: colors.borderDefault),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: colors.borderDefault),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(
            color: colors.primary,
            width: AppStroke.medium,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: colors.danger),
        ),
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(
            Size(double.infinity, AppComponentTokens.buttonHeightMd),
          ),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          ),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
          ),
          elevation: const WidgetStatePropertyAll(AppElevation.level0),
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return colors.primaryDisabled;
            }
            if (states.contains(WidgetState.pressed)) {
              return colors.primaryPressed;
            }
            if (states.contains(WidgetState.hovered)) {
              return colors.primaryHover;
            }
            return colors.primary;
          }),
          foregroundColor: WidgetStatePropertyAll(colors.onPrimary),
          textStyle: const WidgetStatePropertyAll(AppTypography.labelLarge),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(
            Size(double.infinity, AppComponentTokens.buttonHeightMd),
          ),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
          ),
          side: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return BorderSide(color: colors.borderSubtle);
            }
            return BorderSide(color: colors.borderDefault);
          }),
          foregroundColor: WidgetStatePropertyAll(colors.textPrimary),
          textStyle: const WidgetStatePropertyAll(AppTypography.labelLarge),
        ),
      ),

      snackBarTheme: SnackBarThemeData(
        backgroundColor: colors.bgInverse,
        contentTextStyle: AppTypography.bodyMedium.copyWith(
          color: colors.textInverse,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        behavior: SnackBarBehavior.floating,
      ),

      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: colors.bgElevated,
        selectedItemColor: colors.primary,
        unselectedItemColor: colors.textTertiary,
        selectedLabelStyle: AppTypography.labelMedium,
        unselectedLabelStyle: AppTypography.labelMedium,
        elevation: AppElevation.level2,
        type: BottomNavigationBarType.fixed,
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: colors.bgElevated,
        indicatorColor: colors.primary.withValues(alpha: 0.18),
        surfaceTintColor: Colors.transparent,
        labelTextStyle: WidgetStatePropertyAll(
          AppTypography.labelMedium.copyWith(color: colors.textSecondary),
        ),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? colors.primary : colors.textTertiary,
            size: 24,
          );
        }),
      ),
    );
  }
}
