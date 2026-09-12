package android.support.v4.widget;

import android.annotation.TargetApi;
import android.graphics.drawable.Drawable;
import android.support.annotation.RequiresApi;
import android.support.v4.view.MotionEventCompat;
import android.widget.CompoundButton;

/* JADX INFO: loaded from: classes.dex */
@RequiresApi(MotionEventCompat.AXIS_BRAKE)
@TargetApi(MotionEventCompat.AXIS_BRAKE)
class CompoundButtonCompatApi23 {
    CompoundButtonCompatApi23() {
    }

    static Drawable getButtonDrawable(CompoundButton button) {
        return button.getButtonDrawable();
    }
}
