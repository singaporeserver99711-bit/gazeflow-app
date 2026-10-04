package com.gazeflow.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;
import androidx.annotation.Nullable;

public class SensorHeatmapOverlayView extends View {

    private Paint paintFaceBox;
    private Paint paintFaceBorder;
    private Paint paintActivePoint;
    private Paint paintText;
    private Paint paintTile;

    private float faceCenterX = 0.5f;
    private float faceWidth = 0.35f;

    private float activePointX = -1f;
    private float activePointY = -1f;

    // 16x16 Heatmap grid values (0 to 255)
    private int[] heatmapEnergy = new int[256];

    public SensorHeatmapOverlayView(Context context) {
        super(context);
        init();
    }

    public SensorHeatmapOverlayView(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        paintFaceBox = new Paint();
        paintFaceBox.setColor(Color.parseColor("#35EF4444")); // Red translucent mask
        paintFaceBox.setStyle(Paint.Style.FILL);

        paintFaceBorder = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintFaceBorder.setColor(Color.parseColor("#EF4444"));
        paintFaceBorder.setStyle(Paint.Style.STROKE);
        paintFaceBorder.setStrokeWidth(4f);
        paintFaceBorder.setPathEffect(new DashPathEffect(new float[]{10, 10}, 0));

        paintActivePoint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintActivePoint.setColor(Color.parseColor("#38BDF8"));
        paintActivePoint.setStyle(Paint.Style.FILL);

        paintText = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintText.setColor(Color.WHITE);
        paintText.setTextSize(26f);

        paintTile = new Paint();
        paintTile.setStyle(Paint.Style.FILL);
    }

    public void setFaceBox(float centerX, float width) {
        this.faceCenterX = centerX;
        this.faceWidth = width;
        invalidate();
    }

    public void updateSensorData(int[] energyGrid, float pointX, float pointY) {
        if (energyGrid != null && energyGrid.length == 256) {
            System.arraycopy(energyGrid, 0, this.heatmapEnergy, 0, 256);
        }
        this.activePointX = pointX;
        this.activePointY = pointY;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        int w = getWidth();
        int h = getHeight();
        if (w == 0 || h == 0) return;

        // 1. Draw 16x16 Heatmap Tiles
        float tileW = w / 16.0f;
        float tileH = h / 16.0f;

        for (int y = 0; y < 16; y++) {
            for (int x = 0; x < 16; x++) {
                int energy = heatmapEnergy[y * 16 + x];
                if (energy > 20) {
                    int alpha = Math.min(200, energy * 2);
                    paintTile.setColor(Color.argb(alpha, 16, 185, 129)); // Emerald green glow
                    canvas.drawRect(x * tileW, y * tileH, (x + 1) * tileW, (y + 1) * tileH, paintTile);
                }
            }
        }

        // 2. Draw Face Exclusion Box
        float boxLeft = (faceCenterX - (faceWidth / 2f)) * w;
        float boxRight = (faceCenterX + (faceWidth / 2f)) * w;
        RectF faceRect = new RectF(boxLeft, 0, boxRight, h);

        canvas.drawRect(faceRect, paintFaceBox);
        canvas.drawRect(faceRect, paintFaceBorder);

        canvas.drawText("👤 FACE MASK (IGNORED)", boxLeft + 16, 70, paintText);

        // 3. Draw Detected Hand Point
        if (activePointX >= 0 && activePointY >= 0) {
            float px = activePointX * w;
            float py = activePointY * h;
            canvas.drawCircle(px, py, 22f, paintActivePoint);

            paintActivePoint.setColor(Color.WHITE);
            canvas.drawCircle(px, py, 8f, paintActivePoint);
            paintActivePoint.setColor(Color.parseColor("#38BDF8"));
        }
    }
}
