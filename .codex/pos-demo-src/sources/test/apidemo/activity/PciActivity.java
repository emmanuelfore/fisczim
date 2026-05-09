package test.apidemo.activity;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Message;
import android.util.Log;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Spinner;
import android.widget.SpinnerAdapter;
import android.widget.TextView;
import vpos.apipackage.ByteUtil;
import vpos.apipackage.PosApiHelper;
import vpos.apipackage.StringUtil;

/* JADX INFO: loaded from: classes.dex */
public class PciActivity extends Activity {
    public static final int OPCODE_GET_DES = 3;
    public static final int OPCODE_GET_HostWorkKey = 5;
    private static final int OPCODE_GET_KCV = 2;
    public static final int OPCODE_GET_MAC = 4;
    public static final int OPCODE_HOSTMAIN_KEY = 1;
    public static final int OPCODE_KLK_KEY = 0;
    private ReadWriteRunnable _runnable;
    private final String tag = "PciActivity";
    private int RESULT_CODE = 0;
    TextView textView = null;
    byte[] inData = null;
    byte[] poutData = null;
    byte[] KeyData = null;
    byte[] desOut = null;
    byte[] macOut = null;
    byte keyNo = 9;
    byte mkeyNo = 9;
    byte keyLen = 16;
    byte mode = 0;
    short inLen = 8;
    PosApiHelper posApiHelper = PosApiHelper.getInstance();
    private Handler handler = new Handler() { // from class: test.apidemo.activity.PciActivity.2
        @Override // android.os.Handler
        public void handleMessage(Message msg) {
            Bundle b = msg.getData();
            String strInfo = b.getString("MSG");
            if (msg.what == 0) {
                PciActivity.this.textView.setText(strInfo);
            } else {
                PciActivity.this.textView.setText(((Object) PciActivity.this.textView.getText()) + "\n" + strInfo);
            }
            Log.i("PciActivity", strInfo);
        }
    };

