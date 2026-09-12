package test.apidemo.activity;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;
import vpos.apipackage.APDU_RESP;
import vpos.apipackage.APDU_SEND;
import vpos.apipackage.ByteUtil;
import vpos.apipackage.PosApiHelper;

/* JADX INFO: loaded from: classes.dex */
public class PiccActivity extends Activity implements View.OnClickListener {
    private static final String DISABLE_FUNCTION_LAUNCH_ACTION = "android.intent.action.DISABLE_FUNCTION_LAUNCH";
    static final int TYPE_M1_OPERATE = 4;
    static final int TYPE_M1_READ = 3;
    static final int TYPE_M1_READ_BLOCK = 6;
    static final int TYPE_M1_WRITE = 2;
    static final int TYPE_M1_WRITE_BLOCK = 5;
    static final int TYPE_NFC = 0;
    static final int TYPE_PICC = 1;
    static final int TYPE_PICC_M1_OPERATE = 8;
    static final int TYPE_PICC_POLL = 7;
    static byte m1OpereteType = 0;
    Button btnNfc;
    Button btnOperateM1;
    Button btnPiccPoll;
    Button btnReadM1;
    Button btnReadM1Block;
    Button btnStart;
    Button btnWriteM1;
    Button btnWriteM1Block;
    EditText editBlkNo;
    EditText editM1OperateBlkNo;
    EditText editM1OperateData;
    EditText editM1OperateUpdateNo;
    EditText editWriteData;
    IFinishCall iFinishCall;
    RadioButton rb_Subtraction;
    RadioButton rb_add;
    RadioButton rb_equal;
    byte picc_mode = 66;
    byte picc_type = 97;
    byte blkNo = 60;
    byte[] blkValue = new byte[20];
    byte[] pwd = new byte[20];
    byte[] cardtype = new byte[3];
    byte[] serialNo = new byte[50];
    byte[] dataIn = new byte[530];
    byte[] dataM1 = new byte[16];
    TextView textViewMsg = null;
    TextView tvOpereteType = null;
    RadioGroup rg_operate = null;
    String strBlkNo = "";
    String strWriteData = "";
    private boolean bIsBack = false;
    PosApiHelper posApiHelper = PosApiHelper.getInstance();
    PICC_Thread piccThread = null;
    private boolean m_bThreadFinished = false;

    interface IFinishCall {
        void isFinish(boolean z);
    }

    void setIFinishCall(IFinishCall iFinishCall) {
        this.iFinishCall = iFinishCall;
    }

