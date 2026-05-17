import 'package:flutter/material.dart';

import 'app_tokens.dart';

@immutable
class AppColorsExtension extends ThemeExtension<AppColorsExtension> {
  final AppColorsScheme scheme;

  const AppColorsExtension(this.scheme);

  @override
  ThemeExtension<AppColorsExtension> copyWith({AppColorsScheme? scheme}) {
    return AppColorsExtension(scheme ?? this.scheme);
  }

  @override
  ThemeExtension<AppColorsExtension> lerp(
    covariant ThemeExtension<AppColorsExtension>? other,
    double t,
  ) {
    if (other is! AppColorsExtension) {
      return this;
    }

    return AppColorsExtension(_lerpScheme(scheme, other.scheme, t));
  }

  static AppColorsScheme _lerpScheme(
    AppColorsScheme a,
    AppColorsScheme b,
    double t,
  ) {
    Color mix(Color one, Color two) => Color.lerp(one, two, t) ?? one;

    return AppColorsScheme(
      bgPrimary: mix(a.bgPrimary, b.bgPrimary),
      bgSecondary: mix(a.bgSecondary, b.bgSecondary),
      bgTertiary: mix(a.bgTertiary, b.bgTertiary),
      bgElevated: mix(a.bgElevated, b.bgElevated),
      bgInverse: mix(a.bgInverse, b.bgInverse),
      textPrimary: mix(a.textPrimary, b.textPrimary),
      textSecondary: mix(a.textSecondary, b.textSecondary),
      textTertiary: mix(a.textTertiary, b.textTertiary),
      textInverse: mix(a.textInverse, b.textInverse),
      textDisabled: mix(a.textDisabled, b.textDisabled),
      borderSubtle: mix(a.borderSubtle, b.borderSubtle),
      borderDefault: mix(a.borderDefault, b.borderDefault),
      borderStrong: mix(a.borderStrong, b.borderStrong),
      divider: mix(a.divider, b.divider),
      primary: mix(a.primary, b.primary),
      primaryHover: mix(a.primaryHover, b.primaryHover),
      primaryPressed: mix(a.primaryPressed, b.primaryPressed),
      primaryDisabled: mix(a.primaryDisabled, b.primaryDisabled),
      onPrimary: mix(a.onPrimary, b.onPrimary),
      success: mix(a.success, b.success),
      onSuccess: mix(a.onSuccess, b.onSuccess),
      successBg: mix(a.successBg, b.successBg),
      warning: mix(a.warning, b.warning),
      onWarning: mix(a.onWarning, b.onWarning),
      warningBg: mix(a.warningBg, b.warningBg),
      danger: mix(a.danger, b.danger),
      onDanger: mix(a.onDanger, b.onDanger),
      dangerBg: mix(a.dangerBg, b.dangerBg),
      info: mix(a.info, b.info),
      onInfo: mix(a.onInfo, b.onInfo),
      infoBg: mix(a.infoBg, b.infoBg),
      focusRing: mix(a.focusRing, b.focusRing),
      overlay: mix(a.overlay, b.overlay),
      shadow: mix(a.shadow, b.shadow),
    );
  }
}

extension AppThemeContext on BuildContext {
  AppColorsScheme get appColors {
    final extension = Theme.of(this).extension<AppColorsExtension>();
    if (extension != null) {
      return extension.scheme;
    }
    return Theme.of(this).brightness == Brightness.dark
        ? AppColorsScheme.dark
        : AppColorsScheme.light;
  }
}
