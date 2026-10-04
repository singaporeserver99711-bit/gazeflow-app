package com.gazeflow.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.CaptureResult;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.params.Face;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import java.util.Collections;

public class FloatingEyeBubbleService extends Service {
    public static final String ACTION_STOP = "com.gazeflow.app.ACTION_STOP";
    public static final String ACTION_UPDATE_SETTINGS = "com.gazeflow.app.ACTION_UPDATE_SETTINGS";
    public static boolean isRunning = false;
    private static final String TAG = "FloatingEyeBubble";

    private WindowManager windowManager;
    private View floatingBubbleView;
    private ImageView bubbleIcon;
    private TextureView cameraTextureView;
    private WindowManager.LayoutParams params;

    // Camera2 variables
    private CameraDevice cameraDevice;
    private CameraCaptureSession cameraCaptureSession;
    private HandlerThread cameraThread;
    private Handler cameraHandler;
    private String frontCameraId = null;

    // Strict Mode & Orientation Settings
    private String controlMode = "head"; // "head", "hand", "eye"
    private String deviceOrientation = "landscape"; // "landscape", "portrait"
    private float headThreshold = 26.0f;
    private long gestureCooldownMs = 900;
    private boolean audioChimesEnabled = true;

    // Head / Eye tracking state
    private float baselineFaceX = -1;
    private float baselineFaceY = -1;
    private long lastHeadTriggerTime = 0;
    private boolean isHeadReturnDebouncing = false;

    // Hand tracking state (Background async with throttle)
    private boolean isProcessingHandFrame = false;
    private long lastFrameTime = 0;
    private int[] prevLuma = null;
    private int fingerFlickState = 0; // 0: Idle, 1: Rising (2-3 fingers), 2: Falling
    private long flickStateStartTime = 0;
    private long lastHandTriggerTime = 0;
    private int palmHoldFrames = 0;

    // Touch variables
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

