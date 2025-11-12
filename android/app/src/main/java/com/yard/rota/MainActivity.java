package com.yard.rota;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

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
  }
}
