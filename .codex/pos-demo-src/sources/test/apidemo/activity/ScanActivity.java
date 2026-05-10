package test.apidemo.activity;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.support.annotation.Nullable;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import java.io.UnsupportedEncodingException;

/* JADX INFO: loaded from: classes.dex */
public class ScanActivity extends Activity implements View.OnClickListener {
    private static final String DISABLE_FUNCTION_LAUNCH_ACTION = "android.intent.action.DISABLE_FUNCTION_LAUNCH";
    public static final int ENCODE_MODE_GBK = 2;
    public static final int ENCODE_MODE_NONE = 3;
    public static final int ENCODE_MODE_UTF8 = 1;
    private Button btnContinuous;
    private Button btnDisableScan;
    private Button btnEnableScan;
    private Button btnNormal;
    private Button btnStartScan;
    private Button btnStopScan;
    private BroadcastReceiver mScanRecevier = null;
    private TextView tvMsg;

    @Override // android.app.Activity
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1);
        getWindow().setFlags(1024, 1024);
        setContentView(R.layout.activity_scan);
        this.btnDisableScan = (Button) findViewById(R.id.btnDisableScan);
        this.btnEnableScan = (Button) findViewById(R.id.btnEnableScan);
        this.btnNormal = (Button) findViewById(R.id.btnNormal);
        this.btnContinuous = (Button) findViewById(R.id.btnContinuous);
        this.btnStartScan = (Button) findViewById(R.id.btnStartScan);
        this.tvMsg = (TextView) findViewById(R.id.tvMsg);
        this.tvMsg.setMovementMethod(ScrollingMovementMethod.getInstance());
        this.btnDisableScan.setOnClickListener(this);
        this.btnEnableScan.setOnClickListener(this);
        this.btnNormal.setOnClickListener(this);
        this.btnContinuous.setOnClickListener(this);
        this.btnStartScan.setOnClickListener(this);
        this.mScanRecevier = new BroadcastReceiver() { // from class: test.apidemo.activity.ScanActivity.1
            @Override // android.content.BroadcastReceiver
            public void onReceive(Context context, Intent intent) {
                Log.e("Scan", "scan receive.......");
                String scanResult = "";
                int length = intent.getIntExtra("EXTRA_SCAN_LENGTH", 0);
                int encodeType = intent.getIntExtra("EXTRA_SCAN_ENCODE_MODE", 1);
                if (encodeType == 3) {
                    byte[] data = intent.getByteArrayExtra("EXTRA_SCAN_DATA");
                    try {
                        scanResult = new String(data, 0, length, "iso-8859-1");
                    } catch (UnsupportedEncodingException e) {
                        e.printStackTrace();
                    }
                } else {
                    scanResult = intent.getStringExtra("EXTRA_SCAN_DATA");
                }
                ScanActivity.this.tvMsg.setText("Scan Bar Code ：" + scanResult);
            }
        };
        IntentFilter filter = new IntentFilter("ACTION_BAR_SCAN");
        registerReceiver(this.mScanRecevier, filter);
    }

    @Override // android.app.Activity
    protected void onDestroy() {
        super.onDestroy();
        Intent intentDisScan = new Intent("ACTION_BAR_SCANCFG");
        intentDisScan.putExtra("EXTRA_SCAN_POWER", 0);
        sendBroadcast(intentDisScan);
    }

    @Override // android.app.Activity
    protected void onResume() {
        super.onResume();
        disableFunctionLaunch(true);
        getWindow().addFlags(128);
        Intent intentEnableScan = new Intent("ACTION_BAR_SCANCFG");
        intentEnableScan.putExtra("EXTRA_SCAN_POWER", 1);
        sendBroadcast(intentEnableScan);
    }

    @Override // android.app.Activity
    protected void onPause() {
        disableFunctionLaunch(false);
        getWindow().clearFlags(128);
        super.onPause();
    }

    @Override // android.view.View.OnClickListener
    public void onClick(View v) {
        switch (v.getId()) {
            case R.id.btnEnableScan /* 2131427379 */:
                this.tvMsg.setText("Open...");
                Intent intentEnableScan = new Intent("ACTION_BAR_SCANCFG");
                intentEnableScan.putExtra("EXTRA_SCAN_POWER", 1);
                sendBroadcast(intentEnableScan);
                break;
            case R.id.btnDisableScan /* 2131427380 */:
                this.tvMsg.setText("Close...");
                Intent intentDisScan = new Intent("ACTION_BAR_SCANCFG");
                intentDisScan.putExtra("EXTRA_SCAN_POWER", 0);
                sendBroadcast(intentDisScan);
                break;
            case R.id.btnNormal /* 2131427382 */:
                Intent intentNormal = new Intent("ACTION_BAR_SCANCFG");
                intentNormal.putExtra("EXTRA_TRIG_MODE", 0);
                this.tvMsg.setText("Set Scan: Normal Mode");
                sendBroadcast(intentNormal);
                break;
            case R.id.btnContinuous /* 2131427383 */:
                Intent intentContinuous = new Intent("ACTION_BAR_SCANCFG");
                intentContinuous.putExtra("EXTRA_TRIG_MODE", 1);
                this.tvMsg.setText("Set Scan: Continuous Mode");
                sendBroadcast(intentContinuous);
                break;
            case R.id.btnStartScan /* 2131427384 */:
                Intent startIntent = new Intent("ACTION_BAR_TRIGSCAN");
                startIntent.putExtra("timeout", 60);
                this.tvMsg.setText("Start Scan...");
                sendBroadcast(startIntent);
                break;
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
