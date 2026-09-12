package test.apidemo.activity;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.widget.TextView;
import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import vpos.apipackage.AppTypeApi;
import vpos.apipackage.ByteUtil;
import vpos.apipackage.PosApiHelper;
import vpos.keypad.EMVCOHelper;

/* JADX INFO: loaded from: classes.dex */
public class EmvTestActivity extends Activity {
    private static final String DISABLE_FUNCTION_LAUNCH_ACTION = "android.intent.action.DISABLE_FUNCTION_LAUNCH";
    public static final int REQUEST_EXTERNAL_STORAGE = 1;
    public static final int TYPE_PIN_BLOCK = 2;
    public static final int TYPE_SHOW_PAD = 3;
    public static final int TYPE_TEST_EMV = 1;
    public static final int TYPE_TEST_PK = 4;
    IBackFinish mIBackFinish;
    TextView tvEmvMsg;
    TextView txtTitle;
    public static final String TAG = EmvTestActivity.class.getSimpleName();
    public static String[] MY_PERMISSIONS_STORAGE = {"android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.MOUNT_UNMOUNT_FILESYSTEMS"};
    private static final Pattern track2Pattern = Pattern.compile("^([0-9]{1,19})(?:[=Dd])([0-9]{4}|=)([0-9]{3}|=).*$");
    private static final Pattern track1Pattern = Pattern.compile("^.*?([0-9]{10,19})\\^([^^]{2,26})\\^([0-9]{4}|\\^)([0-9]{3}|\\^)[^;]*(;([^?]*)\\?.*)?$");
    private EMVCOHelper emvcoHelper = EMVCOHelper.getInstance();
    boolean isOpen = false;
    String McrData = "";
    byte[] track1 = new byte[250];
    byte[] track2 = new byte[250];
    byte[] track3 = new byte[250];
    String PaypssTag57_data = "";
    byte[] TermParabuf = {-33, 24, 7, -12, -32, -8, -28, -21, -14, -96, -97, 53, 1, 34, -97, 51, 3, -32, -48, -56, -97, 64, 5, 96, 0, -16, -16, 1, -33, 25, 8, 0, 0, 0, 0, 0, 0, 0, 0, -33, 38, 15, -97, 2, 6, 95, 42, 2, -102, 3, -100, 1, -107, 5, -97, 55, 4, -33, 64, 1, -1, -97, 57, 1, 5, -97, 26, 2, 1, 86, -97, 30, 8, 17, 34, 51, 68, 85, 102, 119, -120, -33, 66, 1, 0, -33, 67, 1, 0, -33, 68, 1, 0, -33, 69, 1, 0, -33, 70, 1, 1, -97, 102, 4, 116, 0, 0, -128, -33, 71, 5, -81, 97, -1, 12, 7};
    byte[] Visaaid0 = {-97, 6, 7, -96, 0, 0, 0, 3, 16, 16, -97, 1, 6, 0, 0, 0, 0, 0, 1, -97, 9, 2, 0, 32, -97, 21, 2, 0, 1, -97, 22, 8, 17, 34, 51, 68, 85, 102, 119, -120, -97, 78, 18, -46, -8, -63, -86, -55, -52, -50, -15, -55, -18, -37, -38, -73, -42, -71, -85, -53, -66, -33, 17, 5, -52, 0, 0, 0, 0, -33, 19, 5, 0, 0, 0, 0, 0, -33, 18, 5, -52, 0, 0, 0, 0, -33, 20, 3, -97, 55, 4, -33, 21, 4, 0, 0, -100, 64, -33, 22, 1, 50, -33, 23, 1, 20, -33, 24, 1, 1, -97, 27, 4, 0, 1, -122, -96, 95, 42, 2, 1, 86, 95, 54, 1, 2, -97, 60, 2, 1, 86, -97, 61, 1, 2, -33, 1, 1, 0, -33, 25, 6, 0, 0, 0, 5, 0, 0, -33, 32, 6, 16, 0, 0, 16, 0, 0, -33, 33, 6, 0, 0, 0, 16, 0, 0, -97, 123, 6, 0, 0, 0, 16, 0, 0};
    byte[] VISAaid1 = {-97, 6, 7, -96, 0, 0, 0, 3, 32, 16, -97, 1, 6, 0, 0, 0, 0, 0, 1, -97, 9, 2, 0, 32, -97, 21, 2, 0, 1, -97, 22, 8, 17, 34, 51, 68, 85, 102, 119, -120, -97, 78, 18, -46, -8, -63, -86, -55, -52, -50, -15, -55, -18, -37, -38, -73, -42, -71, -85, -53, -66, -33, 17, 5, -52, 0, 0, 0, 0, -33, 19, 5, 0, 0, 0, 0, 0, -33, 18, 5, -52, 0, 0, 0, 0, -33, 20, 3, -97, 55, 4, -33, 21, 4, 0, 0, -100, 64, -33, 22, 1, 50, -33, 23, 1, 20, -33, 24, 1, 1, -97, 27, 4, 0, 1, -122, -96, -97, 28, 8, 17, 34, 51, 68, 85, 102, 119, -120, 95, 42, 2, 1, 86, 95, 54, 1, 2, -97, 60, 2, 1, 86, -97, 61, 1, 2, -97, 29, 1, 1, -33, 1, 1, 0, -33, 25, 6, 0, 0, 0, 5, 0, 0, -33, 32, 6, 16, 0, 0, 0, 0, 0, -33, 33, 0, 0, 0, 80, 0, 0, 0, -97, 123, 6, 0, 0, 0, 16, 0, 0};
    byte[] UnionPay_Debit = {-97, 6, 8, -96, 0, 0, 3, 51, 1, 1, 1, -97, 1, 6, 0, 0, 0, 0, 0, 1, -97, 9, 2, 0, 32, -97, 21, 2, 0, 1, -97, 22, 8, 17, 34, 51, 68, 85, 102, 119, -120, -97, 78, 18, -46, -8, -63, -86, -55, -52, -50, -15, -55, -18, -37, -38, -73, -42, -71, -85, -53, -66, -33, 17, 5, -52, 0, 0, 0, 0, -33, 19, 5, 0, 0, 0, 0, 0, -33, 18, 5, -52, 0, 0, 0, 0, -33, 20, 3, -97, 55, 4, -33, 21, 4, 0, 0, -100, 64, -33, 22, 1, 50, -33, 23, 1, 20, -33, 24, 1, 1, -97, 27, 4, 0, 1, -122, -96, -97, 28, 8, 17, 34, 51, 68, 85, 102, 119, -120, 95, 42, 2, 1, 86, 95, 54, 1, 2, -97, 60, 2, 1, 86, -97, 61, 1, 2, -97, 29, 1, 1, -33, 1, 1, 0, -33, 25, 6, 0, 0, 0, 5, 0, 0, -33, 32, 6, 0, 0, 0, 16, 0, 0, -33, 33, 6, 0, 0, 0, 16, 0, 0, -97, 123, 6, 0, 0, 0, 16, 0, 0};
    byte[] UnionPay_Credit = {-97, 6, 8, -96, 0, 0, 3, 51, 1, 1, 2, -97, 1, 6, 0, 0, 0, 0, 0, 1, -97, 9, 2, 0, 32, -97, 21, 2, 0, 1, -97, 22, 8, 17, 34, 51, 68, 85, 102, 119, -120, -97, 78, 18, -46, -8, -63, -86, -55, -52, -50, -15, -55, -18, -37, -38, -73, -42, -71, -85, -53, -66, -33, 17, 5, -52, 0, 0, 0, 0, -33, 19, 5, 0, 0, 0, 0, 0, -33, 18, 5, -52, 0, 0, 0, 0, -33, 20, 3, -97, 55, 4, -33, 21, 4, 0, 0, -100, 64, -33, 22, 1, 50, -33, 23, 1, 20, -33, 24, 1, 1, -97, 27, 4, 0, 1, -122, -96, -97, 28, 8, 17, 34, 51, 68, 85, 102, 119, -120, 95, 42, 2, 1, 86, 95, 54, 1, 2, -97, 60, 2, 1, 86, -97, 61, 1, 2, -97, 29, 1, 1, -33, 1, 1, 0, -33, 25, 6, 0, 0, 0, 5, 0, 0, -33, 32, 6, 0, 0, 0, 16, 0, 0, -33, 33, 6, 0, 0, 0, 16, 0, 0, -97, 123, 6, 0, 0, 0, 16, 0, 0};
    byte[] Master0 = {-97, 6, 7, -96, 0, 0, 0, 4, 16, 16, -97, 1, 6, 0, 0, 0, 0, 0, 1, -97, 9, 2, 0, 32, -97, 21, 2, 0, 1, -97, 22, 8, 17, 34, 51, 68, 85, 102, 119, -120, -97, 78, 18, -46, -8, -63, -86, -55, -52, -50, -15, -55, -18, -37, -38, -73, -42, -71, -85, -53, -66, -33, 17, 5, -52, 0, 0, 0, 0, -33, 19, 5, 0, 0, 0, 0, 0, -33, 18, 5, -52, 0, 0, 0, 0, -33, 20, 3, -97, 55, 4, -33, 21, 4, 0, 0, -100, 64, -33, 22, 1, 50, -33, 23, 1, 20, -33, 24, 1, 1, -97, 27, 4, 0, 1, -122, -96, -97, 28, 8, 17, 34, 51, 68, 85, 102, 119, -120, 95, 42, 2, 1, 86, 95, 54, 1, 2, -97, 60, 2, 1, 86, -97, 61, 1, 2, -97, 29, 1, 1, -33, 1, 1, 0, -33, 25, 6, 0, 0, 0, 5, 0, 0, -33, 32, 6, 0, 0, 0, 16, 0, 0, -33, 33, 6, 0, 0, 0, 16, 0, 0, -97, 123, 6, 0, 0, 0, 16, 0, 0};
    byte[] Master1 = {-97, 6, 7, -96, 0, 0, 0, 4, 48, 96, -97, 1, 6, 0, 0, 0, 0, 0, 1, -97, 9, 2, 0, 32, -97, 21, 2, 0, 1, -97, 22, 8, 17, 34, 51, 68, 85, 102, 119, -120, -97, 78, 18, -46, -8, -63, -86, -55, -52, -50, -15, -55, -18, -37, -38, -73, -42, -71, -85, -53, -66, -33, 17, 5, -52, 0, 0, 0, 0, -33, 19, 5, 0, 0, 0, 0, 0, -33, 18, 5, -52, 0, 0, 0, 0, -33, 20, 3, -97, 55, 4, -33, 21, 4, 0, 0, -100, 64, -33, 22, 1, 50, -33, 23, 1, 20, -33, 24, 1, 1, -97, 27, 4, 0, 1, -122, -96, -97, 28, 8, 17, 34, 51, 68, 85, 102, 119, -120, 95, 42, 2, 1, 86, 95, 54, 1, 2, -97, 60, 2, 1, 86, -97, 61, 1, 2, -97, 29, 1, 1, -33, 1, 1, 0, -33, 25, 6, 0, 0, 0, 5, 0, 0, -33, 32, 6, 0, 0, 0, 16, 0, 0, -33, 33, 6, 0, 0, 0, 16, 0, 0, -97, 123, 6, 0, 0, 0, 16, 0, 0};
    byte[] MIRAID0 = {-97, 6, 7, -96, 0, 0, 6, 88, 32, 16, -97, 1, 6, 0, 0, 0, 0, 0, 1, -97, 9, 2, 0, 32, -97, 21, 2, 0, 1, -97, 22, 8, 17, 34, 51, 68, 85, 102, 119, -120, -97, 78, 18, -46, -8, -63, -86, -55, -52, -50, -15, -55, -18, -37, -38, -73, -42, -71, -85, -53, -66, -33, 17, 5, -52, 0, 0, 0, 0, -33, 19, 5, 0, 0, 0, 0, 0, -33, 18, 5, -52, 0, 0, 0, 0, -33, 20, 3, -97, 55, 4, -33, 21, 4, 0, 0, -100, 64, -33, 22, 1, 50, -33, 23, 1, 20, -33, 24, 1, 1, -97, 27, 4, 0, 1, -122, -96, -97, 28, 8, 17, 34, 51, 68, 85, 102, 119, -120, 95, 42, 2, 1, 86, 95, 54, 1, 2, -97, 60, 2, 1, 86, -97, 61, 1, 2, -97, 29, 1, 1, -33, 1, 1, 0, -33, 25, 6, 0, 0, 0, 5, 0, 0, -33, 32, 6, 0, 0, 0, 16, 0, 0, -33, 33, 6, 0, 0, 0, 16, 0, 0, -97, 123, 6, 0, 0, 0, 16, 0, 0};
    byte[] MIRAID1 = {-97, 6, 7, -96, 0, 0, 6, 88, 16, 16, -97, 1, 6, 0, 0, 0, 0, 0, 1, -97, 9, 2, 0, 32, -97, 21, 2, 0, 1, -97, 22, 8, 17, 34, 51, 68, 85, 102, 119, -120, -97, 78, 18, -46, -8, -63, -86, -55, -52, -50, -15, -55, -18, -37, -38, -73, -42, -71, -85, -53, -66, -33, 17, 5, -52, 0, 0, 0, 0, -33, 19, 5, 0, 0, 0, 0, 0, -33, 18, 5, -52, 0, 0, 0, 0, -33, 20, 3, -97, 55, 4, -33, 21, 4, 0, 0, -100, 64, -33, 22, 1, 50, -33, 23, 1, 20, -33, 24, 1, 1, -97, 27, 4, 0, 1, -122, -96, -97, 28, 8, 17, 34, 51, 68, 85, 102, 119, -120, 95, 42, 2, 1, 86, 95, 54, 1, 2, -97, 60, 2, 1, 86, -97, 61, 1, 2, -97, 29, 1, 1, -33, 1, 1, 0, -33, 25, 6, 0, 0, 0, 5, 0, 0, -33, 32, 6, 0, 0, 0, 16, 0, 0, -33, 33, 6, 0, 0, 0, 16, 0, 0, -97, 123, 6, 0, 0, 0, 16, 0, 0};
    byte[] capk1buf = {-97, 34, 1, 50, -97, 6, 7, -96, 0, 0, 6, 88, 16, 16, -33, 5, 8, 50, 48, 50, 48, 49, 50, 51, 49, -33, 6, 1, 1, -33, 7, 1, 1, -33, 4, 3, 1, 0, 1, -33, 3, 20, 37, 26, 95, 93, -26, 28, -14, -117, 92, 110, 43, 88, 7, -64, 100, 74, 1, -44, 111, -11, -33, 2, 96, -108, 43, 127, 43, -91, -22, 48, 115, 18, -74, 61, -9, 124, 82, 67, 97, -118, -52, 32, 2, -67, 126, -53, 116, -40, 33, -2, 123, -36, 120, -65, 40, -12, -97, 116, 25, 10, -39, -78, 59, -105, 19, -79, 64, -1, -20, 31, -76, 41, -39, 63, 86, -67, -57, -83, -28, -84, 7, 93, 117, 83, 44, 30, 89, 11, 33, -121, 76, 121, 82, -14, -101, -116, 15, 12, 28, -29, -82, -19, -56, -38, 37, 52, 49, 35, -25, 29, -49, -122, -58, -103, -114, 21, -9, 86, -29};
    byte[] capk2buf = {-97, 34, 1, 87, -97, 6, 7, -96, 0, 0, 6, 88, 16, 16, -33, 5, 8, 50, 48, 50, 48, 49, 50, 51, 49, -33, 6, 1, 1, -33, 7, 1, 1, -33, 4, 3, 1, 0, 1, -33, 3, 20, 37, 26, 95, 93, -26, 28, -14, -117, 92, 110, 43, 88, 7, -64, 100, 74, 1, -44, 111, -11, -33, 2, 96, -108, 43, 127, 43, -91, -22, 48, 115, 18, -74, 61, -9, 124, 82, 67, 97, -118, -52, 32, 2, -67, 126, -53, 116, -40, 33, -2, 123, -36, 120, -65, 40, -12, -97, 116, 25, 10, -39, -78, 59, -105, 19, -79, 64, -1, -20, 31, -76, 41, -39, 63, 86, -67, -57, -83, -28, -84, 7, 93, 117, 83, 44, 30, 89, 11, 33, -121, 76, 121, 82, -14, -101, -116, 15, 12, 28, -29, -82, -19, -56, -38, 37, 52, 49, 35, -25, 29, -49, -122, -58, -103, -114, 21, -9, 86, -29};
    byte[] capk3buf = {-97, 34, 1, 87, -97, 6, 7, -96, 0, 0, 6, 88, 16, 16, -33, 5, 8, 50, 48, 50, 48, 49, 50, 51, 49, -33, 6, 1, 1, -33, 7, 1, 1, -33, 4, 3, 1, 0, 1, -33, 3, 20, 37, 26, 95, 93, -26, 28, -14, -117, 92, 110, 43, 88, 7, -64, 100, 74, 1, -44, 111, -11, -33, 2, 96, -108, 43, 127, 43, -91, -22, 48, 115, 18, -74, 61, -9, 124, 82, 67, 97, -118, -52, 32, 2, -67, 126, -53, 116, -40, 33, -2, 123, -36, 120, -65, 40, -12, -97, 116, 25, 10, -39, -78, 59, -105, 19, -79, 64, -1, -20, 31, -76, 41, -39, 63, 86, -67, -57, -83, -28, -84, 7, 93, 117, 83, 44, 30, 89, 11, 33, -121, 76, 121, 82, -14, -101, -116, 15, 12, 28, -29, -82, -19, -56, -38, 37, 52, 49, 35, -25, 29, -49, -122, -58, -103, -114, 21, -9, 86, -29};
    byte[] aidTmp = {-97, 6, 7, -96, 0, 0, 0, 3, 16, 16, -97, 28, 4, 17, 0, 0, 17, -97, 22, 15, 48, 48, 48, 48, 48, 48, 48, 49, 48, 48, 48, 48, 49, 50, 53, -97, 21, 2, 18, 52, -97, 78, 6, 83, 72, 79, 80, 32, 49, -97, 1, 6, 1, 35, 69, 103, -119, 16, -97, 9, 2, 0, -106, -33, 17, 5, -52, 0, 0, 0, 0, -33, 19, 5, 0, 0, 0, 0, 0, -33, 18, 5, -52, 0, 0, 0, 0, -33, 20, 3, -97, 55, 4, -33, 21, 4, 0, 0, -100, 64, -33, 22, 1, 50, -33, 23, 1, 20, -33, 24, 1, 1, -97, 27, 4, 0, 1, -122, -96, 95, 42, 2, 8, 64, 95, 54, 1, 2, -97, 60, 2, 8, 64, -97, 61, 1, 2, -97, 29, 1, 1, -33, 1, 1, 0, -33, 25, 6, 0, 0, 0, 0, 0, 80, -33, 32, 6, 0, 0, 0, 0, 0, 100, -33, 33, 6, 0, 0, 0, 0, 0, 50, -97, 123, 6, 0, 0, 0, 0, 39, 16};
    String Emv_Capkinput = "9F2201059F0605A000000004DF05083230323131323331DF060101DF070101DF040103DF0314EBFA0D5D06D8CE702DA3EAE890701D45E274C845DF0281B0B8048ABC30C90D976336543E3FD7091C8FE4800DF820ED55E7E94813ED00555B573FECA3D84AF6131A651D66CFF4284FB13B635EDD0EE40176D8BF04B7FD1C7BACF9AC7327DFAA8AA72D10DB3B8E70B2DDD811CB4196525EA386ACC33C0D9D4575916469C4E4F53E8E1C912CC618CB22DDE7C3568E90022E6BBA770202E4522A2DD623D180E215BD1D1507FE3DC90CA310D27B3EFCCD8F83DE3052CAD1E48938C68D095AAC91B5F37E28BB49EC7ED597";
    String Reader_input = "9F01009F150201029F16009F1A0200569F1C009F1E0849464430303030319F4E00DF81170100";
    String Kernel_input = "DF6000DF6200DF6300DF810800DF810900DF810A00DF810C0102DF810D00DF811C020000DF811D0100";
    String Aid_input0 = "9C01009F0607A0000000071010DF810C0102DF811B01209F090200029F1D086CFF0000000000009F3501229F33009F400500000000009F6D0200019F7E00DF811A039F6A04DF811F0108DF81180160DF81190108DF812C0100DF811E0110DF812306000000010000DF812406000000030000DF812506000000050000DF812606000000004000DF8120050000000000DF8121050000000000DF8122050000000000";
    String Capk_input = "DF0105A000000004DF020100DF030103DF0481A09C6BE5ADB10B4BE3DCE2099B4B210672B89656EBA091204F613ECC623BEDC9C6D77B660E8BAEEA7F7CE30F1B153879A4E36459343D1FE47ACDBD41FCD710030C2BA1D9461597982C6E1BDD08554B726F5EFF7913CE59E79E357295C321E26D0B8BE270A9442345C753E2AA2ACFC9D30850602FE6CAC00C6DDF6B8D9D9B4879B2826B042A07F0E5AE526A3D3C4D22C72B9EAA52EED8893866F866387AC05A1399DF0514EC0A59D35D19F031E9E8CBEC56DB80E22B1DE130";
    String Trans_input = "DF0101009C01009F02060000000099009F03060000000000005F2A0209785F3601025F57009F5301019F7C141020000000000000000000000000000000000001";
    String Aid_inputT = "9C01009F0607A0000000031010DF810C0102DF811B01209F090200029F1D086CFF0000000000009F3501229F33009F400500000000009F6D0200019F7E00DF811A039F6A04DF811F0108DF81180120DF81190103DF812C0100DF811E0110DF812306100000010000DF812406100000030000DF812506100000050000DF812606000000010000DF8120050000000000DF8121050000000000DF8122050000000000";
    String Aid_input = "9C01009F0607A0000000041010DF810C0102DF811B01209F090200029F1D086CFF0000000000009F3501229F33009F400500000000009F6D0200019F7E00DF811A039F6A04DF811F0108DF81180160DF81190108DF812C0100DF811E0110DF812306100000010000DF812406100000030000DF812506100000050000DF812606000000010000DF8120050000000000DF8121050000000000DF8122050000000000";
    private boolean bIsBack = false;
    private EmvThread emvThread = null;
    private boolean m_bThreadFinished = true;
    int mCardType = -1;
    String Tag5A_data = "";
    String Tag57_data = "";
    String PAN = "";
    String Tag95_data = "";
    String strEmvStatus = "";

