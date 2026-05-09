package vpos.apipackage;

import android.annotation.TargetApi;
import android.content.Context;
import android.util.AttributeSet;
import android.widget.LinearLayout;

/* JADX INFO: loaded from: classes.jar:vpos/apipackage/CustomLayout.class */
public class CustomLayout extends LinearLayout {
    MyViewFocusInterface myViewFocusInterface;

    /* JADX INFO: loaded from: classes.jar:vpos/apipackage/CustomLayout$MyViewFocusInterface.class */
    interface MyViewFocusInterface {
        void isNoFocus();
    }

    public CustomLayout(Context context) {
        super(context);
    }

    public CustomLayout(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public CustomLayout(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
    }

    @TargetApi(21)
    public CustomLayout(Context context, AttributeSet attrs, int defStyleAttr, int defStyleRes) {
        super(context, attrs, defStyleAttr, defStyleRes);
    }

    @Override // android.view.View
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        super.onWindowFocusChanged(hasWindowFocus);
        if (!hasWindowFocus) {
            this.myViewFocusInterface.isNoFocus();
        }
    }

    public void setMyViewFocusInterface(MyViewFocusInterface myViewFocusInterface) {
        this.myViewFocusInterface = myViewFocusInterface;
    }
}
