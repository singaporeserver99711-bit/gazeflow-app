package com.gazeflow.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;
import androidx.annotation.Nullable;
import java.util.ArrayList;
import java.util.List;

public class AirDrawView extends View {

    private Paint paintLeftZone;
    private Paint paintRightZone;
    private Paint paintFaceZone;
    private Paint paintZoneBorder;
    private Paint paintBrush;
    private Paint paintFingerTip;
    private Paint paintText;
    private Paint paintVectorArrow;

    // Drawing paths
    private List<List<PointF>> strokeList = new ArrayList<>();
    private List<PointF> currentStroke = new ArrayList<>();
    private PointF currentFingerPos = null;

    // Vectors and status
    private String gestureStatus = "READY (Move hand in Left or Right zone)";
    private int gestureStatusColor = Color.parseColor("#10B981"); // Emerald
    private float vectorDY = 0f;
    private boolean isPalmDetected = false;

    // Configurable Zone ratios (0.0 to 1.0)
    private float faceZoneWidthRatio = 0.38f; // Center 38% is excluded for face!

    public AirDrawView(Context context) {
        super(context);
        init();
    }

    public AirDrawView(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        // Left & Right hand zones (Green transparent tint)
        paintLeftZone = new Paint();
        paintLeftZone.setColor(Color.parseColor("#1510B981"));
        paintLeftZone.setStyle(Paint.Style.FILL);

        paintRightZone = new Paint();
        paintRightZone.setColor(Color.parseColor("#1510B981"));
        paintRightZone.setStyle(Paint.Style.FILL);

        // Face zone (Red / Dark hatched exclusion tint)
        paintFaceZone = new Paint();
        paintFaceZone.setColor(Color.parseColor("#25EF4444"));
        paintFaceZone.setStyle(Paint.Style.FILL);

        paintZoneBorder = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintZoneBorder.setColor(Color.parseColor("#4B5563"));
        paintZoneBorder.setStyle(Paint.Style.STROKE);
        paintZoneBorder.setStrokeWidth(3f);
        paintZoneBorder.setPathEffect(new DashPathEffect(new float[]{12, 12}, 0));

        // Brush for touchless air drawing
        paintBrush = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintBrush.setColor(Color.parseColor("#38BDF8")); // Cyan glow
        paintBrush.setStyle(Paint.Style.STROKE);
        paintBrush.setStrokeWidth(10f);
        paintBrush.setStrokeCap(Paint.Cap.ROUND);
        paintBrush.setStrokeJoin(Paint.Join.ROUND);

        // Fingertip cursor
        paintFingerTip = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintFingerTip.setColor(Color.parseColor("#F43F5E"));
        paintFingerTip.setStyle(Paint.Style.FILL);

        // Vector arrow
        paintVectorArrow = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintVectorArrow.setStrokeWidth(6f);
        paintVectorArrow.setStyle(Paint.Style.STROKE);

        // HUD Text
        paintText = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintText.setColor(Color.WHITE);
        paintText.setTextSize(36f);
        paintText.setFakeBoldText(true);
    }

    public void setFaceZoneWidthRatio(float ratio) {
        this.faceZoneWidthRatio = Math.max(0.15f, Math.min(0.65f, ratio));
        invalidate();
    }

    public float getFaceZoneWidthRatio() {
        return faceZoneWidthRatio;
    }

    public void setFingerPosition(float normX, float normY, boolean isDrawing) {
        int w = getWidth();
        int h = getHeight();
        if (w == 0 || h == 0) return;

        float screenX = normX * w;
        float screenY = normY * h;

        currentFingerPos = new PointF(screenX, screenY);

        if (isDrawing) {
            currentStroke.add(new PointF(screenX, screenY));
        } else {
            if (!currentStroke.isEmpty()) {
                strokeList.add(new ArrayList<>(currentStroke));
                currentStroke.clear();
            }
        }
        invalidate();
    }

