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
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
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
    private static final String TAG = "FloatingEyeBubble";

    private WindowManager windowManager;
    private View floatingBubbleView;
    private ImageView bubbleIcon;
    private WindowManager.LayoutParams params;

    private int initialX;
    private int initialY;
    private float initialTouchX;
    private float initialTouchY;
    private long touchStartTime;

    private Handler autoScrollHandler = new Handler(Looper.getMainLooper());
    private boolean isAutoScrollActive = false;
    private final Runnable autoScrollRunnable = new Runnable() {
        @Override
        public void run() {
            if (isAutoScrollActive && GazeAccessibilityService.instance != null) {
                GazeAccessibilityService.instance.performScrollNextShort();
                Toast.makeText(FloatingEyeBubbleService.this, "Auto-scrolled next Short", Toast.LENGTH_SHORT).show();
                autoScrollHandler.postDelayed(this, 15000); // Auto-scroll every 15s
            }
        }
    };

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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Please grant 'Appear on top' permission first!", Toast.LENGTH_LONG).show();
            stopSelf();
            return;
        }

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        showControlsNotification();

        try {
            floatingBubbleView = LayoutInflater.from(this).inflate(R.layout.layout_floating_bubble, null);

            int layoutType = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;

            params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    layoutType,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                    PixelFormat.TRANSLUCENT
            );
            params.gravity = Gravity.TOP | Gravity.START;
            params.x = 80;
            params.y = 260;

            bubbleIcon = floatingBubbleView.findViewById(R.id.bubble_icon);

            // Long-press: close bubble
            floatingBubbleView.setOnLongClickListener(v -> {
                Toast.makeText(this, "Bubble Closed!", Toast.LENGTH_SHORT).show();
                stopSelf();
                return true;
            });

            // Touch & Tap logic
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
                            try {
                                windowManager.updateViewLayout(floatingBubbleView, params);
                            } catch (Exception ignored) {}
                            return true;
                        }
                        return false;

                    case MotionEvent.ACTION_UP:
                        long duration = System.currentTimeMillis() - touchStartTime;
                        float totalMove = Math.abs(event.getRawX() - initialTouchX) + Math.abs(event.getRawY() - initialTouchY);

                        if (duration < 400 && totalMove < 25) {
                            // Quick Tap: Scroll to Next Short!
                            triggerScrollNext();
                            return true;
                        }
                        return false;
                }
                return false;
            });

            windowManager.addView(floatingBubbleView, params);
            Toast.makeText(this, "Bubble Active! Tap bubble anytime to scroll YouTube Shorts.", Toast.LENGTH_LONG).show();

        } catch (Exception e) {
            Log.e(TAG, "Error adding floating bubble window", e);
            Toast.makeText(this, "Unable to show bubble: " + e.getMessage(), Toast.LENGTH_LONG).show();
            stopSelf();
        }
    }

    private void triggerScrollNext() {
        if (GazeAccessibilityService.instance != null) {
            GazeAccessibilityService.instance.performScrollNextShort();
            Toast.makeText(this, "Swiped to Next Short!", Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(this, "Accessibility Service is not connected yet! Turn it ON in Settings.", Toast.LENGTH_LONG).show();
        }
    }

    private void showControlsNotification() {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
                NotificationChannel channel = new NotificationChannel(
                        "gazeflow_bubble_channel",
                        "GazeFlow Floating Controls",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Controls for floating bubble");
                manager.createNotificationChannel(channel);
            }

            Intent stopIntent = new Intent(this, FloatingEyeBubbleService.class);
            stopIntent.setAction(ACTION_STOP);
            PendingIntent stopPendingIntent = PendingIntent.getService(
                    this, 0, stopIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            Notification notification = new NotificationCompat.Builder(this, "gazeflow_bubble_channel")
                    .setContentTitle("GazeFlow is Running")
                    .setContentText("Tap floating bubble to scroll Shorts. Long-press to close.")
                    .setSmallIcon(R.drawable.ic_bubble_eye)
                    .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Close Bubble", stopPendingIntent)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setAutoCancel(true)
                    .build();

            if (manager != null) {
                manager.notify(1001, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Notification error: ", e);
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        autoScrollHandler.removeCallbacks(autoScrollRunnable);
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.cancel(1001);
            }
        } catch (Exception ignored) {}

        if (floatingBubbleView != null && windowManager != null) {
            try {
                windowManager.removeView(floatingBubbleView);
            } catch (Exception ignored) {}
        }
    }
}
