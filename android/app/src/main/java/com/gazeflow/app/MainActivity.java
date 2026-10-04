package com.gazeflow.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private TextView tvStatusOverlay;
    private TextView tvStatusAccessibility;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        tvStatusOverlay = findViewById(R.id.tv_status_overlay);
        tvStatusAccessibility = findViewById(R.id.tv_status_accessibility);

        Button btnOverlay = findViewById(R.id.btn_grant_overlay);
        Button btnAccessibility = findViewById(R.id.btn_grant_accessibility);
        Button btnTestGesture = findViewById(R.id.btn_test_gesture);
        Button btnStartBubble = findViewById(R.id.btn_start_bubble);
        Button btnStopBubble = findViewById(R.id.btn_stop_bubble);

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

        btnTestGesture.setOnClickListener(v -> {
            if (GazeAccessibilityService.instance != null) {
                GazeAccessibilityService.instance.performScrollNextShort();
                Toast.makeText(this, "Gesture Dispatched! Screen scrolled successfully.", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Accessibility Service is not active! Please turn it ON first.", Toast.LENGTH_LONG).show();
            }
        });

        btnStartBubble.setOnClickListener(v -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
                Toast.makeText(this, "Please grant 'Appear on top' permission first!", Toast.LENGTH_SHORT).show();
                return;
            }
            try {
                Intent serviceIntent = new Intent(this, FloatingEyeBubbleService.class);
                startService(serviceIntent);
                Toast.makeText(this, "Floating Bubble Started! Open YouTube Shorts now.", Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(this, "Failed to start bubble: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });

        btnStopBubble.setOnClickListener(v -> {
            Intent stopIntent = new Intent(this, FloatingEyeBubbleService.class);
            stopIntent.setAction(FloatingEyeBubbleService.ACTION_STOP);
            startService(stopIntent);
            Toast.makeText(this, "Floating Bubble Stopped!", Toast.LENGTH_SHORT).show();
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
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
            tvStatusOverlay.setTextColor(0xFF10B981); // Emerald green
        } else {
            tvStatusOverlay.setText("1. Appear on Top: NOT GRANTED ❌");
            tvStatusOverlay.setTextColor(0xFFEF4444); // Red
        }

        if (GazeAccessibilityService.instance != null) {
            tvStatusAccessibility.setText("2. Accessibility Service: CONNECTED & READY ✔");
            tvStatusAccessibility.setTextColor(0xFF10B981); // Emerald green
        } else {
            tvStatusAccessibility.setText("2. Accessibility Service: NOT ACTIVE ⚠️");
            tvStatusAccessibility.setTextColor(0xFFF59E0B); // Amber
        }
    }
}
