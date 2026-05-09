package vpos.keypad;

import android.content.Context;
import android.inputmethodservice.Keyboard;
import android.inputmethodservice.KeyboardView;
import android.util.AttributeSet;
import android.util.Log;

/* JADX INFO: loaded from: classes.jar:vpos/keypad/StockKeyboardView.class */
public class StockKeyboardView extends KeyboardView {
    MyViewFocusInterface myViewFocusInterface;

    /* JADX INFO: loaded from: classes.jar:vpos/keypad/StockKeyboardView$MyViewFocusInterface.class */
    interface MyViewFocusInterface {
        void isNoFocus();
    }

    public StockKeyboardView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public StockKeyboardView(Context context, AttributeSet attrs, int defStyle) {
        super(context, attrs, defStyle);
    }

    @Override // android.inputmethodservice.KeyboardView
    protected boolean onLongPress(Keyboard.Key popupKey) {
        if (popupKey.codes[0] == -5) {
        }
        return super.onLongPress(popupKey);
    }

    public void setMyViewFocusInterface(MyViewFocusInterface myViewFocusInterface) {
        this.myViewFocusInterface = myViewFocusInterface;
    }

    @Override // android.view.View
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        super.onWindowFocusChanged(hasWindowFocus);
        if (!hasWindowFocus) {
            Log.e("liuhao", "no focus");
            this.myViewFocusInterface.isNoFocus();
        }
    }
}
