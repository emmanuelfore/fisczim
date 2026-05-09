package test.apidemo.activity;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.os.storage.StorageManager;
import android.support.annotation.Nullable;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.view.KeyEvent;
import android.view.View;
import android.widget.ImageView;
import android.widget.Toast;
import java.io.File;
import java.lang.reflect.Array;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import vpos.apipackage.PosApiHelper;

/* JADX INFO: loaded from: classes.dex */
public class UpgradeOsActivity extends Activity {
    public static final int REQUEST_EXTERNAL_STORAGE = 1;
    private ImageView ivHome;
    public static String[] MY_PERMISSIONS_STORAGE = {"android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.MOUNT_UNMOUNT_FILESYSTEMS"};
    public static final String TAG = UpgradeOsActivity.class.getSimpleName();

    @Override // android.app.Activity
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1);
        getWindow().setFlags(1024, 1024);
        setContentView(R.layout.activity_upgrade_os);
        this.ivHome = (ImageView) findViewById(R.id.ivHome);
    }

    public void OnClickBackHome(View view) {
        finish();
    }

    public void OnClickUpgradeOs(View view) {
        int checkPermission = ContextCompat.checkSelfPermission(this, "android.permission.WRITE_EXTERNAL_STORAGE");
        if (checkPermission != 0) {
            ActivityCompat.requestPermissions(this, MY_PERMISSIONS_STORAGE, 1);
        } else {
            upgradeOS();
        }
    }

    @Override // android.app.Activity
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1) {
            if (grantResults[0] != 0) {
                Toast.makeText(this, "no permission ,plz to request~", 0).show();
                ActivityCompat.requestPermissions(this, MY_PERMISSIONS_STORAGE, 1);
            } else {
                upgradeOS();
            }
        }
    }

    public void upgradeOS() {
        synchronized (this) {
            this.ivHome.setEnabled(false);
            String path = getStoragePath(getApplicationContext(), false) + "/upgrade.zip";
            File mOsFile = new File(path);
            if (!mOsFile.exists()) {
                Toast.makeText(this, getString(R.string.file_not_found_update_os), 0).show();
                this.ivHome.setEnabled(true);
            } else {
                PosApiHelper.getInstance();
                PosApiHelper.installRomPackage(this, path);
                this.ivHome.setEnabled(true);
            }
        }
    }

    @Override // android.app.Activity, android.view.KeyEvent.Callback
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == 4) {
            return true;
        }
        return super.onKeyDown(keyCode, event);
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
