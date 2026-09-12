package android.support.v4.media;

import android.annotation.TargetApi;
import android.media.MediaDescription;
import android.net.Uri;
import android.support.annotation.RequiresApi;
import android.support.v4.media.MediaDescriptionCompatApi21;
import android.support.v4.view.MotionEventCompat;

/* JADX INFO: loaded from: classes.dex */
@RequiresApi(MotionEventCompat.AXIS_BRAKE)
@TargetApi(MotionEventCompat.AXIS_BRAKE)
class MediaDescriptionCompatApi23 extends MediaDescriptionCompatApi21 {
    MediaDescriptionCompatApi23() {
    }

    public static Uri getMediaUri(Object descriptionObj) {
        return ((MediaDescription) descriptionObj).getMediaUri();
    }

    static class Builder extends MediaDescriptionCompatApi21.Builder {
        Builder() {
        }

        public static void setMediaUri(Object builderObj, Uri mediaUri) {
            ((MediaDescription.Builder) builderObj).setMediaUri(mediaUri);
        }
    }
}
