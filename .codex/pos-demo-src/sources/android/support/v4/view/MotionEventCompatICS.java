package android.support.v4.view;

import android.annotation.TargetApi;
import android.support.annotation.RequiresApi;
import android.view.MotionEvent;

/* JADX INFO: loaded from: classes.dex */
@RequiresApi(MotionEventCompat.AXIS_RZ)
@TargetApi(MotionEventCompat.AXIS_RZ)
class MotionEventCompatICS {
    MotionEventCompatICS() {
    }

    public static int getButtonState(MotionEvent event) {
        return event.getButtonState();
    }
}
