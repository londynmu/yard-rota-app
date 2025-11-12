package com.yard.rota;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Switch from launch (splash) theme to main content theme
    setTheme(R.style.AppTheme_NoActionBar);
    super.onCreate(savedInstanceState);
    // Make system bars consume insets so WebView does not draw under status bar
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
  }
}
