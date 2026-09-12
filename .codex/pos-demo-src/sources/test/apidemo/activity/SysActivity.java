package test.apidemo.activity;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.app.ProgressDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Process;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;
import java.io.File;
import vpos.apipackage.ByteUtil;
import vpos.apipackage.PosApiHelper;
import vpos.apipackage.Sys;

/* JADX INFO: loaded from: classes.dex */
public class SysActivity extends Activity implements View.OnClickListener {
    private static final String DISABLE_FUNCTION_LAUNCH_ACTION = "android.intent.action.DISABLE_FUNCTION_LAUNCH";
    public static String[] MY_PERMISSIONS_STORAGE = {"android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.MOUNT_UNMOUNT_FILESYSTEMS"};
    public static final int OPCODE_BEEP_TEST = 2;
    public static final int OPCODE_GET_CHIP_ID = 3;
    public static final int OPCODE_GET_SN = 1;
    public static final int OPCODE_SET_SN = 0;
    public static final int REQUEST_EXTERNAL_STORAGE = 1;
    Button btnBeep;
    Button btnGetChipID;
    Button btnGetSN;
    Button btnSetSN;
    Button btnUpdate;
    Button btnVersion;
    private LocationManager locationManager;
    private final String TAG = "SysActivity";
    byte[] SN = new byte[32];
    String snString = "";
    byte[] version = new byte[9];
    EditText editSn = null;
    TextView tvMsg = null;
    int ret = 0;
    PosApiHelper posApiHelper = PosApiHelper.getInstance();
    ProgressDialog mcuPowerDlg = null;
    ProgressDialog updateDlg = null;
    private double latitude = 0.0d;
    private double longitude = 0.0d;
    LocationListener locationListener = new LocationListener() { // from class: test.apidemo.activity.SysActivity.6
        @Override // android.location.LocationListener
        public void onStatusChanged(String provider, int status, Bundle extras) {
        }

        @Override // android.location.LocationListener
        public void onProviderEnabled(String provider) {
            Log.e("SysActivity", provider);
        }

        @Override // android.location.LocationListener
        public void onProviderDisabled(String provider) {
            Log.e("SysActivity", provider);
        }

        @Override // android.location.LocationListener
        public void onLocationChanged(Location location) {
            if (location != null) {
                Log.e("Map", "Location changed : Lat: " + location.getLatitude() + " Lng: " + location.getLongitude());
                SysActivity.this.latitude = location.getLatitude();
                SysActivity.this.longitude = location.getLongitude();
            }
        }
    };