    public void updateGestureFeedback(String status, int color, float dy, boolean palm) {
        this.gestureStatus = status;
        this.gestureStatusColor = color;
        this.vectorDY = dy;
        this.isPalmDetected = palm;
        invalidate();
    }

    public void clearCanvas() {
        strokeList.clear();
        currentStroke.clear();
        currentFingerPos = null;
        gestureStatus = "Canvas Cleared";
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        int w = getWidth();
        int h = getHeight();
        if (w == 0 || h == 0) return;

        // Calculate Zone boundaries
        float centerStartX = (w * (1.0f - faceZoneWidthRatio)) / 2f;
        float centerEndX = centerStartX + (w * faceZoneWidthRatio);

        // 1. Draw Left Hand Active Zone
        RectF leftRect = new RectF(0, 0, centerStartX, h);
        canvas.drawRect(leftRect, paintLeftZone);
        canvas.drawLine(centerStartX, 0, centerStartX, h, paintZoneBorder);

        // 2. Draw Center Face Exclusion Zone (MASKED OUT)
        RectF centerRect = new RectF(centerStartX, 0, centerEndX, h);
        canvas.drawRect(centerRect, paintFaceZone);
        canvas.drawLine(centerEndX, 0, centerEndX, h, paintZoneBorder);

        // 3. Draw Right Hand Active Zone
        RectF rightRect = new RectF(centerEndX, 0, w, h);
        canvas.drawRect(rightRect, paintRightZone);

        // Zone Labels
        paintText.setTextSize(30f);
        paintText.setColor(Color.parseColor("#10B981"));
        canvas.drawText("👈 LEFT HAND ZONE", 24, 60, paintText);

        paintText.setColor(Color.parseColor("#EF4444"));
        canvas.drawText("👤 FACE ZONE (EXCLUDED / IGNORED)", centerStartX + 20, 60, paintText);

        paintText.setColor(Color.parseColor("#10B981"));
        canvas.drawText("👉 RIGHT HAND ZONE", centerEndX + 24, 60, paintText);

        // 4. Draw Air Drawing Strokes
        Path path = new Path();
        for (List<PointF> stroke : strokeList) {
            if (stroke.size() > 1) {
                path.reset();
                PointF first = stroke.get(0);
                path.moveTo(first.x, first.y);
                for (int i = 1; i < stroke.size(); i++) {
                    PointF pt = stroke.get(i);
                    path.lineTo(pt.x, pt.y);
                }
                canvas.drawPath(path, paintBrush);
            }
        }

        // Current active stroke
        if (currentStroke.size() > 1) {
            path.reset();
            PointF first = currentStroke.get(0);
            path.moveTo(first.x, first.y);
            for (int i = 1; i < currentStroke.size(); i++) {
                PointF pt = currentStroke.get(i);
                path.lineTo(pt.x, pt.y);
            }
            canvas.drawPath(path, paintBrush);
        }

        // 5. Draw Fingertip Cursor & Palm Aura
        if (currentFingerPos != null) {
            if (isPalmDetected) {
                Paint auraPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
                auraPaint.setColor(Color.parseColor("#60A855F7"));
                canvas.drawCircle(currentFingerPos.x, currentFingerPos.y, 75f, auraPaint);
            }

            canvas.drawCircle(currentFingerPos.x, currentFingerPos.y, 18f, paintFingerTip);

            // Motion Vector Arrow
            if (Math.abs(vectorDY) > 0.05f) {
                paintVectorArrow.setColor(vectorDY < 0 ? Color.parseColor("#38BDF8") : Color.parseColor("#F59E0B"));
                float arrowLength = -vectorDY * 220f;
                canvas.drawLine(currentFingerPos.x, currentFingerPos.y, currentFingerPos.x, currentFingerPos.y + arrowLength, paintVectorArrow);
            }
        }

        // 6. Draw HUD Telemetry Banner
        paintText.setTextSize(34f);
        paintText.setColor(gestureStatusColor);
        canvas.drawText("⚡ STATUS: " + gestureStatus, 30, h - 35, paintText);
    }
}
