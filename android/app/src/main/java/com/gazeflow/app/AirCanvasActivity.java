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
    private SensorHeatmapOverlayView heatmapOverlayView;
    private AirDrawCanvasView airDrawCanvasView;

    private Button btnRotateCamera;
    private CheckBox cbSwapAxes;
    private CheckBox cbMirrorX;
    private CheckBox cbInvertY;

    private TextView tvFacePosLabel;
    private SeekBar seekFacePosX;
    private TextView tvFaceWidthLabel;
    private SeekBar seekFaceWidth;

    private CameraDevice cameraDevice;
    private CameraCaptureSession cameraCaptureSession;
    private HandlerThread cameraThread;
    private Handler cameraHandler;
    private String frontCameraId = null;

    private SharedPreferences prefs;

    // Calibration variables
    private int cameraRotation = 270; // 0, 90, 180, 270
    private boolean swapAxes = true;
    private boolean mirrorX = false;
    private boolean invertY = false;

    private float facePosX = 0.50f;
    private float faceWidth = 0.35f;

    // Tracking state
    private boolean isProcessingFrame = false;
    private long lastFrameTime = 0;
    private int[] prevLuma = null;
    private float prevCentroidY = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_air_canvas);

        prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE);
        loadCalibrationSettings();

        cameraTextureView = findViewById(R.id.air_camera_texture);
        heatmapOverlayView = findViewById(R.id.sensor_heatmap_overlay);
        airDrawCanvasView = findViewById(R.id.air_draw_canvas);

        btnRotateCamera = findViewById(R.id.btn_rotate_camera);
        cbSwapAxes = findViewById(R.id.cb_swap_axes);
        cbMirrorX = findViewById(R.id.cb_mirror_x);
        cbInvertY = findViewById(R.id.cb_invert_y);

        tvFacePosLabel = findViewById(R.id.tv_face_pos_label);
        seekFacePosX = findViewById(R.id.seek_face_pos_x);
        tvFaceWidthLabel = findViewById(R.id.tv_face_width_label);
        seekFaceWidth = findViewById(R.id.seek_face_width);

        Button btnBack = findViewById(R.id.btn_back);
        Button btnClear = findViewById(R.id.btn_clear_canvas);
        Button btnApply = findViewById(R.id.btn_apply_zones_to_bubble);

        // Update UI states
        btnRotateCamera.setText("🔄 Rotate: " + cameraRotation + "°");
        cbSwapAxes.setChecked(swapAxes);
        cbMirrorX.setChecked(mirrorX);
        cbInvertY.setChecked(invertY);

        seekFacePosX.setProgress((int) (facePosX * 100));
        tvFacePosLabel.setText("👤 Face Position X: " + (int)(facePosX * 100) + "%");

        seekFaceWidth.setProgress((int) (faceWidth * 100));
        tvFaceWidthLabel.setText("👤 Face Mask Width: " + (int)(faceWidth * 100) + "%");

        heatmapOverlayView.setFaceBox(facePosX, faceWidth);

        btnBack.setOnClickListener(v -> finish());
        btnClear.setOnClickListener(v -> airDrawCanvasView.clearCanvas());

        // Rotate button cycles: 270 -> 0 -> 90 -> 180
        btnRotateCamera.setOnClickListener(v -> {
            if (cameraRotation == 270) cameraRotation = 0;
            else if (cameraRotation == 0) cameraRotation = 90;
            else if (cameraRotation == 90) cameraRotation = 180;
            else cameraRotation = 270;

            btnRotateCamera.setText("🔄 Rotate: " + cameraRotation + "°");
            applyOrientationTransform(cameraTextureView.getWidth(), cameraTextureView.getHeight());
            Toast.makeText(this, "Rotation: " + cameraRotation + "°", Toast.LENGTH_SHORT).show();
        });

        cbSwapAxes.setOnCheckedChangeListener((b, isChecked) -> swapAxes = isChecked);
        cbMirrorX.setOnCheckedChangeListener((b, isChecked) -> mirrorX = isChecked);
        cbInvertY.setOnCheckedChangeListener((b, isChecked) -> invertY = isChecked);

        // Face Position X Slider
        seekFacePosX.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                facePosX = progress / 100f;
                tvFacePosLabel.setText("👤 Face Position X: " + progress + "%");
                heatmapOverlayView.setFaceBox(facePosX, faceWidth);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });

        // Face Width Slider
        seekFaceWidth.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                faceWidth = Math.max(0.10f, progress / 100f);
                tvFaceWidthLabel.setText("👤 Face Mask Width: " + progress + "%");
                heatmapOverlayView.setFaceBox(facePosX, faceWidth);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });

        // Save & Apply
        btnApply.setOnClickListener(v -> {
            prefs.edit()
                .putInt("camera_rotation", cameraRotation)
                .putBoolean("swap_axes", swapAxes)
                .putBoolean("mirror_x", mirrorX)
                .putBoolean("invert_y", invertY)
                .putFloat("face_pos_x", facePosX)
                .putFloat("face_width", faceWidth)
                .apply();

            if (FloatingEyeBubbleService.isRunning) {
                Intent updateIntent = new Intent(this, FloatingEyeBubbleService.class);
                updateIntent.setAction(FloatingEyeBubbleService.ACTION_UPDATE_SETTINGS);
                startService(updateIntent);
            }

            Toast.makeText(this, "✔ Saved 1:1 Orientation & Face Exclusion to Shorts Bubble!", Toast.LENGTH_LONG).show();
        });

        setupCameraThread();
        setupTextureListener();
    }

    private void loadCalibrationSettings() {
        cameraRotation = prefs.getInt("camera_rotation", 270);
        swapAxes = prefs.getBoolean("swap_axes", true);
        mirrorX = prefs.getBoolean("mirror_x", false);
        invertY = prefs.getBoolean("invert_y", false);
        facePosX = prefs.getFloat("face_pos_x", 0.50f);
        faceWidth = prefs.getFloat("face_width", 0.35f);
    }

    private void setupCameraThread() {
        cameraThread = new HandlerThread("DualSplitThread");
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
                if (now - lastFrameTime < 45 || isProcessingFrame) return;
                lastFrameTime = now;
                isProcessingFrame = true;

                Bitmap bitmap = cameraTextureView.getBitmap(16, 16);
                if (bitmap == null) {
                    isProcessingFrame = false;
                    return;
                }

                if (cameraHandler != null) {
                    cameraHandler.post(() -> {
                        try {
                            processDualSplitFrame(bitmap);
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
        matrix.postRotate((float) cameraRotation, centerX, centerY);
        cameraTextureView.setTransform(matrix);
    }

    private void openFrontCamera() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return;
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
     * Dual Split-Screen Frame Processing with Real-Time Coordinate Mapping
     */
    private void processDualSplitFrame(Bitmap bitmap) {
        int[] pixels = new int[256];
        bitmap.getPixels(pixels, 0, 16, 0, 0, 16, 16);

        int[] currentLuma = new int[256];
        int ambient = 0;
        for (int i = 0; i < 256; i++) {
            int c = pixels[i];
            int luma = (Color.red(c) * 77 + Color.green(c) * 150 + Color.blue(c) * 29) >> 8;
            currentLuma[i] = luma;
            ambient += luma;
        }

        if (prevLuma == null) {
            prevLuma = currentLuma;
            return;
        }

        int noiseFloor = Math.max(14, (ambient / 256) / 14);

        int[] heatmap = new int[256];
        float totalDiff = 0;
        float weightedX = 0;
        float weightedY = 0;
        int activeSidePixels = 0;

        float faceMinX = facePosX - (faceWidth / 2f);
        float faceMaxX = facePosX + (faceWidth / 2f);

        for (int rawY = 0; rawY < 16; rawY++) {
            for (int rawX = 0; rawX < 16; rawX++) {
                int diff = Math.abs(currentLuma[rawY * 16 + rawX] - prevLuma[rawY * 16 + rawX]);
                heatmap[rawY * 16 + rawX] = diff;

                if (diff > noiseFloor) {
                    // Coordinate Mapping (Swap axes / Mirror / Invert)
                    float mappedX = rawX / 15.0f;
                    float mappedY = rawY / 15.0f;

                    if (swapAxes) {
                        float temp = mappedX;
                        mappedX = mappedY;
                        mappedY = temp;
                    }

                    if (mirrorX) {
                        mappedX = 1.0f - mappedX;
                    }

                    if (invertY) {
                        mappedY = 1.0f - mappedY;
                    }

                    // Check if inside Face Exclusion Box
                    if (mappedX >= faceMinX && mappedX <= faceMaxX) {
                        continue; // EXCLUDE FACE REGION!
                    }

                    activeSidePixels++;
                    totalDiff += diff;
                    weightedX += (mappedX * diff);
                    weightedY += (mappedY * diff);
                }
            }
        }
        prevLuma = currentLuma;

        if (totalDiff > 160) {
            float handX = weightedX / totalDiff;
            float handY = weightedY / totalDiff;

            float dy = 0f;
            if (prevCentroidY >= 0) {
                dy = prevCentroidY - handY; // Positive = Moving UP, Negative = Moving DOWN
            }
            prevCentroidY = handY;

            String status;
            int statusColor;
            boolean isPalm = (activeSidePixels > 60);

            if (isPalm) {
                status = "✋ PALM DETECTED -> PAUSE VIDEO";
                statusColor = Color.parseColor("#C084FC");
            } else if (Math.abs(dy) > 0.08f) {
                boolean up = dy > 0;
                status = up ? "☝️ UPWARD FLICK -> NEXT SHORT" : "👇 DOWNWARD FLICK -> PREV SHORT";
                statusColor = up ? Color.parseColor("#38BDF8") : Color.parseColor("#F59E0B");
            } else {
                status = "DRAWING IN AIR (Finger Active)";
                statusColor = Color.parseColor("#10B981");
            }

            final int[] finalHeatmap = heatmap;
            final float finalHandX = handX;
            final float finalHandY = handY;
            final String finalStatus = status;
            final int finalColor = statusColor;
            final float finalDy = dy;

            runOnUiThread(() -> {
                heatmapOverlayView.updateSensorData(finalHeatmap, finalHandX, finalHandY);
                airDrawCanvasView.addFingerPoint(finalHandX, finalHandY, true);
                airDrawCanvasView.setGestureStatus(finalStatus, finalColor, finalDy);
            });

        } else {
            prevCentroidY = -1;
            final int[] finalHeatmap = heatmap;
            runOnUiThread(() -> {
                heatmapOverlayView.updateSensorData(finalHeatmap, -1f, -1f);
                airDrawCanvasView.addFingerPoint(0, 0, false);
                airDrawCanvasView.setGestureStatus("READY (Move hand in air)", Color.parseColor("#10B981"), 0f);
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
