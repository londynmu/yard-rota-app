# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep line numbers for better crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Capacitor - Keep WebView JavaScript Bridge
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Capacitor plugins
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.CapacitorPlugin$Method public <methods>;
}

# Keep Capacitor Bridge
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }

# Keep Android WebView classes
-keepclassmembers class android.webkit.WebView {
   public *;
}

# Keep JSON serialization
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class org.json.** { *; }

# AndroidX
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
