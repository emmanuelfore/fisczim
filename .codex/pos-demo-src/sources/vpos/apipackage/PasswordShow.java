package vpos.apipackage;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.util.AttributeSet;
import android.util.Log;
import android.view.WindowManager;
import android.widget.TextView;

/* JADX INFO: loaded from: classes.dex */
public class PasswordShow {
    private static Context mctx;
    private static Dialog mdialog;
    private static BorderTextView textView;
    byte mark;
    private final String tag = "PasswordShow";
    boolean isQuit = false;
    String amountString = null;
    KB_Thread m_KBThread = null;
    private Handler handler = new Handler(Looper.getMainLooper()) { // from class: vpos.apipackage.PasswordShow.1
        @Override // android.os.Handler
        @SuppressLint({"InlinedApi"})
        public void handleMessage(Message msg) {
            Log.d("PasswordShow", "msg.what=" + msg.what);
            switch (msg.what) {
                case 1:
                    break;
                case 2:
                    Bundle b = msg.getData();
                    String strInfo = b.getString("MSG");
                    Log.i("PasswordShow", strInfo);
                    PasswordShow.mdialog.dismiss();
                    Log.d("PasswordShow", "mdialog.dismiss();");
                    break;
                case 3:
                    Bundle b2 = msg.getData();
                    String strInfo2 = b2.getString("MSG");
                    Log.i("MSG_WHAT_ID_NATION", strInfo2);
                    AlertDialog.Builder builder = new AlertDialog.Builder(PasswordShow.mctx);
                    String tittle = "";
                    if (PasswordShow.this.mark != 0) {
                        tittle = "Amount: " + PasswordShow.this.amountString + "\n";
                    }
                    builder.setTitle(tittle + "Input pin: ");
                    BorderTextView unused = PasswordShow.textView = PasswordShow.this.new BorderTextView(PasswordShow.mctx);
                    PasswordShow.textView.setGravity(17);
                    builder.setCancelable(false);
                    builder.setView(PasswordShow.textView);
                    Dialog unused2 = PasswordShow.mdialog = builder.show();
                    WindowManager.LayoutParams layoutParams = PasswordShow.mdialog.getWindow().getAttributes();
                    layoutParams.width = 500;
                    layoutParams.height = -2;
                    PasswordShow.mdialog.getWindow().setAttributes(layoutParams);
                    break;
                case 4:
                    Bundle b3 = msg.getData();
                    String strInfo3 = b3.getString("MSG");
                    Log.d("PasswordShow", strInfo3);
                    PasswordShow.textView.setTextSize(40.0f);
                    PasswordShow.textView.setText(strInfo3);
                    break;
                default:
                    Bundle b4 = msg.getData();
                    String strInfo4 = b4.getString("MSG");
                    Log.d("PasswordShow", strInfo4);
                    break;
            }
        }
    };

    /* JADX INFO: Access modifiers changed from: private */
    public static native int Lib_GetPinEvent();

    public PasswordShow(Context ctx) {
        mctx = ctx;
    }

    public int ShowDialog(byte mark, byte[] amount) {
        Log.d("PasswordShow", "ShowDialog iAmount = " + ByteUtil.bytearrayToHexString(amount, amount.length));
        this.mark = mark;
        this.amountString = new String(amount).trim();
        Log.e("amountString", "amountString = " + this.amountString);
        SendMsg(3, "showMessage");
        this.isQuit = false;
        this.m_KBThread = new KB_Thread();
        this.m_KBThread.start();
        return 0;
    }

    public int DismissDialog() {
        Log.d("PasswordShow", "DismissDialog");
        SendMsg(2, "disShowMessage");
        this.isQuit = true;
        return 0;
    }

    public void SendMsg(int iType, String strInfo) {
        if (this.handler != null) {
            Message msg = new Message();
            msg.what = iType;
            Bundle b = new Bundle();
            b.putString("MSG", strInfo);
            msg.setData(b);
            this.handler.sendMessage(msg);
        }
    }

    public class KB_Thread extends Thread {
        int keyNum;
        int keycode;
        int ret;
        private boolean m_bThreadFinished = false;
        int keyNumOld = 0;

        public KB_Thread() {
        }

        public boolean isThreadFinished() {
            return this.m_bThreadFinished;
        }

        @Override // java.lang.Thread, java.lang.Runnable
        public void run() {
            Log.e("KB_Thread[ run ]", "run() begin");
            synchronized (this) {
                while (!PasswordShow.this.isQuit) {
                    this.keyNum = PasswordShow.Lib_GetPinEvent();
                    if (this.keyNum >= 0) {
                        if (this.keyNum == 59) {
                            PasswordShow.this.DismissDialog();
                            return;
                        }
                        if (this.keyNum == 28) {
                            PasswordShow.this.DismissDialog();
                            return;
                        }
                        String strInfo = "";
                        for (int i = 0; i < this.keyNum; i++) {
                            strInfo = strInfo + "*";
                        }
                        PasswordShow.this.SendMsg(4, strInfo);
                    }
                }
            }
        }
    }

    @SuppressLint({"DrawAllocation"})
    public class BorderTextView extends TextView {
        private int sroke_width;

        public BorderTextView(Context context) {
            super(context);
            this.sroke_width = 10;
        }

        public BorderTextView(Context context, AttributeSet attrs) {
            super(context, attrs);
            this.sroke_width = 10;
        }

        @Override // android.widget.TextView, android.view.View
        protected void onDraw(Canvas canvas) {
            Paint paint = new Paint();
            paint.setColor(-16776961);
            canvas.drawLine(0.0f, 0.0f, getWidth() - this.sroke_width, 0.0f, paint);
            canvas.drawLine(0.0f, 0.0f, 0.0f, getHeight() - this.sroke_width, paint);
            canvas.drawLine(getWidth() - this.sroke_width, 0.0f, getWidth() - this.sroke_width, getHeight() - this.sroke_width, paint);
            canvas.drawLine(0.0f, getHeight() - this.sroke_width, getWidth() - this.sroke_width, getHeight() - this.sroke_width, paint);
            super.onDraw(canvas);
        }
    }
}
