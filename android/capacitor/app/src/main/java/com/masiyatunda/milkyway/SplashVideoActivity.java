package com.masiyatunda.milkyway;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.widget.VideoView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/**
 * Native startup splash: plays res/raw/milkyway_splash.mp4 (MilkyWay logo, sound and Swahili text are
 * part of the video) full screen, with no skip button and Back disabled, then opens MainActivity.
 * The website has no splash; this exists only inside the APK.
 */
public class SplashVideoActivity extends AppCompatActivity {
    // Safety net in case the device never reports completion; the video itself is shorter than this.
    private static final long MAX_SPLASH_MS = 30000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private VideoView video;
    private int resumeAt = 0;
    private boolean done = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Launcher tapped while the app is already open: return to it without replaying the splash.
        if (!isTaskRoot() && getIntent() != null && Intent.ACTION_MAIN.equals(getIntent().getAction())
                && getIntent().hasCategory(Intent.CATEGORY_LAUNCHER)) {
            finish();
            return;
        }

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_splash_video);
        hideSystemBars();

        // Unskippable: Back does nothing while the intro plays.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() { }
        });

        video = findViewById(R.id.splash_video);
        video.setOnCompletionListener(mp -> openApp());
        video.setOnErrorListener((mp, what, extra) -> { openApp(); return true; });
        video.setVideoURI(Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.milkyway_splash));
        video.start();
        handler.postDelayed(this::openApp, MAX_SPLASH_MS);
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (video != null && !done) {
            resumeAt = video.getCurrentPosition();
            video.pause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (video != null && !done) {
            hideSystemBars();
            video.seekTo(resumeAt);
            video.start();
        }
    }

    private void openApp() {
        if (done) return;
        done = true;
        handler.removeCallbacksAndMessages(null);
        Intent main = new Intent(this, MainActivity.class);
        // Keep notification-tap extras and deep links for the web layer.
        Intent source = getIntent();
        if (source != null) {
            if (source.getExtras() != null) main.putExtras(source.getExtras());
            if (source.getData() != null) main.setData(source.getData());
        }
        startActivity(main);
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (video != null) video.stopPlayback();
        super.onDestroy();
    }
}
