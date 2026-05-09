package test.apidemo.activity;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Message;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import com.google.zxing.BarcodeFormat;
import java.util.Timer;
import test.apidemo.service.MyService;
import vpos.apipackage.PosApiHelper;

/* JADX INFO: loaded from: classes.dex */
public class PrintActivity extends Activity {
    private static final String DISABLE_FUNCTION_LAUNCH_ACTION = "android.intent.action.DISABLE_FUNCTION_LAUNCH";
    private static final int DISABLE_RG = 11;
    private static final int ENABLE_RG = 10;
    private int BatteryV;
    private Button btnBmp;
    SharedPreferences.Editor editor;
    private IntentFilter filter;
    private Button gb_barcode;
    private Button gb_test;
    private Button gb_unicode;
    Intent mPrintServiceIntent;
    SharedPreferences preferences;
    private RadioButton radioButton_4;
    private RadioButton radioButton_5;
    private RadioButton rb_high;
    private RadioButton rb_low;
    private RadioButton rb_middle;
    private BroadcastReceiver receiver;
    SharedPreferences sp;
    private Timer timer;
    private Timer timer2;
    private int voltage_level;
    public String tag = "PrintActivity-Robert2";
    final int PRINT_TEST = 0;
    final int PRINT_UNICODE = 1;
    final int PRINT_BMP = 2;
    final int PRINT_BARCODE = 4;
    final int PRINT_CYCLE = 5;
    final int PRINT_LONGER = 7;
    final int PRINT_OPEN = 8;
    private RadioGroup rg = null;
    TextView textViewMsg = null;
    TextView textViewGray = null;
    int ret = -1;
    private boolean m_bThreadFinished = true;
    private boolean is_cycle = false;
    private int cycle_num = 0;
    private int RESULT_CODE = 0;
    int IsWorking = 0;
    PosApiHelper posApiHelper = PosApiHelper.getInstance();
    Handler handlers = new Handler();
    Runnable runnable = new Runnable() { // from class: test.apidemo.activity.PrintActivity.2
        @Override // java.lang.Runnable
        public void run() {
            Log.e(PrintActivity.this.tag, "TIMER log...");
            PrintActivity.this.printThread = PrintActivity.this.new Print_Thread(1);
            PrintActivity.this.printThread.start();
            Log.e(PrintActivity.this.tag, "TIMER log2...");
            if (PrintActivity.this.RESULT_CODE == 0) {
                PrintActivity.this.editor = PrintActivity.this.preferences.edit();
                PrintActivity.this.editor.putInt("count", PrintActivity.access$204(PrintActivity.this));
                PrintActivity.this.editor.commit();
                Log.e(PrintActivity.this.tag, "cycle num=" + PrintActivity.this.cycle_num);
                PrintActivity.this.SendMsg("cycle num =" + PrintActivity.this.cycle_num);
            }
            PrintActivity.this.handlers.postDelayed(this, 9000L);
        }
    };
    Print_Thread printThread = null;
    private Handler handler = new Handler() { // from class: test.apidemo.activity.PrintActivity.3
        @Override // android.os.Handler
        public void handleMessage(Message msg) {
            switch (msg.what) {
                case 10:
                    PrintActivity.this.IsWorking = 0;
                    PrintActivity.this.rb_high.setEnabled(true);
                    PrintActivity.this.rb_middle.setEnabled(true);
                    PrintActivity.this.rb_low.setEnabled(true);
                    PrintActivity.this.radioButton_4.setEnabled(true);
                    PrintActivity.this.radioButton_5.setEnabled(true);
                    break;
                case 11:
                    PrintActivity.this.IsWorking = 1;
                    PrintActivity.this.rb_high.setEnabled(false);
                    PrintActivity.this.rb_middle.setEnabled(false);
                    PrintActivity.this.rb_low.setEnabled(false);
                    PrintActivity.this.radioButton_4.setEnabled(false);
                    PrintActivity.this.radioButton_5.setEnabled(false);
                    break;
                default:
                    Bundle b = msg.getData();
                    String strInfo = b.getString("MSG");
                    PrintActivity.this.textViewMsg.setText(strInfo);
                    break;
            }
        }
    };
    ServiceConnection serviceConnection = new ServiceConnection() { // from class: test.apidemo.activity.PrintActivity.4
        @Override // android.content.ServiceConnection
        public void onServiceConnected(ComponentName name, IBinder service) {
            MyService.MyBinder binder = (MyService.MyBinder) service;
            MyService myService = binder.getService();
            myService.setCallback(new MyService.CallBackPrintStatus() { // from class: test.apidemo.activity.PrintActivity.4.1
                @Override // test.apidemo.service.MyService.CallBackPrintStatus
                public void printStatusChange(String strStatus) {
                    PrintActivity.this.SendMsg(strStatus);
                }
            });
        }

        @Override // android.content.ServiceConnection
        public void onServiceDisconnected(ComponentName name) {
        }
    };

