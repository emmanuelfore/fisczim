package test.apidemo.activity;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import vpos.apipackage.APDU_RESP;
import vpos.apipackage.APDU_SEND;
import vpos.apipackage.ByteUtil;
import vpos.apipackage.PosApiHelper;

/* JADX INFO: loaded from: classes.dex */
public class IccActivity extends Activity implements View.OnClickListener {
    private int ret;
    private final String TAG = "IccActivity";
    private boolean isIccChecked = false;
    private boolean isPsam1Checked = false;
    private boolean isPsam2Checked = false;
    private RadioGroup rg = null;
    RadioButton radioButtonIcc = null;
    private Button btnSingleTest = null;
    public byte[] dataIn = new byte[512];
    public byte[] ATR = new byte[40];
    public byte vcc_mode = 1;
    TextView tv_msg = null;
    PosApiHelper posApiHelper = PosApiHelper.getInstance();
    String strInfo = "";
    ICC_Thread IccThread = null;
    private boolean m_bThreadFinished = false;

    @Override // android.app.Activity
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1);
        getWindow().setFlags(1024, 1024);
        setContentView(R.layout.activity_icc);
        this.rg = (RadioGroup) findViewById(R.id.rg_card_type);
        this.tv_msg = (TextView) findViewById(R.id.tv_msg);
        this.btnSingleTest = (Button) findViewById(R.id.button_SingleTest);
        this.btnSingleTest.setOnClickListener(this);
        this.radioButtonIcc = (RadioButton) findViewById(R.id.radioButton_icc);
        this.radioButtonIcc.setChecked(true);
        this.isIccChecked = true;
        this.rg.setOnCheckedChangeListener(new RadioGroup.OnCheckedChangeListener() { // from class: test.apidemo.activity.IccActivity.1
            @Override // android.widget.RadioGroup.OnCheckedChangeListener
            public void onCheckedChanged(RadioGroup radioGroup, int checkedId) {
                switch (checkedId) {
                    case R.id.radioButton_icc /* 2131427333 */:
                        IccActivity.this.isIccChecked = true;
                        IccActivity.this.isPsam1Checked = false;
                        IccActivity.this.isPsam2Checked = false;
                        IccActivity.this.tv_msg.setText("Icc Checked");
                        break;
                    case R.id.RadioButton_psam1 /* 2131427334 */:
                        IccActivity.this.isIccChecked = false;
                        IccActivity.this.isPsam1Checked = true;
                        IccActivity.this.isPsam2Checked = false;
                        IccActivity.this.tv_msg.setText("Psam1 Checked");
                        break;
                    case R.id.RadioButton_psam2 /* 2131427335 */:
                        IccActivity.this.isIccChecked = false;
                        IccActivity.this.isPsam1Checked = false;
                        IccActivity.this.isPsam2Checked = true;
                        IccActivity.this.tv_msg.setText("Psam2 Checked");
                        break;
                }
            }
        });
    }

    void startTestIcc(byte slot) {
        short lc;
        short le;
        this.ret = 1;
        if (slot == 0) {
            this.ret = this.posApiHelper.IccCheck(slot);
            if (this.ret != 0) {
                runOnUiThread(new Runnable() { // from class: test.apidemo.activity.IccActivity.2
                    @Override // java.lang.Runnable
                    public void run() {
                        IccActivity.this.tv_msg.setText("Check Failed");
                    }
                });
                Log.e("IccActivity", "Lib_IccCheck failed!");
                return;
            }
        }
        this.ret = this.posApiHelper.IccOpen(slot, this.vcc_mode, this.ATR);
        if (this.ret != 0) {
            runOnUiThread(new Runnable() { // from class: test.apidemo.activity.IccActivity.3
                @Override // java.lang.Runnable
                public void run() {
                    IccActivity.this.tv_msg.setText("Open Failed");
                }
            });
            Log.e("IccActivity", "IccOpen failed!");
            return;
        }
        Log.e("IccActivity", "atrString = " + ByteUtil.bytearrayToHexString(this.ATR, 40));
        String atrString = "";
        for (int i = 0; i < this.ATR.length; i++) {
            atrString = atrString + Integer.toHexString(Integer.valueOf(String.valueOf((int) this.ATR[i])).intValue()).replaceAll("f", "");
        }
        Log.e("IccActivity", "atrString = " + atrString);
        byte[] cmd = new byte[4];
        if (slot == 0) {
            cmd[0] = 0;
            cmd[1] = -92;
            cmd[2] = 4;
            cmd[3] = 0;
            lc = 14;
            le = 1;
            this.dataIn = "1PAY.SYS.DDF01".getBytes();
        } else {
            cmd[0] = 0;
            cmd[1] = -124;
            cmd[2] = 0;
            cmd[3] = 0;
            lc = 0;
            le = 8;
            this.dataIn = "".getBytes();
            Log.e("liuhao Icc  ", "PSAM *******");
        }
        APDU_SEND ApduSend = new APDU_SEND(cmd, lc, this.dataIn, le);
        byte[] resp = new byte[516];
        this.ret = this.posApiHelper.IccCommand(slot, ApduSend.getBytes(), resp);
        if (this.ret == 0) {
            APDU_RESP ApduResp = new APDU_RESP(resp);
            this.strInfo = ByteUtil.bytearrayToHexString(ApduResp.DataOut, ApduResp.LenOut) + "SWA:" + ByteUtil.byteToHexString(ApduResp.SWA) + " SWB:" + ByteUtil.byteToHexString(ApduResp.SWB);
            runOnUiThread(new Runnable() { // from class: test.apidemo.activity.IccActivity.4
                @Override // java.lang.Runnable
                public void run() {
                    IccActivity.this.tv_msg.setText(IccActivity.this.strInfo);
                }
            });
        } else {
            runOnUiThread(new Runnable() { // from class: test.apidemo.activity.IccActivity.5
                @Override // java.lang.Runnable
                public void run() {
                    IccActivity.this.tv_msg.setText("Command Failed");
                }
            });
            Log.e("IccActivity", "Icc_Command failed!");
        }
        try {
            Thread.sleep(200L);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }

    public static byte[] hexStringToByteArray(String s) {
        int len = s.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4) + Character.digit(s.charAt(i + 1), 16));
        }
        return data;
    }

    @Override // android.view.View.OnClickListener
    public void onClick(View v) {
        if (this.IccThread != null && !this.IccThread.isThreadFinished()) {
            Log.e("onClickTest", "return return");
            return;
        }
        this.tv_msg.setText("");
        if (v.getId() == R.id.button_SingleTest) {
            if (this.isIccChecked) {
                this.IccThread = new ICC_Thread((byte) 0);
                this.IccThread.start();
            }
            if (this.isPsam1Checked) {
                this.IccThread = new ICC_Thread((byte) 1);
                this.IccThread.start();
            }
            if (this.isPsam2Checked) {
                this.IccThread = new ICC_Thread((byte) 2);
                this.IccThread.start();
            }
        }
    }

    public class ICC_Thread extends Thread {
        private int iWaitSecond = 1;
        byte slot = 0;
        byte testMode;

        public boolean isThreadFinished() {
            return IccActivity.this.m_bThreadFinished;
        }

        public ICC_Thread(byte mode) {
            this.testMode = mode;
        }

        @Override // java.lang.Thread, java.lang.Runnable
        public void run() {
            synchronized (this) {
                IccActivity.this.m_bThreadFinished = false;
                IccActivity.this.startTestIcc(this.testMode);
                IccActivity.this.m_bThreadFinished = true;
            }
            Log.e("ICCThread[ run ]", "run() end");
        }
    }

    public void closeLed() {
        try {
            PosApiHelper.getInstance().SysSetLedMode(1, 0);
            Thread.sleep(20L);
            PosApiHelper.getInstance().SysSetLedMode(2, 0);
            Thread.sleep(20L);
            PosApiHelper.getInstance().SysSetLedMode(3, 0);
            Thread.sleep(20L);
            PosApiHelper.getInstance().SysSetLedMode(4, 0);
            Thread.sleep(20L);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }

    @Override // android.app.Activity
    protected void onDestroy() {
        super.onDestroy();
        closeLed();
    }
}
