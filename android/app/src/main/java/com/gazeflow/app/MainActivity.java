package com.gazeflow.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private static final int CAMERA_PERMISSION_CODE = 101;
    public static final String PREFS_NAME = "GazeFlowSettings";

    private TextView tvStatusOverlay;
    private TextView tvStatusAccessibility;
    private TextView tvStatusCamera;

    // Orientation cards
    private LinearLayout cardOrientLandscape;
    private LinearLayout cardOrientPortrait;

    // Mode cards
    private LinearLayout cardModeHead;
    private LinearLayout cardModeHand;
    private LinearLayout cardModeEye;

    // Sensitivity & Audio
    private TextView tvSensitivityValue;
    private SeekBar seekSensitivity;
    private CheckBox cbAudioChimes;

    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        // Status views
        tvStatusOverlay = findViewById(R.id.tv_status_overlay);
        tvStatusAccessibility = findViewById(R.id.tv_status_accessibility);
        tvStatusCamera = findViewById(R.id.tv_status_camera);

        // Permission buttons
        Button btnCamera = findViewById(R.id.btn_grant_camera);
        Button btnOverlay = findViewById(R.id.btn_grant_overlay);
        Button btnAccessibility = findViewById(R.id.btn_grant_accessibility);

        // Orientation cards
        cardOrientLandscape = findViewById(R.id.card_orient_landscape);
        cardOrientPortrait = findViewById(R.id.card_orient_portrait);

        // Mode cards
        cardModeHead = findViewById(R.id.card_mode_head);
        cardModeHand = findViewById(R.id.card_mode_hand);
        cardModeEye = findViewById(R.id.card_mode_eye);

        // Sensitivity & Chimes
        tvSensitivityValue = findViewById(R.id.tv_sensitivity_value);
        seekSensitivity = findViewById(R.id.seek_sensitivity);
        cbAudioChimes = findViewById(R.id.cb_audio_chimes);

        // Actions
        Button btnStartBubble = findViewById(R.id.btn_start_bubble);
        Button btnTestGesture = findViewById(R.id.btn_test_gesture);
        Button btnStopBubble = findViewById(R.id.btn_stop_bubble);

        // Load saved orientation (Default to Landscape for tablets)
        String savedOrientation = prefs.getString("device_orientation", "landscape");
        setOrientationUi("landscape".equals(savedOrientation));

        cardOrientLandscape.setOnClickListener(v -> {
            setOrientationUi(true);
            prefs.edit().putString("device_orientation", "landscape").apply();
            Toast.makeText(this, "Landscape Tablet Mode selected (Camera rotated upright)", Toast.LENGTH_SHORT).show();
        });

        cardOrientPortrait.setOnClickListener(v -> {
            setOrientationUi(false);
            prefs.edit().putString("device_orientation", "portrait").apply();
            Toast.makeText(this, "Portrait Vertical Mode selected", Toast.LENGTH_SHORT).show();
        });

        // Load saved control mode (Default to Head Gesture)
        String savedMode = prefs.getString("control_mode", "head");
        setModeUi(savedMode);

        cardModeHead.setOnClickListener(v -> {
            setModeUi("head");
            prefs.edit().putString("control_mode", "head").apply();
            Toast.makeText(this, "Head Gesture Active: Nod UP for Next, DOWN for Prev", Toast.LENGTH_SHORT).show();
        });

        cardModeHand.setOnClickListener(v -> {
            setModeUi("hand");
            prefs.edit().putString("control_mode", "hand").apply();
            Toast.makeText(this, "Hand Gesture Active: Wave/Fingers UP for Next, DOWN for Prev", Toast.LENGTH_SHORT).show();
        });

        cardModeEye.setOnClickListener(v -> {
            setModeUi("eye");
            prefs.edit().putString("control_mode", "eye").apply();
            Toast.makeText(this, "Eye Gaze Active: Glance UP to scroll", Toast.LENGTH_SHORT).show();
        });

        // Sensitivity
        int sensitivity = prefs.getInt("sensitivity_level", 3); // 1 to 5
        seekSensitivity.setProgress(sensitivity - 1);
        tvSensitivityValue.setText("Level " + sensitivity + " / 5");

        seekSensitivity.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                int level = progress + 1;
                tvSensitivityValue.setText("Level " + level + " / 5");
                prefs.edit().putInt("sensitivity_level", level).apply();
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });

        // Audio chimes
        boolean chimesEnabled = prefs.getBoolean("audio_chimes", true);
        cbAudioChimes.setChecked(chimesEnabled);
        cbAudioChimes.setOnCheckedChangeListener((buttonView, isChecked) -> {
            prefs.edit().putBoolean("audio_chimes", isChecked).apply();
        });

        // Permission handlers
        btnCamera.setOnClickListener(v -> {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
            } else {
                Toast.makeText(this, "Camera permission already granted!", Toast.LENGTH_SHORT).show();
            }
        });

        btnOverlay.setOnClickListener(v -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!Settings.canDrawOverlays(this)) {
                    Intent intent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName())
                    );
                    startActivity(intent);
                } else {
                    Toast.makeText(this, "Appear on top permission already granted!", Toast.LENGTH_SHORT).show();
                }
            }
        });

        btnAccessibility.setOnClickListener(v -> {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            startActivity(intent);
        });

        // Test swipe gesture
        btnTestGesture.setOnClickListener(v -> {
            if (GazeAccessibilityService.instance != null) {
                GazeAccessibilityService.instance.performScrollNextShort();
                if (cbAudioChimes.isChecked()) {
                    playSuccessChime();
                }
                Toast.makeText(this, "⚡ Swipe Gesture Dispatched! Screen scrolled successfully.", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Accessibility Service is not active! Please turn it ON in Settings.", Toast.LENGTH_LONG).show();
            }
        });

        // Start floating bubble
        btnStartBubble.setOnClickListener(v -> {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
                Toast.makeText(this, "Camera permission needed for gesture tracking!", Toast.LENGTH_SHORT).show();
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
                Toast.makeText(this, "Please grant 'Appear on top' permission first!", Toast.LENGTH_SHORT).show();
                return;
            }

            try {
                Intent serviceIntent = new Intent(this, FloatingEyeBubbleService.class);
                startService(serviceIntent);
                Toast.makeText(this, "Gesture Controller Started! Switch to YouTube Shorts now.", Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(this, "Failed to start bubble: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });

        btnStopBubble.setOnClickListener(v -> {
            Intent stopIntent = new Intent(this, FloatingEyeBubbleService.class);
            stopIntent.setAction(FloatingEyeBubbleService.ACTION_STOP);
            startService(stopIntent);
            Toast.makeText(this, "Gesture Controller Stopped!", Toast.LENGTH_SHORT).show();
        });

        // Request camera permission on launch if needed
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
        }
    }

    private void setOrientationUi(boolean isLandscape) {
        if (isLandscape) {
            cardOrientLandscape.setBackgroundResource(R.drawable.bg_btn_active);
            cardOrientPortrait.setBackgroundResource(R.drawable.bg_btn_inactive);
        } else {
            cardOrientLandscape.setBackgroundResource(R.drawable.bg_btn_inactive);
            cardOrientPortrait.setBackgroundResource(R.drawable.bg_btn_active);
        }
    }

    private void setModeUi(String mode) {
        cardModeHead.setBackgroundResource("head".equals(mode) ? R.drawable.bg_btn_active : R.drawable.bg_btn_inactive);
        cardModeHand.setBackgroundResource("hand".equals(mode) ? R.drawable.bg_btn_active : R.drawable.bg_btn_inactive);
        cardModeEye.setBackgroundResource("eye".equals(mode) ? R.drawable.bg_btn_active : R.drawable.bg_btn_inactive);
    }

    private void playSuccessChime() {
        try {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80);
            tone.startTone(ToneGenerator.TONE_PROP_BEEP, 120);
        } catch (Exception ignored) {}
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateStatuses();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        updateStatuses();
    }

    private void updateStatuses() {
        boolean overlayGranted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            overlayGranted = Settings.canDrawOverlays(this);
        } else {
            overlayGranted = true;
        }

        if (overlayGranted) {
            tvStatusOverlay.setText("1. Appear on Top: GRANTED ✔");
            tvStatusOverlay.setTextColor(0xFF10B981);
        } else {
            tvStatusOverlay.setText("1. Appear on Top: NOT GRANTED ❌");
            tvStatusOverlay.setTextColor(0xFFEF4444);
        }

        if (GazeAccessibilityService.instance != null) {
            tvStatusAccessibility.setText("2. Accessibility Service: CONNECTED & READY ✔");
            tvStatusAccessibility.setTextColor(0xFF10B981);
        } else {
            tvStatusAccessibility.setText("2. Accessibility Service: NOT ACTIVE ⚠️");
            tvStatusAccessibility.setTextColor(0xFFF59E0B);
        }

        boolean cameraGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
        if (cameraGranted) {
            tvStatusCamera.setText("3. Front Camera: GRANTED (Ready for Gesture Tracking) ✔");
            tvStatusCamera.setTextColor(0xFF10B981);
        } else {
            tvStatusCamera.setText("3. Front Camera: NOT GRANTED (Tap Camera button above) ❌");
            tvStatusCamera.setTextColor(0xFFEF4444);
        }
    }
}
