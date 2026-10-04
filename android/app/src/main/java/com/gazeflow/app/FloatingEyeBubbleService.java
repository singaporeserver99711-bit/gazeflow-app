package com.gazeflow.app;

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

public class FloatingEyeBubbleService extends Service {
    private WindowManager windowManager;
    private View floatingBubbleView;
    private boolean isEyeTrackingPaused = false;
    private int initialX;
    private int initialY;
    private float initialTouchX;
    private float initialTouchY;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

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

        floatingBubbleView.setOnClickListener(v -> {
            isEyeTrackingPaused = !isEyeTrackingPaused;
            if (isEyeTrackingPaused) {
                bubbleIcon.setColorFilter(Color.parseColor("#F59E0B"));
                Toast.makeText(this, "Eye Scroll PAUSED. Manual thumb scrolling active!", Toast.LENGTH_SHORT).show();
            } else {
                bubbleIcon.setColorFilter(Color.parseColor("#10B981"));
                Toast.makeText(this, "Eye Scroll ACTIVE. Look UP to scroll next short!", Toast.LENGTH_SHORT).show();
            }
        });

        floatingBubbleView.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = params.x;
                    initialY = params.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    return false;
                case MotionEvent.ACTION_MOVE:
                    params.x = initialX + (int) (event.getRawX() - initialTouchX);
                    params.y = initialY + (int) (event.getRawY() - initialTouchY);
                    windowManager.updateViewLayout(floatingBubbleView, params);
                    return true;
            }
            return false;
        });

        windowManager.addView(floatingBubbleView, params);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (floatingBubbleView != null && windowManager != null) {
            windowManager.removeView(floatingBubbleView);
        }
    }
}
