package test.apidemo.activity;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Message;
import android.util.Log;
import android.widget.RelativeLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.Arrays;
import vpos.apipackage.PosApiHelper;

/* JADX INFO: loaded from: classes.dex */
public class McrActivity extends Activity {
    private static final String DISABLE_FUNCTION_LAUNCH_ACTION = "android.intent.action.DISABLE_FUNCTION_LAUNCH";
    private static final int MSG_MSR_CLOSE_FLAG = 2;
    private static final String MSG_MSR_INFO = "msg_msr_info";
    private static final int MSG_MSR_INFO_FLAG = 1;
    private static final int MSG_MSR_OPEN_FLAG = 0;
    private Context mContext;
    public byte[] track1 = new byte[250];
    public byte[] track2 = new byte[250];
    public byte[] track3 = new byte[250];
    public String tag = "McrActivity";
    TextView textViewMsg = null;
    RelativeLayout progressBar = null;
    boolean isQuit = false;
    boolean isOpen = false;
    int ret = -1;
    int checkCount = 0;
    int successCount = 0;
    int failCount = 0;
    private int RESULT_CODE = 0;
    PosApiHelper posApiHelper = PosApiHelper.getInstance();
    MSR_Thread m_MSRThread = null;
    private Handler handler = new Handler() { // from class: test.apidemo.activity.McrActivity.1
        @Override // android.os.Handler
        public void handleMessage(Message msg) {
            switch (msg.what) {
                case 0:
                    McrActivity.this.updateUI();
                    break;
                case 1:
                    Bundle b = msg.getData();
                    String strInfo = b.getString(McrActivity.MSG_MSR_INFO);
                    if (McrActivity.this.RESULT_CODE == -1) {
                        McrActivity.this.textViewMsg.setText("Failed\n" + strInfo);
                    } else {
                        McrActivity.this.textViewMsg.setText("Succeed\n" + strInfo);
                    }
                    Log.e("Msr", strInfo);
                    break;
                case 2:
                    Toast.makeText(McrActivity.this.mContext, R.string.mcrTitle, 0).show();
                    McrActivity.this.finish();
                    break;
            }
        }
    };

