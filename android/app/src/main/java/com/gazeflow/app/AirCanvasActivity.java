package com.gazeflow.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.Surface;
import android.view.TextureView;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import java.util.Collections;

public class AirCanvasActivity extends AppCompatActivity {

    private TextureView cameraTextureView;
    private AirDrawView airDrawView;

    private TextView tvFaceZoneLabel;
    private SeekBar seekFaceZone;
    private TextView tvCanvasSensLabel;
    private SeekBar seekCanvasSens;
    private CheckBox cbCanvasInvert;
    private Button btnCanvasOrientation;

    private CameraDevice cameraDevice;
    private CameraCaptureSession cameraCaptureSession;
    private HandlerThread cameraThread;
    private Handler cameraHandler;
    private String frontCameraId = null;

    private SharedPreferences prefs;
    private String deviceOrientation = "landscape";
    private float faceZoneRatio = 0.38f;
    private int sensitivityLevel = 6;
    private boolean invertDirection = false;

    private boolean isProcessingFrame = false;
    private long lastFrameTime = 0;
    private int[] prevLuma = null;
    private float prevCentroidY = -1;
    private long centroidStartTime = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_air_canvas);

        prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE);
        loadPreferences();

        cameraTextureView = findViewById(R.id.air_camera_texture);
        airDrawView = findViewById(R.id.air_draw_view);
        airDrawView.setFaceZoneWidthRatio(faceZoneRatio);

        tvFaceZoneLabel = findViewById(R.id.tv_face_zone_label);
        seekFaceZone = findViewById(R.id.seek_face_zone);
        tvCanvasSensLabel = findViewById(R.id.tv_canvas_sens_label);
        seekCanvasSens = findViewById(R.id.seek_canvas_sens);
        cbCanvasInvert = findViewById(R.id.cb_canvas_invert);
        btnCanvasOrientation = findViewById(R.id.btn_canvas_orientation);

        Button btnBack = findViewById(R.id.btn_back);
        Button btnClearCanvas = findViewById(R.id.btn_clear_canvas);
        Button btnApplyZones = findViewById(R.id.btn_apply_zones_to_bubble);

        // Setup UI values
        int faceProgress = (int) ((faceZoneRatio - 0.15f) * 100f);
        seekFaceZone.setProgress(faceProgress);
        tvFaceZoneLabel.setText("Center " + (int)(faceZoneRatio * 100) + "% Masked");

        seekCanvasSens.setProgress(sensitivityLevel - 1);
        tvCanvasSensLabel.setText("Sensitivity: " + sensitivityLevel + " / 10");

        cbCanvasInvert.setChecked(invertDirection);
        btnCanvasOrientation.setText("Mode: " + ("landscape".equals(deviceOrientation) ? "Landscape" : "Portrait"));

        btnBack.setOnClickListener(v -> finish());
        btnClearCanvas.setOnClickListener(v -> airDrawView.clearCanvas());

        // Dynamic Face Zone Slider
        seekFaceZone.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                faceZoneRatio = 0.15f + (progress / 100f);
                tvFaceZoneLabel.setText("Center " + (int)(faceZoneRatio * 100) + "% Masked");
                airDrawView.setFaceZoneWidthRatio(faceZoneRatio);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });

        // Sensitivity Slider
        seekCanvasSens.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                sensitivityLevel = progress + 1;
                tvCanvasSensLabel.setText("Sensitivity: " + sensitivityLevel + " / 10");
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });

        // Invert Direction
        cbCanvasInvert.setOnCheckedChangeListener((buttonView, isChecked) -> {
            invertDirection = isChecked;
        });

        // Orientation Switch
        btnCanvasOrientation.setOnClickListener(v -> {
            if ("landscape".equals(deviceOrientation)) {
                deviceOrientation = "portrait";
            } else {
                deviceOrientation = "landscape";
            }
            btnCanvasOrientation.setText("Mode: " + ("landscape".equals(deviceOrientation) ? "Landscape" : "Portrait"));
            applyOrientationTransform(cameraTextureView.getWidth(), cameraTextureView.getHeight());
            Toast.makeText(this, "Camera rotated for " + deviceOrientation, Toast.LENGTH_SHORT).show();
        });

        // Save & Apply Zones to YouTube Shorts Bubble
        btnApplyZones.setOnClickListener(v -> {
            prefs.edit()
                .putFloat("face_zone_ratio", faceZoneRatio)
                .putInt("sensitivity_level", sensitivityLevel)
                .putBoolean("invert_direction", invertDirection)
                .putString("device_orientation", deviceOrientation)
                .apply();

            if (FloatingEyeBubbleService.isRunning) {
                Intent updateIntent = new Intent(this, FloatingEyeBubbleService.class);
                updateIntent.setAction(FloatingEyeBubbleService.ACTION_UPDATE_SETTINGS);
                startService(updateIntent);
            }

            Toast.makeText(this, "✔ Zones & Calibrated Settings Saved to Shorts Bubble!", Toast.LENGTH_LONG).show();
        });

        setupCameraThread();
        setupTextureListener();
    }

    private void loadPreferences() {
        deviceOrientation = prefs.getString("device_orientation", "landscape");
        faceZoneRatio = prefs.getFloat("face_zone_ratio", 0.38f);
        sensitivityLevel = prefs.getInt("sensitivity_level", 6);
        invertDirection = prefs.getBoolean("invert_direction", false);
    }

    private void setupCameraThread() {
        cameraThread = new HandlerThread("AirCanvasThread");
        cameraThread.start();
        cameraHandler = new Handler(cameraThread.getLooper());
    }

    private void setupTextureListener() {
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
                long now = System.currentTimeMillis();
                if (now - lastFrameTime < 45 || isProcessingFrame) {
                    return;
                }
                lastFrameTime = now;
                isProcessingFrame = true;

                Bitmap bitmap = cameraTextureView.getBitmap(24, 24);
                if (bitmap == null) {
                    isProcessingFrame = false;
                    return;
                }

                if (cameraHandler != null) {
                    cameraHandler.post(() -> {
                        try {
                            analyzeAirDrawing(bitmap);
                        } finally {
                            bitmap.recycle();
                            isProcessingFrame = false;
                        }
                    });
                } else {
                    bitmap.recycle();
                    isProcessingFrame = false;
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
                        startPreview();
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
                    }
                }, cameraHandler);
            }
        } catch (CameraAccessException | SecurityException ignored) {}
    }

    private void startPreview() {
        if (cameraDevice == null || !cameraTextureView.isAvailable()) return;

        try {
            SurfaceTexture texture = cameraTextureView.getSurfaceTexture();
            texture.setDefaultBufferSize(320, 240);
            Surface surface = new Surface(texture);

            final CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            builder.addTarget(surface);

            cameraDevice.createCaptureSession(Collections.singletonList(surface), new CameraCaptureSession.StateCallback() {
                @Override
                public void onConfigured(@NonNull CameraCaptureSession session) {
                    if (cameraDevice == null) return;
                    cameraCaptureSession = session;
                    try {
                        builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                        cameraCaptureSession.setRepeatingRequest(builder.build(), null, cameraHandler);
                    } catch (CameraAccessException ignored) {}
                }

                @Override
                public void onConfigureFailed(@NonNull CameraCaptureSession session) {}
            }, cameraHandler);

        } catch (CameraAccessException ignored) {}
    }

    /**
     * Touchless Air-Canvas Analyzer:
     * - Filters out center face exclusion columns.
     * - Detects hand presence in left or right side zones.
     * - Maps fingertip position to screen and draws path!
     */
    private void analyzeAirDrawing(Bitmap bitmap) {
        int w = 24;
        int h = 24;
        int[] pixels = new int[w * h];
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h);

        int[] currentLuma = new int[w * h];
        int ambient = 0;
        for (int i = 0; i < pixels.length; i++) {
            int c = pixels[i];
            int luma = (Color.red(c) * 77 + Color.green(c) * 150 + Color.blue(c) * 29) >> 8;
            currentLuma[i] = luma;
            ambient += luma;
        }

        if (prevLuma == null) {
            prevLuma = currentLuma;
            return;
        }

        int noiseFloor = Math.max(12, (ambient / (w * h)) / 14);

        // Center exclusion columns
        int centerStartCol = (int) (w * (0.5f - faceZoneRatio / 2f));
        int centerEndCol = (int) (w * (0.5f + faceZoneRatio / 2f));

        float leftWeightedX = 0, leftWeightedY = 0, leftDiff = 0;
        float rightWeightedX = 0, rightWeightedY = 0, rightDiff = 0;
        int activeSidePixels = 0;

        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                // EXCLUDE CENTER FACE ZONE
                if (x >= centerStartCol && x <= centerEndCol) {
                    continue;
                }

                int diff = Math.abs(currentLuma[y * w + x] - prevLuma[y * w + x]);
                if (diff > noiseFloor) {
                    activeSidePixels++;
                    if (x < centerStartCol) {
                        // Left Hand Zone
                        leftDiff += diff;
                        leftWeightedX += (x * diff);
                        leftWeightedY += (y * diff);
                    } else {
                        // Right Hand Zone
                        rightDiff += diff;
                        rightWeightedX += (x * diff);
                        rightWeightedY += (y * diff);
                    }
                }
            }
        }
        prevLuma = currentLuma;

        float chosenDiff = Math.max(leftDiff, rightDiff);
        boolean isLeft = (leftDiff > rightDiff);

        float minMotion = Math.max(180f, 450f - (sensitivityLevel * 28f));

        if (chosenDiff > minMotion) {
            float avgX = isLeft ? (leftWeightedX / leftDiff) : (rightWeightedX / rightDiff);
            float avgY = isLeft ? (leftWeightedY / leftDiff) : (rightWeightedY / rightDiff);

            // Normalized screen coordinates (0.0 to 1.0)
            float normX = avgX / (float) w;
            float normY = avgY / (float) h;

            // Invert camera mirroring for natural hand pointing
            normX = 1.0f - normX;

            float currentCentroidY = normY;
            float dy = 0f;
            if (prevCentroidY > 0) {
                dy = prevCentroidY - currentCentroidY;
            }
            prevCentroidY = currentCentroidY;

            String status;
            int statusColor;
            boolean isPalm = (activeSidePixels > 60);

            if (isPalm) {
                status = "✋ PALM DETECTED in " + (isLeft ? "LEFT" : "RIGHT") + " Zone -> PAUSE";
                statusColor = Color.parseColor("#C084FC"); // Purple
            } else if (Math.abs(dy) > 0.08f) {
                boolean up = dy > 0;
                if (invertDirection) up = !up;
                status = up ? "☝️ UPWARD FLICK DETECTED -> NEXT SHORT" : "👇 DOWNWARD FLICK DETECTED -> PREV SHORT";
                statusColor = up ? Color.parseColor("#38BDF8") : Color.parseColor("#F59E0B");
            } else {
                status = "DRAWING with " + (isLeft ? "LEFT" : "RIGHT") + " Hand";
                statusColor = Color.parseColor("#10B981");
            }

            final float finalNormX = normX;
            final float finalNormY = normY;
            final String finalStatus = status;
            final int finalColor = statusColor;
            final float finalDy = dy;
            final boolean finalIsPalm = isPalm;

            runOnUiThread(() -> {
                airDrawView.setFingerPosition(finalNormX, finalNormY, true);
                airDrawView.updateGestureFeedback(finalStatus, finalColor, finalDy, finalIsPalm);
            });

        } else {
            prevCentroidY = -1;
            runOnUiThread(() -> {
                airDrawView.setFingerPosition(0, 0, false);
                airDrawView.updateGestureFeedback("READY (Move hand in Left or Right zone)", Color.parseColor("#10B981"), 0f, false);
            });
        }
    }

    private void closeCamera() {
        if (cameraCaptureSession != null) {
            try { cameraCaptureSession.close(); } catch (Exception ignored) {}
            cameraCaptureSession = null;
        }
        if (cameraDevice != null) {
            try { cameraDevice.close(); } catch (Exception ignored) {}
            cameraDevice = null;
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        closeCamera();
        if (cameraThread != null) {
            cameraThread.quitSafely();
            try { cameraThread.join(500); } catch (InterruptedException ignored) {}
            cameraThread = null;
            cameraHandler = null;
        }
    }
}
