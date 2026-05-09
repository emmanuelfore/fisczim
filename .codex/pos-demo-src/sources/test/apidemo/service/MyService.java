package test.apidemo.service;

import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.IBinder;
import android.support.annotation.Nullable;
import android.util.Log;
import com.google.zxing.BarcodeFormat;
import vpos.apipackage.PosApiHelper;

/* JADX INFO: loaded from: classes.dex */
public class MyService extends Service {
    public static final String tag = MyService.class.getSimpleName();
    CallBackPrintStatus callBackPrintStatus;
    PosApiHelper posApiHelper = PosApiHelper.getInstance();

    public interface CallBackPrintStatus {
        void printStatusChange(String str);
    }

    @Override // android.app.Service
    public void onCreate() {
        super.onCreate();
    }

    @Override // android.app.Service
    public int onStartCommand(Intent intent, int flags, int startId) {
        new Thread(new Runnable() { // from class: test.apidemo.service.MyService.1
            @Override // java.lang.Runnable
            public void run() {
                if (MyService.this.posApiHelper.PrintInit(2, 24, 24, 51) != 0) {
                    return;
                }
                MyService.this.posApiHelper.PrintStr("Print Tile\n");
                MyService.this.posApiHelper.PrintStr("\n");
                int ret = MyService.this.posApiHelper.PrintSetFont((byte) 16, (byte) 16, (byte) 51);
                Log.e(MyService.tag, "initRer PrintSetFont: " + ret);
                if (ret != 0) {
                    return;
                }
                MyService.this.posApiHelper.PrintStr("- - - - - - - - - - - - - - - - - - - - - - - -\n");
                MyService.this.posApiHelper.PrintStr("  Print Str1 \n");
                MyService.this.posApiHelper.PrintStr("  Print Str2 \n");
                MyService.this.posApiHelper.PrintBarcode("123456789", 360, 120, BarcodeFormat.CODE_128);
                MyService.this.posApiHelper.PrintBarcode("123456789", 240, 240, BarcodeFormat.QR_CODE);
                MyService.this.posApiHelper.PrintStr("CODE_128 : 123456789\n\n");
                MyService.this.posApiHelper.PrintStr("QR_CODE : 123456789\n\n");
                MyService.this.posApiHelper.PrintStr("asdadasdasdasdasd\n\n");
                MyService.this.posApiHelper.PrintStr("1234567890\n\n");
                MyService.this.posApiHelper.PrintStr("                                        \n");
                MyService.this.posApiHelper.PrintStr("\n");
                MyService.this.posApiHelper.PrintStr("\n");
                Log.e(MyService.tag, "Printing... ");
                int ret2 = MyService.this.posApiHelper.PrintStart();
                Log.e(MyService.tag, "Lib_PrnStart ret = " + ret2);
                if (ret2 != 0) {
                    Log.e(MyService.tag, "Lib_PrnStart fail, ret = " + ret2);
                    if (ret2 == -1) {
                        Log.e(MyService.tag, "No Print Paper ");
                        return;
                    } else {
                        Log.e(MyService.tag, "Print fail");
                        return;
                    }
                }
                Log.e(MyService.tag, "Print Finish ");
            }
        }).start();
        return super.onStartCommand(intent, flags, startId);
    }

    @Override // android.app.Service
    public void onDestroy() {
        stopSelf();
        super.onDestroy();
    }

    @Override // android.app.Service
    @Nullable
    public IBinder onBind(Intent intent) {
        return new MyBinder();
    }

    public class MyBinder extends Binder {
        public MyBinder() {
        }

        public MyService getService() {
            return MyService.this;
        }
    }

    public void setCallback(CallBackPrintStatus callback) {
        this.callBackPrintStatus = callback;
    }
}