    @Override // android.app.Activity
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1);
        getWindow().setFlags(1024, 1024);
        setContentView(R.layout.activity_mcr);
        this.textViewMsg = (TextView) findViewById(R.id.textView_msg);
        this.progressBar = (RelativeLayout) findViewById(R.id.mcr_bar_progress);
        this.mContext = this;
    }

    @Override // android.app.Activity
    protected void onPause() {
        disableFunctionLaunch(false);
        getWindow().clearFlags(128);
        super.onPause();
        this.isQuit = true;
        Log.d("onPause", "onPause onPause!");
    }

    @Override // android.app.Activity
    protected void onResume() {
        disableFunctionLaunch(true);
        getWindow().addFlags(128);
        super.onResume();
        this.isQuit = false;
        this.isOpen = false;
        this.m_MSRThread = new MSR_Thread();
        this.m_MSRThread.start();
        Log.d("onResume", "m_MSRThread.start()");
    }

    @Override // android.app.Activity
    protected void onDestroy() {
        super.onDestroy();
        this.m_MSRThread.interrupt();
        this.isOpen = false;
        this.posApiHelper.McrClose();
        Log.d("onDestroy", "VaMsrCard.Close()");
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void updateUI() {
        this.progressBar.setVisibility(8);
        this.textViewMsg.setVisibility(0);
        this.textViewMsg.setText(R.string.swipe);
        if (getRequestedOrientation() != 1) {
            setRequestedOrientation(1);
        }
    }

    public class MSR_Thread extends Thread {
        private boolean m_bThreadFinished = false;

        public MSR_Thread() {
        }

        public boolean isThreadFinished() {
            return this.m_bThreadFinished;
        }

        @Override // java.lang.Thread, java.lang.Runnable
        public void run() {
            Log.e("MSR_Thread[ run ]", "run() begin");
            synchronized (this) {
                if (!McrActivity.this.isOpen) {
                    int reset1 = McrActivity.this.posApiHelper.McrOpen();
                    Log.e("liuhao ", "reset1 =" + reset1);
                    if (reset1 == 0) {
                        Message msg = new Message();
                        msg.what = 0;
                        McrActivity.this.handler.sendMessage(msg);
                        McrActivity.this.isOpen = true;
                    } else {
                        Message msg2 = new Message();
                        msg2.what = 2;
                        McrActivity.this.handler.sendMessage(msg2);
                        Log.e("liuhao", "msr open and reset failed");
                    }
                }
                while (!McrActivity.this.isQuit && McrActivity.this.isOpen) {
                    int temp = -1;
                    McrActivity.this.posApiHelper.McrOpen();
                    while (temp != 0 && !McrActivity.this.isQuit) {
                        try {
                            temp = McrActivity.this.posApiHelper.McrCheck();
                            Log.e("liuhao", "Lib_McrCheck =" + temp);
                            Thread.sleep(200L);
                        } catch (InterruptedException e) {
                            e.printStackTrace();
                        }
                    }
                    if (McrActivity.this.isQuit) {
                        return;
                    }
                    McrActivity.this.checkCount++;
                    Arrays.fill(McrActivity.this.track1, (byte) 0);
                    Arrays.fill(McrActivity.this.track2, (byte) 0);
                    Arrays.fill(McrActivity.this.track3, (byte) 0);
                    McrActivity.this.ret = McrActivity.this.posApiHelper.McrRead((byte) 0, (byte) 0, McrActivity.this.track1, McrActivity.this.track2, McrActivity.this.track3);
                    Log.e("liuhao", "Lib_McrRead ret = " + McrActivity.this.ret);
                    if (McrActivity.this.ret > 0) {
                        McrActivity.this.RESULT_CODE = 0;
                        McrActivity.this.successCount++;
                        Message msg3 = new Message();
                        Bundle b = new Bundle();
                        String string = "";
                        Log.e("liuhao", "ret = " + McrActivity.this.ret);
                        if (McrActivity.this.ret > 7) {
                            McrActivity.this.RESULT_CODE = -1;
                            string = "Lib_MsrRead check data error";
                            McrActivity.this.failCount++;
                        } else {
                            if ((McrActivity.this.ret & 1) == 1) {
                                string = "track1:" + new String(McrActivity.this.track1).trim();
                            }
                            if ((McrActivity.this.ret & 2) == 2) {
                                string = string + "\n\ntrack2:" + new String(McrActivity.this.track2).trim();
                            }
                            if ((McrActivity.this.ret & 4) == 4) {
                                string = string + "\n\ntrack3:" + new String(McrActivity.this.track3).trim();
                            }
                        }
                        b.putString(McrActivity.MSG_MSR_INFO, string);
                        msg3.setData(b);
                        msg3.what = 1;
                        McrActivity.this.handler.sendMessage(msg3);
                        Log.e("liuhao", "Lib_MsrRead succeed!");
                        McrActivity.this.posApiHelper.SysBeep();
                    } else {
                        McrActivity.this.RESULT_CODE = -1;
                        McrActivity.this.failCount++;
                        Message msg4 = new Message();
                        Bundle b2 = new Bundle();
                        b2.putString(McrActivity.MSG_MSR_INFO, "Lib_MsrRead fail");
                        msg4.setData(b2);
                        msg4.what = 1;
                        McrActivity.this.handler.sendMessage(msg4);
                        Log.e("liuhao", "Lib_MsrRead failed!");
                    }
                }
            }
        }
    }

    private void disableFunctionLaunch(boolean state) {
        Intent disablePowerKeyIntent = new Intent(DISABLE_FUNCTION_LAUNCH_ACTION);
        if (state) {
            disablePowerKeyIntent.putExtra("state", true);
        } else {
            disablePowerKeyIntent.putExtra("state", false);
        }
        sendBroadcast(disablePowerKeyIntent);
    }
}
