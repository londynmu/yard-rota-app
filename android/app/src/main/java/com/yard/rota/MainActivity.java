package com.yard.rota;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.graphics.Insets;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Switch from launch (splash) theme to main content theme
    setTheme(R.style.AppTheme_NoActionBar);
    super.onCreate(savedInstanceState);
    // Force non-transparent status bar with dark icons and no content under it
    final Window window = getWindow();
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
    window.setStatusBarColor(Color.WHITE);
    // Remove layout fullscreen flags and enable light status bar icons (API 23+)
    final View decor = window.getDecorView();
    int sysUi = decor.getSystemUiVisibility();
    sysUi &= ~View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
    sysUi &= ~View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      sysUi |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    }
    decor.setSystemUiVisibility(sysUi);
    // Make system bars consume insets so WebView does not draw under status bar
    WindowCompat.setDecorFitsSystemWindows(window, true);

    // Apply system bar insets as padding to the root content so top/bottom are respected
    final View root = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
      v.setPadding(0, bars.top, 0, bars.bottom);
      return insets;
    });

    // Explicitly show system bars (in case device/gesture settings hid them)
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
    if (controller != null) {
      controller.setAppearanceLightStatusBars(true);
      controller.setAppearanceLightNavigationBars(true);
      controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_BARS_BY_SWIPE);
      controller.show(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    // Re-assert system bar visibility on resume (some OEMs toggle immersive)
    final Window window = getWindow();
    final View decor = window.getDecorView();
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
    if (controller != null) {
      controller.setAppearanceLightStatusBars(true);
      controller.setAppearanceLightNavigationBars(true);
      controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_BARS_BY_SWIPE);
      controller.show(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
    }
  }
}
