package android.support.v4.view;

import android.annotation.TargetApi;
import android.support.annotation.RequiresApi;
import android.view.MotionEvent;

/* JADX INFO: loaded from: classes.dex */
@RequiresApi(MotionEventCompat.AXIS_RX)
@TargetApi(MotionEventCompat.AXIS_RX)
class MotionEventCompatHoneycombMr1 {
    MotionEventCompatHoneycombMr1() {
    }

    static float getAxisValue(MotionEvent event, int axis) {
        return event.getAxisValue(axis);
    }

    static float getAxisValue(MotionEvent event, int axis, int pointerIndex) {
        return event.getAxisValue(axis, pointerIndex);
    }
}
