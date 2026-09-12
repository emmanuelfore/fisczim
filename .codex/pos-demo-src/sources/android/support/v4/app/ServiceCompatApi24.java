package android.support.v4.app;

import android.annotation.TargetApi;
import android.app.Service;
import android.support.annotation.RequiresApi;
import android.support.v4.view.MotionEventCompat;

/* JADX INFO: loaded from: classes.dex */
@RequiresApi(MotionEventCompat.AXIS_DISTANCE)
@TargetApi(MotionEventCompat.AXIS_DISTANCE)
class ServiceCompatApi24 {
    ServiceCompatApi24() {
    }

    public static void stopForeground(Service service, int flags) {
        service.stopForeground(flags);
    }
}
