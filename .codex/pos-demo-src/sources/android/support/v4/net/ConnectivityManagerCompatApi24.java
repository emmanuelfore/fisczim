package android.support.v4.net;

import android.annotation.TargetApi;
import android.net.ConnectivityManager;
import android.support.annotation.RequiresApi;
import android.support.v4.view.MotionEventCompat;

/* JADX INFO: loaded from: classes.dex */
@RequiresApi(MotionEventCompat.AXIS_DISTANCE)
@TargetApi(MotionEventCompat.AXIS_DISTANCE)
class ConnectivityManagerCompatApi24 {
    ConnectivityManagerCompatApi24() {
    }

    public static int getRestrictBackgroundStatus(ConnectivityManager cm) {
        return cm.getRestrictBackgroundStatus();
    }
}