    interface IBackFinish {
        void isBack();
    }

    @Override // android.app.Activity
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(1);
        getWindow().setFlags(1024, 1024);
        setContentView(R.layout.activity_emv_lay);
        this.txtTitle = (TextView) findViewById(R.id.txtTitle);
        this.tvEmvMsg = (TextView) findViewById(R.id.tvEmvMsg);
    }

    @Override // android.app.Activity
    protected void onResume() {
        disableFunctionLaunch(true);
        getWindow().addFlags(128);
        super.onResume();
        this.isOpen = false;
    }

    @Override // android.app.Activity
    protected void onPause() {
        disableFunctionLaunch(false);
        getWindow().clearFlags(128);
        super.onPause();
        if (this.emvThread != null) {
            this.emvThread.interrupt();
            EMVCOHelper eMVCOHelper = this.emvcoHelper;
            EMVCOHelper.EmvFinal();
        }
    }

    @Override // android.app.Activity
    protected void onDestroy() {
        super.onDestroy();
        PosApiHelper.getInstance().EntryPoint_Close();
        if (this.emvThread != null) {
            this.emvThread.interrupt();
        }
    }

    public void onClickAppType(View view) {
        AppTypeApi.initCxt(this);
        AppTypeApi.showAppWin(3, "123".getBytes());
    }

    public void onClickTestEmv(View view) {
        if (Build.VERSION.SDK_INT >= 23) {
            requestPermission();
        } else {
            testEmv();
        }
    }

    public void onClickPinBlock(View view) {
        this.tvEmvMsg.setText(getResources().getText(R.string.emvTips));
        if (this.emvThread != null && !this.emvThread.isThreadFinished()) {
            Log.e(TAG, "Thread is still running...");
        } else {
            this.emvThread = new EmvThread(2);
            this.emvThread.start();
        }
    }

    public void onClickShowPad(View view) {
        Log.e(TAG, "onClickShowPad");
        this.tvEmvMsg.setText("");
        if (this.emvThread != null && !this.emvThread.isThreadFinished()) {
            Log.e(TAG, "Thread is still running...");
        } else {
            this.emvThread = new EmvThread(3);
            this.emvThread.start();
        }
    }

    public static String getContactlessPan(String track2) {
        Matcher matcher = track2Pattern.matcher(track2);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return null;
    }

    public static String getCardHolderName(String track1) {
        Matcher matcher = track1Pattern.matcher(track1);
        if (matcher.find()) {
            return matcher.group(2);
        }
        return null;
    }

    public void onClickTestPK(View view) {
        Log.e(TAG, "onClickTestPK");
        this.tvEmvMsg.setText("");
        if (this.emvThread != null && !this.emvThread.isThreadFinished()) {
            Log.e(TAG, "Thread is still running...");
        } else {
            this.emvThread = new EmvThread(4);
            this.emvThread.start();
        }
    }

    public void setIBackFinish(IBackFinish mIBackFinish) {
        this.mIBackFinish = mIBackFinish;
    }

    /* JADX WARN: Code restructure failed: missing block: B:15:0x0040, code lost:
    
        r0 = 2;
     */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    private int DetectCard() {
        /*
            r9 = this;
            r0 = 0
            vpos.apipackage.PosApiHelper r1 = vpos.apipackage.PosApiHelper.getInstance()
            int r2 = r1.PiccOpen()
            int r3 = r1.McrOpen()
            r4 = 41
            byte[] r4 = new byte[r4]
            if (r3 != 0) goto L16
            r1.McrReset()
        L16:
            r5 = 0
            int r5 = r1.IccCheck(r5)
            if (r5 != 0) goto L1f
            r0 = 1
            goto L4c
        L1f:
            if (r2 != 0) goto L42
            r6 = 3
            byte[] r6 = new byte[r6]
            r7 = 50
            byte[] r7 = new byte[r7]
            r8 = 65
            int r8 = r1.PiccCheck(r8, r6, r7)
            if (r8 == 0) goto L40
            r8 = 66
            int r8 = r1.PiccCheck(r8, r6, r7)
            if (r8 == 0) goto L40
            r8 = 77
            int r8 = r1.PiccCheck(r8, r6, r7)
            if (r8 != 0) goto L42
        L40:
            r0 = 2
            goto L4c
        L42:
            if (r3 != 0) goto L5a
            int r6 = r1.McrCheck()
            if (r6 != 0) goto L5a
            r0 = 3
        L4c:
            if (r2 != 0) goto L54
            r5 = 2
            if (r0 == r5) goto L54
            r1.PiccClose()
        L54:
            if (r3 != 0) goto L59
            r1.McrClose()
        L59:
            return r0
        L5a:
            goto L16
        */
        throw new UnsupportedOperationException("Method not decompiled: test.apidemo.activity.EmvTestActivity.DetectCard():int");
    }

    class EmvThread extends Thread {
        int type;

        EmvThread(int type) {
            this.type = 0;
            this.type = type;
        }

        public boolean isThreadFinished() {
            return EmvTestActivity.this.m_bThreadFinished;
        }

        @Override // java.lang.Thread, java.lang.Runnable
        public void run() {
            synchronized (this) {
                EmvTestActivity.this.m_bThreadFinished = false;
                PosApiHelper.getInstance().SysLogSwitch(1);
                EMVCOHelper unused = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvEnvParaInit();
                EMVCOHelper unused2 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvClearAllCapks();
                EMVCOHelper unused3 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvClearAllAIDS();
                EMVCOHelper unused4 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvAddOneCAPK(EmvTestActivity.this.capk1buf, EmvTestActivity.this.capk1buf.length);
                EMVCOHelper unused5 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvAddOneAIDS(EmvTestActivity.this.Visaaid0, EmvTestActivity.this.Visaaid0.length);
                EMVCOHelper unused6 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvSaveTermParas(EmvTestActivity.this.TermParabuf, EmvTestActivity.this.TermParabuf.length, 0);
                EMVCOHelper unused7 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvAddOneAIDS(EmvTestActivity.this.VISAaid1, EmvTestActivity.this.VISAaid1.length);
                EMVCOHelper unused8 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvSaveTermParas(EmvTestActivity.this.TermParabuf, EmvTestActivity.this.TermParabuf.length, 0);
                EMVCOHelper unused9 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvAddOneAIDS(EmvTestActivity.this.MIRAID0, EmvTestActivity.this.MIRAID0.length);
                EMVCOHelper unused10 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvSaveTermParas(EmvTestActivity.this.TermParabuf, EmvTestActivity.this.TermParabuf.length, 0);
                EMVCOHelper unused11 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvAddOneAIDS(EmvTestActivity.this.MIRAID1, EmvTestActivity.this.MIRAID1.length);
                EMVCOHelper unused12 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvSaveTermParas(EmvTestActivity.this.TermParabuf, EmvTestActivity.this.TermParabuf.length, 0);
                EMVCOHelper unused13 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvAddOneAIDS(EmvTestActivity.this.Master0, EmvTestActivity.this.Master0.length);
                EMVCOHelper unused14 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvSaveTermParas(EmvTestActivity.this.TermParabuf, EmvTestActivity.this.TermParabuf.length, 0);
                EMVCOHelper unused15 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvAddOneAIDS(EmvTestActivity.this.Master1, EmvTestActivity.this.Master1.length);
                EMVCOHelper unused16 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvSaveTermParas(EmvTestActivity.this.TermParabuf, EmvTestActivity.this.TermParabuf.length, 0);
                EMVCOHelper unused17 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvAddOneAIDS(EmvTestActivity.this.UnionPay_Debit, EmvTestActivity.this.UnionPay_Debit.length);
                EMVCOHelper unused18 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvSaveTermParas(EmvTestActivity.this.TermParabuf, EmvTestActivity.this.TermParabuf.length, 0);
                EMVCOHelper unused19 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvAddOneAIDS(EmvTestActivity.this.UnionPay_Credit, EmvTestActivity.this.UnionPay_Credit.length);
                EMVCOHelper unused20 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.EmvSaveTermParas(EmvTestActivity.this.TermParabuf, EmvTestActivity.this.TermParabuf.length, 0);
                EMVCOHelper unused21 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.PaypassAidSet(EmvTestActivity.this.Aid_input0);
                EMVCOHelper unused22 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.PaypassAidSet(EmvTestActivity.this.Aid_input);
                EMVCOHelper unused23 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.PaypassAidSet(EmvTestActivity.this.Aid_inputT);
                EMVCOHelper unused24 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.PaypassCapkSet(EmvTestActivity.this.Capk_input);
                EMVCOHelper unused25 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.PaypassReaderSet(EmvTestActivity.this.Reader_input);
                EMVCOHelper unused26 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.PaypassKernelSet(EmvTestActivity.this.Kernel_input);
                EMVCOHelper unused27 = EmvTestActivity.this.emvcoHelper;
                EMVCOHelper.PaypassTransSet(EmvTestActivity.this.Trans_input);
                switch (this.type) {
                    case 1:
                        byte[] bArr = new byte[3];
                        byte[] bArr2 = new byte[50];
                        byte[] bArr3 = new byte[40];
                        byte[] PaypassTagBuff = new byte[1024];
                        long time = System.currentTimeMillis();
                        PosApiHelper.getInstance().EntryPoint_Open();
                        if (System.currentTimeMillis() < time + 30000) {
                            if (!EmvTestActivity.this.bIsBack) {
                                EmvTestActivity.this.setIBackFinish(new IBackFinish() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.1
                                    @Override // test.apidemo.activity.EmvTestActivity.IBackFinish
                                    public void isBack() {
                                        Log.e("VPOS", "*************setIBackFinish loop");
                                        EmvTestActivity.this.m_bThreadFinished = true;
                                    }
                                });
                                EmvTestActivity.this.mCardType = PosApiHelper.getInstance().EntryPoint_Detect();
                                Log.e("VPOS", "EntryPoint_Detect mCardType== " + EmvTestActivity.this.mCardType);
                                if (EmvTestActivity.this.mCardType < 0) {
                                    Log.e("VPOS", "*************loop detecting return ");
                                    PosApiHelper.getInstance().EntryPoint_Close();
                                    EmvTestActivity.this.m_bThreadFinished = true;
                                    return;
                                }
                            } else {
                                Log.e("VPOS", "*****************loop detecting bIsBack 11");
                                EmvTestActivity.this.m_bThreadFinished = true;
                                return;
                            }
                        }
                        Log.e("VPOS", "*************loop detecting return 00");
                        PosApiHelper.getInstance().EntryPoint_Close();
                        Log.e("VPOS", "*************loop detecting return11 ");
                        if (EmvTestActivity.this.mCardType == -1) {
                            EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.2
                                @Override // java.lang.Runnable
                                public void run() {
                                    if (EmvTestActivity.this.bIsBack) {
                                        EmvTestActivity.this.tvEmvMsg.setText(EmvTestActivity.this.getResources().getText(R.string.emvTips));
                                    } else {
                                        EmvTestActivity.this.tvEmvMsg.setText("timeOut~");
                                    }
                                }
                            });
                            EmvTestActivity.this.m_bThreadFinished = true;
                            return;
                        }
                        if (EmvTestActivity.this.mCardType == 0) {
                            EmvTestActivity.this.McrData = "";
                            Log.e("Mcrtest", "Mcrtest start00");
                            PosApiHelper posApiHelper = PosApiHelper.getInstance();
                            Log.e("Mcrtest", "Mcrtest start11");
                            Arrays.fill(EmvTestActivity.this.track1, (byte) 0);
                            Arrays.fill(EmvTestActivity.this.track2, (byte) 0);
                            Arrays.fill(EmvTestActivity.this.track3, (byte) 0);
                            Log.e("Mcrtest", "Mcrtest start22");
                            int ret = posApiHelper.McrRead((byte) 0, (byte) 0, EmvTestActivity.this.track1, EmvTestActivity.this.track2, EmvTestActivity.this.track3);
                            Log.e("Mcrtest", "Mcrtest start44=" + ret);
                            if (ret >= 0) {
                                if ((ret & 1) == 1) {
                                    EmvTestActivity.this.McrData = "track1:" + new String(EmvTestActivity.this.track1).trim();
                                }
                                if ((ret & 2) == 2) {
                                    EmvTestActivity.this.McrData = EmvTestActivity.this.McrData + "\n\ntrack2:" + new String(EmvTestActivity.this.track2).trim();
                                }
                                if ((ret & 4) == 4) {
                                    EmvTestActivity.this.McrData = EmvTestActivity.this.McrData + "\n\ntrack3:" + new String(EmvTestActivity.this.track3).trim();
                                }
                            } else {
                                EmvTestActivity.this.McrData = "Lib_MsrRead check data error";
                            }
                            posApiHelper.McrClose();
                            EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.3
                                @Override // java.lang.Runnable
                                public void run() {
                                    EmvTestActivity.this.tvEmvMsg.setText("MCR:  " + EmvTestActivity.this.McrData);
                                }
                            });
                        } else if (EmvTestActivity.this.mCardType == 1) {
                            EmvTestActivity.this.Tag5A_data = "";
                            EMVCOHelper unused28 = EmvTestActivity.this.emvcoHelper;
                            int ret2 = EMVCOHelper.EmvKeyPadInit(EmvTestActivity.this);
                            EMVCOHelper unused29 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.SetPinPadTime(20);
                            if (ret2 != 0) {
                                EmvTestActivity.this.m_bThreadFinished = true;
                                return;
                            }
                            byte[] CardNoData = new byte[56];
                            byte[] PinData = new byte[56];
                            EMVCOHelper unused30 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.SetPinPadType(0);
                            EMVCOHelper unused31 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.EmvKernelInit();
                            EMVCOHelper unused32 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.EmvSetTransType(1);
                            EMVCOHelper unused33 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.EmvSetTransAmount(9879900);
                            EMVCOHelper unused34 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.EmvSetCardType(1);
                            Log.e("liuhaoEMV", "EMV TEST");
                            EMVCOHelper unused35 = EmvTestActivity.this.emvcoHelper;
                            int ret3 = EMVCOHelper.EmvProcess(1, 0);
                            Log.e("liuhaoEMV", "ret = " + ret3);
                            if (ret3 < 0) {
                                EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.4
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        EmvTestActivity.this.strEmvStatus = "EMV Termination";
                                        EmvTestActivity.this.tvEmvMsg.setText("EMV Termination");
                                    }
                                });
                                EmvTestActivity.this.m_bThreadFinished = true;
                                return;
                            }
                            if (ret3 == 3) {
                                EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.5
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        EmvTestActivity.this.strEmvStatus = "EMV  GOONLINE";
                                    }
                                });
                            }
                            EMVCOHelper unused36 = EmvTestActivity.this.emvcoHelper;
                            int TagCardNo_len = EMVCOHelper.EmvGetTagData(CardNoData, 56, 90);
                            int i = 0;
                            while (i < TagCardNo_len) {
                                StringBuilder sb = new StringBuilder();
                                int ret4 = ret3;
                                sb.append("i = ");
                                sb.append(i);
                                sb.append("  ");
                                sb.append((int) CardNoData[i]);
                                Log.e("CardNoData", sb.toString());
                                StringBuilder sb2 = new StringBuilder();
                                EmvTestActivity emvTestActivity = EmvTestActivity.this;
                                sb2.append(emvTestActivity.Tag5A_data);
                                sb2.append(ByteUtil.byteToHexString(CardNoData[i]));
                                emvTestActivity.Tag5A_data = sb2.toString();
                                i++;
                                ret3 = ret4;
                            }
                            int ret5 = TagCardNo_len % 2;
                            if (ret5 != 0) {
                                EmvTestActivity.this.Tag5A_data = EmvTestActivity.this.Tag5A_data.substring(0, (TagCardNo_len * 2) - 1);
                            }
                            EMVCOHelper unused37 = EmvTestActivity.this.emvcoHelper;
                            int PinData_len = EMVCOHelper.EmvGetTagData(PinData, 56, 189);
                            final String TagPin_data = ByteUtil.bytearrayToHexString(PinData, PinData_len);
                            EMVCOHelper unused38 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.EmvPinbyPass();
                            EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.6
                                @Override // java.lang.Runnable
                                public void run() {
                                    EmvTestActivity.this.tvEmvMsg.setText(EmvTestActivity.this.strEmvStatus + "\n\nCardNO:" + EmvTestActivity.this.Tag5A_data + "\n\nPIN:" + TagPin_data);
                                }
                            });
                            Log.e("EMV PinData", "-TagPin_data=----" + TagPin_data);
                            EMVCOHelper unused39 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.EmvFinal();
                        } else if (EmvTestActivity.this.mCardType != 3) {
                            if (EmvTestActivity.this.mCardType == 2) {
                                Log.e("Paypass", "Paypass Kernel Test");
                                EMVCOHelper unused40 = EmvTestActivity.this.emvcoHelper;
                                int result = EMVCOHelper.PaypassProcess();
                                Log.e("Paypass", "Paypass PaypassProcess ret->" + result);
                                EMVCOHelper unused41 = EmvTestActivity.this.emvcoHelper;
                                int Data_len = EMVCOHelper.PaypassGetTagValue(PaypassTagBuff, 1024, 87);
                                Log.e("Paypass", "Paypass PaypassGetTagValue" + Data_len);
                                for (int i2 = 0; i2 < Data_len; i2++) {
                                    Log.e("CardNoData", "i = " + i2 + "  " + ((int) PaypassTagBuff[i2]));
                                    StringBuilder sb3 = new StringBuilder();
                                    EmvTestActivity emvTestActivity2 = EmvTestActivity.this;
                                    sb3.append(emvTestActivity2.PaypssTag57_data);
                                    sb3.append(ByteUtil.byteToHexString(PaypassTagBuff[i2]));
                                    emvTestActivity2.PaypssTag57_data = sb3.toString();
                                }
                                int i3 = Data_len / 2;
                                if (i3 != 0) {
                                    EmvTestActivity.this.PaypssTag57_data = EmvTestActivity.this.PaypssTag57_data.substring(0, Data_len * 2);
                                }
                                EMVCOHelper unused42 = EmvTestActivity.this.emvcoHelper;
                                EMVCOHelper.PaypassFinal();
                                EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.10
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        EmvTestActivity.this.tvEmvMsg.setText(EmvTestActivity.this.PaypssTag57_data);
                                    }
                                });
                                EMVCOHelper unused43 = EmvTestActivity.this.emvcoHelper;
                                EMVCOHelper.EmvFinal();
                            }
                        } else {
                            Log.e("paywaveunipay", "paywaveunipay0000");
                            EmvTestActivity.this.Tag5A_data = "";
                            EMVCOHelper unused44 = EmvTestActivity.this.emvcoHelper;
                            int ret6 = EMVCOHelper.EmvKeyPadInit(EmvTestActivity.this);
                            EMVCOHelper unused45 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.SetPinPadTime(20);
                            if (ret6 != 0) {
                                EmvTestActivity.this.m_bThreadFinished = true;
                                return;
                            }
                            short TagCardNo = 87;
                            byte[] CardNoData2 = new byte[56];
                            byte[] TVRData = new byte[56];
                            byte[] PinData2 = new byte[56];
                            byte[] result2 = new byte[2];
                            EMVCOHelper unused46 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.EmvKernelInit();
                            EMVCOHelper unused47 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.EmvSetTransType(1);
                            EMVCOHelper unused48 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.EmvSetTransAmount(800000);
                            EMVCOHelper unused49 = EmvTestActivity.this.emvcoHelper;
                            EMVCOHelper.EmvSetCardType(2);
                            Log.e("liuhaoEMV", "EMV TEST");
                            EMVCOHelper unused50 = EmvTestActivity.this.emvcoHelper;
                            int ret7 = EMVCOHelper.EmvProcess(4, 0);
                            Log.e("liuhaoEMV", "ret = " + ret7);
                            if (ret7 < 0) {
                                EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.7
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        EmvTestActivity.this.strEmvStatus = "EMV Termination";
                                        EmvTestActivity.this.tvEmvMsg.setText("EMV Termination");
                                        EMVCOHelper unused51 = EmvTestActivity.this.emvcoHelper;
                                        EMVCOHelper.EmvFinal();
                                    }
                                });
                                EMVCOHelper unused51 = EmvTestActivity.this.emvcoHelper;
                                EMVCOHelper.QvsdcSetOnlineResult(result2);
                                EmvTestActivity.this.m_bThreadFinished = true;
                                return;
                            }
                            if (ret7 == 3) {
                                EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.8
                                    @Override // java.lang.Runnable
                                    public void run() {
                                        EmvTestActivity.this.strEmvStatus = "EMV  GOONLINE";
                                    }
                                });
                            }
                            byte[] card_no0 = EmvTestActivity.this.PAN.getBytes();
                            byte[] mode0 = {1};
                            byte[] pin_block0 = new byte[8];
                            EMVCOHelper unused52 = EmvTestActivity.this.emvcoHelper;
                            int ret8 = EMVCOHelper.EmvGetKLKPinBlock(EmvTestActivity.this, 0, 2, card_no0, mode0, pin_block0, 10);
                            Log.e("EmvGetKLKPinBlock", "EmvGetKLKPinBlock ret=  " + ret8);
                            EMVCOHelper unused53 = EmvTestActivity.this.emvcoHelper;
                            int TagCardNo_len2 = EMVCOHelper.EmvGetTagData(CardNoData2, 56, 87);
                            int i4 = 0;
                            while (i4 < TagCardNo_len2) {
                                int ret9 = ret8;
                                StringBuilder sb4 = new StringBuilder();
                                short TagCardNo2 = TagCardNo;
                                sb4.append("i = ");
                                sb4.append(i4);
                                sb4.append("  ");
                                sb4.append((int) CardNoData2[i4]);
                                Log.e("CardNoData", sb4.toString());
                                StringBuilder sb5 = new StringBuilder();
                                EmvTestActivity emvTestActivity3 = EmvTestActivity.this;
                                sb5.append(emvTestActivity3.Tag57_data);
                                sb5.append(ByteUtil.byteToHexString(CardNoData2[i4]));
                                emvTestActivity3.Tag57_data = sb5.toString();
                                i4++;
                                ret8 = ret9;
                                TagCardNo = TagCardNo2;
                            }
                            int ret10 = TagCardNo_len2 % 2;
                            if (ret10 != 0) {
                                EmvTestActivity.this.Tag57_data = EmvTestActivity.this.Tag57_data.substring(0, (TagCardNo_len2 * 2) - 1);
                            }
                            Log.e("Tag57", "-Tag57_data=----" + EmvTestActivity.this.Tag57_data);
                            EmvTestActivity.this.PAN = EmvTestActivity.getContactlessPan(EmvTestActivity.this.Tag57_data);
                            EMVCOHelper unused54 = EmvTestActivity.this.emvcoHelper;
                            int TagTVR_len = EMVCOHelper.EmvGetTagData(TVRData, 56, 149);
                            int i5 = 0;
                            while (i5 < TagTVR_len) {
                                StringBuilder sb6 = new StringBuilder();
                                int TagCardNo_len3 = TagCardNo_len2;
                                sb6.append("i = ");
                                sb6.append(i5);
                                sb6.append("  ");
                                sb6.append((int) TVRData[i5]);
                                Log.e("TagTvr", sb6.toString());
                                StringBuilder sb7 = new StringBuilder();
                                EmvTestActivity emvTestActivity4 = EmvTestActivity.this;
                                sb7.append(emvTestActivity4.Tag95_data);
                                sb7.append(ByteUtil.byteToHexString(TVRData[i5]));
                                emvTestActivity4.Tag95_data = sb7.toString();
                                i5++;
                                TagCardNo_len2 = TagCardNo_len3;
                            }
                            if (TagTVR_len % 2 != 0) {
                                EmvTestActivity.this.Tag95_data = EmvTestActivity.this.Tag95_data.substring(0, TagTVR_len * 2);
                            }
                            Log.e("Tag95", "-Tag95_data=----" + EmvTestActivity.this.Tag95_data);
                            EMVCOHelper unused55 = EmvTestActivity.this.emvcoHelper;
                            int PinData_len2 = EMVCOHelper.EmvGetTagData(PinData2, 56, 189);
                            String TagPin_data2 = "";
                            int i6 = 0;
                            while (true) {
                                int i7 = i6;
                                if (i7 >= PinData_len2) {
                                    ByteUtil.hexStr2Str(TagPin_data2);
                                    EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.9
                                        @Override // java.lang.Runnable
                                        public void run() {
                                            EmvTestActivity.this.tvEmvMsg.setText(EmvTestActivity.this.strEmvStatus + "\n\nCardNO:" + EmvTestActivity.this.PAN + "\n\nTVR:" + EmvTestActivity.this.Tag95_data);
                                        }
                                    });
                                    Log.e("EMV PinData", "-TagPin_data=----" + TagPin_data2);
                                    EMVCOHelper unused56 = EmvTestActivity.this.emvcoHelper;
                                    EMVCOHelper.EmvFinal();
                                } else {
                                    int TagTVR_len2 = TagTVR_len;
                                    Log.e("EMV PinData", "i = " + i7 + "  " + ((int) PinData2[i7]));
                                    StringBuilder sb8 = new StringBuilder();
                                    sb8.append(TagPin_data2);
                                    sb8.append(ByteUtil.byteToHexString(PinData2[i7]));
                                    TagPin_data2 = sb8.toString();
                                    i6 = i7 + 1;
                                    TagTVR_len = TagTVR_len2;
                                    PinData_len2 = PinData_len2;
                                }
                            }
                        }
                        break;
                        break;
                    case 2:
                        byte[] card_no = {50, 50, 48, 48, 50, 52, 48, 54, 57, 57, 51, 48, 49, 48, 54, 49};
                        byte[] mode = {5};
                        byte[] pin_block = new byte[8];
                        Log.e("vpos", "PinBlock0 ");
                        EMVCOHelper unused57 = EmvTestActivity.this.emvcoHelper;
                        int ret11 = EMVCOHelper.EmvGetKLKPinBlock(EmvTestActivity.this, 0, 2, card_no, mode, pin_block, 12);
                        Log.e("vpos", "PinBlock1 ret " + ret11);
                        new byte[1][0] = 0;
                        Log.e("vpos", "PinBlock2 ");
                        Log.e("PinBlock", "PinBlock0 EmvGetPinBlock ret=" + ret11);
                        if (ret11 != 0) {
                            Log.e(EmvTestActivity.TAG, "PinBlock1 ret :" + ret11);
                            EmvTestActivity.this.m_bThreadFinished = true;
                            return;
                        }
                        final String pin_block00 = ByteUtil.bytearrayToHexString(pin_block, pin_block.length);
                        Log.e("PinBlock", "PinBlock2 pin_block00=----" + pin_block00);
                        EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.11
                            @Override // java.lang.Runnable
                            public void run() {
                                EmvTestActivity.this.tvEmvMsg.setText("PinBlock0 :" + pin_block00);
                            }
                        });
                        break;
                        break;
                    case 3:
                        byte[] pwd = new byte[20];
                        byte[] PinData22 = new byte[56];
                        EMVCOHelper unused58 = EmvTestActivity.this.emvcoHelper;
                        EMVCOHelper.EmvSetTransAmount(9879900);
                        EMVCOHelper unused59 = EmvTestActivity.this.emvcoHelper;
                        final String Pin_PlanText = EMVCOHelper.EmvPin_PlanText(EmvTestActivity.this, 0, 2, 30);
                        Log.e("heyp66666", "EmvPin_PlanText");
                        Log.e("heyp45555", "EmvPin_PlanText-----" + Pin_PlanText);
                        Log.e("heyp1-BDTag", "EmvShowKeyPad ret=0");
                        EMVCOHelper unused60 = EmvTestActivity.this.emvcoHelper;
                        int PinData_len22 = EMVCOHelper.EmvGetTagData(PinData22, 56, 189);
                        Log.e("heyp2--BDTag", PinData_len22 + "");
                        ByteUtil.bytesToString(pwd);
                        if (!TextUtils.isEmpty(Pin_PlanText) && Pin_PlanText.trim().length() > 0) {
                            EmvTestActivity.this.runOnUiThread(new Runnable() { // from class: test.apidemo.activity.EmvTestActivity.EmvThread.12
                                @Override // java.lang.Runnable
                                public void run() {
                                    EmvTestActivity.this.tvEmvMsg.setText("Password : " + Pin_PlanText);
                                }
                            });
                        }
                        break;
                }
                EmvTestActivity.this.m_bThreadFinished = true;
            }
        }
    }

    public static String str2HexStr(String str) {
        char[] chars = "0123456789ABCDEF".toCharArray();
        StringBuilder sb = new StringBuilder("");
        byte[] bs = str.getBytes();
        for (int i = 0; i < bs.length; i++) {
            int bit = (bs[i] & 240) >> 4;
            sb.append(chars[bit]);
            int bit2 = bs[i] & 15;
            sb.append(chars[bit2]);
            sb.append(' ');
        }
        return sb.toString().trim();
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
    public void onBackPressed() {
        super.onBackPressed();
        if (this.emvThread != null && !this.emvThread.isThreadFinished()) {
            Log.e(TAG, "onBackPressed() , Thread is still running...");
            this.emvThread.interrupt();
        }
        if (this.mIBackFinish != null) {
            this.mIBackFinish.isBack();
            this.bIsBack = true;
        }
        EMVCOHelper eMVCOHelper = this.emvcoHelper;
        EMVCOHelper.EmvFinal();
        finish();
    }

    private void testEmv() {
        this.tvEmvMsg.setText(getResources().getText(R.string.emvTips));
        this.strEmvStatus = "";
        if (this.emvThread != null && !this.emvThread.isThreadFinished()) {
            Log.e(TAG, "Thread is still running...");
        } else {
            this.emvThread = new EmvThread(1);
            this.emvThread.start();
        }
    }

    @Override // android.app.Activity
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1 && grantResults[0] == 0) {
            testEmv();
        }
    }

    private void requestPermission() {
        int checkCallPhonePermission = ContextCompat.checkSelfPermission(this, "android.permission.WRITE_EXTERNAL_STORAGE");
        if (checkCallPhonePermission != 0) {
            ActivityCompat.requestPermissions(this, MY_PERMISSIONS_STORAGE, 1);
        } else {
            testEmv();
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