    static /* synthetic */ int access$204(PrintActivity x0) {
        int i = x0.cycle_num + 1;
        x0.cycle_num = i;
        return i;
    }

    @Override // android.app.Activity
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1);
        getWindow().setFlags(1024, 1024);
        setContentView(R.layout.activity_print);
        this.textViewMsg = (TextView) findViewById(R.id.textView_msg);
        this.textViewGray = (TextView) findViewById(R.id.textview_Gray);
        this.rg = (RadioGroup) findViewById(R.id.rg_Gray_type);
        this.rb_high = (RadioButton) findViewById(R.id.RadioButton_high);
        this.rb_middle = (RadioButton) findViewById(R.id.RadioButton_middle);
        this.rb_low = (RadioButton) findViewById(R.id.radioButton_low);
        this.radioButton_4 = (RadioButton) findViewById(R.id.radioButton_4);
        this.radioButton_5 = (RadioButton) findViewById(R.id.radioButton_5);
        this.gb_test = (Button) findViewById(R.id.button_test);
        this.gb_unicode = (Button) findViewById(R.id.button_unicode);
        this.gb_barcode = (Button) findViewById(R.id.button_barcode);
        this.btnBmp = (Button) findViewById(R.id.btnBmp);
        init_Gray();
        this.rg.setOnCheckedChangeListener(new RadioGroup.OnCheckedChangeListener() { // from class: test.apidemo.activity.PrintActivity.1
            @Override // android.widget.RadioGroup.OnCheckedChangeListener
            public void onCheckedChanged(RadioGroup radioGroup, int checkedId) {
                if (PrintActivity.this.printThread != null && !PrintActivity.this.printThread.isThreadFinished()) {
                    Log.e(PrintActivity.this.tag, "Thread is still running...");
                }
                String strGray = PrintActivity.this.getResources().getString(R.string.selectGray);
                switch (checkedId) {
                    case R.id.RadioButton_high /* 2131427369 */:
                        PrintActivity.this.textViewGray.setText(strGray + "1");
                        PrintActivity.this.posApiHelper.PrintSetGray(1);
                        PrintActivity.this.setValue(1);
                        break;
                    case R.id.RadioButton_middle /* 2131427370 */:
                        PrintActivity.this.textViewGray.setText(strGray + "2");
                        PrintActivity.this.posApiHelper.PrintSetGray(2);
                        PrintActivity.this.setValue(2);
                        break;
                    case R.id.radioButton_low /* 2131427371 */:
                        PrintActivity.this.textViewGray.setText(strGray + "3");
                        PrintActivity.this.posApiHelper.PrintSetGray(3);
                        PrintActivity.this.setValue(3);
                        break;
                    case R.id.radioButton_4 /* 2131427372 */:
                        PrintActivity.this.textViewGray.setText(strGray + "4");
                        PrintActivity.this.posApiHelper.PrintSetGray(4);
                        PrintActivity.this.setValue(4);
                        break;
                    case R.id.radioButton_5 /* 2131427373 */:
                        PrintActivity.this.textViewGray.setText(strGray + "5");
                        PrintActivity.this.posApiHelper.PrintSetGray(5);
                        PrintActivity.this.setValue(5);
                        break;
                }
            }
        });
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void setValue(int val) {
        this.sp = getSharedPreferences("Gray", 0);
        SharedPreferences.Editor editor = this.sp.edit();
        editor.putInt("value", val);
        editor.commit();
    }

    /* JADX INFO: Access modifiers changed from: private */
    public int getValue() {
        this.sp = getSharedPreferences("Gray", 0);
        int value = this.sp.getInt("value", 2);
        return value;
    }

    private void init_Gray() {
        int flag = getValue();
        this.posApiHelper.PrintSetGray(flag);
        String strGray = getResources().getString(R.string.selectGray);
        if (flag == 3) {
            this.rb_low.setChecked(true);
            this.textViewGray.setText(strGray + "3");
            return;
        }
        if (flag == 2) {
            this.rb_middle.setChecked(true);
            this.textViewGray.setText(strGray + "2");
            return;
        }
        if (flag == 1) {
            this.rb_high.setChecked(true);
            this.textViewGray.setText(strGray + "1");
            return;
        }
        if (flag == 4) {
            this.radioButton_4.setChecked(true);
            this.textViewGray.setText(strGray + "4");
            return;
        }
        if (flag == 5) {
            this.radioButton_5.setChecked(true);
            this.textViewGray.setText(strGray + "5");
        }
    }

    @Override // android.app.Activity
    protected void onResume() {
        disableFunctionLaunch(true);
        getWindow().addFlags(128);
        super.onResume();
        this.filter = new IntentFilter("android.intent.action.BATTERY_CHANGED");
        this.receiver = new BatteryReceiver();
        registerReceiver(this.receiver, this.filter);
    }

    @Override // android.app.Activity
    protected void onPause() {
        disableFunctionLaunch(false);
        getWindow().clearFlags(128);
        super.onPause();
        QuitHandler();
        unregisterReceiver(this.receiver);
    }

    @Override // android.app.Activity
    protected void onDestroy() {
        super.onDestroy();
    }

    @Override // android.app.Activity, android.view.KeyEvent.Callback
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        Log.d("onKeyDown", "keyCode = " + keyCode);
        Log.d("ROBERT2 onKeyDown", "keyCode = " + keyCode);
        Log.d("ROBERT2 onKeyDown", "IsWorking== " + this.IsWorking);
        if (keyCode == 4 && this.IsWorking == 1) {
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    public void onClickTest(View v) {
        if (this.printThread != null && !this.printThread.isThreadFinished()) {
            Log.e(this.tag, "Thread is still running...");
        } else {
            this.printThread = new Print_Thread(0);
            this.printThread.start();
        }
    }

    public void onClickUnicodeTest(View v) {
        if (this.printThread != null && !this.printThread.isThreadFinished()) {
            Log.e(this.tag, "Thread is still running...");
        } else {
            this.printThread = new Print_Thread(1);
            this.printThread.start();
        }
    }

    public void OnClickBarcode(View view) {
        if (this.printThread != null && !this.printThread.isThreadFinished()) {
            Log.e(this.tag, "Thread is still running...");
        } else {
            this.printThread = new Print_Thread(4);
            this.printThread.start();
        }
    }

    public void onClickBmp(View view) {
        if (this.printThread != null && !this.printThread.isThreadFinished()) {
            Log.e(this.tag, "Thread is still running...");
        } else {
            this.printThread = new Print_Thread(2);
            this.printThread.start();
        }
    }

    public void onClickCycle(View v) {
        if (this.printThread != null && !this.printThread.isThreadFinished()) {
            Log.e(this.tag, "Thread is still running...");
            return;
        }
        if (!this.is_cycle) {
            this.is_cycle = true;
            this.preferences = getSharedPreferences("count", 1);
            this.cycle_num = this.preferences.getInt("count", 0);
            SendMsg("total cycle num =" + this.cycle_num);
            Log.e(this.tag, "Thread is still 3000ms...");
            this.handlers.postDelayed(this.runnable, 3000L);
        }
    }

    public void onClickClean(View v) {
        this.textViewMsg.setText("");
        this.preferences = getSharedPreferences("count", 1);
        this.cycle_num = this.preferences.getInt("count", 0);
        this.editor = this.preferences.edit();
        this.cycle_num = 0;
        this.editor.putInt("count", this.cycle_num);
        this.editor.commit();
        QuitHandler();
    }

    public void onClickPrnOpen(View v) {
        if (this.printThread != null && !this.printThread.isThreadFinished()) {
            Log.e(this.tag, "Thread is still running...");
        } else {
            this.printThread = new Print_Thread(8);
            this.printThread.start();
        }
    }

    public void onClickLong(View v) {
        if (this.printThread != null && !this.printThread.isThreadFinished()) {
            Log.e(this.tag, "Thread is still running...");
        } else {
            this.printThread = new Print_Thread(7);
            this.printThread.start();
        }
    }

    public void QuitHandler() {
        this.is_cycle = false;
        this.gb_test.setEnabled(true);
        this.gb_barcode.setEnabled(true);
        this.btnBmp.setEnabled(true);
        this.gb_unicode.setEnabled(true);
        this.handlers.removeCallbacks(this.runnable);
    }

    public class Print_Thread extends Thread {
        String content = "1234567890";
        int type;

        public boolean isThreadFinished() {
            return PrintActivity.this.m_bThreadFinished;
        }

        public Print_Thread(int type) {
            this.type = type;
        }

        /* JADX WARN: Removed duplicated region for block: B:117:0x0898 A[Catch: all -> 0x0aa9, TryCatch #2 {, blocks: (B:4:0x0013, B:5:0x0019, B:10:0x0047, B:11:0x00c8, B:147:0x0a98, B:148:0x0aa7, B:13:0x00cd, B:14:0x00e6, B:19:0x00f8, B:21:0x0123, B:23:0x0148, B:31:0x0173, B:32:0x0178, B:24:0x0150, B:26:0x0156, B:27:0x015e, B:29:0x0164, B:30:0x016c, B:34:0x017a, B:18:0x00f5, B:35:0x0188, B:37:0x02ab, B:39:0x02d0, B:47:0x02fb, B:48:0x0300, B:40:0x02d8, B:42:0x02de, B:43:0x02e6, B:45:0x02ec, B:46:0x02f4, B:50:0x0302, B:51:0x0332, B:54:0x0353, B:55:0x0361, B:57:0x039f, B:59:0x03c4, B:67:0x03ef, B:68:0x03f4, B:60:0x03cc, B:62:0x03d2, B:63:0x03da, B:65:0x03e0, B:66:0x03e8, B:70:0x03f6, B:71:0x0404, B:73:0x04d0, B:75:0x04f5, B:83:0x0520, B:84:0x0525, B:76:0x04fd, B:78:0x0503, B:79:0x050b, B:81:0x0511, B:82:0x0519, B:86:0x0527, B:87:0x0535, B:89:0x057e, B:91:0x05d7, B:93:0x05fc, B:101:0x0627, B:102:0x062c, B:94:0x0604, B:96:0x060a, B:97:0x0612, B:99:0x0618, B:100:0x0620, B:104:0x062e, B:105:0x065b, B:106:0x066d, B:108:0x066f, B:111:0x0700, B:114:0x0867, B:115:0x086d, B:117:0x0898, B:119:0x08bd, B:127:0x08e8, B:128:0x08ee, B:120:0x08c5, B:122:0x08cb, B:123:0x08d3, B:125:0x08d9, B:126:0x08e1, B:130:0x08f0, B:131:0x093e, B:133:0x0a2b, B:135:0x0a50, B:143:0x0a7b, B:144:0x0a81, B:136:0x0a58, B:138:0x0a5e, B:139:0x0a66, B:141:0x0a6c, B:142:0x0a74, B:146:0x0a83, B:9:0x0028), top: B:158:0x0013, inners: #0, #1 }] */
        /* JADX WARN: Removed duplicated region for block: B:130:0x08f0 A[Catch: all -> 0x0aa9, TryCatch #2 {, blocks: (B:4:0x0013, B:5:0x0019, B:10:0x0047, B:11:0x00c8, B:147:0x0a98, B:148:0x0aa7, B:13:0x00cd, B:14:0x00e6, B:19:0x00f8, B:21:0x0123, B:23:0x0148, B:31:0x0173, B:32:0x0178, B:24:0x0150, B:26:0x0156, B:27:0x015e, B:29:0x0164, B:30:0x016c, B:34:0x017a, B:18:0x00f5, B:35:0x0188, B:37:0x02ab, B:39:0x02d0, B:47:0x02fb, B:48:0x0300, B:40:0x02d8, B:42:0x02de, B:43:0x02e6, B:45:0x02ec, B:46:0x02f4, B:50:0x0302, B:51:0x0332, B:54:0x0353, B:55:0x0361, B:57:0x039f, B:59:0x03c4, B:67:0x03ef, B:68:0x03f4, B:60:0x03cc, B:62:0x03d2, B:63:0x03da, B:65:0x03e0, B:66:0x03e8, B:70:0x03f6, B:71:0x0404, B:73:0x04d0, B:75:0x04f5, B:83:0x0520, B:84:0x0525, B:76:0x04fd, B:78:0x0503, B:79:0x050b, B:81:0x0511, B:82:0x0519, B:86:0x0527, B:87:0x0535, B:89:0x057e, B:91:0x05d7, B:93:0x05fc, B:101:0x0627, B:102:0x062c, B:94:0x0604, B:96:0x060a, B:97:0x0612, B:99:0x0618, B:100:0x0620, B:104:0x062e, B:105:0x065b, B:106:0x066d, B:108:0x066f, B:111:0x0700, B:114:0x0867, B:115:0x086d, B:117:0x0898, B:119:0x08bd, B:127:0x08e8, B:128:0x08ee, B:120:0x08c5, B:122:0x08cb, B:123:0x08d3, B:125:0x08d9, B:126:0x08e1, B:130:0x08f0, B:131:0x093e, B:133:0x0a2b, B:135:0x0a50, B:143:0x0a7b, B:144:0x0a81, B:136:0x0a58, B:138:0x0a5e, B:139:0x0a66, B:141:0x0a6c, B:142:0x0a74, B:146:0x0a83, B:9:0x0028), top: B:158:0x0013, inners: #0, #1 }] */
        @Override // java.lang.Thread, java.lang.Runnable
        /*
            Code decompiled incorrectly, please refer to instructions dump.
            To view partially-correct add '--show-bad-code' argument
        */
        public void run() {
            /*
                Method dump skipped, instruction units count: 2756
                To view this dump add '--comments-level debug' option
            */
            throw new UnsupportedOperationException("Method not decompiled: test.apidemo.activity.PrintActivity.Print_Thread.run():void");
        }
    }

    public void SendMsg(String strInfo) {
        Message msg = new Message();
        Bundle b = new Bundle();
        b.putString("MSG", strInfo);
        msg.setData(b);
        this.handler.sendMessage(msg);
    }

    public class BatteryReceiver extends BroadcastReceiver {
        public BatteryReceiver() {
        }

        @Override // android.content.BroadcastReceiver
        public void onReceive(Context context, Intent intent) {
            PrintActivity.this.voltage_level = intent.getExtras().getInt("level");
            Log.e("wbw", "current  = " + PrintActivity.this.voltage_level);
            PrintActivity.this.BatteryV = intent.getIntExtra("voltage", 0);
            Log.e("wbw", "BatteryV  = " + PrintActivity.this.BatteryV);
            Log.e("wbw", "V  = " + ((PrintActivity.this.BatteryV * 2) / 100));
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

    public void OnClickPrintSimpleApiTest(View view) {
        if (this.printThread != null && !this.printThread.isThreadFinished()) {
            Log.e(this.tag, "Thread is still running...");
        } else {
            new Thread(new Runnable() { // from class: test.apidemo.activity.PrintActivity.5
                @Override // java.lang.Runnable
                public void run() {
                    Message msg = Message.obtain();
                    Message msg1 = Message.obtain();
                    msg.what = 11;
                    PrintActivity.this.handler.sendMessage(msg);
                    PrintActivity.this.ret = PrintActivity.this.posApiHelper.PrintInit(2, 24, 24, 0);
                    if (PrintActivity.this.ret != 0) {
                        return;
                    }
                    PrintActivity.this.ret = PrintActivity.this.getValue();
                    Log.e(PrintActivity.this.tag, "getValue():" + PrintActivity.this.ret);
                    PrintActivity.this.posApiHelper.PrintSetGray(PrintActivity.this.ret);
                    PrintActivity.this.posApiHelper.PrintStr("Print Tile\n");
                    PrintActivity.this.posApiHelper.PrintStr("\n");
                    PrintActivity.this.ret = PrintActivity.this.posApiHelper.PrintSetFont((byte) 16, (byte) 16, (byte) 51);
                    Log.e(PrintActivity.this.tag, "initRer PrintSetFont: " + PrintActivity.this.ret);
                    if (PrintActivity.this.ret != 0) {
                        return;
                    }
                    PrintActivity.this.posApiHelper.PrintStr("- - - - - - - - - - - - - - - - - - - - - - - -\n");
                    PrintActivity.this.posApiHelper.PrintStr("  Print Str1 \n");
                    PrintActivity.this.posApiHelper.PrintStr("  Print Str2 \n");
                    PrintActivity.this.posApiHelper.PrintBarcode("123456789", 360, 120, BarcodeFormat.CODE_128);
                    PrintActivity.this.posApiHelper.PrintBarcode("123456789", 240, 240, BarcodeFormat.QR_CODE);
                    PrintActivity.this.posApiHelper.PrintStr("CODE_128 : 123456789\n\n");
                    PrintActivity.this.posApiHelper.PrintStr("QR_CODE : 123456789\n\n");
                    PrintActivity.this.posApiHelper.PrintStr("                                        \n");
                    PrintActivity.this.posApiHelper.PrintStr("\n");
                    PrintActivity.this.posApiHelper.PrintStr("\n");
                    PrintActivity.this.SendMsg("Printing... ");
                    PrintActivity.this.ret = PrintActivity.this.posApiHelper.PrintStart();
                    Log.e(PrintActivity.this.tag, "Lib_PrnStart ret = " + PrintActivity.this.ret);
                    msg1.what = 10;
                    PrintActivity.this.handler.sendMessage(msg1);
                    if (PrintActivity.this.ret != 0) {
                        PrintActivity.this.RESULT_CODE = -1;
                        Log.e("liuhao", "Lib_PrnStart fail, ret = " + PrintActivity.this.ret);
                        if (PrintActivity.this.ret == -1) {
                            PrintActivity.this.SendMsg("No Print Paper ");
                            return;
                        }
                        if (PrintActivity.this.ret == -2) {
                            PrintActivity.this.SendMsg("too hot ");
                            return;
                        } else if (PrintActivity.this.ret == -3) {
                            PrintActivity.this.SendMsg("low voltage ");
                            return;
                        } else {
                            PrintActivity.this.SendMsg("Print fail ");
                            return;
                        }
                    }
                    PrintActivity.this.RESULT_CODE = 0;
                    PrintActivity.this.SendMsg("Print Finish ");
                }
            }).start();
        }
    }
}
