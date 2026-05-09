package android.support.v4.media;

import android.os.SystemClock;
import android.view.KeyEvent;

/* JADX INFO: loaded from: classes.dex */
@Deprecated
public abstract class TransportPerformer {
    static final int AUDIOFOCUS_GAIN = 1;
    static final int AUDIOFOCUS_GAIN_TRANSIENT = 2;
    static final int AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK = 3;
    static final int AUDIOFOCUS_LOSS = -1;
    static final int AUDIOFOCUS_LOSS_TRANSIENT = -2;
    static final int AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK = -3;

    @Deprecated
    public abstract long onGetCurrentPosition();

    @Deprecated
    public abstract long onGetDuration();

    @Deprecated
    public abstract boolean onIsPlaying();

    @Deprecated
    public abstract void onPause();

    @Deprecated
    public abstract void onSeekTo(long j);

    @Deprecated
    public abstract void onStart();

    @Deprecated
    public abstract void onStop();

    @Deprecated
    public TransportPerformer() {
    }

    @Deprecated
    public int onGetBufferPercentage() {
        return 100;
    }

    @Deprecated
    public int onGetTransportControlFlags() {
        return 60;
    }

    /* JADX WARN: Can't fix incorrect switch cases order, some code will duplicate */
    @Deprecated
    public boolean onMediaButtonDown(int keyCode, KeyEvent event) {
        switch (keyCode) {
            case 79:
            case 85:
                if (onIsPlaying()) {
                    onPause();
                } else {
                    onStart();
                }
                return true;
            case 86:
                onStop();
                return true;
            case TransportMediator.KEYCODE_MEDIA_PLAY /* 126 */:
                onStart();
                return true;
            case TransportMediator.KEYCODE_MEDIA_PAUSE /* 127 */:
                onPause();
                return true;
            default:
                return true;
        }
    }

    @Deprecated
    public boolean onMediaButtonUp(int keyCode, KeyEvent event) {
        return true;
    }

    @Deprecated
    public void onAudioFocusChange(int focusChange) {
        int keyCode = 0;
        if (focusChange == -1) {
            keyCode = TransportMediator.KEYCODE_MEDIA_PAUSE;
        }
        if (keyCode != 0) {
            long now = SystemClock.uptimeMillis();
            int i = keyCode;
            onMediaButtonDown(keyCode, new KeyEvent(now, now, 0, i, 0));
            onMediaButtonUp(keyCode, new KeyEvent(now, now, 1, i, 0));
        }
    }
}
