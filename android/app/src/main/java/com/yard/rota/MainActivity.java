package com.yard.rota;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
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

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    setTheme(R.style.AppTheme_NoActionBar);
    super.onCreate(savedInstanceState);

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
}
