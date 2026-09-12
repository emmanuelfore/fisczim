package vpos.apipackage;

import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.util.Log;
import android.view.KeyEvent;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import com.cspos.BuildConfig;
import com.cspos.R;
import vpos.apipackage.CustomLayout;

/* JADX INFO: loaded from: classes.jar:vpos/apipackage/AppTypeWindow.class */
public class AppTypeWindow {
    private Context mContext;
    private static AlertDialog dlgSelect;
    private RadioGroup radioGroup;
    private static final int MSG_WHAT_SHOW_DIALOG = 0;
    private static final int MSG_WHAT_CLOSE_DIALOG = 1;
    private static final int MSG_WHAT_CLEAR_DIALOG = 2;
    private static final int TIME_OUT_MS = 10000;
    long currentTime;
    long startTime;
    private int typeCount;
    private String[] types;
    IFinishType mIFinishType;
    static int rid = -1;
    final String tag = "liuhao";
    private String title = BuildConfig.FLAVOR;
    int keyInputResult = -1;
    private boolean bFinish = false;
    Decet_Thread m_KBThread = null;
    private Handler mHandler = new Handler(Looper.getMainLooper()) { // from class: vpos.apipackage.AppTypeWindow.2
        @Override // android.os.Handler
        public void handleMessage(Message msg) {
            super.handleMessage(msg);
            switch (msg.what) {
                case AppTypeWindow.MSG_WHAT_SHOW_DIALOG /* 0 */:
                    Log.e("liuhao", "handler  MSG_WHAT_SHOW_DIALOG ..........");
                    CustomLayout layout = new CustomLayout(AppTypeWindow.this.mContext);
                    layout.setLayoutParams(new LinearLayout.LayoutParams(-1, -1));
                    layout.setOrientation(AppTypeWindow.MSG_WHAT_CLOSE_DIALOG);
                    layout.setGravity(17);
                    AppTypeWindow.this.radioGroup = new RadioGroup(AppTypeWindow.this.mContext);
                    AppTypeWindow.this.radioGroup.setLayoutParams(new LinearLayout.LayoutParams(-1, -1));
                    AppTypeWindow.this.radioGroup.setPadding(38, 8, 38, 18);
                    for (int i = AppTypeWindow.MSG_WHAT_SHOW_DIALOG; i < AppTypeWindow.this.typeCount; i += AppTypeWindow.MSG_WHAT_CLOSE_DIALOG) {
                        RadioButton radioButton = new RadioButton(AppTypeWindow.this.mContext);
                        radioButton.setLayoutParams(new LinearLayout.LayoutParams(-1, -2));
                        radioButton.setTextSize(30.0f);
                        radioButton.setTextColor(AppTypeWindow.this.mContext.getResources().getColor(R.color.rbColor1));
                        radioButton.setText(AppTypeWindow.this.types[i]);
                        radioButton.setButtonDrawable(R.drawable.dialog_app_radio_button_style);
                        AppTypeWindow.this.radioGroup.addView(radioButton, i);
                    }
                    layout.addView(AppTypeWindow.this.radioGroup);
                    layout.setMyViewFocusInterface(new CustomLayout.MyViewFocusInterface() { // from class: vpos.apipackage.AppTypeWindow.2.1
                        @Override // vpos.apipackage.CustomLayout.MyViewFocusInterface
                        public void isNoFocus() {
                            AppTypeWindow.this.keyInputResult = -1;
                            if (AppTypeWindow.this.mIFinishType != null) {
                                AppTypeWindow.this.mIFinishType.isFinished(AppTypeWindow.this.keyInputResult);
                            }
                            AppTypeWindow.this.CloseWindow();
                        }
                    });
                    TextView tvTitle = new TextView(AppTypeWindow.this.mContext);
                    tvTitle.setLayoutParams(new LinearLayout.LayoutParams(-1, -1));
                    tvTitle.setPadding(25, 15, 25, 15);
                    tvTitle.setText(AppTypeWindow.this.title);
                    tvTitle.setTextSize(22.0f);
                    tvTitle.setTextColor(AppTypeWindow.this.mContext.getResources().getColor(R.color.black));
                    tvTitle.setGravity(17);
                    AlertDialog unused = AppTypeWindow.dlgSelect = new AlertDialog.Builder(AppTypeWindow.this.mContext, R.style.mDlgTheme).setCustomTitle(tvTitle).setView(layout).setPositiveButton("OK", new DialogInterface.OnClickListener() { // from class: vpos.apipackage.AppTypeWindow.2.3
                        @Override // android.content.DialogInterface.OnClickListener
                        public void onClick(DialogInterface dialog, int which) {
                            Log.e("liuhao", "_____OK_____");
                            AppTypeWindow.this.keyInputResult = AppTypeWindow.MSG_WHAT_SHOW_DIALOG;
                            if (AppTypeWindow.this.mIFinishType != null) {
                                AppTypeWindow.this.mIFinishType.isFinished(AppTypeWindow.this.keyInputResult);
                            }
                            AppTypeWindow.this.CloseWindow();
                        }
                    }).setNegativeButton("Cancel", new DialogInterface.OnClickListener() { // from class: vpos.apipackage.AppTypeWindow.2.2
                        @Override // android.content.DialogInterface.OnClickListener
                        public void onClick(DialogInterface dialog, int which) {
                            AppTypeWindow.this.keyInputResult = -2;
                            Log.e("liuhao", " _____Cancel____");
                            if (AppTypeWindow.this.mIFinishType != null) {
                                AppTypeWindow.this.mIFinishType.isFinished(AppTypeWindow.this.keyInputResult);
                            }
                            AppTypeWindow.this.CloseWindow();
                        }
                    }).show();
                    AppTypeWindow.dlgSelect.setCanceledOnTouchOutside(false);
                    AppTypeWindow.dlgSelect.getButton(-1).setTextSize(18.0f);
                    AppTypeWindow.dlgSelect.getButton(-2).setTextSize(18.0f);
                    AppTypeWindow.dlgSelect.getButton(-1).setTextColor(AppTypeWindow.this.mContext.getResources().getColor(R.color.accent1));
                    AppTypeWindow.dlgSelect.getButton(-2).setTextColor(AppTypeWindow.this.mContext.getResources().getColor(R.color.accent1));
                    AppTypeWindow.dlgSelect.getWindow().setBackgroundDrawable(new ColorDrawable(AppTypeWindow.MSG_WHAT_SHOW_DIALOG));
                    AppTypeWindow.dlgSelect.setOnKeyListener(new DialogInterface.OnKeyListener() { // from class: vpos.apipackage.AppTypeWindow.2.4
                        @Override // android.content.DialogInterface.OnKeyListener
                        public boolean onKey(DialogInterface dialog, int keyCode, KeyEvent event) {
                            Log.e("liuhao", ".....start.....");
                            if (keyCode == 4 && event.getAction() == AppTypeWindow.MSG_WHAT_CLOSE_DIALOG) {
                                Log.e("liuhao", ".....back key.....");
                                AppTypeWindow.this.keyInputResult = -3;
                                if (AppTypeWindow.this.mIFinishType != null) {
                                    AppTypeWindow.this.mIFinishType.isFinished(AppTypeWindow.this.keyInputResult);
                                }
                                AppTypeWindow.this.CloseWindow();
                                return false;
                            }
                            return false;
                        }
                    });
                    break;
                case AppTypeWindow.MSG_WHAT_CLOSE_DIALOG /* 1 */:
                    if (AppTypeWindow.dlgSelect != null) {
                        AppTypeWindow.dlgSelect.dismiss();
                        AlertDialog unused2 = AppTypeWindow.dlgSelect = null;
                        AppTypeWindow.this.mContext = null;
                    }
                    AppTypeWindow.this.bFinish = true;
                    break;
                case AppTypeWindow.MSG_WHAT_CLEAR_DIALOG /* 2 */:
                    if (AppTypeWindow.this.radioGroup != null) {
                        AppTypeWindow.this.radioGroup.clearCheck();
                    }
                    break;
            }
        }
    };