    @Override // android.app.Activity
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1);
        getWindow().setFlags(1024, 1024);
        setContentView(R.layout.activity_pci);
        this.textView = (TextView) findViewById(R.id.textView_pci);
        Spinner spinnerKeyNo = (Spinner) findViewById(R.id.spinner_key_no);
        ArrayAdapter<?> adapterKeyNo = ArrayAdapter.createFromResource(this, R.array.keyNo, R.layout.spinner_item);
        adapterKeyNo.setDropDownViewResource(R.layout.dropdown_stytle);
        spinnerKeyNo.setAdapter((SpinnerAdapter) adapterKeyNo);
        spinnerKeyNo.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() { // from class: test.apidemo.activity.PciActivity.1
            @Override // android.widget.AdapterView.OnItemSelectedListener
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                TextView tv = (TextView) view;
                tv.setGravity(1);
                Log.e("onItenSelect position", "onItenSelect  " + Integer.toString(position));
                PciActivity.this.keyNo = (byte) position;
                PciActivity.this.mkeyNo = (byte) position;
            }

            @Override // android.widget.AdapterView.OnItemSelectedListener
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });
    }

    public void OnClickMkey(View view) {
        if (this._runnable != null && !this._runnable.IsThreadFinished()) {
            Log.e("", "Thread is still running, return...");
            return;
        }
        this._runnable = new ReadWriteRunnable(0);
        Thread requestThread = new Thread(this._runnable);
        requestThread.start();
    }

    public void OnClickHostMainKey(View view) {
        if (this._runnable != null && !this._runnable.IsThreadFinished()) {
            Log.e("", "Thread is still running, return...");
            return;
        }
        this._runnable = new ReadWriteRunnable(1);
        Thread requestThread = new Thread(this._runnable);
        requestThread.start();
    }

    public void OnClickGetKcv(View view) {
        this._runnable = new ReadWriteRunnable(2);
        Thread requestThread = new Thread(this._runnable);
        requestThread.start();
    }

    public void OnClickGetDes(View view) {
        if (this._runnable != null && !this._runnable.IsThreadFinished()) {
            Log.e("", "Thread is still running, return...");
            return;
        }
        this._runnable = new ReadWriteRunnable(3);
        Thread requestThread = new Thread(this._runnable);
        requestThread.start();
        Log.i("PciActivity", "OnClickGetDes");
    }

    public void OnClickGetMac(View view) {
        if (this._runnable != null && !this._runnable.IsThreadFinished()) {
            Log.e("", "Thread is still running, return...");
            return;
        }
        this._runnable = new ReadWriteRunnable(4);
        Thread requestThread = new Thread(this._runnable);
        requestThread.start();
        Log.i("PciActivity", "OnClickGetMac");
    }

    public void OnClickHost_WorkKey(View view) {
        if (this._runnable != null && !this._runnable.IsThreadFinished()) {
            Log.e("heyp-kcv", "Thread is still running, return...");
            return;
        }
        this._runnable = new ReadWriteRunnable(5);
        Thread requestThread = new Thread(this._runnable);
        requestThread.start();
        Log.i("PciActivity", "OnClickHost_WorkKey");
    }

    private class ReadWriteRunnable implements Runnable {
        private int mOpCode;
        private int ret;
        byte[] keyData = null;
        byte[] key_kcv = null;
        boolean isThreadFinished = false;

        public boolean IsThreadFinished() {
            return this.isThreadFinished;
        }

        public ReadWriteRunnable(int OpCode) {
            this.mOpCode = OpCode;
        }

        @Override // java.lang.Runnable
        public void run() {
            this.isThreadFinished = false;
            switch (this.mOpCode) {
                case 0:
                    byte[] main_pinkey = new byte[32];
                    this.key_kcv = main_pinkey;
                    for (int i = 0; i < 32; i++) {
                        this.key_kcv[i] = 0;
                    }
                    this.keyData = StringUtil.hexStringToBytes("55555555555555551111111111111111");
                    PciActivity.this.mode = (byte) 0;
                    PciActivity.this.keyNo = (byte) 1;
                    PciActivity.this.keyLen = (byte) 16;
                    this.ret = PciActivity.this.posApiHelper.PciWritePIN_KLKKey(PciActivity.this.keyNo, PciActivity.this.keyLen, this.keyData, PciActivity.this.mode, this.key_kcv);
                    this.ret = PciActivity.this.posApiHelper.PciWritePIN_MKey((byte) (PciActivity.this.keyNo - 1), PciActivity.this.keyLen, this.keyData, PciActivity.this.mode);
                    Log.e("PciActivity", "OPCODE_KLK_KEY Succeed1\nkey_kcv: " + ByteUtil.bytearrayToHexString(this.key_kcv, 32));
                    if (this.ret == 0) {
                        PciActivity.this.RESULT_CODE = 0;
                        Log.d("PciActivity", "Pci_WritePinMKey success");
                        PciActivity.this.SendMsg("Pci_WritePinMKey Succeed\n", 0);
                        this.ret = PciActivity.this.posApiHelper.PciWriteMAC_KLKKey(PciActivity.this.keyNo, PciActivity.this.keyLen, this.keyData, PciActivity.this.mode, this.key_kcv);
                        this.ret = PciActivity.this.posApiHelper.PciWriteMAC_MKey((byte) (PciActivity.this.keyNo - 1), PciActivity.this.keyLen, this.keyData, PciActivity.this.mode);
                        Log.e("PciActivity", "OPCODE_KLK_KEY Succeed2\nkey_kcv: " + ByteUtil.bytearrayToHexString(this.key_kcv, 32));
                        if (this.ret == 0) {
                            PciActivity.this.RESULT_CODE = 0;
                            Log.d("PciActivity", "Pci_WriteMacMKey success");
                            PciActivity.this.SendMsg("Pci_WriteMacMKey Succeed\n", 1);
                            this.ret = PciActivity.this.posApiHelper.PciWriteDES_KLKKey(PciActivity.this.keyNo, PciActivity.this.keyLen, this.keyData, PciActivity.this.mode, this.key_kcv);
                            this.ret = PciActivity.this.posApiHelper.PciWriteDES_MKey((byte) (PciActivity.this.keyNo - 1), PciActivity.this.keyLen, this.keyData, PciActivity.this.mode);
                            Log.e("PciActivity", "OPCODE_KLK_KEY Succeed3\nkey_kcv: " + ByteUtil.bytearrayToHexString(this.key_kcv, 32));
                            if (this.ret == 0) {
                                PciActivity.this.RESULT_CODE = 0;
                                Log.d("PciActivity", "Pci_WriteDesMKey success");
                                PciActivity.this.SendMsg("Pci_WriteDesMKey Succeed\n", 1);
                            } else {
                                PciActivity.this.RESULT_CODE = -1;
                                Log.e("PciActivity", "Pci_WriteDesMKey failed, ret = " + this.ret);
                                PciActivity.this.SendMsg("Pci_WriteDesMKey Failed, ret = " + this.ret + "\n", 1);
                            }
                        } else {
                            PciActivity.this.RESULT_CODE = -1;
                            Log.e("PciActivity", "Pci_WriteMacMKey failed, ret = " + this.ret);
                            PciActivity.this.SendMsg("Pci_WriteMacMKey Failed, ret = " + this.ret + "\n", 1);
                        }
                    } else {
                        PciActivity.this.RESULT_CODE = -1;
                        Log.e("PciActivity", "Pci_WritePinMKey failed, ret = " + this.ret);
                        PciActivity.this.SendMsg("Pci_WritePinMKey Failed, ret = " + this.ret + "\n", 0);
                    }
                    break;
                case 1:
                    byte[] main_pinkey2 = StringUtil.hexStringToBytes("26BAD380150068A0EB09E8B62F83A493");
                    byte[] main_deskey = StringUtil.hexStringToBytes("F679786E2411E3DEF679786E2411E3DE");
                    byte[] main_mackey = StringUtil.hexStringToBytes("5690BD4F22A450FCEC999B4D46AEACA8");
                    this.key_kcv = new byte[32];
                    for (int i2 = 0; i2 < 32; i2++) {
                        this.key_kcv[i2] = 0;
                    }
                    PciActivity.this.keyNo = (byte) 1;
                    PciActivity.this.mkeyNo = (byte) 1;
                    PciActivity.this.keyLen = (byte) 16;
                    PciActivity.this.mode = (byte) 1;
                    this.ret = PciActivity.this.posApiHelper.PciWritePinKey_HostMK(PciActivity.this.keyNo, PciActivity.this.keyLen, main_pinkey2, PciActivity.this.mode, PciActivity.this.mkeyNo, this.key_kcv);
                    Log.e("PciActivity", "OPCODE_HOSTMAIN_KEY Succeed1\nkey_kcv: " + ByteUtil.bytearrayToHexString(this.key_kcv, 32));
                    if (this.ret == 0) {
                        PciActivity.this.RESULT_CODE = 0;
                        Log.d("PciActivity", "Pci_WritePinKey success");
                        PciActivity.this.SendMsg("Pci_WritePinKey Succeed\n", 0);
                        this.ret = PciActivity.this.posApiHelper.PciWriteMacKey_HostMK(PciActivity.this.keyNo, PciActivity.this.keyLen, main_mackey, PciActivity.this.mode, PciActivity.this.mkeyNo, this.key_kcv);
                        Log.e("PciActivity", "OPCODE_HOSTMAIN_KEY Succeed2\nkey_kcv: " + ByteUtil.bytearrayToHexString(this.key_kcv, 32));
                        if (this.ret == 0) {
                            PciActivity.this.RESULT_CODE = 0;
                            Log.d("PciActivity", "Pci_WriteMacKey success");
                            PciActivity.this.SendMsg("Pci_WriteMacKey Succeed\n", 1);
                            this.ret = PciActivity.this.posApiHelper.PciWriteDesKey_HostMK(PciActivity.this.keyNo, PciActivity.this.keyLen, main_deskey, PciActivity.this.mode, PciActivity.this.mkeyNo, this.key_kcv);
                            Log.e("PciActivity", "OPCODE_HOSTMAIN_KEY Succeed2\nkey_kcv: " + ByteUtil.bytearrayToHexString(this.key_kcv, 32));
                            if (this.ret == 0) {
                                PciActivity.this.RESULT_CODE = 0;
                                Log.d("PciActivity", "Pci_WriteDesKey success");
                                PciActivity.this.SendMsg("Pci_WriteDesKey Succeed\n", 1);
                            } else {
                                PciActivity.this.RESULT_CODE = -1;
                                Log.e("PciActivity", "Pci_WriteDesKey failed, ret = " + this.ret);
                                PciActivity.this.SendMsg("Pci_WriteDesKey Failed, ret = " + this.ret + "\n", 1);
                            }
                        } else {
                            PciActivity.this.RESULT_CODE = -1;
                            Log.e("PciActivity", "Pci_WriteMacKey failed, ret = " + this.ret);
                            PciActivity.this.SendMsg("Pci_WriteMacKey Failed, ret = " + this.ret + "\n", 1);
                        }
                    } else {
                        PciActivity.this.RESULT_CODE = -1;
                        Log.e("PciActivity", "Pci_WritePinKey failed, ret = " + this.ret);
                        PciActivity.this.SendMsg("Pci_WritePinKey Failed, ret = " + this.ret + "\n", 0);
                    }
                    break;
                case 2:
                    byte[] KLK_PINKcv = new byte[8];
                    byte[] KLK_DESKcv = new byte[8];
                    byte[] KLK_MACKcv = new byte[8];
                    byte[] KLK_MAINPINKcv = new byte[8];
                    byte[] KLK_MAINDESKcv = new byte[8];
                    byte[] KLK_MAINMACKcv = new byte[8];
                    byte[] KLK_WORKPINKcv = new byte[8];
                    byte[] KLK_WORKPINKcv2 = new byte[8];
                    byte[] KLK_WORKMACKcv = new byte[8];
                    this.ret = PciActivity.this.posApiHelper.PciReadKcv((byte) 1, (byte) 10, KLK_PINKcv);
                    this.ret = PciActivity.this.posApiHelper.PciReadKcv((byte) 1, (byte) 12, KLK_DESKcv);
                    this.ret = PciActivity.this.posApiHelper.PciReadKcv((byte) 1, (byte) 11, KLK_MACKcv);
                    this.ret = PciActivity.this.posApiHelper.PciReadKcv((byte) 1, (byte) 16, KLK_MAINPINKcv);
                    this.ret = PciActivity.this.posApiHelper.PciReadKcv((byte) 1, (byte) 17, KLK_MAINMACKcv);
                    this.ret = PciActivity.this.posApiHelper.PciReadKcv((byte) 1, (byte) 18, KLK_MAINDESKcv);
                    this.ret = PciActivity.this.posApiHelper.PciReadKcv((byte) 2, (byte) 16, KLK_WORKPINKcv);
                    this.ret = PciActivity.this.posApiHelper.PciReadKcv((byte) 2, (byte) 17, KLK_WORKMACKcv);
                    this.ret = PciActivity.this.posApiHelper.PciReadKcv((byte) 2, (byte) 18, KLK_WORKPINKcv2);
                    if (this.ret == 0) {
                        PciActivity.this.RESULT_CODE = 0;
                        PciActivity.this.SendMsg("KLK_PINKcv: " + ByteUtil.bytearrayToHexString(KLK_PINKcv, 3) + "\r\nKLK_DESKcv: " + ByteUtil.bytearrayToHexString(KLK_DESKcv, 3) + "\r\nKLK_MACKcv: " + ByteUtil.bytearrayToHexString(KLK_MACKcv, 3) + "\r\n\nKLK_MAINPINKcv: " + ByteUtil.bytearrayToHexString(KLK_MAINPINKcv, 3) + "\r\nKLK_MAINMACKcv: " + ByteUtil.bytearrayToHexString(KLK_MAINMACKcv, 3) + "\r\nKLK_MAINDESKcv: " + ByteUtil.bytearrayToHexString(KLK_MAINDESKcv, 3) + "\r\n\nKLK_WORKPINKcv: " + ByteUtil.bytearrayToHexString(KLK_WORKPINKcv, 3) + "\r\nKLK_WORKMACKcv: " + ByteUtil.bytearrayToHexString(KLK_WORKMACKcv, 3) + "\r\nKLK_WORKDESKcv: " + ByteUtil.bytearrayToHexString(KLK_WORKPINKcv2, 3), 0);
                    } else {
                        PciActivity.this.RESULT_CODE = -1;
                        Log.e("PciActivity", "PciReadKcv failed, ret = " + this.ret);
                        PciActivity.this.SendMsg("PciReadKcv Failed, ret = " + this.ret + "\n", 0);
                    }
                    break;
                case 3:
                    Log.i("PciActivity", "OPCODE_GET_DES");
                    PciActivity.this.inData = StringUtil.hexStringToBytes("8EB4B045F6C10642");
                    PciActivity.this.inLen = (short) 8;
                    PciActivity.this.keyNo = (byte) 2;
                    PciActivity.this.inData = new byte[PciActivity.this.inLen];
                    PciActivity.this.poutData = new byte[PciActivity.this.inLen];
                    PciActivity.this.mode = (byte) 0;
                    byte[] bArr = new byte[64];
                    byte[] bArr2 = new byte[64];
                    byte[] bArr3 = new byte[512];
                    byte[] Out = new byte[512];
                    byte[] IV = StringUtil.hexStringToBytes("12345678");
                    byte[] key = StringUtil.hexStringToBytes("1234567890123456ABCDEFGH");
                    byte[] Src = StringUtil.hexStringToBytes("E6B6345F1015380284481BBCFFB9052A227FC14F73072E8D5007AC01DFEDCC2BCBCE1EB14A95ED60BA1A44700F4E18AE");
                    this.ret = PciActivity.this.posApiHelper.PciTriDes(0, 1, IV, key, 0, Src, 48, Out);
                    Log.e("PciActivity", "Pci_GetDes Succeed\npoutData: " + ByteUtil.bytearrayToHexString(Out, Out.length));
                    if (this.ret == 0) {
                        PciActivity.this.RESULT_CODE = 0;
                        PciActivity.this.SendMsg("Pci_GetDes Succeed\nCBCDesOut: " + ByteUtil.bytearrayToHexString(Out, Out.length), 0);
                    } else {
                        PciActivity.this.RESULT_CODE = -1;
                        Log.e("PciActivity", "Pci_GetDes failed, ret = " + this.ret);
                        PciActivity.this.SendMsg("Pci_GetDes Failed, ret = " + this.ret + "\n", 0);
                    }
                    break;
                case 4:
                    Log.i("PciActivity", "OPCODE_GET_MAC");
                    byte[] macdata = StringUtil.hexStringToBytes("2681E49B7613EC47252605630FE2CBA227538032618C2A692503C142C88B61BC");
                    PciActivity.this.macOut = new byte[PciActivity.this.inLen];
                    PciActivity.this.mode = (byte) 4;
                    PciActivity.this.keyNo = (byte) 2;
                    this.ret = PciActivity.this.posApiHelper.PciGetKLKMac(PciActivity.this.keyNo, (short) 32, macdata, PciActivity.this.macOut, PciActivity.this.mode);
                    if (this.ret == 0) {
                        PciActivity.this.RESULT_CODE = 0;
                        if (PciActivity.this.mode == 4) {
                            PciActivity.this.SendMsg("Pci_GetMac Succeed\nmacOut: " + ByteUtil.bytearrayToHexString(PciActivity.this.macOut, 4), 0);
                        } else {
                            PciActivity.this.SendMsg("Pci_GetMac Succeed\nmacOut: " + ByteUtil.bytearrayToHexString(PciActivity.this.macOut, 8), 0);
                        }
                    } else {
                        PciActivity.this.RESULT_CODE = -1;
                        Log.e("PciActivity", "Pci_GetMac failed, ret = " + this.ret);
                        PciActivity.this.SendMsg("Pci_GetMac Failed, ret = " + this.ret + "\n", 0);
                    }
                    break;
                case 5:
                    Log.e("heyp-kcv", "OPCODE_GET_KCV-0");
                    byte[] work_pinkey = StringUtil.hexStringToBytes("11111111111111111111111111111112");
                    byte[] work_deskey = StringUtil.hexStringToBytes("411A41F9CA1ABE09411A41F9CA1ABE09");
                    byte[] work_mackey = StringUtil.hexStringToBytes("41540F929B4E6D71F376D20F68B1BFC7");
                    this.key_kcv = new byte[32];
                    for (int i3 = 0; i3 < 32; i3++) {
                        this.key_kcv[i3] = 0;
                    }
                    PciActivity.this.keyNo = (byte) 2;
                    PciActivity.this.mkeyNo = (byte) 2;
                    PciActivity.this.keyLen = (byte) 16;
                    PciActivity.this.mode = (byte) 1;
                    this.ret = PciActivity.this.posApiHelper.PciWritePinKey_HostWK(PciActivity.this.keyNo, PciActivity.this.keyLen, work_pinkey, PciActivity.this.mode, PciActivity.this.mkeyNo, this.key_kcv);
                    this.ret = PciActivity.this.posApiHelper.PciWritePinKey((byte) (PciActivity.this.keyNo - 2), PciActivity.this.keyLen, work_pinkey, PciActivity.this.mode, (byte) (PciActivity.this.mkeyNo - 2));
                    Log.e("PciActivity", "OPCODE_GET_HostWorkKey0 Succeed\nkey_kcv: " + ByteUtil.bytearrayToHexString(this.key_kcv, 32));
                    if (this.ret == 0) {
                        PciActivity.this.RESULT_CODE = 0;
                        Log.d("PciActivity", "Pci_WritePinKey success");
                        PciActivity.this.SendMsg("Pci_WritePinKey Succeed\n", 0);
                        this.ret = PciActivity.this.posApiHelper.PciWriteMacKey_HostWK(PciActivity.this.keyNo, PciActivity.this.keyLen, work_mackey, PciActivity.this.mode, PciActivity.this.mkeyNo, this.key_kcv);
                        this.ret = PciActivity.this.posApiHelper.PciWriteMacKey((byte) (PciActivity.this.keyNo - 2), PciActivity.this.keyLen, work_mackey, PciActivity.this.mode, (byte) (PciActivity.this.mkeyNo - 2));
                        Log.e("PciActivity", "OPCODE_GET_HostWorkKey1 Succeed\nkey_kcv: " + ByteUtil.bytearrayToHexString(this.key_kcv, 32));
                        if (this.ret == 0) {
                            PciActivity.this.RESULT_CODE = 0;
                            Log.d("PciActivity", "Pci_WriteMacKey success");
                            PciActivity.this.SendMsg("Pci_WriteMacKey Succeed\n", 1);
                            this.ret = PciActivity.this.posApiHelper.PciWriteDesKey_HostWK(PciActivity.this.keyNo, PciActivity.this.keyLen, work_deskey, PciActivity.this.mode, PciActivity.this.mkeyNo, this.key_kcv);
                            this.ret = PciActivity.this.posApiHelper.PciWriteDesKey((byte) (PciActivity.this.keyNo - 2), PciActivity.this.keyLen, work_deskey, PciActivity.this.mode, (byte) (PciActivity.this.mkeyNo - 2));
                            Log.e("PciActivity", "OPCODE_GET_HostWorkKey2 Succeed\nkey_kcv: " + ByteUtil.bytearrayToHexString(this.key_kcv, 32));
                            if (this.ret == 0) {
                                PciActivity.this.RESULT_CODE = 0;
                                Log.d("PciActivity", "Pci_WriteDesKey success");
                                PciActivity.this.SendMsg("Pci_WriteDesKey Succeed\n", 1);
                            } else {
                                PciActivity.this.RESULT_CODE = -1;
                                Log.e("PciActivity", "Pci_WriteDesKey failed, ret = " + this.ret);
                                PciActivity.this.SendMsg("Pci_WriteDesKey Failed, ret = " + this.ret + "\n", 1);
                            }
                        } else {
                            PciActivity.this.RESULT_CODE = -1;
                            Log.e("PciActivity", "Pci_WriteMacKey failed, ret = " + this.ret);
                            PciActivity.this.SendMsg("Pci_WriteMacKey Failed, ret = " + this.ret + "\n", 1);
                        }
                    } else {
                        PciActivity.this.RESULT_CODE = -1;
                        Log.e("PciActivity", "Pci_WritePinKey failed, ret = " + this.ret);
                        PciActivity.this.SendMsg("Pci_WritePinKey Failed, ret = " + this.ret + "\n", 0);
                    }
                    break;
            }
            this.isThreadFinished = true;
        }
    }

    public void SendMsg(String strInfo, int what) {
        Message msg = new Message();
        msg.what = what;
        Bundle b = new Bundle();
        b.putString("MSG", strInfo);
        msg.setData(b);
        this.handler.sendMessage(msg);
    }
}
