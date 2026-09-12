package vpos.keypad;

import android.graphics.drawable.Drawable;

/* JADX INFO: loaded from: classes.jar:vpos/keypad/KeyElement.class */
public class KeyElement {
    int keyCode;
    Drawable keyIcon;

    public int getKeyCode() {
        return this.keyCode;
    }

    public void setKeyCode(int keyCode) {
        this.keyCode = keyCode;
    }

    public Drawable getKeyIcon() {
        return this.keyIcon;
    }

    public void setKeyIcon(Drawable keyIcon) {
        this.keyIcon = keyIcon;
    }
}