    /* JADX INFO: loaded from: classes.jar:vpos/apipackage/AppTypeWindow$IFinishType.class */
    interface IFinishType {
        void isFinished(int i);
    }

    public void setIFinishType(IFinishType mIFinishType) {
        this.mIFinishType = mIFinishType;
    }

    /* JADX INFO: loaded from: classes.jar:vpos/apipackage/AppTypeWindow$TimeCount.class */
    class TimeCount extends CountDownTimer {
        public TimeCount(long millisInFuture, long countDownInterval) {
            super(millisInFuture, countDownInterval);
        }

        @Override // android.os.CountDownTimer
        public void onTick(long millisUntilFinished) {
        }

        @Override // android.os.CountDownTimer
        public void onFinish() {
            AppTypeWindow.this.CloseWindow();
            AppTypeWindow.this.keyInputResult = AppTypeWindow.MSG_WHAT_SHOW_DIALOG;
            AppTypeWindow.rid = -1;
        }
    }

    public AppTypeWindow(Context context) {
        this.mContext = context;
    }

    public int ShowSelectWindow(int typeCount, byte[] typeBytes, final byte[] selResult) {
        byte[] bArr = new byte[10];
        this.bFinish = false;
        String strApps = ByteUtil.bytesToString(typeBytes);
        Log.e("liuhao", "input = " + strApps);
        this.types = strApps.split(";");
        this.title = this.mContext.getResources().getString(R.string.aid_dlg_title);
        this.typeCount = typeCount;
        SendMsg(MSG_WHAT_SHOW_DIALOG, BuildConfig.FLAVOR);
        rid = 15;
        System.arraycopy(ByteUtil.iToBytes(rid), MSG_WHAT_SHOW_DIALOG, selResult, MSG_WHAT_SHOW_DIALOG, ByteUtil.iToBytes(rid).length);
        setIFinishType(new IFinishType() { // from class: vpos.apipackage.AppTypeWindow.1
            @Override // vpos.apipackage.AppTypeWindow.IFinishType
            public void isFinished(int finishResult) {
                AppTypeWindow.this.keyInputResult = finishResult;
                if (finishResult == 0) {
                    AppTypeWindow.rid = AppTypeWindow.this.radioGroup.getCheckedRadioButtonId();
                    AppTypeWindow.rid = AppTypeWindow.this.radioGroup.indexOfChild(AppTypeWindow.this.radioGroup.findViewById(AppTypeWindow.rid));
                    Log.e("liuhao", "Robert select appDLG ===ShowSelectWindow rid = " + AppTypeWindow.rid);
                    Log.e("liuhao", "Robert select appDLG  ByteUtil.iToBytes(rid).length  = " + ByteUtil.iToBytes(AppTypeWindow.rid).length);
                } else {
                    AppTypeWindow.rid = -1;
                    Log.e("liuhao", "Robert select appDLG  else ===ShowSelectWindow rid = " + AppTypeWindow.rid);
                }
                System.arraycopy(ByteUtil.iToBytes(AppTypeWindow.rid), AppTypeWindow.MSG_WHAT_SHOW_DIALOG, selResult, AppTypeWindow.MSG_WHAT_SHOW_DIALOG, ByteUtil.iToBytes(AppTypeWindow.rid).length);
                Log.e("liuhao", "Robert select appDLG  rid return buf = " + ByteUtil.bytesToInt(selResult));
                AppTypeWindow.this.m_KBThread.interrupt();
                AppTypeWindow.this.CloseWindow();
            }
        });
        this.m_KBThread = new Decet_Thread();
        this.m_KBThread.start();
        ClearWindown();
        Log.e("liuhao", "Robert select appDLG  return rid = " + rid);
        return rid;
    }

