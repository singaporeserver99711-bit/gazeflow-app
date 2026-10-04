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
        Button btnAccessibility = findViewById(R.id.btn_grant_accessibility);
        Button btnStartBubble = findViewById(R.id.btn_start_bubble);

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

        btnAccessibility.setOnClickListener(v -> {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            startActivity(intent);
        });

        btnStartBubble.setOnClickListener(v -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
                Toast.makeText(this, "Please grant 'Display over other apps' first!", Toast.LENGTH_SHORT).show();
            } else {
                startService(new Intent(this, FloatingEyeBubbleService.class));
                Toast.makeText(this, "Floating Bubble Started! Open YouTube now.", Toast.LENGTH_LONG).show();
                finish();
            }
        });
    }
}
