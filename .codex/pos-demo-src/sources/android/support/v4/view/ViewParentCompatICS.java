package android.support.v4.view;

import android.annotation.TargetApi;
import android.support.annotation.RequiresApi;
import android.view.View;
import android.view.ViewParent;
import android.view.accessibility.AccessibilityEvent;

/* JADX INFO: loaded from: classes.dex */
@RequiresApi(MotionEventCompat.AXIS_RZ)
@TargetApi(MotionEventCompat.AXIS_RZ)
class ViewParentCompatICS {
    ViewParentCompatICS() {
    }

    public static boolean requestSendAccessibilityEvent(ViewParent parent, View child, AccessibilityEvent event) {
        return parent.requestSendAccessibilityEvent(child, event);
    }
}
