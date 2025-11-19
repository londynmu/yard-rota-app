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

  private void enforceSystemBarAppearance(final Window window) {
    final View decor = window.getDecorView();
    int sysUi = decor.getSystemUiVisibility();
    sysUi &= ~View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
    sysUi &= ~View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
    sysUi &= ~View.SYSTEM_UI_FLAG_HIDE_NAVIGATION;
    sysUi &= ~View.SYSTEM_UI_FLAG_FULLSCREEN;
    sysUi &= ~View.SYSTEM_UI_FLAG_IMMERSIVE;
    sysUi &= ~View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      sysUi |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      sysUi |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    }
    decor.setSystemUiVisibility(sysUi);

    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
    if (controller != null) {
      controller.setAppearanceLightStatusBars(true);
      controller.setAppearanceLightNavigationBars(true);
      controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_DEFAULT);
      controller.show(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
    }
  }

  private void installSafeAreaListener(final View root) {
    if (root == null) return;
    ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      return insets;
    });
    ViewCompat.requestApplyInsets(root);
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Switch from launch (splash) theme to main content theme
    setTheme(R.style.AppTheme_NoActionBar);
    super.onCreate(savedInstanceState);
    // FORCE LIGHT MODE: White status bar and navigation bar with DARK icons
    final Window window = getWindow();
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
    window.setStatusBarColor(Color.WHITE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      window.setNavigationBarColor(Color.WHITE);
    }

    WindowCompat.setDecorFitsSystemWindows(window, false);
    enforceSystemBarAppearance(window);
    installSafeAreaListener(findViewById(android.R.id.content));
  }

  @Override
  public void onResume() {
    super.onResume();
    // Re-assert system bar visibility on resume (some OEMs toggle immersive)
    enforceSystemBarAppearance(getWindow());
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (!hasFocus) return;
    // Re-apply when window regains focus (addresses One UI dark mode edge cases)
    enforceSystemBarAppearance(getWindow());
  }
}