    public void CloseWindow() {
        SendMsg(MSG_WHAT_CLOSE_DIALOG, BuildConfig.FLAVOR);
        this.bFinish = true;
    }

    public void ClearWindown() {
        SendMsg(MSG_WHAT_CLEAR_DIALOG, BuildConfig.FLAVOR);
    }

    private void SendMsg(int what, String strInfo) {
        if (MSG_WHAT_SHOW_DIALOG != this.mHandler) {
            Message msg = new Message();
            msg.what = what;
            Bundle b = new Bundle();
            b.putString("MSG", strInfo);
            msg.setData(b);
            this.mHandler.sendMessage(msg);
        }
    }

    /* JADX INFO: loaded from: classes.jar:vpos/apipackage/AppTypeWindow$Decet_Thread.class */
    public class Decet_Thread extends Thread {
        private boolean m_bThreadFinished = false;

        public Decet_Thread() {
        }

        public boolean isThreadFinished() {
            return this.m_bThreadFinished;
        }

        @Override // java.lang.Thread, java.lang.Runnable
        public void run() {
            Log.e("Robert2030", "run() begin");
            synchronized (this) {
                AppTypeWindow.this.startTime = System.currentTimeMillis();
                while (AppTypeWindow.this.currentTime - AppTypeWindow.this.startTime < 10000) {
                    AppTypeWindow.this.currentTime = System.currentTimeMillis();
                }
                Log.e("Robert2030", "run() close");
                AppTypeWindow.this.keyInputResult = AppTypeWindow.MSG_WHAT_SHOW_DIALOG;
                AppTypeWindow.rid = -1;
                AppTypeWindow.this.CloseWindow();
            }
        }
    }

    /* JADX INFO: loaded from: classes.jar:vpos/apipackage/AppTypeWindow$Util.class */
    static class Util {
        Util() {
        }

        public static void sleepMs(int ms) {
            try {
                Thread.sleep(ms);
            } catch (InterruptedException e) {
                e.printStackTrace();
                Log.e("SleepMs", "SleepMs fail : " + e.getMessage().toString());
            }
        }
    }
}