    @Override // android.app.Activity
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1);
        getWindow().setFlags(1024, 1024);
        setContentView(R.layout.activity_sys);
        this.tvMsg = (TextView) findViewById(R.id.textview);
        this.editSn = (EditText) findViewById(R.id.editSn);
        this.btnSetSN = (Button) findViewById(R.id.btnSetSN);
        this.btnGetSN = (Button) findViewById(R.id.btnGetSN);
        this.btnGetChipID = (Button) findViewById(R.id.btnGetChipID);
        this.btnBeep = (Button) findViewById(R.id.btnBeep);
        this.btnVersion = (Button) findViewById(R.id.btnVersion);
        this.btnUpdate = (Button) findViewById(R.id.btnUpdate);
        this.btnSetSN.setOnClickListener(this);
        this.btnGetSN.setOnClickListener(this);
        this.btnGetChipID.setOnClickListener(this);
        this.btnBeep.setOnClickListener(this);
        this.btnVersion.setOnClickListener(this);
        this.btnUpdate.setOnClickListener(this);
        if (Build.VERSION.SDK_INT < 23) {
            findViewById(R.id.btnGetOsVer).setVisibility(8);
            findViewById(R.id.btnMcuVer).setVisibility(8);
        }
    }

    @Override // android.app.Activity
    protected void onDestroy() {
        super.onDestroy();
        synchronized (this) {
            try {
                startTestLed(1, 0);
                Thread.sleep(20L);
                startTestLed(2, 0);
                Thread.sleep(20L);
                startTestLed(3, 0);
                Thread.sleep(20L);
                startTestLed(4, 0);
                Thread.sleep(20L);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }

    @Override // android.app.Activity
    protected void onResume() {
        disableFunctionLaunch(true);
        getWindow().addFlags(128);
        super.onResume();
        Toast.makeText(this, this.posApiHelper.getAARVersion(), 0).show();
    }

    @Override // android.app.Activity
    protected void onPause() {
        disableFunctionLaunch(false);
        getWindow().clearFlags(128);
        super.onPause();
    }

    public void OnClickMcuOn(View view) {
        disableFunctionLaunch(true);
        int ret = this.posApiHelper.SetMcuPowerMode(1);
        if (ret == 0) {
            this.tvMsg.setText("MCU ON success~");
            return;
        }
        this.tvMsg.setText("MCU ON failed~ ret = " + ret);
    }

    public void OnClickMcuOff(View view) {
        int ret = this.posApiHelper.SetMcuPowerMode(0);
        if (ret == 0) {
            this.tvMsg.setText("MCU OFF success~");
            return;
        }
        this.tvMsg.setText("MCU OFF failed~ ret = " + ret);
    }

    public void OnClickMcuVer(View view) {
        this.tvMsg.setText("Mcu Target Version :" + this.posApiHelper.getMcuTargetVersion(this));
    }

    public void OnClickOsVer(View view) {
        this.tvMsg.setText("OS Version :" + this.posApiHelper.getOSVersion(this));
    }

    public void OnClickLED1Open(View view) {
        startTestLed(1, 1);
    }

    public void OnClickLED2Open(View view) {
        startTestLed(2, 1);
    }

    public void OnClickLED3Open(View view) {
        startTestLed(3, 1);
    }

    public void OnClickLED4Open(View view) {
        startTestLed(4, 1);
    }

    public void OnClickLED1Close(View view) {
        startTestLed(1, 0);
    }

    public void OnClickLED2Close(View view) {
        startTestLed(2, 0);
    }

    public void OnClickLED3Close(View view) {
        startTestLed(3, 0);
    }

    public void OnClickLED4Close(View view) {
        startTestLed(4, 0);
    }

    public void OnClickSecuTamperBit(View view) {
        String strEnable = ((EditText) findViewById(R.id.edEnable)).getText().toString().trim();
        String strTamperBit = ((EditText) findViewById(R.id.edTamperBit)).getText().toString().trim();
        this.ret = Sys.Lib_SecuTamperBit((byte) Integer.parseInt(strEnable), (byte) Integer.parseInt(strTamperBit));
    }

    void startTestSys(int OpCode) {
        switch (OpCode) {
            case 0:
                this.tvMsg.setText("Set SN...");
                this.snString = this.editSn.getText().toString();
                this.ret = this.posApiHelper.SysWriteSN(this.snString.getBytes());
                if (this.ret == 0) {
                    this.tvMsg.setText("Write SN Success\nsetSN : " + this.snString);
                } else {
                    this.tvMsg.setText("Write SN Failed");
                }
                break;
            case 1:
                this.tvMsg.setText("Get SN...");
                this.ret = this.posApiHelper.SysReadSN(this.SN);
                if (this.ret == 0) {
                    this.tvMsg.setText("Read SN Success: " + new String(this.SN).trim());
                } else {
                    this.tvMsg.setText("Read SN Failed");
                }
                break;
            case 2:
                this.tvMsg.setText("Test Beep...");
                this.ret = this.posApiHelper.SysBeep();
                break;
            case 3:
                byte[] chipIdBuf = new byte[16];
                this.ret = this.posApiHelper.SysReadChipID(chipIdBuf, 16);
                if (this.ret == 0) {
                    this.tvMsg.setText("Read ChipID Success: " + ByteUtil.bytearrayToHexString(chipIdBuf, 16));
                } else {
                    this.tvMsg.setText("Read ChipID Failed");
                }
                break;
        }
        try {
            Thread.sleep(200L);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }

    void getSysVersionInfo() {
        this.ret = this.posApiHelper.SysGetVersion(this.version);
        Log.e("SysActivity", "getSysVersionInfo ret = " + this.ret);
        if (this.ret == 0) {
            if (this.version[6] == -1 && this.version[7] == -1 && this.version[8] == -1) {
                this.tvMsg.setText("Security SP Version: A26-" + ((int) this.version[0]) + "." + ((int) this.version[1]) + "." + ((int) this.version[2]) + "\nLib Version: V" + ((int) this.version[3]) + "." + ((int) this.version[4]) + "." + ((int) this.version[5]) + "\nSecurity Boot Version: NULL\nSucceed");
                return;
            }
            this.tvMsg.setText("Security App Version: V" + ((int) this.version[0]) + "." + ((int) this.version[1]) + "." + ((int) this.version[2]) + "\nLib Version: V" + ((int) this.version[3]) + "." + ((int) this.version[4]) + "." + ((int) this.version[5]) + "\nSecurity Boot Version: V" + ((int) this.version[6]) + "." + ((int) this.version[7]) + "." + ((int) this.version[8]) + "\nSucceed");
            return;
        }
        this.tvMsg.setText("Get_Version Failed");
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void restartApp() {
        disableFunctionLaunch(false);
        Process.killProcess(Process.myPid());
    }

    /* JADX INFO: Access modifiers changed from: private */
    /* JADX WARN: Type inference failed for: r0v5, types: [test.apidemo.activity.SysActivity$1] */
    public void startUpdate() {
        Log.e("SysActivity", "startUpdate  ........ 00");
        disableFunctionLaunch(true);
        this.updateDlg = ProgressDialog.show(this, null, getString(R.string.isUpdating), false, false);
        new Thread() { // from class: test.apidemo.activity.SysActivity.1
            /* JADX WARN: Type inference failed for: r1v3, types: [test.apidemo.activity.SysActivity$1$2] */
            @Override // java.lang.Thread, java.lang.Runnable
            public void run() {
                super.run();
                int ret = SysActivity.this.posApiHelper.SysUpdate();
                Log.e("SysActivity", "SysUpdate ret = " + ret);
                if (ret == 0) {
                    SysActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.SysActivity.1.1
                        @Override // java.lang.Runnable
                        public void run() {
                            SysActivity.this.updateDlg.cancel();
                            SysActivity.this.tvMsg.setText(R.string.update_finish);
                        }
                    });
                    new Thread() { // from class: test.apidemo.activity.SysActivity.1.2
                        @Override // java.lang.Thread, java.lang.Runnable
                        public void run() {
                            try {
                                sleep(2000L);
                                SysActivity.this.restartApp();
                            } catch (InterruptedException e) {
                                e.printStackTrace();
                            }
                        }
                    }.start();
                } else {
                    SysActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.SysActivity.1.3
                        @Override // java.lang.Runnable
                        public void run() {
                            SysActivity.this.updateDlg.cancel();
                            SysActivity.this.tvMsg.setText(R.string.update_fail);
                        }
                    });
                }
            }
        }.start();
    }

    private void requestPermission() {
        int checkCallPhonePermission = ContextCompat.checkSelfPermission(this, "android.permission.WRITE_EXTERNAL_STORAGE");
        if (checkCallPhonePermission != 0) {
            ActivityCompat.requestPermissions(this, MY_PERMISSIONS_STORAGE, 1);
        } else {
            updateMcu();
        }
    }

    @Override // android.app.Activity
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1 && grantResults[0] == 0) {
            updateMcu();
        }
    }

    private void updateMcu() {
        File file;
        File file1;
        this.tvMsg.setText("Update...");
        if (Build.VERSION.SDK_INT >= 21) {
            file = new File("/storage/emulated/0/Download/MAXQ3255X_App.bin");
            file1 = new File("/storage/emulated/0/MAXQ3255X_App.bin");
        } else {
            file = new File("/storage/sdcard0/Download/MAXQ3255X_App.bin");
            file1 = new File("/storage/sdcard0/MAXQ3255X_App.bin");
        }
        if (!file.exists() && !file1.exists()) {
            Toast.makeText(getApplicationContext(), getString(R.string.file_not_found), 0).show();
        } else {
            new AlertDialog.Builder(this).setTitle(R.string.update).setMessage(R.string.update_or_not).setPositiveButton(R.string.ok, new DialogInterface.OnClickListener() { // from class: test.apidemo.activity.SysActivity.3
                @Override // android.content.DialogInterface.OnClickListener
                public void onClick(DialogInterface dialog, int which) {
                    SysActivity.this.startUpdate();
                    dialog.cancel();
                }
            }).setNegativeButton(R.string.cancel, new DialogInterface.OnClickListener() { // from class: test.apidemo.activity.SysActivity.2
                @Override // android.content.DialogInterface.OnClickListener
                public void onClick(DialogInterface dialog, int which) {
                    dialog.cancel();
                }
            }).show();
        }
    }

    @Override // android.view.View.OnClickListener
    public void onClick(View v) {
        switch (v.getId()) {
            case R.id.btnUpdate /* 2131427388 */:
                if (Build.VERSION.SDK_INT >= 23) {
                    requestPermission();
                } else {
                    updateMcu();
                }
                break;
            case R.id.btnSetSN /* 2131427390 */:
                startTestSys(0);
                break;
            case R.id.btnGetSN /* 2131427391 */:
                startTestSys(1);
                break;
            case R.id.btnGetChipID /* 2131427392 */:
                startTestSys(3);
                break;
            case R.id.btnBeep /* 2131427393 */:
                startTestSys(2);
                break;
            case R.id.btnVersion /* 2131427395 */:
                getSysVersionInfo();
                break;
        }
    }

    /* JADX WARN: Type inference failed for: r0v5, types: [test.apidemo.activity.SysActivity$5] */
    public void OnClickGps(View view) {
        this.locationManager = (LocationManager) getSystemService("location");
        if (this.locationManager.isProviderEnabled("gps")) {
            getLocation();
        } else {
            toggleGPS();
            new Handler() { // from class: test.apidemo.activity.SysActivity.5
            }.postDelayed(new Runnable() { // from class: test.apidemo.activity.SysActivity.4
                @Override // java.lang.Runnable
                public void run() {
                    SysActivity.this.getLocation();
                }
            }, 2000L);
        }
    }

    private void toggleGPS() {
        Intent gpsIntent = new Intent();
        gpsIntent.setClassName("com.android.settings", "com.android.settings.widget.SettingsAppWidgetProvider");
        gpsIntent.addCategory("android.intent.category.ALTERNATIVE");
        gpsIntent.setData(Uri.parse("custom:3"));
        try {
            PendingIntent.getBroadcast(this, 0, gpsIntent, 0).send();
        } catch (PendingIntent.CanceledException e) {
            e.printStackTrace();
            if (ActivityCompat.checkSelfPermission(this, "android.permission.ACCESS_FINE_LOCATION") != 0 && ActivityCompat.checkSelfPermission(this, "android.permission.ACCESS_COARSE_LOCATION") != 0) {
                return;
            }
            this.locationManager.requestLocationUpdates("network", 1000L, 0.0f, this.locationListener);
            Location location1 = this.locationManager.getLastKnownLocation("network");
            if (location1 != null) {
                this.latitude = location1.getLatitude();
                this.longitude = location1.getLongitude();
            }
        }
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void getLocation() {
        if (ActivityCompat.checkSelfPermission(this, "android.permission.ACCESS_FINE_LOCATION") != 0 && ActivityCompat.checkSelfPermission(this, "android.permission.ACCESS_COARSE_LOCATION") != 0) {
            return;
        }
        Location location = this.locationManager.getLastKnownLocation("gps");
        if (location != null) {
            this.latitude = location.getLatitude();
            this.longitude = location.getLongitude();
        } else {
            this.locationManager.requestLocationUpdates("gps", 1000L, 0.0f, this.locationListener);
        }
        this.tvMsg.setText("Latitude ：" + this.latitude + "\nLongitude ：" + this.longitude);
    }

    /* JADX WARN: Type inference failed for: r0v1, types: [test.apidemo.activity.SysActivity$7] */
    private void startTestLed(final int testCode, final int mode) {
        this.tvMsg.setText("LED Test");
        new Thread() { // from class: test.apidemo.activity.SysActivity.7
            @Override // java.lang.Thread, java.lang.Runnable
            public void run() {
                super.run();
                SysActivity.this.ret = SysActivity.this.posApiHelper.SysSetLedMode(testCode, mode);
                final String txt = mode == 1 ? "Open" : "Close";
                if (SysActivity.this.ret == 0) {
                    SysActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.SysActivity.7.1
                        @Override // java.lang.Runnable
                        public void run() {
                            SysActivity.this.tvMsg.setText("LED" + testCode + " " + txt + " Succeed");
                        }
                    });
                } else {
                    SysActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.SysActivity.7.2
                        @Override // java.lang.Runnable
                        public void run() {
                            SysActivity.this.tvMsg.setText("LED" + testCode + " " + txt + " Failed");
                        }
                    });
                }
            }
        }.start();
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
