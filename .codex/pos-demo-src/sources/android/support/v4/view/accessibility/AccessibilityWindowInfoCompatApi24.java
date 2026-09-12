package android.support.v4.view.accessibility;

import android.annotation.TargetApi;
import android.support.annotation.RequiresApi;
import android.support.v4.view.MotionEventCompat;
import android.view.accessibility.AccessibilityWindowInfo;

/* JADX INFO: loaded from: classes.dex */
@RequiresApi(MotionEventCompat.AXIS_DISTANCE)
@TargetApi(MotionEventCompat.AXIS_DISTANCE)
class AccessibilityWindowInfoCompatApi24 {
    AccessibilityWindowInfoCompatApi24() {
    }

    public static CharSequence getTitle(Object info) {
        return ((AccessibilityWindowInfo) info).getTitle();
    }

    public static Object getAnchor(Object info) {
        return ((AccessibilityWindowInfo) info).getAnchor();
    }
}
