package test.apidemo.activity;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.os.storage.StorageManager;
import android.support.annotation.NonNull;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.support.v4.graphics.drawable.DrawableCompat;
import android.support.v4.view.MotionEventCompat;
import android.telephony.TelephonyManager;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;
import java.lang.reflect.Array;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import test.apidemo.activity.GridMenuLayout;
import vpos.apipackage.PosApiHelper;
import vpos.keypad.EMVCOHelper;

/* JADX INFO: loaded from: classes.dex */
public class MainActivity extends Activity {
    private static final int ITEM_CODE_EMV = 8;
    private static final int ITEM_CODE_ICC = 0;
    private static final int ITEM_CODE_MCR = 2;
    private static final int ITEM_CODE_NFC = 1;
    private static final int ITEM_CODE_PCI = 3;
    private static final int ITEM_CODE_PRINT = 4;
    private static final int ITEM_CODE_SCAN = 6;
    private static final int ITEM_CODE_SYS = 5;
    private static final int ITEM_CODE_UPDATE_OS = 7;
    public static String[] MY_PERMISSIONS = {"android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.READ_PHONE_STATE"};
    public static final int REQUEST_EXTERNAL_PERMISSION = 1;
    EMVCOHelper emvcoHelper = EMVCOHelper.getInstance();
    Context mContext;
    private GridMenuLayout mGridMenuLayout;

