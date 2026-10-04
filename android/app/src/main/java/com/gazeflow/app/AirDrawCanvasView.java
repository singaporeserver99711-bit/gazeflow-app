package com.gazeflow.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PointF;
import android.util.AttributeSet;
import android.view.View;
import androidx.annotation.Nullable;
import java.util.ArrayList;
import java.util.List;

public class AirDrawCanvasView extends View {

    private Paint paintBrush;
    private Paint paintFingerTip;
    private Paint paintText;
    private Paint paintVector;

    private List<List<PointF>> strokes = new ArrayList<>();
    private List<PointF> currentStroke = new ArrayList<>();
    private PointF currentFingerPoint = null;

    private String gestureStatus = "READY (Move hand in air)";
    private int statusColor = Color.parseColor("#10B981");
    private float motionDY = 0f;

    public AirDrawCanvasView(Context context) {
        super(context);
        init();
    }

    public AirDrawCanvasView(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        paintBrush = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintBrush.setColor(Color.parseColor("#10B981")); // Emerald
        paintBrush.setStyle(Paint.Style.STROKE);
        paintBrush.setStrokeWidth(12f);
        paintBrush.setStrokeCap(Paint.Cap.ROUND);
        paintBrush.setStrokeJoin(Paint.Join.ROUND);

        paintFingerTip = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintFingerTip.setColor(Color.parseColor("#F43F5E")); // Rose
        paintFingerTip.setStyle(Paint.Style.FILL);

        paintText = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintText.setColor(Color.WHITE);
        paintText.setTextSize(32f);
        paintText.setFakeBoldText(true);

        paintVector = new Paint(Paint.ANTI_ALIAS_FLAG);
        paintVector.setStrokeWidth(8f);
        paintVector.setStyle(Paint.Style.STROKE);
        paintVector.setStrokeCap(Paint.Cap.ROUND);
    }

    public void addFingerPoint(float normX, float normY, boolean isDrawing) {
        int w = getWidth();
        int h = getHeight();
        if (w == 0 || h == 0) return;

        float screenX = normX * w;
        float screenY = normY * h;

        currentFingerPoint = new PointF(screenX, screenY);

        if (isDrawing) {
            currentStroke.add(new PointF(screenX, screenY));
        } else {
            if (!currentStroke.isEmpty()) {
                strokes.add(new ArrayList<>(currentStroke));
                currentStroke.clear();
            }
        }
        invalidate();
    }

    public void setGestureStatus(String status, int color, float dy) {
        this.gestureStatus = status;
        this.statusColor = color;
        this.motionDY = dy;
        invalidate();
    }

    public void clearCanvas() {
        strokes.clear();
        currentStroke.clear();
        currentFingerPoint = null;
        gestureStatus = "Canvas Cleared";
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        int w = getWidth();
        int h = getHeight();
        if (w == 0 || h == 0) return;

        // Draw finished strokes
        Path path = new Path();
        for (List<PointF> stroke : strokes) {
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

        // Draw active stroke
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

        // Draw fingertip cursor & motion vector arrow
        if (currentFingerPoint != null) {
            canvas.drawCircle(currentFingerPoint.x, currentFingerPoint.y, 16f, paintFingerTip);

            if (Math.abs(motionDY) > 0.05f) {
                paintVector.setColor(motionDY < 0 ? Color.parseColor("#38BDF8") : Color.parseColor("#F59E0B"));
                float arrowLength = -motionDY * 240f;
                canvas.drawLine(currentFingerPoint.x, currentFingerPoint.y, currentFingerPoint.x, currentFingerPoint.y + arrowLength, paintVector);
            }
        }

        // Draw Status Banner at bottom
        paintText.setColor(statusColor);
        canvas.drawText("STATUS: " + gestureStatus, 24, h - 30, paintText);
    }
}