    @Override // android.app.Activity
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1);
        getWindow().setFlags(1024, 1024);
        setContentView(R.layout.activity_picc);
        this.textViewMsg = (TextView) findViewById(R.id.textView_picc);
        this.textViewMsg.requestFocus();
        this.tvOpereteType = (TextView) findViewById(R.id.tvOpereteType);
        this.editBlkNo = (EditText) findViewById(R.id.editBlkNo);
        this.editWriteData = (EditText) findViewById(R.id.editWriteData);
        this.editM1OperateData = (EditText) findViewById(R.id.editM1OperateData);
        this.editM1OperateBlkNo = (EditText) findViewById(R.id.editM1OperateBlkNo);
        this.editM1OperateUpdateNo = (EditText) findViewById(R.id.editM1OperateUpdateNo);
        this.btnStart = (Button) findViewById(R.id.btnPiccTest);
        this.btnNfc = (Button) findViewById(R.id.btnNfc);
        this.btnReadM1 = (Button) findViewById(R.id.btnReadM1);
        this.btnWriteM1 = (Button) findViewById(R.id.btnWriteM1);
        this.btnOperateM1 = (Button) findViewById(R.id.btnOperateM1);
        this.btnReadM1Block = (Button) findViewById(R.id.btnReadM1Block);
        this.btnWriteM1Block = (Button) findViewById(R.id.btnWriteM1Block);
        this.btnPiccPoll = (Button) findViewById(R.id.btnPiccPoll);
        this.btnStart.setOnClickListener(this);
        this.btnNfc.setOnClickListener(this);
        this.btnReadM1.setOnClickListener(this);
        this.btnWriteM1.setOnClickListener(this);
        this.btnOperateM1.setOnClickListener(this);
        this.btnReadM1Block.setOnClickListener(this);
        this.btnWriteM1Block.setOnClickListener(this);
        this.btnPiccPoll.setOnClickListener(this);
        this.rg_operate = (RadioGroup) findViewById(R.id.rg_operate);
        this.rb_add = (RadioButton) findViewById(R.id.rb_add);
        this.rb_add.setChecked(true);
        this.rb_Subtraction = (RadioButton) findViewById(R.id.rb_Subtraction);
        this.rb_equal = (RadioButton) findViewById(R.id.rb_equal);
        this.rg_operate.setOnCheckedChangeListener(new RadioGroup.OnCheckedChangeListener() { // from class: test.apidemo.activity.PiccActivity.1
            @Override // android.widget.RadioGroup.OnCheckedChangeListener
            public void onCheckedChanged(RadioGroup group, int checkedId) {
                switch (checkedId) {
                    case R.id.rb_add /* 2131427360 */:
                        PiccActivity.m1OpereteType = (byte) 43;
                        PiccActivity.this.tvOpereteType.setText(" + ");
                        break;
                    case R.id.rb_Subtraction /* 2131427361 */:
                        PiccActivity.m1OpereteType = (byte) 45;
                        PiccActivity.this.tvOpereteType.setText(" - ");
                        break;
                    case R.id.rb_equal /* 2131427362 */:
                        PiccActivity.m1OpereteType = (byte) 61;
                        PiccActivity.this.tvOpereteType.setText(" = ");
                        break;
                }
            }
        });
    }

    @Override // android.app.Activity
    protected void onResume() {
        super.onResume();
        getWindow().addFlags(128);
        disableFunctionLaunch(true);
    }

    @Override // android.app.Activity
    protected void onPause() {
        disableFunctionLaunch(false);
        getWindow().clearFlags(128);
        super.onPause();
    }

    @Override // android.app.Activity
    public void onBackPressed() {
        super.onBackPressed();
        this.bIsBack = true;
    }

    public int readNfcCard() {
        int ret;
        synchronized (this) {
            Log.e("nfc", "heyp nfc Picc_Open start!");
            byte[] NfcData_Len = new byte[5];
            byte[] Technology = new byte[25];
            byte[] NFC_UID = new byte[56];
            byte[] NDEF_message = new byte[500];
            ret = this.posApiHelper.PiccNfc(NfcData_Len, Technology, NFC_UID, NDEF_message);
            int TechnologyLength = NfcData_Len[0] & 255;
            int NFC_UID_length = NfcData_Len[1] & 255;
            int NDEF_message_length = (NfcData_Len[3] & 255) + (NfcData_Len[4] & 255);
            byte[] NDEF_message_data = new byte[NDEF_message_length];
            byte[] NFC_UID_data = new byte[NFC_UID_length];
            System.arraycopy(NFC_UID, 0, NFC_UID_data, 0, NFC_UID_length);
            System.arraycopy(NDEF_message, 0, NDEF_message_data, 0, NDEF_message_length);
            String NDEF_message_data_str = new String(NDEF_message_data);
            String NDEF_str = null;
            if (!TextUtils.isEmpty(NDEF_message_data_str)) {
                NDEF_str = NDEF_message_data_str.substring(NDEF_message_data_str.indexOf("en") + 2, NDEF_message_data_str.length());
            }
            if (ret != 0) {
                runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.4
                    @Override // java.lang.Runnable
                    public void run() {
                        PiccActivity.this.textViewMsg.setText("Read Card Failed !..");
                    }
                });
            } else {
                this.posApiHelper.SysBeep();
                if (!TextUtils.isEmpty(NDEF_str)) {
                    final String tmpStr = "TYPE: " + new String(Technology).substring(0, TechnologyLength) + "\nUID: " + ByteUtil.bytearrayToHexString(NFC_UID_data, NFC_UID_data.length) + "\n" + NDEF_str;
                    runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.2
                        @Override // java.lang.Runnable
                        public void run() {
                            PiccActivity.this.textViewMsg.setText(tmpStr);
                        }
                    });
                } else {
                    final String str = "TYPE: " + new String(Technology).substring(0, TechnologyLength) + "\nUID: " + ByteUtil.bytearrayToHexString(NFC_UID_data, NFC_UID_data.length) + "\n" + NDEF_str;
                    runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.3
                        @Override // java.lang.Runnable
                        public void run() {
                            PiccActivity.this.textViewMsg.setText(str);
                        }
                    });
                }
            }
            this.m_bThreadFinished = true;
        }
        return ret;
    }

    public int ByteArrayToInt(byte[] bArr) {
        if (bArr.length != 4) {
            return -1;
        }
        return ((bArr[3] & 255) << 24) | ((bArr[2] & 255) << 16) | ((bArr[1] & 255) << 8) | ((bArr[0] & 255) << 0);
    }

    @Override // android.view.View.OnClickListener
    public void onClick(View v) {
        int id = v.getId();
        if (id != R.id.btnOperateM1) {
            switch (id) {
                case R.id.btnReadM1 /* 2131427349 */:
                    if (this.piccThread != null && !this.piccThread.isThreadFinished()) {
                        Log.e("onClickReadM1", "return return");
                    } else {
                        this.piccThread = new PICC_Thread(3);
                        this.piccThread.start();
                    }
                    break;
                case R.id.btnWriteM1 /* 2131427350 */:
                    if (this.piccThread != null && !this.piccThread.isThreadFinished()) {
                        Log.e("onClickWriteM1", "return return");
                    } else {
                        this.piccThread = new PICC_Thread(2);
                        this.piccThread.start();
                    }
                    break;
                default:
                    switch (id) {
                        case R.id.btnReadM1Block /* 2131427353 */:
                            if (this.piccThread != null && !this.piccThread.isThreadFinished()) {
                                Log.e("onClickReadM1 Block", "return return");
                            } else {
                                this.piccThread = new PICC_Thread(6);
                                this.piccThread.start();
                            }
                            break;
                        case R.id.btnWriteM1Block /* 2131427354 */:
                            if (this.piccThread != null && !this.piccThread.isThreadFinished()) {
                                Log.e("onClickWriteM1 Block", "return return");
                            } else {
                                this.piccThread = new PICC_Thread(5);
                                this.piccThread.start();
                            }
                            break;
                        case R.id.btnPiccTest /* 2131427355 */:
                            if (this.piccThread != null && !this.piccThread.isThreadFinished()) {
                                Log.e("onClickTest", "return return");
                            } else {
                                this.piccThread = new PICC_Thread(1);
                                this.piccThread.start();
                            }
                            break;
                        case R.id.btnNfc /* 2131427356 */:
                            if (this.piccThread != null && !this.piccThread.isThreadFinished()) {
                                Log.e("onClickNfc", "return return");
                            } else {
                                this.piccThread = new PICC_Thread(0);
                                this.piccThread.start();
                            }
                            break;
                        case R.id.btnPiccPoll /* 2131427357 */:
                            if (this.piccThread != null && !this.piccThread.isThreadFinished()) {
                                Log.e("PiccPoll", "return return");
                            } else {
                                this.piccThread = new PICC_Thread(7);
                                this.piccThread.start();
                            }
                            break;
                    }
                    break;
            }
            return;
        }
        if (this.piccThread != null && !this.piccThread.isThreadFinished()) {
            Log.e("onClickReadM1", "return return");
        } else {
            this.piccThread = new PICC_Thread(4);
            this.piccThread.start();
        }
    }

    public class PICC_Thread extends Thread {
        int ret;
        int type;

        public PICC_Thread(int type) {
            this.type = type;
        }

        public boolean isThreadFinished() {
            return PiccActivity.this.m_bThreadFinished;
        }

        @Override // java.lang.Thread, java.lang.Runnable
        public void run() {
            synchronized (this) {
                PiccActivity.this.m_bThreadFinished = false;
                switch (this.type) {
                    case 0:
                        this.ret = PiccActivity.this.readNfcCard();
                        break;
                    case 1:
                        this.ret = PiccActivity.this.posApiHelper.PiccOpen();
                        if (this.ret != 0) {
                            PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.1
                                @Override // java.lang.Runnable
                                public void run() {
                                    PiccActivity.this.textViewMsg.setText("Picc_Open Error");
                                }
                            });
                            Log.e("RsaThread[ run ]", "Picc_Open error!");
                            return;
                        }
                        boolean bPICCCheck = false;
                        this.ret = PiccActivity.this.posApiHelper.PiccCheck(PiccActivity.this.picc_mode, PiccActivity.this.cardtype, PiccActivity.this.serialNo);
                        Log.e("liuhao picc", "000000000000 ret = " + this.ret);
                        if (this.ret == 0) {
                            Log.e("RsaThread[ run ]", "Picc_Check succeed!");
                            bPICCCheck = true;
                        }
                        if (!bPICCCheck) {
                            PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.8
                                @Override // java.lang.Runnable
                                public void run() {
                                    PiccActivity.this.textViewMsg.setText(" Looking for cards ");
                                }
                            });
                            Log.e("PICC_Thread11[ run ]", "Time Out!");
                        } else if (77 == PiccActivity.this.picc_mode) {
                            PiccActivity.this.pwd[0] = -1;
                            PiccActivity.this.pwd[1] = -1;
                            PiccActivity.this.pwd[2] = -1;
                            PiccActivity.this.pwd[3] = -1;
                            PiccActivity.this.pwd[4] = -1;
                            PiccActivity.this.pwd[5] = -1;
                            PiccActivity.this.pwd[6] = 0;
                            PiccActivity.this.picc_type = (byte) 65;
                            this.ret = PiccActivity.this.posApiHelper.PiccM1Authority(PiccActivity.this.picc_type, PiccActivity.this.blkNo, PiccActivity.this.pwd, PiccActivity.this.serialNo);
                            if (this.ret == 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.2
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("Picc_M1Authority Succeed");
                                    }
                                });
                                PiccActivity.this.blkValue[0] = 34;
                                PiccActivity.this.blkValue[1] = 0;
                                PiccActivity.this.blkValue[2] = 0;
                                PiccActivity.this.blkValue[3] = 0;
                                PiccActivity.this.blkValue[4] = -69;
                                PiccActivity.this.blkValue[5] = -1;
                                PiccActivity.this.blkValue[6] = -1;
                                PiccActivity.this.blkValue[7] = -1;
                                PiccActivity.this.blkValue[8] = 68;
                                PiccActivity.this.blkValue[9] = 0;
                                PiccActivity.this.blkValue[10] = 0;
                                PiccActivity.this.blkValue[11] = 0;
                                PiccActivity.this.blkValue[12] = PiccActivity.this.blkNo;
                                PiccActivity.this.blkValue[13] = (byte) (PiccActivity.this.blkNo ^ (-1));
                                PiccActivity.this.blkValue[14] = PiccActivity.this.blkNo;
                                PiccActivity.this.blkValue[15] = (byte) (PiccActivity.this.blkNo ^ (-1));
                                this.ret = PiccActivity.this.posApiHelper.PiccM1WriteBlock(PiccActivity.this.blkNo, PiccActivity.this.blkValue);
                                if (this.ret != 0) {
                                    PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.4
                                        @Override // java.lang.Runnable
                                        public void run() {
                                            PiccActivity.this.textViewMsg.setText("Picc_M1WriteBlock Error    return " + PICC_Thread.this.ret);
                                        }
                                    });
                                } else {
                                    Log.e("liuhao", "ret = " + this.ret + ",  blkValue = " + PiccActivity.this.blkValue.toString());
                                    PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.3
                                        @Override // java.lang.Runnable
                                        public void run() {
                                            PiccActivity.this.textViewMsg.setText("Picc_M1WriteBlock read blkValue :" + ByteUtil.bytearrayToHexString(PiccActivity.this.blkValue, 20));
                                        }
                                    });
                                    PiccActivity.this.posApiHelper.SysBeep();
                                }
                            } else {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.5
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("Picc_M1Authority Error    return " + PICC_Thread.this.ret);
                                    }
                                });
                            }
                        } else {
                            byte[] cmd = {0, -124, 0, 0};
                            PiccActivity.this.dataIn = "1PAY.SYS.DDF01".getBytes();
                            APDU_SEND ApduSend = new APDU_SEND(cmd, (short) 0, PiccActivity.this.dataIn, (short) 8);
                            byte[] resp = new byte[516];
                            this.ret = PiccActivity.this.posApiHelper.PiccCommand(ApduSend.getBytes(), resp);
                            if (this.ret != 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.7
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("Picc_Command Error    return " + PICC_Thread.this.ret);
                                    }
                                });
                                Log.e("RsaThread[ run ]", "Picc_Command failed! return " + this.ret);
                            } else {
                                APDU_RESP ApduResp = new APDU_RESP(resp);
                                final String finalStrInfo = ByteUtil.bytearrayToHexString(ApduResp.DataOut, ApduResp.LenOut) + "SWA:" + ByteUtil.byteToHexString(ApduResp.SWA) + " SWB:" + ByteUtil.byteToHexString(ApduResp.SWB);
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.6
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText(finalStrInfo);
                                    }
                                });
                            }
                        }
                        PiccActivity.this.posApiHelper.PiccClose();
                        Log.e("PICC_Thread11[ run ]", "posApiHelperPiccClose()!");
                        break;
                        break;
                    case 2:
                        PiccActivity.this.strBlkNo = PiccActivity.this.editBlkNo.getText().toString().trim();
                        PiccActivity.this.strWriteData = PiccActivity.this.editWriteData.getText().toString().trim();
                        if (PiccActivity.this.strBlkNo != null && PiccActivity.this.strBlkNo.length() >= 1 && PiccActivity.this.strWriteData.length() >= 1) {
                            PiccActivity.this.blkNo = (byte) Integer.parseInt(PiccActivity.this.strBlkNo);
                            PiccActivity.this.pwd[0] = -1;
                            PiccActivity.this.pwd[1] = -1;
                            PiccActivity.this.pwd[2] = -1;
                            PiccActivity.this.pwd[3] = -1;
                            PiccActivity.this.pwd[4] = -1;
                            PiccActivity.this.pwd[5] = -1;
                            PiccActivity.this.pwd[6] = 0;
                            PiccActivity.this.picc_type = (byte) 65;
                            this.ret = PiccActivity.this.posApiHelper.PiccM1Authority(PiccActivity.this.picc_type, PiccActivity.this.blkNo, PiccActivity.this.pwd, PiccActivity.this.serialNo);
                            if (this.ret != 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.14
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Write failed~\n Authority -- ret = " + PICC_Thread.this.ret);
                                    }
                                });
                                PiccActivity.this.m_bThreadFinished = true;
                                return;
                            }
                            this.ret = PiccActivity.this.posApiHelper.PiccM1WriteValue(Integer.parseInt(PiccActivity.this.strBlkNo), PiccActivity.this.strWriteData.getBytes());
                            if (this.ret == 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.15
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Write Success~\n");
                                    }
                                });
                            } else {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.16
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Write failed~ \nret = " + PICC_Thread.this.ret);
                                    }
                                });
                                PiccActivity.this.m_bThreadFinished = true;
                                return;
                            }
                            break;
                        }
                        PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.13
                            @Override // java.lang.Runnable
                            public void run() {
                                PiccActivity.this.textViewMsg.setText(PiccActivity.this.getResources().getString(R.string.blockTips) + "\nand " + PiccActivity.this.getResources().getString(R.string.writeTips));
                                Toast.makeText(PiccActivity.this, PiccActivity.this.getResources().getString(R.string.blockTips) + "and " + PiccActivity.this.getResources().getString(R.string.writeTips), 0).show();
                            }
                        });
                        PiccActivity.this.m_bThreadFinished = true;
                        return;
                    case 3:
                        PiccActivity.this.strBlkNo = PiccActivity.this.editBlkNo.getText().toString().trim();
                        if (PiccActivity.this.strBlkNo != null && PiccActivity.this.strBlkNo.length() >= 1) {
                            PiccActivity.this.blkNo = (byte) Integer.parseInt(PiccActivity.this.strBlkNo);
                            PiccActivity.this.pwd[0] = -1;
                            PiccActivity.this.pwd[1] = -1;
                            PiccActivity.this.pwd[2] = -1;
                            PiccActivity.this.pwd[3] = -1;
                            PiccActivity.this.pwd[4] = -1;
                            PiccActivity.this.pwd[5] = -1;
                            PiccActivity.this.pwd[6] = 0;
                            PiccActivity.this.picc_type = (byte) 65;
                            this.ret = PiccActivity.this.posApiHelper.PiccM1Authority(PiccActivity.this.picc_type, PiccActivity.this.blkNo, PiccActivity.this.pwd, PiccActivity.this.serialNo);
                            if (this.ret != 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.10
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Read failed~\n Authority -- ret = " + PICC_Thread.this.ret);
                                    }
                                });
                                PiccActivity.this.m_bThreadFinished = true;
                                return;
                            }
                            this.ret = PiccActivity.this.posApiHelper.PiccM1ReadValue(Integer.parseInt(PiccActivity.this.strBlkNo), PiccActivity.this.dataM1);
                            if (this.ret == 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.11
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Read Success~\n" + ByteUtil.bytearrayToHexString(PiccActivity.this.dataM1, 4));
                                    }
                                });
                            } else {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.12
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Read failed~ \nret = " + PICC_Thread.this.ret);
                                    }
                                });
                            }
                            break;
                        }
                        PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.9
                            @Override // java.lang.Runnable
                            public void run() {
                                PiccActivity.this.textViewMsg.setText(PiccActivity.this.getResources().getString(R.string.blockTips));
                                Toast.makeText(PiccActivity.this, PiccActivity.this.getResources().getString(R.string.blockTips), 0).show();
                            }
                        });
                        PiccActivity.this.m_bThreadFinished = true;
                        return;
                    case 4:
                        if (PiccActivity.this.editM1OperateBlkNo.getText().toString().trim().length() >= 1 && PiccActivity.this.editM1OperateUpdateNo.getText().toString().trim().length() >= 1) {
                            PiccActivity.this.blkNo = (byte) Integer.parseInt(PiccActivity.this.strBlkNo);
                            PiccActivity.this.pwd[0] = -1;
                            PiccActivity.this.pwd[1] = -1;
                            PiccActivity.this.pwd[2] = -1;
                            PiccActivity.this.pwd[3] = -1;
                            PiccActivity.this.pwd[4] = -1;
                            PiccActivity.this.pwd[5] = -1;
                            PiccActivity.this.pwd[6] = 0;
                            PiccActivity.this.picc_type = (byte) 65;
                            this.ret = PiccActivity.this.posApiHelper.PiccM1Authority(PiccActivity.this.picc_type, PiccActivity.this.blkNo, PiccActivity.this.pwd, PiccActivity.this.serialNo);
                            if (this.ret != 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.26
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Operate Authority failed~\n Authority -- ret = " + PICC_Thread.this.ret);
                                    }
                                });
                                PiccActivity.this.m_bThreadFinished = true;
                                return;
                            } else {
                                this.ret = PiccActivity.this.posApiHelper.PiccM1Operate(PiccActivity.m1OpereteType, (byte) Integer.parseInt(PiccActivity.this.editM1OperateBlkNo.getText().toString().trim()), PiccActivity.this.editM1OperateData.getText().toString().trim().getBytes(), (byte) Integer.parseInt(PiccActivity.this.editM1OperateUpdateNo.getText().toString().trim()));
                                if (this.ret != 0) {
                                    PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.27
                                        @Override // java.lang.Runnable
                                        public void run() {
                                            PiccActivity.this.textViewMsg.setText("M1 Operate Operate failed~\n Operate -- ret = " + PICC_Thread.this.ret);
                                        }
                                    });
                                    PiccActivity.this.m_bThreadFinished = true;
                                    return;
                                }
                            }
                        }
                        PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.25
                            @Override // java.lang.Runnable
                            public void run() {
                                Toast.makeText(PiccActivity.this, "M1 Operate failed~\n Please Input start blkNO and update blkNO~", 0).show();
                                PiccActivity.this.textViewMsg.setText("M1 Operate failed~\n Please Input start blkNO and update blkNO~");
                            }
                        });
                        PiccActivity.this.m_bThreadFinished = true;
                        return;
                    case 5:
                        PiccActivity.this.strBlkNo = PiccActivity.this.editBlkNo.getText().toString().trim();
                        PiccActivity.this.strWriteData = PiccActivity.this.editWriteData.getText().toString().trim();
                        if (PiccActivity.this.strBlkNo != null && PiccActivity.this.strBlkNo.length() >= 1 && PiccActivity.this.strWriteData.length() >= 1) {
                            PiccActivity.this.blkNo = (byte) Integer.parseInt(PiccActivity.this.strBlkNo);
                            PiccActivity.this.pwd[0] = -1;
                            PiccActivity.this.pwd[1] = -1;
                            PiccActivity.this.pwd[2] = -1;
                            PiccActivity.this.pwd[3] = -1;
                            PiccActivity.this.pwd[4] = -1;
                            PiccActivity.this.pwd[5] = -1;
                            PiccActivity.this.pwd[6] = 0;
                            PiccActivity.this.picc_type = (byte) 65;
                            this.ret = PiccActivity.this.posApiHelper.PiccM1Authority(PiccActivity.this.picc_type, PiccActivity.this.blkNo, PiccActivity.this.pwd, PiccActivity.this.serialNo);
                            if (this.ret != 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.22
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Write Block failed~\n Authority -- ret = " + PICC_Thread.this.ret);
                                    }
                                });
                                PiccActivity.this.m_bThreadFinished = true;
                                return;
                            }
                            this.ret = PiccActivity.this.posApiHelper.PiccM1WriteBlock(Integer.parseInt(PiccActivity.this.strBlkNo), PiccActivity.this.strWriteData.getBytes());
                            if (this.ret == 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.23
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Write Block Success~\n");
                                    }
                                });
                            } else {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.24
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Write Block failed~ \nret = " + PICC_Thread.this.ret);
                                    }
                                });
                                PiccActivity.this.m_bThreadFinished = true;
                                return;
                            }
                            break;
                        }
                        PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.21
                            @Override // java.lang.Runnable
                            public void run() {
                                PiccActivity.this.textViewMsg.setText(PiccActivity.this.getResources().getString(R.string.blockTips) + "\nand " + PiccActivity.this.getResources().getString(R.string.writeTips));
                                Toast.makeText(PiccActivity.this, PiccActivity.this.getResources().getString(R.string.blockTips) + "and " + PiccActivity.this.getResources().getString(R.string.writeTips), 0).show();
                            }
                        });
                        PiccActivity.this.m_bThreadFinished = true;
                        return;
                    case 6:
                        PiccActivity.this.strBlkNo = PiccActivity.this.editBlkNo.getText().toString().trim();
                        if (PiccActivity.this.strBlkNo != null && PiccActivity.this.strBlkNo.length() >= 1) {
                            PiccActivity.this.blkNo = (byte) Integer.parseInt(PiccActivity.this.strBlkNo);
                            PiccActivity.this.pwd[0] = -1;
                            PiccActivity.this.pwd[1] = -1;
                            PiccActivity.this.pwd[2] = -1;
                            PiccActivity.this.pwd[3] = -1;
                            PiccActivity.this.pwd[4] = -1;
                            PiccActivity.this.pwd[5] = -1;
                            PiccActivity.this.pwd[6] = 0;
                            PiccActivity.this.picc_type = (byte) 65;
                            this.ret = PiccActivity.this.posApiHelper.PiccM1Authority(PiccActivity.this.picc_type, PiccActivity.this.blkNo, PiccActivity.this.pwd, PiccActivity.this.serialNo);
                            if (this.ret != 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.18
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Read failed~\n Authority -- ret = " + PICC_Thread.this.ret);
                                    }
                                });
                                PiccActivity.this.m_bThreadFinished = true;
                                return;
                            }
                            this.ret = PiccActivity.this.posApiHelper.PiccM1ReadBlock(Integer.parseInt(PiccActivity.this.strBlkNo), PiccActivity.this.dataM1);
                            if (this.ret == 0) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.19
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Read Block Success~\n" + ByteUtil.bytearrayToHexString(PiccActivity.this.dataM1, 16));
                                    }
                                });
                            } else {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.20
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText("M1 Read Block failed~ \nret = " + PICC_Thread.this.ret);
                                    }
                                });
                            }
                            break;
                        }
                        PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.17
                            @Override // java.lang.Runnable
                            public void run() {
                                PiccActivity.this.textViewMsg.setText(PiccActivity.this.getResources().getString(R.string.blockTips));
                                Toast.makeText(PiccActivity.this, PiccActivity.this.getResources().getString(R.string.blockTips), 0).show();
                            }
                        });
                        PiccActivity.this.m_bThreadFinished = true;
                        return;
                    case 7:
                        this.ret = PiccActivity.this.posApiHelper.PiccOpen();
                        final byte[] CardType = new byte[4];
                        final byte[] UID = new byte[10];
                        final byte[] ucUIDLen = new byte[1];
                        final byte[] ATS = new byte[40];
                        final byte[] ucATSLen = new byte[1];
                        final byte[] SAK = new byte[1];
                        if (this.ret != 0) {
                            PiccActivity.this.m_bThreadFinished = true;
                            return;
                        }
                        long time = System.currentTimeMillis();
                        while (true) {
                            long time2 = time;
                            long time3 = System.currentTimeMillis();
                            if (time3 >= time2 + 10000) {
                                break;
                            } else if (!PiccActivity.this.bIsBack) {
                                PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.28
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        PiccActivity.this.textViewMsg.setText(PiccActivity.this.getResources().getString(R.string.wait_time));
                                    }
                                });
                                Log.e("liuhao ", "NFC = " + System.currentTimeMillis());
                                this.ret = PiccActivity.this.posApiHelper.PiccPoll(CardType, UID, ucUIDLen, ATS, ucATSLen, SAK);
                                Log.e("PiccPoll", ((int) ucUIDLen[0]) + "");
                                Log.e("PiccPoll", ((int) ucATSLen[0]) + "");
                                if (this.ret != 0) {
                                    PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.30
                                        @Override // java.lang.Runnable
                                        public void run() {
                                            PiccActivity.this.textViewMsg.setText("Picc Poll Test Failed...");
                                        }
                                    });
                                    time = time2;
                                } else {
                                    PiccActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.PiccActivity.PICC_Thread.29
                                        @Override // java.lang.Runnable
                                        public void run() {
                                            PiccActivity.this.textViewMsg.setText("CardType :" + new String(CardType) + "\nUID : " + ByteUtil.bytearrayToHexString(UID, ucUIDLen[0]) + "\nATS :" + ByteUtil.bytearrayToHexString(ATS, ucATSLen[0]) + "\nSAK :" + ByteUtil.bytearrayToHexString(SAK, 1));
                                        }
                                    });
                                    PiccActivity.this.m_bThreadFinished = true;
                                    return;
                                }
                            } else {
                                Log.e("PICC", "*****************loop bIsBack true");
                                PiccActivity.this.m_bThreadFinished = true;
                                return;
                            }
                        }
                        break;
                }
                PiccActivity.this.m_bThreadFinished = true;
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
