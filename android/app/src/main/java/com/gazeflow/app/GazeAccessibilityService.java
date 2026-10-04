package com.gazeflow.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.accessibility.AccessibilityEvent;

public class GazeAccessibilityService extends AccessibilityService {
    public static GazeAccessibilityService instance = null;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (instance == this) {
            instance = null;
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    public void performScrollNextShort() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            float width = (float) metrics.widthPixels;
            float height = (float) metrics.heightPixels;

            Path swipePath = new Path();
            swipePath.moveTo(width / 2f, height * 0.78f);
            swipePath.lineTo(width / 2f, height * 0.22f);

            GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(swipePath, 0, 250);
            GestureDescription gesture = new GestureDescription.Builder().addStroke(stroke).build();
            dispatchGesture(gesture, null, null);
        }
    }

    public void performScrollPrevShort() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            float width = (float) metrics.widthPixels;
            float height = (float) metrics.heightPixels;

            Path swipePath = new Path();
            swipePath.moveTo(width / 2f, height * 0.22f);
            swipePath.lineTo(width / 2f, height * 0.78f);

            GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(swipePath, 0, 250);
            GestureDescription gesture = new GestureDescription.Builder().addStroke(stroke).build();
            dispatchGesture(gesture, null, null);
        }
    }

    public void performTapPlayPause() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            float centerX = metrics.widthPixels / 2f;
            float centerY = metrics.heightPixels / 2f;

            Path tapPath = new Path();
            tapPath.moveTo(centerX, centerY);

            GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(tapPath, 0, 60);
            GestureDescription gesture = new GestureDescription.Builder().addStroke(stroke).build();
            dispatchGesture(gesture, null, null);
        }
    }
}
