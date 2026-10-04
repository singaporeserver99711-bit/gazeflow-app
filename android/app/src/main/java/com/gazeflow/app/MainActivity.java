package com.gazeflow.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Button btnOverlay = findViewById(R.id.btn_grant_overlay);
        Button btnUnlockRestricted = findViewById(R.id.btn_unlock_restricted);
        Button btnAccessibility = findViewById(R.id.btn_grant_accessibility);
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
                    Toast.makeText(this, "Overlay permission already granted!", Toast.LENGTH_SHORT).show();
                }
            }
        });

        // Takes user directly to App Info so they can tap 3 dots (⋮) > Allow restricted settings
        btnUnlockRestricted.setOnClickListener(v -> {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
            Toast.makeText(this, "Tap 3 dots (⋮) at top-right, then select 'Allow restricted settings'", Toast.LENGTH_LONG).show();
        });

        btnAccessibility.setOnClickListener(v -> {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            startActivity(intent);
        });

        btnStartBubble.setOnClickListener(v -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
                Toast.makeText(this, "Please allow 'Display over other apps' first!", Toast.LENGTH_SHORT).show();
            } else {
                Intent serviceIntent = new Intent(this, FloatingEyeBubbleService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }
                Toast.makeText(this, "Floating Bubble Started! Long-press bubble or tap Stop to close.", Toast.LENGTH_LONG).show();
            }
        });

        btnStopBubble.setOnClickListener(v -> {
            Intent stopIntent = new Intent(this, FloatingEyeBubbleService.class);
            stopIntent.setAction(FloatingEyeBubbleService.ACTION_STOP);
            startService(stopIntent);
            Toast.makeText(this, "Floating Bubble Closed!", Toast.LENGTH_SHORT).show();
        });
    }
}