        loadUserSettings();
        if (cameraTextureView != null && cameraTextureView.isAvailable()) {
            applyOrientationTransform(cameraTextureView.getWidth(), cameraTextureView.getHeight());
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;

        loadUserSettings();

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
            cameraTextureView = floatingBubbleView.findViewById(R.id.camera_texture_view);

            setupCameraThread();
            setupCameraTextureListener();

            floatingBubbleView.setOnLongClickListener(v -> {
                Toast.makeText(this, "GazeFlow Bubble Closed", Toast.LENGTH_SHORT).show();
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
                            try {
                                windowManager.updateViewLayout(floatingBubbleView, params);
                            } catch (Exception ignored) {}
                            return true;
                        }
                        return false;

                    case MotionEvent.ACTION_UP:
                        long duration = System.currentTimeMillis() - touchStartTime;
                        float totalMove = Math.abs(event.getRawX() - initialTouchX) + Math.abs(event.getRawY() - initialTouchY);

                        if (duration < 350 && totalMove < 25) {
                            triggerScroll(true, "Manual Tap");
                            return true;
                        }
                        return false;
                }
                return false;
            });

            windowManager.addView(floatingBubbleView, params);

            String modeName = "head".equals(controlMode) ? "👤 Head Nodding" :
                             ("hand".equals(controlMode) ? "✋ 2-3 Finger Scroll & Palm Pause" : "👁️ Eye Gaze");
            Toast.makeText(this, "Active Mode: " + modeName, Toast.LENGTH_SHORT).show();

        } catch (Exception e) {
            Log.e(TAG, "Error initializing floating bubble", e);
            stopSelf();
        }
    }

    private void loadUserSettings() {
        SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE);
        controlMode = prefs.getString("control_mode", "head");
        deviceOrientation = prefs.getString("device_orientation", "landscape");
        int sensitivity = prefs.getInt("sensitivity_level", 3);

        headThreshold = Math.max(16.0f, 48.0f - (sensitivity * 7.0f));
        audioChimesEnabled = prefs.getBoolean("audio_chimes", true);

        baselineFaceX = -1;
        baselineFaceY = -1;
        prevLuma = null;
        fingerFlickState = 0;
        palmHoldFrames = 0;
        isProcessingHandFrame = false;
    }

    private void setupCameraThread() {
        cameraThread = new HandlerThread("CameraBackgroundThread");
        cameraThread.start();
        cameraHandler = new Handler(cameraThread.getLooper());
    }

    private void setupCameraTextureListener() {
        cameraTextureView.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override
            public void onSurfaceTextureAvailable(@NonNull SurfaceTexture surface, int width, int height) {
                applyOrientationTransform(width, height);
                openFrontCamera();
            }

            @Override
            public void onSurfaceTextureSizeChanged(@NonNull SurfaceTexture surface, int width, int height) {
                applyOrientationTransform(width, height);
            }

            @Override
            public boolean onSurfaceTextureDestroyed(@NonNull SurfaceTexture surface) {
                closeCamera();
                return true;
            }

            @Override
            public void onSurfaceTextureUpdated(@NonNull SurfaceTexture surface) {
                if (!"hand".equals(controlMode)) return;

                long now = System.currentTimeMillis();
                // 15 FPS throttle (every 66ms) - completely eliminates UI thread lag & battery drain!
                if (now - lastFrameTime < 66 || isProcessingHandFrame) {
                    return;
                }
                lastFrameTime = now;
                isProcessingHandFrame = true;

                // Grab a lightweight 16x16 thumbnail without blocking the main UI thread
                Bitmap bitmap = cameraTextureView.getBitmap(16, 16);
                if (bitmap == null) {
                    isProcessingHandFrame = false;
                    return;
                }

                if (cameraHandler != null) {
                    cameraHandler.post(() -> {
                        try {
                            processFingersAndPalmAsync(bitmap);
                        } finally {
                            bitmap.recycle();
                            isProcessingHandFrame = false;
                        }
                    });
                } else {
                    bitmap.recycle();
                    isProcessingHandFrame = false;
                }
            }
        });
    }

    private void applyOrientationTransform(int width, int height) {
        if (cameraTextureView == null || width == 0 || height == 0) return;
        Matrix matrix = new Matrix();
        float centerX = width / 2.0f;
        float centerY = height / 2.0f;

        float rotation = "landscape".equals(deviceOrientation) ? 270f : 0f;
        matrix.postRotate(rotation, centerX, centerY);
        cameraTextureView.setTransform(matrix);
    }

    private void openFrontCamera() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Camera permission not granted.");
            return;
        }

        CameraManager manager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
        if (manager == null) return;

        try {
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
                Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT) {
                    frontCameraId = id;
                    break;
                }
            }

            if (frontCameraId == null && manager.getCameraIdList().length > 0) {
                frontCameraId = manager.getCameraIdList()[0];
            }

            if (frontCameraId != null) {
                manager.openCamera(frontCameraId, new CameraDevice.StateCallback() {
                    @Override
                    public void onOpened(@NonNull CameraDevice camera) {
                        cameraDevice = camera;
                        startCameraPreview();
                    }

                    @Override
                    public void onDisconnected(@NonNull CameraDevice camera) {
                        camera.close();
                        cameraDevice = null;
                    }

                    @Override
                    public void onError(@NonNull CameraDevice camera, int error) {
                        camera.close();
                        cameraDevice = null;
                        Log.e(TAG, "Camera open error: " + error);
                    }
                }, cameraHandler);
            }
        } catch (CameraAccessException | SecurityException e) {
            Log.e(TAG, "Failed to open camera: ", e);
        }
    }

    private void startCameraPreview() {
        if (cameraDevice == null || !cameraTextureView.isAvailable()) return;

        try {
            SurfaceTexture texture = cameraTextureView.getSurfaceTexture();
            texture.setDefaultBufferSize(320, 240);
            Surface surface = new Surface(texture);

            final CaptureRequest.Builder previewRequestBuilder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            previewRequestBuilder.addTarget(surface);
            previewRequestBuilder.set(CaptureRequest.STATISTICS_FACE_DETECT_MODE, CaptureRequest.STATISTICS_FACE_DETECT_MODE_SIMPLE);

            cameraDevice.createCaptureSession(Collections.singletonList(surface), new CameraCaptureSession.StateCallback() {
                @Override
                public void onConfigured(@NonNull CameraCaptureSession session) {
                    if (cameraDevice == null) return;
                    cameraCaptureSession = session;
                    try {
                        previewRequestBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                        cameraCaptureSession.setRepeatingRequest(previewRequestBuilder.build(), new CameraCaptureSession.CaptureCallback() {
                            @Override
                            public void onCaptureCompleted(@NonNull CameraCaptureSession session, @NonNull CaptureRequest request, @NonNull TotalCaptureResult result) {
                                if ("head".equals(controlMode) || "eye".equals(controlMode)) {
                                    processHeadGesturePrecise(result);
                                }
                            }
                        }, cameraHandler);
                    } catch (CameraAccessException e) {
                        Log.e(TAG, "Error starting preview: ", e);
                    }
                }

                @Override
                public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                    Log.e(TAG, "Capture session configuration failed");
                }
            }, cameraHandler);

        } catch (CameraAccessException e) {
            Log.e(TAG, "Error starting camera preview: ", e);
        }
    }

    /**
     * Head Gesture Processing with Rebound-Lockout Debounce
     */
    private void processHeadGesturePrecise(TotalCaptureResult result) {
        Face[] faces = result.get(CaptureResult.STATISTICS_FACES);
        if (faces == null || faces.length == 0) return;

        Face primaryFace = faces[0];
        Rect bounds = primaryFace.getBounds();
        float currentX = (float) bounds.centerX();
        float currentY = (float) bounds.centerY();

        if (baselineFaceX < 0 || baselineFaceY < 0) {
            baselineFaceX = currentX;
            baselineFaceY = currentY;
            return;
        }

        baselineFaceX = baselineFaceX * 0.92f + currentX * 0.08f;
        baselineFaceY = baselineFaceY * 0.92f + currentY * 0.08f;

        float delta = 0;
        if ("landscape".equals(deviceOrientation)) {
            delta = currentX - baselineFaceX;
        } else {
            delta = baselineFaceY - currentY;
        }

        long currentTime = System.currentTimeMillis();

        if (isHeadReturnDebouncing) {
            if (currentTime - lastHeadTriggerTime > 800) {
                isHeadReturnDebouncing = false;
            }
            return;
        }

        if (currentTime - lastHeadTriggerTime < gestureCooldownMs) return;

        if (delta > headThreshold) {
            lastHeadTriggerTime = currentTime;
            isHeadReturnDebouncing = true;
            new Handler(Looper.getMainLooper()).post(() -> {
                flashBubble(1);
                triggerScroll(true, "Head Nod UP");
            });
        } else if (delta < -headThreshold && "head".equals(controlMode)) {
            lastHeadTriggerTime = currentTime;
            isHeadReturnDebouncing = true;
            new Handler(Looper.getMainLooper()).post(() -> {
                flashBubble(2);
                triggerScroll(false, "Head Nod DOWN");
            });
        }
    }

    /**
     * Precise Async Gesture Engine:
     * A. PALM WITH ALL 5 FINGERS: Wide spread (left, center, right, top, bottom), covers > 50% of the frame.
     *    Holding it steady for ~300ms triggers PAUSE / PLAY.
     * B. 2-3 FINGERS UPWARD / DOWNWARD: Focused vertical band (< 40% width).
     *    Flicking upward triggers NEXT SHORT.
     *    Flicking downward triggers PREVIOUS SHORT.
     */
    private void processFingersAndPalmAsync(Bitmap bitmap) {
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastHandTriggerTime < 950) {
            return; // 0.95s debounce prevents accidental double-triggers
        }

        int[] pixels = new int[256];
        bitmap.getPixels(pixels, 0, 16, 0, 0, 16, 16);

        int[] currentLuma = new int[256];
        for (int i = 0; i < 256; i++) {
            int c = pixels[i];
            currentLuma[i] = (Color.red(c) * 77 + Color.green(c) * 150 + Color.blue(c) * 29) >> 8;
        }

        if (prevLuma == null) {
            prevLuma = currentLuma;
            return;
        }

        float motionTop = 0;
        float motionMid = 0;
        float motionBottom = 0;

        // Measure horizontal spread across Left (cols 0-4), Center (5-10), and Right (11-15)
        float motionLeft = 0;
        float motionCenter = 0;
        float motionRight = 0;

        int activePixelCount = 0;

        for (int y = 0; y < 16; y++) {
            for (int x = 0; x < 16; x++) {
                int diff = Math.abs(currentLuma[y * 16 + x] - prevLuma[y * 16 + x]);
                if (diff > 16) {
                    activePixelCount++;
                    // Vertical zones
                    if (y < 5) motionTop += diff;
                    else if (y < 11) motionMid += diff;
                    else motionBottom += diff;

                    // Horizontal zones
                    if (x < 5) motionLeft += diff;
                    else if (x < 11) motionCenter += diff;
                    else motionRight += diff;
                }
            }
        }
        prevLuma = currentLuma;

        float totalMotion = motionTop + motionMid + motionBottom;

        // --- GESTURE 1: 5-FINGER OPEN PALM TO PAUSE ---
        // Wide spread across ALL columns (left, center, right) and rows (top, mid, bottom) with large area
        boolean isWideSpread = (motionLeft > 70 && motionCenter > 100 && motionRight > 70);
        boolean isFullVertical = (motionTop > 70 && motionMid > 100 && motionBottom > 70);
        boolean isPalmPresence = isWideSpread && isFullVertical && (activePixelCount > 85);

        if (isPalmPresence) {
            palmHoldFrames++;
            if (palmHoldFrames >= 3) { // Held steady for ~200-300ms
                palmHoldFrames = 0;
                fingerFlickState = 0;
                lastHandTriggerTime = currentTime;
                new Handler(Looper.getMainLooper()).post(() -> {
                    flashBubble(3); // Purple for Pause/Play
                    triggerPlayPause();
                });
                return;
            }
        } else {
            palmHoldFrames = Math.max(0, palmHoldFrames - 1);
        }

        // --- GESTURE 2: 2-3 FINGERS UPWARD / DOWNWARD FOR SCROLL ---
        // 2-3 fingers are compact (focused width, NOT spread across both sides like a palm)
        if (totalMotion < 250) {
            if (currentTime - flickStateStartTime > 550) {
                fingerFlickState = 0;
            }
            return;
        }

        // Must NOT be a wide 5-finger palm (if wide spread, ignore scroll to avoid mistaking palm for a scroll)
        if (motionLeft > 180 && motionRight > 180 && activePixelCount > 90) {
            return;
        }

        switch (fingerFlickState) {
            case 0: // Idle - waiting for 2-3 fingers to initiate flick
                if (motionBottom > motionTop + 80 && motionBottom > 130) {
                    // Fingers appeared in bottom zone -> Rising UP
                    fingerFlickState = 1;
                    flickStateStartTime = currentTime;
                } else if (motionTop > motionBottom + 80 && motionTop > 130) {
                    // Fingers appeared in top zone -> Falling DOWN
                    fingerFlickState = 2;
                    flickStateStartTime = currentTime;
                }
                break;

            case 1: // Rising: Fingers moving UP towards top zone
                if (currentTime - flickStateStartTime > 550) {
                    fingerFlickState = 0;
                } else if (motionTop > motionBottom + 100 && motionTop > 160) {
                    // CONFIRMED: 2-3 fingers flicked UP!
                    fingerFlickState = 0;
                    lastHandTriggerTime = currentTime;
                    new Handler(Looper.getMainLooper()).post(() -> {
                        flashBubble(1); // Cyan for Next
                        triggerScroll(true, "2-3 Fingers Flick UP");
                    });
                }
                break;

            case 2: // Falling: Fingers moving DOWN towards bottom zone
                if (currentTime - flickStateStartTime > 550) {
                    fingerFlickState = 0;
                } else if (motionBottom > motionTop + 100 && motionBottom > 160) {
                    // CONFIRMED: 2-3 fingers flicked DOWN!
                    fingerFlickState = 0;
                    lastHandTriggerTime = currentTime;
                    new Handler(Looper.getMainLooper()).post(() -> {
                        flashBubble(2); // Amber for Prev
                        triggerScroll(false, "2-3 Fingers Flick DOWN");
                    });
                }
                break;
        }
    }

    private void triggerPlayPause() {
        if (GazeAccessibilityService.instance != null) {
            GazeAccessibilityService.instance.performTapPlayPause();
            Toast.makeText(this, "✋ 5-Finger Palm -> Paused / Resumed!", Toast.LENGTH_SHORT).show();

            if (audioChimesEnabled) {
                playPauseChime();
            }
        } else {
            Toast.makeText(this, "Accessibility Service is OFF. Turn ON in Settings.", Toast.LENGTH_LONG).show();
        }
    }

    private void triggerScroll(boolean isNext, String source) {
        if (GazeAccessibilityService.instance != null) {
            if (isNext) {
                GazeAccessibilityService.instance.performScrollNextShort();
                Toast.makeText(this, "⚡ " + source + " -> Next Short!", Toast.LENGTH_SHORT).show();
            } else {
                GazeAccessibilityService.instance.performScrollPrevShort();
                Toast.makeText(this, "⚡ " + source + " -> Previous Short!", Toast.LENGTH_SHORT).show();
            }

            if (audioChimesEnabled) {
                playScrollChime(isNext);
            }
        } else {
            Toast.makeText(this, "Accessibility Service is OFF. Turn ON in Settings.", Toast.LENGTH_LONG).show();
        }
    }

    private void playScrollChime(boolean isNext) {
        try {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 75);
            tone.startTone(isNext ? ToneGenerator.TONE_PROP_BEEP : ToneGenerator.TONE_PROP_BEEP2, 100);
        } catch (Exception ignored) {}
    }

    private void playPauseChime() {
        try {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 75);
            tone.startTone(ToneGenerator.TONE_PROP_PROMPT, 140);
        } catch (Exception ignored) {}
    }

    private void flashBubble(int type) {
        if (bubbleIcon != null) {
            int color;
            if (type == 1) {
                color = Color.parseColor("#38BDF8"); // Cyan
            } else if (type == 2) {
                color = Color.parseColor("#F59E0B"); // Amber
            } else {
                color = Color.parseColor("#C084FC"); // Purple (Palm Pause)
            }

            bubbleIcon.setColorFilter(color);
            bubbleIcon.postDelayed(() -> {
                if (bubbleIcon != null) {
                    bubbleIcon.setColorFilter(Color.parseColor("#10B981")); // Emerald
                }
            }, 600);
        }
    }

    private void showControlsNotification() {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
                NotificationChannel channel = new NotificationChannel(
                        "gazeflow_bubble_channel",
                        "GazeFlow Gesture Controller",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Controls for floating gesture controller");
                manager.createNotificationChannel(channel);
            }

            Intent stopIntent = new Intent(this, FloatingEyeBubbleService.class);
            stopIntent.setAction(ACTION_STOP);
            PendingIntent stopPendingIntent = PendingIntent.getService(
                    this, 0, stopIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            Notification notification = new NotificationCompat.Builder(this, "gazeflow_bubble_channel")
                    .setContentTitle("GazeFlow Gesture Tracking Active")
                    .setContentText("2-3 Fingers=Scroll, 5-Finger Palm=Pause.")
                    .setSmallIcon(R.drawable.ic_bubble_eye)
                    .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Tracker", stopPendingIntent)
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

    private void closeCamera() {
        if (cameraCaptureSession != null) {
            try {
                cameraCaptureSession.close();
            } catch (Exception ignored) {}
            cameraCaptureSession = null;
        }
        if (cameraDevice != null) {
            try {
                cameraDevice.close();
            } catch (Exception ignored) {}
            cameraDevice = null;
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
        closeCamera();
        if (cameraThread != null) {
            cameraThread.quitSafely();
            try {
                cameraThread.join(500);
            } catch (InterruptedException ignored) {}
            cameraThread = null;
            cameraHandler = null;
        }

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
