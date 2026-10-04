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
import android.graphics.Color;
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

    // Gaze / Head-pitch tracking state
    private float baselineFaceY = -1;
    private long lastGazeTriggerTime = 0;
    private float gazeThreshold = 32.0f;
    private long gazeCooldownMs = 550;
    private boolean isLookUpTrigger = true;
    private boolean audioChimesEnabled = true;

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
                            triggerScrollNext("Manual Tap");
                            return true;
                        }
                        return false;
                }
                return false;
            });

            windowManager.addView(floatingBubbleView, params);
            String triggerName = isLookUpTrigger ? "Look UP" : "Look DOWN";
            Toast.makeText(this, "Eye Tracker Active! " + triggerName + " to scroll YouTube Shorts.", Toast.LENGTH_LONG).show();

        } catch (Exception e) {
            Log.e(TAG, "Error initializing floating bubble", e);
            stopSelf();
        }
    }

    private void loadUserSettings() {
        SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE);
        int sensitivity = prefs.getInt("sensitivity_level", 2);
        // Level 1 = 48, Level 2 = 36, Level 3 = 28, Level 4 = 22, Level 5 = 16
        gazeThreshold = Math.max(16.0f, 54.0f - (sensitivity * 8.0f));

        gazeCooldownMs = prefs.getInt("dwell_ms", 550);
        String trigger = prefs.getString("trigger_direction", "look_up");
        isLookUpTrigger = "look_up".equals(trigger);
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
                openFrontCamera();
            }

            @Override
            public void onSurfaceTextureSizeChanged(@NonNull SurfaceTexture surface, int width, int height) {}

            @Override
            public boolean onSurfaceTextureDestroyed(@NonNull SurfaceTexture surface) {
                closeCamera();
                return true;
            }

            @Override
            public void onSurfaceTextureUpdated(@NonNull SurfaceTexture surface) {}
        });
    }

    private void openFrontCamera() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Camera permission not granted. Falling back to tap trigger.");
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
                                processFaceGaze(result);
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

    private void processFaceGaze(TotalCaptureResult result) {
        Face[] faces = result.get(CaptureResult.STATISTICS_FACES);
        if (faces == null || faces.length == 0) {
            return;
        }

        Face primaryFace = faces[0];
        Rect bounds = primaryFace.getBounds();
        float currentFaceY = (float) bounds.centerY();

        if (baselineFaceY < 0) {
            baselineFaceY = currentFaceY;
            return;
        }

        baselineFaceY = baselineFaceY * 0.90f + currentFaceY * 0.10f;
        float deltaY = baselineFaceY - currentFaceY;

        boolean triggered = false;
        if (isLookUpTrigger && deltaY > gazeThreshold) {
            triggered = true;
        } else if (!isLookUpTrigger && deltaY < -gazeThreshold) {
            triggered = true;
        }

        long currentTime = System.currentTimeMillis();
        if (triggered && (currentTime - lastGazeTriggerTime > gazeCooldownMs)) {
            lastGazeTriggerTime = currentTime;
            new Handler(Looper.getMainLooper()).post(() -> {
                flashBubbleGazeSuccess();
                if (audioChimesEnabled) {
                    playChime();
                }
                String triggerDesc = isLookUpTrigger ? "Look UP" : "Look DOWN";
                triggerScrollNext("Eye Gaze (" + triggerDesc + ")");
            });
        }
    }

    private void playChime() {
        try {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 75);
            tone.startTone(ToneGenerator.TONE_PROP_BEEP, 100);
        } catch (Exception ignored) {}
    }

    private void flashBubbleGazeSuccess() {
        if (bubbleIcon != null) {
            bubbleIcon.setColorFilter(Color.parseColor("#38BDF8")); // Cyan flash
            bubbleIcon.postDelayed(() -> {
                if (bubbleIcon != null) {
                    bubbleIcon.setColorFilter(Color.parseColor("#10B981")); // Emerald
                }
            }, 600);
        }
    }

    private void triggerScrollNext(String source) {
        if (GazeAccessibilityService.instance != null) {
            GazeAccessibilityService.instance.performScrollNextShort();
            Toast.makeText(this, "⚡ " + source + " -> Next Short!", Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(this, "Accessibility Service is OFF. Turn ON in Settings.", Toast.LENGTH_LONG).show();
        }
    }

    private void showControlsNotification() {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
                NotificationChannel channel = new NotificationChannel(
                        "gazeflow_bubble_channel",
                        "GazeFlow Eye Tracker",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Controls for floating gaze tracker");
                manager.createNotificationChannel(channel);
            }

            Intent stopIntent = new Intent(this, FloatingEyeBubbleService.class);
            stopIntent.setAction(ACTION_STOP);
            PendingIntent stopPendingIntent = PendingIntent.getService(
                    this, 0, stopIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            Notification notification = new NotificationCompat.Builder(this, "gazeflow_bubble_channel")
                    .setContentTitle("GazeFlow Eye Tracking Active")
                    .setContentText("Gaze to scroll YouTube Shorts. Tap bubble to close.")
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
