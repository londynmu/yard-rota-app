import 'package:flutter/material.dart';

import '../assets/app_assets.dart';

/// Calendar / home background for **light** appearance (device light or forced light).
enum LightHomeWallpaper {
  /// Figma file `XtOUUHoZSw0ZCWscI1gBNy` node `5:49`.
  classic,

  /// Figma file `XtOUUHoZSw0ZCWscI1gBNy` node `0:4` — coral / cyan ribbon mesh.
  ribbonMesh,

  /// Figma node `4:13` — white perforated / mesh plane.
  perforatedMesh,

  /// Figma node `4:17` — white ribbed organic flow.
  ribbedFlow,

  /// Figma node `7:85` — grayscale contour line terrain.
  contourMesh,

  /// Figma node `8:95` — grayscale layered stripe waves.
  layeredWaves,
}

/// Calendar / home background for **dark** appearance.
enum DarkHomeWallpaper {
  /// Figma node `5:57`.
  nightMesh,

  /// Figma node `5:59` — hex mesh terrain.
  glowHexTerrain,

  /// Figma node `5:71` — dimpled metallic waves.
  dimpledMetal,

  /// Figma node `6:81` — velvet mesh waves.
  velvetWaves,

  /// Figma node `5:73` — ridged monochrome depth.
  ridgedDepth,
}

extension LightHomeWallpaperX on LightHomeWallpaper {
  String get assetPath => switch (this) {
    LightHomeWallpaper.classic => AppAssets.homeLightFigmaBg,
    LightHomeWallpaper.ribbonMesh => AppAssets.homeLightFigmaRibbonMesh,
    LightHomeWallpaper.perforatedMesh => AppAssets.homeLightFigma413,
    LightHomeWallpaper.ribbedFlow => AppAssets.homeLightFigma417,
    LightHomeWallpaper.contourMesh => AppAssets.homeLightFigma785,
    LightHomeWallpaper.layeredWaves => AppAssets.homeLightFigma895,
  };

  String get displayLabel => switch (this) {
    LightHomeWallpaper.classic => 'Classic mesh',
    LightHomeWallpaper.ribbonMesh => 'Ribbon mesh',
    LightHomeWallpaper.perforatedMesh => 'Perforated mesh',
    LightHomeWallpaper.ribbedFlow => 'Ribbed flow',
    LightHomeWallpaper.contourMesh => 'Contour mesh',
    LightHomeWallpaper.layeredWaves => 'Layered waves',
  };
}

extension DarkHomeWallpaperX on DarkHomeWallpaper {
  String get assetPath => switch (this) {
    DarkHomeWallpaper.nightMesh => AppAssets.homeDarkFigmaBg,
    DarkHomeWallpaper.glowHexTerrain => AppAssets.homeDarkFigma559,
    DarkHomeWallpaper.dimpledMetal => AppAssets.homeDarkFigma571,
    DarkHomeWallpaper.velvetWaves => AppAssets.homeDarkFigma681,
    DarkHomeWallpaper.ridgedDepth => AppAssets.homeDarkFigma573,
  };

  String get displayLabel => switch (this) {
    DarkHomeWallpaper.nightMesh => 'Night mesh',
    DarkHomeWallpaper.glowHexTerrain => 'Hex terrain',
    DarkHomeWallpaper.dimpledMetal => 'Dimpled metal',
    DarkHomeWallpaper.velvetWaves => 'Velvet waves',
    DarkHomeWallpaper.ridgedDepth => 'Ridged depth',
  };
}

String homeBackgroundAssetPath({
  required Brightness brightness,
  required LightHomeWallpaper lightWallpaper,
  required DarkHomeWallpaper darkWallpaper,
}) {
  return brightness == Brightness.dark
      ? darkWallpaper.assetPath
      : lightWallpaper.assetPath;
}
