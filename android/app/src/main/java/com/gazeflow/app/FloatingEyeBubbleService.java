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

    // User settings
    private String controlMode = "head"; // "head", "hand", "eye"
    private String deviceOrientation = "landscape"; // "landscape", "portrait"
    private float gestureThreshold = 30.0f;
    private long gestureCooldownMs = 1200;
    private boolean audioChimesEnabled = true;

    // Head / Eye tracking state
    private float baselineFaceX = -1;
    private float baselineFaceY = -1;
    private long lastTriggerTime = 0;

    // Hand tracking state (Frame difference motion vector)
    private int[] previousLuminanceGrid = null;
    private float previousHandCentroidY = -1;

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

            String modeDesc = "head".equals(controlMode) ? "Nod UP for Next, DOWN for Prev" :
                             ("hand".equals(controlMode) ? "Fingers UP for Next, DOWN for Prev" : "Look UP for Next");
            Toast.makeText(this, "GazeFlow Active: " + modeDesc, Toast.LENGTH_LONG).show();

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
        // Level 1: 44, Level 2: 36, Level 3: 28, Level 4: 22, Level 5: 16
        gestureThreshold = Math.max(16.0f, 50.0f - (sensitivity * 7.0f));
        audioChimesEnabled = prefs.getBoolean("audio_chimes", true);
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
                if ("hand".equals(controlMode)) {
                    processHandGesture();
                }
            }
        });
    }

    private void applyOrientationTransform(int width, int height) {
        if (cameraTextureView == null || width == 0 || height == 0) return;
        Matrix matrix = new Matrix();
        float centerX = width / 2.0f;
        float centerY = height / 2.0f;

        // In landscape on Samsung tablets, front camera is mounted at 270 or 90 degrees
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
                                    processHeadOrEyeGesture(result);
                                }
                            }
                        }, cameraHandler);
                    } catch (CameraAccessException e) {
                        Log.e(TAG, "Error starting repeating preview: ", e);
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
     * Head & Eye Gesture Processing with Orientation Axis Compensation
     */
    private void processHeadOrEyeGesture(TotalCaptureResult result) {
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

        // Smooth moving baseline
        baselineFaceX = baselineFaceX * 0.90f + currentX * 0.10f;
        baselineFaceY = baselineFaceY * 0.90f + currentY * 0.10f;

        float delta = 0;
        if ("landscape".equals(deviceOrientation)) {
            // In tablet landscape mode, vertical head movement corresponds to the camera sensor's X axis!
            delta = currentX - baselineFaceX;
        } else {
            // In vertical portrait mode, vertical head movement corresponds to the camera sensor's Y axis!
            delta = baselineFaceY - currentY;
        }

        long currentTime = System.currentTimeMillis();
        if (currentTime - lastTriggerTime < gestureCooldownMs) return;

        if (delta > gestureThreshold) {
            // Nod UP / Glance UP -> Next Short!
            lastTriggerTime = currentTime;
            new Handler(Looper.getMainLooper()).post(() -> {
                flashBubble(true);
                triggerScroll(true, "head".equals(controlMode) ? "Head Nod UP" : "Eye Glance UP");
            });
        } else if (delta < -gestureThreshold && "head".equals(controlMode)) {
            // Nod DOWN -> Previous Short!
            lastTriggerTime = currentTime;
            new Handler(Looper.getMainLooper()).post(() -> {
                flashBubble(false);
                triggerScroll(false, "Head Nod DOWN");
            });
        }
    }

    /**
     * Hand Gesture Processing (Wave Fingers / Hand UP for Next, DOWN for Prev)
     */
    private void processHandGesture() {
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastTriggerTime < gestureCooldownMs) return;

        try {
            Bitmap bitmap = cameraTextureView.getBitmap(16, 16);
            if (bitmap == null) return;

            int[] pixels = new int[256];
            bitmap.getPixels(pixels, 0, 16, 0, 0, 16, 16);
            bitmap.recycle();

            int[] currentLuminance = new int[256];
            for (int i = 0; i < 256; i++) {
                int c = pixels[i];
                currentLuminance[i] = (Color.red(c) + Color.green(c) + Color.blue(c)) / 3;
            }

            if (previousLuminanceGrid == null) {
                previousLuminanceGrid = currentLuminance;
                return;
            }

            float motionTop = 0;
            float motionBottom = 0;

            for (int y = 0; y < 16; y++) {
                for (int x = 0; x < 16; x++) {
                    int diff = Math.abs(currentLuminance[y * 16 + x] - previousLuminanceGrid[y * 16 + x]);
                    if (diff > 18) {
                        if (y < 8) motionTop += diff;
                        else motionBottom += diff;
                    }
                }
            }
            previousLuminanceGrid = currentLuminance;

            float totalMotion = motionTop + motionBottom;
            if (totalMotion > 450) {
                // Determine vertical motion centroid direction
                float centroidY = (motionBottom - motionTop) / totalMotion;

                if (previousHandCentroidY != -1) {
                    float motionVectorY = centroidY - previousHandCentroidY;
                    if (motionVectorY < -0.25f) {
                        // Hand waved UP -> Next Short!
                        lastTriggerTime = currentTime;
                        previousHandCentroidY = -1;
                        flashBubble(true);
                        triggerScroll(true, "Hand Waved UP");
                        return;
                    } else if (motionVectorY > 0.25f) {
                        // Hand waved DOWN -> Previous Short!
                        lastTriggerTime = currentTime;
                        previousHandCentroidY = -1;
                        flashBubble(false);
                        triggerScroll(false, "Hand Waved DOWN");
                        return;
                    }
                }
                previousHandCentroidY = centroidY;
            } else {
                previousHandCentroidY = -1;
            }
        } catch (Exception ignored) {}
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
                playChime(isNext);
            }
        } else {
            Toast.makeText(this, "Accessibility Service is OFF. Turn ON in Settings.", Toast.LENGTH_LONG).show();
        }
    }

    private void playChime(boolean isNext) {
        try {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 75);
            tone.startTone(isNext ? ToneGenerator.TONE_PROP_BEEP : ToneGenerator.TONE_PROP_BEEP2, 100);
        } catch (Exception ignored) {}
    }

    private void flashBubble(boolean isNext) {
        if (bubbleIcon != null) {
            bubbleIcon.setColorFilter(isNext ? Color.parseColor("#38BDF8") : Color.parseColor("#F59E0B")); // Cyan for Next, Amber for Prev
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
                    .setContentText("Nod/Wave UP for Next, DOWN for Prev. Tap bubble to close.")
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
