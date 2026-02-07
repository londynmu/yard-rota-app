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
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

  private static final int CAMERA_PERMISSION_REQUEST = 1001;
  private PermissionRequest pendingPermissionRequest;

  private void requestCameraPermissions() {
    List<String> needed = new ArrayList<>();
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      needed.add(Manifest.permission.CAMERA);
    }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      needed.add(Manifest.permission.RECORD_AUDIO);
    }
    if (!needed.isEmpty()) {
      ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), CAMERA_PERMISSION_REQUEST);
    }
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == CAMERA_PERMISSION_REQUEST && pendingPermissionRequest != null) {
      boolean allGranted = true;
      for (int result : grantResults) {
        if (result != PackageManager.PERMISSION_GRANTED) {
          allGranted = false;
          break;
        }
      }
      if (allGranted) {
        pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
      } else {
        pendingPermissionRequest.deny();
      }
      pendingPermissionRequest = null;
    }
  }

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

    final int baseLeft = root.getPaddingLeft();
    final int baseTop = root.getPaddingTop();
    final int baseRight = root.getPaddingRight();
    final int baseBottom = root.getPaddingBottom();

    ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
      v.setPadding(baseLeft, baseTop + bars.top, baseRight, baseBottom + bars.bottom);
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

    // Request camera permissions proactively so WebView getUserMedia works
    requestCameraPermissions();

    // Handle WebView permission requests (getUserMedia for camera/mic)
    this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        final String[] resources = request.getResources();
        boolean needsCamera = false;
        for (String r : resources) {
          if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) || PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
            needsCamera = true;
            break;
          }
        }

        if (needsCamera) {
          if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(resources);
          } else {
            pendingPermissionRequest = request;
            requestCameraPermissions();
          }
        } else {
          request.grant(resources);
        }
      }
    });
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