    @Override // android.app.Activity
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1);
        getWindow().setFlags(1024, 1024);
        if (Build.VERSION.SDK_INT >= 23) {
            requestPermission();
        } else {
            initViews();
        }
        PosApiHelper.getInstance().SysLogSwitch(1);
    }

    private void requestPermission() {
        int checkCallPhonePermission = ContextCompat.checkSelfPermission(this, "android.permission.WRITE_EXTERNAL_STORAGE");
        if (checkCallPhonePermission != 0) {
            ActivityCompat.requestPermissions(this, MY_PERMISSIONS, 1);
        } else {
            initViews();
        }
    }

    @Override // android.app.Activity
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1) {
            if (grantResults[0] == 0) {
                initViews();
            } else {
                requestPermission();
            }
        }
    }

    public static Drawable tintDrawable(Drawable drawable, ColorStateList colors) {
        Drawable wrappedDrawable = DrawableCompat.wrap(drawable);
        DrawableCompat.setTintList(wrappedDrawable, colors);
        return wrappedDrawable;
    }

    private void initViews() {
        setContentView(R.layout.main);
        this.mContext = this;
        final Drawable[] itemImgs = {getResources().getDrawable(R.mipmap.icc), getResources().getDrawable(R.mipmap.nfc), getResources().getDrawable(R.mipmap.mcr), getResources().getDrawable(R.mipmap.pci), getResources().getDrawable(R.mipmap.print), getResources().getDrawable(R.mipmap.sys), getResources().getDrawable(R.mipmap.scan), getResources().getDrawable(R.mipmap.upgrade), getResources().getDrawable(R.mipmap.emv), getResources().getDrawable(R.mipmap.more)};
        final String[] itemTitles = {getString(R.string.icc), getString(R.string.picc), getString(R.string.mcr), getString(R.string.pci), getString(R.string.print), getString(R.string.sys), getString(R.string.scan), getString(R.string.upgrade_os), " Emv ", getString(R.string.more)};
        final int sizeWidth = getResources().getDisplayMetrics().widthPixels / 25;
        this.mGridMenuLayout = (GridMenuLayout) findViewById(R.id.myGrid);
        this.mGridMenuLayout.setGridAdapter(new GridMenuLayout.GridAdapter() { // from class: test.apidemo.activity.MainActivity.1
            @Override // test.apidemo.activity.GridMenuLayout.GridAdapter
            public View getView(int index) {
                View view = MainActivity.this.getLayoutInflater().inflate(R.layout.gridmenu_item, (ViewGroup) null);
                ImageView gridItemImg = (ImageView) view.findViewById(R.id.gridItemImg);
                TextView gridItemTxt = (TextView) view.findViewById(R.id.gridItemTxt);
                gridItemImg.setImageDrawable(MainActivity.tintDrawable(itemImgs[index], MainActivity.this.mContext.getResources().getColorStateList(R.color.item_image_select)));
                gridItemTxt.setText(itemTitles[index]);
                gridItemTxt.setTextSize(sizeWidth);
                return view;
            }

            @Override // test.apidemo.activity.GridMenuLayout.GridAdapter
            public int getCount() {
                return itemTitles.length;
            }
        });
        this.mGridMenuLayout.setOnItemClickListener(new GridMenuLayout.OnItemClickListener() { // from class: test.apidemo.activity.MainActivity.2
            @Override // test.apidemo.activity.GridMenuLayout.OnItemClickListener
            @SuppressLint({"NewApi"})
            @TargetApi(MotionEventCompat.AXIS_BRAKE)
            public void onItemClick(View v, int index) {
                switch (index) {
                    case 0:
                        Intent iccIntent = new Intent(MainActivity.this, (Class<?>) IccActivity.class);
                        MainActivity.this.startActivity(iccIntent);
                        break;
                    case 1:
                        Intent nfcIntent = new Intent(MainActivity.this, (Class<?>) PiccActivity.class);
                        MainActivity.this.startActivity(nfcIntent);
                        break;
                    case 2:
                        Intent mcrIntent = new Intent(MainActivity.this, (Class<?>) McrActivity.class);
                        MainActivity.this.startActivity(mcrIntent);
                        break;
                    case 3:
                        Intent pciIntent = new Intent(MainActivity.this, (Class<?>) PciActivity.class);
                        MainActivity.this.startActivity(pciIntent);
                        break;
                    case 4:
                        Intent printIntent = new Intent(MainActivity.this, (Class<?>) PrintActivity.class);
                        MainActivity.this.startActivity(printIntent);
                        break;
                    case 5:
                        Intent sysIntent = new Intent(MainActivity.this, (Class<?>) SysActivity.class);
                        MainActivity.this.startActivity(sysIntent);
                        break;
                    case 6:
                        Intent scanIntent = new Intent(MainActivity.this, (Class<?>) ScanActivity.class);
                        MainActivity.this.startActivity(scanIntent);
                        break;
                    case 7:
                        new AlertDialog.Builder(MainActivity.this.mContext).setTitle(MainActivity.this.getResources().getString(R.string.upgrade_os)).setMessage(R.string.upgradeTips).setPositiveButton(R.string.ok, new DialogInterface.OnClickListener() { // from class: test.apidemo.activity.MainActivity.2.2
                            @Override // android.content.DialogInterface.OnClickListener
                            public void onClick(DialogInterface dialog, int which) {
                                dialog.dismiss();
                                Intent osIntent = new Intent(MainActivity.this, (Class<?>) UpgradeOsActivity.class);
                                MainActivity.this.startActivity(osIntent);
                            }
                        }).setNegativeButton(R.string.cancel, new DialogInterface.OnClickListener() { // from class: test.apidemo.activity.MainActivity.2.1
                            @Override // android.content.DialogInterface.OnClickListener
                            public void onClick(DialogInterface dialog, int which) {
                                dialog.dismiss();
                            }
                        }).show();
                        break;
                    case 8:
                        Intent emvIntent = new Intent(MainActivity.this, (Class<?>) EmvTestActivity.class);
                        MainActivity.this.startActivity(emvIntent);
                        break;
                    default:
                        if (ActivityCompat.checkSelfPermission(MainActivity.this, "android.permission.READ_PHONE_STATE") != 0) {
                            MainActivity.this.requestPermissions(new String[]{"android.permission.READ_PHONE_STATE"}, 2);
                        }
                        String deviceId = ((TelephonyManager) MainActivity.this.getSystemService("phone")).getDeviceId();
                        Log.e("liuhao", "-------> IMEI:" + deviceId);
                        Toast.makeText(MainActivity.this, deviceId, 0).show();
                        break;
                }
            }
        });
    }

    private static String getStoragePath(Context mContext, boolean is_removale) {
        StorageManager mStorageManager = (StorageManager) mContext.getSystemService("storage");
        try {
            Class<?> storageVolumeClazz = Class.forName("android.os.storage.StorageVolume");
            Method getVolumeList = mStorageManager.getClass().getMethod("getVolumeList", new Class[0]);
            Method getPath = storageVolumeClazz.getMethod("getPath", new Class[0]);
            Method isRemovable = storageVolumeClazz.getMethod("isRemovable", new Class[0]);
            Object result = getVolumeList.invoke(mStorageManager, new Object[0]);
            int length = Array.getLength(result);
            for (int i = 0; i < length; i++) {
                Object storageVolumeElement = Array.get(result, i);
                String path = (String) getPath.invoke(storageVolumeElement, new Object[0]);
                boolean removable = ((Boolean) isRemovable.invoke(storageVolumeElement, new Object[0])).booleanValue();
                if (is_removale == removable) {
                    return path;
                }
            }
        } catch (ClassNotFoundException e) {
            e.printStackTrace();
        } catch (IllegalAccessException e2) {
            e2.printStackTrace();
        } catch (NoSuchMethodException e3) {
            e3.printStackTrace();
        } catch (InvocationTargetException e4) {
            e4.printStackTrace();
        }
        return null;
    }
}
