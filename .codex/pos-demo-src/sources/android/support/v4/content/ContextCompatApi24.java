package android.support.v4.content;

import android.annotation.TargetApi;
import android.content.Context;
import android.support.annotation.RequiresApi;
import android.support.v4.view.MotionEventCompat;
import java.io.File;

/* JADX INFO: loaded from: classes.dex */
@RequiresApi(MotionEventCompat.AXIS_DISTANCE)
@TargetApi(MotionEventCompat.AXIS_DISTANCE)
class ContextCompatApi24 {
    ContextCompatApi24() {
    }

    public static File getDataDir(Context context) {
        return context.getDataDir();
    }

    public static Context createDeviceProtectedStorageContext(Context context) {
        return context.createDeviceProtectedStorageContext();
    }

    public static boolean isDeviceProtectedStorage(Context context) {
        return context.isDeviceProtectedStorage();
    }
}
