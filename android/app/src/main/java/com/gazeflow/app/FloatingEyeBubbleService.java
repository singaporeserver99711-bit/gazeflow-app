package com.gazeflow.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.Toast;
import androidx.core.app.NotificationCompat;

public class FloatingEyeBubbleService extends Service {
    public static final String ACTION_STOP = "com.gazeflow.app.ACTION_STOP";
    public static boolean isRunning = false;
    private WindowManager windowManager;
    private View floatingBubbleView;
    private boolean isEyeTrackingPaused = false;
    private int initialX;
    private int initialY;
    private float initialTouchX;
    private float initialTouchY;
    private long touchStartTime;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        createNotificationChannel();
        Intent stopIntent = new Intent(this, FloatingEyeBubbleService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
                this, 0, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Notification notification = new NotificationCompat.Builder(this, "gazeflow_channel")
                .setContentTitle("GazeFlow Eye Tracking Active")
                .setContentText("Tap bubble to pause. Long-press or tap Stop to close.")
                .setSmallIcon(R.drawable.ic_bubble_eye)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Bubble", stopPendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        startForeground(1001, notification);

        floatingBubbleView = LayoutInflater.from(this).inflate(R.layout.layout_floating_bubble, null);

        int layoutType = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 60;
        params.y = 250;

        ImageView bubbleIcon = floatingBubbleView.findViewById(R.id.bubble_icon);

        floatingBubbleView.setOnLongClickListener(v -> {
            Toast.makeText(this, "Bubble Closed!", Toast.LENGTH_SHORT).show();
            stopSelf();
            return true;
        });

        floatingBubbleView.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    touchStartTime = System.currentTimeMillis();
                    initialX = params.x;
                    initialY = params.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    return false;
                case MotionEvent.ACTION_MOVE:
                    float deltaX = Math.abs(event.getRawX() - initialTouchX);
                    float deltaY = Math.abs(event.getRawY() - initialTouchY);
                    if (deltaX > 10 || deltaY > 10) {
                        params.x = initialX + (int) (event.getRawX() - initialTouchX);
                        params.y = initialY + (int) (event.getRawY() - initialTouchY);
                        windowManager.updateViewLayout(floatingBubbleView, params);
                        return true;
                    }
                    return false;
                case MotionEvent.ACTION_UP:
                    long duration = System.currentTimeMillis() - touchStartTime;
                    float moveDist = Math.abs(event.getRawX() - initialTouchX) + Math.abs(event.getRawY() - initialTouchY);
                    if (duration < 350 && moveDist < 20) {
                        isEyeTrackingPaused = !isEyeTrackingPaused;
                        if (isEyeTrackingPaused) {
                            bubbleIcon.setColorFilter(Color.parseColor("#F59E0B"));
                            Toast.makeText(this, "Eye Scroll PAUSED. Long-press to close!", Toast.LENGTH_SHORT).show();
                        } else {
                            bubbleIcon.setColorFilter(Color.parseColor("#10B981"));
                            Toast.makeText(this, "Eye Scroll ACTIVE. Look UP to scroll!", Toast.LENGTH_SHORT).show();
                        }
                        return true;
                    }
                    return false;
            }
            return false;
        });

        windowManager.addView(floatingBubbleView, params);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    "gazeflow_channel",
                    "GazeFlow Floating Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Controls for floating gaze bubble");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        // When user removes app from recent apps / background, remove bubble immediately!
        stopSelf();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        if (floatingBubbleView != null && windowManager != null) {
            try {
                windowManager.removeView(floatingBubbleView);
            } catch (Exception ignored) {}
        }
    }
}
