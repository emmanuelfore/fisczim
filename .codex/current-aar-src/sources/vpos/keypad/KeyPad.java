package vpos.keypad;

import android.annotation.TargetApi;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.graphics.drawable.ColorDrawable;
import android.inputmethodservice.Keyboard;
import android.inputmethodservice.KeyboardView;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.text.Editable;
import android.text.method.PasswordTransformationMethod;
import android.util.Log;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.cspos.BuildConfig;
import com.cspos.PaySys;
import com.cspos.R;
import java.text.DecimalFormat;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import vpos.apipackage.ByteUtil;
import vpos.keypad.StockKeyboardView;
import vpos.util.Util;

/* JADX INFO: loaded from: classes.jar:vpos/keypad/KeyPad.class */
public class KeyPad {
    Context mContext;
    static Dialog dAlertDialog;
    private Keyboard mNumKeyboard;
    private EditText mEditText;
    private ImageView ivDel;
    private static final int MSG_WHAT_SHOW_DIALOG = 0;
    private static final int MSG_WHAT_HIDE_DIALOG = 1;
    private static final int MSG_WHAT_CLEAR_BUFFER = 2;
    private static final int TAG_INPUT_RESLUT_OK = 0;
    private static final int TAG_INPUT_RESLUT_BACK = -1;
    private static final int TAG_INPUT_RESLUT_NOFORCUS = -2;
    private static final int TAG_INPUT_RESLUT_NOINPUT = -3;
    private static final int TAG_INPUT_RESLUT_CANCEL = -4;
    private static final int TAG_INPUT_RESLUT_TIMEOUT = -5;
    private static final int TAG_INPUT_RESLUT_NO_ACTIVITY = -6;
    private boolean mIsInputFinish;
    private EMVCOHelper emvcoHelper;
    IFinishInput mIFinishInput;
    static int TYPE = 0;
    static int amount = 0;
    static int ptc_couter = 0;
    private static int TIMEOUT_MS = 30000;
    final String tag = "KeyPad";
    int keyInputResult = TAG_INPUT_RESLUT_BACK;
    int keyInputMinLength = 0;
    int keyInputMaxLength = 0;
    String mTittleString = "please input Pin ~";
    private Handler handler = new Handler(Looper.getMainLooper()) { // from class: vpos.keypad.KeyPad.2
        @Override // android.os.Handler
        @TargetApi(23)
        public void handleMessage(Message msg) {
            switch (msg.what) {
                case 0:
                    Log.e("Robert", "showpad-------------------MSG_WHAT_SHOW_DIALOG");
                    LayoutInflater inflater = LayoutInflater.from(KeyPad.this.mContext);
                    View layout = inflater.inflate(R.layout.keypad_dialog_layout, (ViewGroup) null);
                    LinearLayout replaceLL = (LinearLayout) layout.findViewById(R.id.replaceLL);
                    StockKeyboardView mKeyboardView = null;
                    if (KeyPad.TYPE == 0) {
                        layout.findViewById(R.id.pk_up_lay).setVisibility(8);
                        layout.findViewById(R.id.pk_ivDel).setVisibility(8);
                        layout.findViewById(R.id.pk_ptc_count).setVisibility(8);
                        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(KeyPad.TAG_INPUT_RESLUT_BACK, KeyPad.TAG_INPUT_RESLUT_BACK);
                        lp.setMargins(0, 0, 0, 5);
                        replaceLL.setLayoutParams(lp);
                        replaceLL.addView(inflater.inflate(R.layout.old_keyboardview_layout, (ViewGroup) null));
                        mKeyboardView = (StockKeyboardView) replaceLL.findViewById(R.id.keyboard_view);
                    } else {
                        layout.findViewById(R.id.pk_up_lay).setVisibility(0);
                        layout.findViewById(R.id.pk_ivDel).setVisibility(0);
                        layout.findViewById(R.id.pk_ptc_count).setVisibility(0);
                        layout.findViewById(R.id.ivLogo).setVisibility(0);
                        LinearLayout.LayoutParams uplay_lp = new LinearLayout.LayoutParams(KeyPad.TAG_INPUT_RESLUT_BACK, KeyPad.TAG_INPUT_RESLUT_NOFORCUS);
                        if (KeyPad.TYPE == KeyPad.MSG_WHAT_HIDE_DIALOG || KeyPad.MSG_WHAT_CLEAR_BUFFER == KeyPad.TYPE) {
                            uplay_lp.setMargins(0, 110, 0, 60);
                            layout.findViewById(R.id.pk_up_lay).setLayoutParams(uplay_lp);
                            layout.findViewById(R.id.ivLogo).setLayoutParams(new LinearLayout.LayoutParams(600, 120));
                            layout.findViewById(R.id.ivLogo).setBackground(KeyPad.this.mContext.getResources().getDrawable(R.drawable.logo_serbank));
                            replaceLL.addView(inflater.inflate(R.layout.pk_serbank_keyboardview_layout, (ViewGroup) null));
                            mKeyboardView = (StockKeyboardView) replaceLL.findViewById(R.id.pk_serbank_keyboard);
                        } else if (KeyPad.TYPE == 3 || 4 == KeyPad.TYPE) {
                            uplay_lp.setMargins(0, 110, 0, 0);
                            layout.findViewById(R.id.pk_up_lay).setLayoutParams(uplay_lp);
                            layout.findViewById(R.id.ivLogo).setLayoutParams(new LinearLayout.LayoutParams(340, 160));
                            layout.findViewById(R.id.ivLogo).setBackground(KeyPad.this.mContext.getResources().getDrawable(R.drawable.logo_aqsi));
                            replaceLL.addView(inflater.inflate(R.layout.pk_aqsi_keyboardview_layout, (ViewGroup) null));
                            mKeyboardView = (StockKeyboardView) replaceLL.findViewById(R.id.pk_aqsi_keyboard);
                        }
                        EMVCOHelper.getInstance();
                        KeyPad.amount = EMVCOHelper.EmvSetExtTransAmount();
                        DecimalFormat df = new DecimalFormat("0.00");
                        String strAmount = df.format(((double) KeyPad.amount) / 100.0d);
                        ((TextView) layout.findViewById(R.id.pk_title_sum)).setText("К оплате : " + strAmount);
                        EMVCOHelper.getInstance();
                        KeyPad.ptc_couter = EMVCOHelper.EmvSetExtPtcCounter();
                        Log.e("liuhao", "ptc_couter = " + KeyPad.ptc_couter);
                        if (KeyPad.ptc_couter == 3) {
                            Log.e("liuhao", "ptc_couter 333333333");
                            ((TextView) layout.findViewById(R.id.pk_ptc_count)).setText("осталось 3 попытки");
                        } else if (KeyPad.ptc_couter == KeyPad.MSG_WHAT_CLEAR_BUFFER) {
                            Log.e("liuhao", "ptc_couter 222222222");
                            ((TextView) layout.findViewById(R.id.pk_ptc_count)).setText("осталось 2 попытки");
                        } else if (KeyPad.ptc_couter == KeyPad.MSG_WHAT_HIDE_DIALOG) {
                            Log.e("liuhao", "ptc_couter 1111111");
                            ((TextView) layout.findViewById(R.id.pk_ptc_count)).setText("последняя попытка");
                        } else {
                            Log.e("liuhao", "ptc_couter esle");
                            ((TextView) layout.findViewById(R.id.pk_ptc_count)).setText(BuildConfig.FLAVOR);
                        }
                        LinearLayout.LayoutParams pkLp = new LinearLayout.LayoutParams(KeyPad.TAG_INPUT_RESLUT_BACK, KeyPad.TAG_INPUT_RESLUT_BACK);
                        pkLp.setMargins(0, 0, 0, 0);
                        replaceLL.setLayoutParams(pkLp);
                    }
                    KeyPad.this.mEditText = (EditText) layout.findViewById(R.id.pwdEdtiInput);
                    KeyPad.this.mEditText.setTransformationMethod(KeyPad.this.new AsteriskPasswordTransformationMethod());
                    KeyPad.this.ivDel = (ImageView) layout.findViewById(R.id.pk_ivDel);
                    KeyPad.this.ivDel.setOnClickListener(new View.OnClickListener() { // from class: vpos.keypad.KeyPad.2.1
                        @Override // android.view.View.OnClickListener
                        public void onClick(View v) {
                            Editable editable = KeyPad.this.mEditText.getText();
                            int start = KeyPad.this.mEditText.getSelectionStart();
                            if (editable != null && editable.length() > 0 && start > 0) {
                                editable.delete(start - KeyPad.MSG_WHAT_HIDE_DIALOG, start);
                            }
                        }
                    });
                    if (KeyPad.TYPE == 0) {
                        KeyPad.this.mNumKeyboard = new Keyboard(KeyPad.this.mContext, R.xml.symbols);
                    } else if (KeyPad.TYPE == KeyPad.MSG_WHAT_HIDE_DIALOG || KeyPad.MSG_WHAT_CLEAR_BUFFER == KeyPad.TYPE) {
                        KeyPad.this.mNumKeyboard = new Keyboard(KeyPad.this.mContext, R.xml.symbols_pk_serbank);
                    } else if (KeyPad.TYPE == 3 || 4 == KeyPad.TYPE) {
                        KeyPad.this.mNumKeyboard = new Keyboard(KeyPad.this.mContext, R.xml.symbols_pk_aqsi);
                    }
                    mKeyboardView.requestFocus();
                    if (KeyPad.TYPE == 0) {
                        KeyPad.this.randomNumKey();
                    } else if (KeyPad.TYPE == KeyPad.MSG_WHAT_CLEAR_BUFFER) {
                        KeyPad.this.randomNumKeyPK();
                    } else if (4 == KeyPad.TYPE) {
                        KeyPad.this.randomNumKeyAsqi();
                    }
                    mKeyboardView.setKeyboard(KeyPad.this.mNumKeyboard);
                    mKeyboardView.setEnabled(true);
                    mKeyboardView.setPreviewEnabled(false);
                    mKeyboardView.setOnKeyboardActionListener(KeyPad.this.listener);
                    mKeyboardView.setMyViewFocusInterface(new StockKeyboardView.MyViewFocusInterface() { // from class: vpos.keypad.KeyPad.2.2
                        @Override // vpos.keypad.StockKeyboardView.MyViewFocusInterface
                        public void isNoFocus() {
                            KeyPad.this.keyInputResult = KeyPad.TAG_INPUT_RESLUT_NOFORCUS;
                            if (KeyPad.this.mIFinishInput != null) {
                                KeyPad.this.mIFinishInput.isFinish(KeyPad.this.keyInputResult);
                            }
                            KeyPad.this.HideKeyPad();
                        }
                    });
                    if ((KeyPad.this.mContext instanceof Activity) && !((Activity) KeyPad.this.mContext).isFinishing()) {
                        Log.e("liuhao KeyPad", "(mContext instanceof Activity) && !((Activity) mContext).isFinishing()");
                        if (KeyPad.TYPE != 0) {
                            KeyPad.dAlertDialog = new AlertDialog.Builder(KeyPad.this.mContext, R.style.fullStyle).setView(layout).show();
                            KeyPad.dAlertDialog.setCanceledOnTouchOutside(false);
                            KeyPad.dAlertDialog.getWindow().getDecorView().setPadding(0, 0, 0, 0);
                            LinearLayout.LayoutParams lp_decor = new LinearLayout.LayoutParams(KeyPad.TAG_INPUT_RESLUT_BACK, KeyPad.TAG_INPUT_RESLUT_BACK);
                            lp_decor.setMargins(0, 0, 0, 0);
                            KeyPad.dAlertDialog.getWindow().getDecorView().setLayoutParams(lp_decor);
                            WindowManager.LayoutParams lp_window = KeyPad.dAlertDialog.getWindow().getAttributes();
                            lp_window.width = KeyPad.TAG_INPUT_RESLUT_BACK;
                            lp_window.height = KeyPad.TAG_INPUT_RESLUT_BACK;
                            KeyPad.dAlertDialog.getWindow().setAttributes(lp_window);
                            KeyPad.dAlertDialog.getWindow().setBackgroundDrawable(new ColorDrawable(KeyPad.TAG_INPUT_RESLUT_BACK));
                            Log.e("liuhao KeyPad", "top : " + KeyPad.dAlertDialog.getWindow().getDecorView().getPaddingTop());
                            Log.e("liuhao KeyPad", "bottom : " + KeyPad.dAlertDialog.getWindow().getDecorView().getPaddingBottom());
                            Log.e("liuhao KeyPad", "left : " + KeyPad.dAlertDialog.getWindow().getDecorView().getPaddingLeft());
                            Log.e("liuhao KeyPad", "right : " + KeyPad.dAlertDialog.getWindow().getDecorView().getPaddingRight());
                            KeyPad.dAlertDialog.getWindow().getDecorView().setMinimumWidth(KeyPad.this.mContext.getResources().getDisplayMetrics().widthPixels);
                            KeyPad.dAlertDialog.getWindow().getDecorView().setBackgroundColor(KeyPad.TAG_INPUT_RESLUT_BACK);
                        } else {
                            KeyPad.dAlertDialog = new AlertDialog.Builder(KeyPad.this.mContext).setView(layout).show();
                            KeyPad.dAlertDialog.setCanceledOnTouchOutside(false);
                        }
                        KeyPad.dAlertDialog.setOnKeyListener(new DialogInterface.OnKeyListener() { // from class: vpos.keypad.KeyPad.2.3
                            @Override // android.content.DialogInterface.OnKeyListener
                            public boolean onKey(DialogInterface dialog, int keyCode, KeyEvent event) {
                                if (keyCode == 4 && event.getAction() == KeyPad.MSG_WHAT_HIDE_DIALOG) {
                                    KeyPad.this.keyInputResult = KeyPad.TAG_INPUT_RESLUT_BACK;
                                    if (KeyPad.this.mIFinishInput != null) {
                                        KeyPad.this.mIFinishInput.isFinish(KeyPad.this.keyInputResult);
                                        return false;
                                    }
                                    return false;
                                }
                                return false;
                            }
                        });
                    } else {
                        KeyPad.this.keyInputMaxLength = KeyPad.TAG_INPUT_RESLUT_NO_ACTIVITY;
                        if (KeyPad.this.mIFinishInput != null) {
                            KeyPad.this.mIFinishInput.isFinish(KeyPad.this.keyInputResult);
                        }
                    }
                    break;
                case KeyPad.MSG_WHAT_HIDE_DIALOG /* 1 */:
                    if (KeyPad.dAlertDialog != null) {
                        KeyPad.dAlertDialog.dismiss();
                        KeyPad.dAlertDialog = null;
                        KeyPad.this.mContext = null;
                    }
                    KeyPad.this.mIsInputFinish = true;
                    break;
                case KeyPad.MSG_WHAT_CLEAR_BUFFER /* 2 */:
                    KeyPad.this.mEditText.setText(BuildConfig.FLAVOR);
                    break;
                default:
                    Bundle b = msg.getData();
                    String strInfo = b.getString("MSG");
                    Log.d("KeyPad", strInfo);
                    break;
            }
        }
    };
    private KeyboardView.OnKeyboardActionListener listener = new KeyboardView.OnKeyboardActionListener() { // from class: vpos.keypad.KeyPad.3
        @Override // android.inputmethodservice.KeyboardView.OnKeyboardActionListener
        public void swipeUp() {
        }

        @Override // android.inputmethodservice.KeyboardView.OnKeyboardActionListener
        public void swipeRight() {
        }

        @Override // android.inputmethodservice.KeyboardView.OnKeyboardActionListener
        public void swipeLeft() {
        }

        @Override // android.inputmethodservice.KeyboardView.OnKeyboardActionListener
        public void swipeDown() {
        }

        @Override // android.inputmethodservice.KeyboardView.OnKeyboardActionListener
        public void onText(CharSequence text) {
        }

        @Override // android.inputmethodservice.KeyboardView.OnKeyboardActionListener
        public void onRelease(int primaryCode) {
        }

        @Override // android.inputmethodservice.KeyboardView.OnKeyboardActionListener
        public void onPress(int primaryCode) {
        }

        @Override // android.inputmethodservice.KeyboardView.OnKeyboardActionListener
        public void onKey(int primaryCode, int[] keyCodes) {
            Editable editable = KeyPad.this.mEditText.getText();
            int start = KeyPad.this.mEditText.getSelectionStart();
            switch (primaryCode) {
                case KeyPad.TAG_INPUT_RESLUT_TIMEOUT /* -5 */:
                    if (editable != null && editable.length() > 0 && start > 0) {
                        editable.delete(start - KeyPad.MSG_WHAT_HIDE_DIALOG, start);
                        break;
                    }
                    break;
                case KeyPad.TAG_INPUT_RESLUT_CANCEL /* -4 */:
                    if (KeyPad.this.mEditText.getText().length() > KeyPad.this.keyInputMinLength - KeyPad.MSG_WHAT_HIDE_DIALOG && KeyPad.this.mEditText.getText().length() < KeyPad.this.keyInputMaxLength + KeyPad.MSG_WHAT_HIDE_DIALOG) {
                        KeyPad.this.keyInputResult = 0;
                        if (KeyPad.this.mIFinishInput != null) {
                            KeyPad.this.mIFinishInput.isFinish(KeyPad.this.keyInputResult);
                        }
                        KeyPad.this.HideKeyPad();
                        break;
                    }
                    break;
                case KeyPad.TAG_INPUT_RESLUT_NOINPUT /* -3 */:
                    KeyPad.this.keyInputResult = KeyPad.TAG_INPUT_RESLUT_CANCEL;
                    if (KeyPad.this.mIFinishInput != null) {
                        KeyPad.this.mIFinishInput.isFinish(KeyPad.this.keyInputResult);
                    }
                    KeyPad.this.HideKeyPad();
                    break;
                default:
                    if (KeyPad.this.mEditText.getText().length() < KeyPad.this.keyInputMaxLength) {
                        editable.insert(start, Character.toString((char) primaryCode));
                    }
                    break;
            }
        }
    };

    /* JADX INFO: loaded from: classes.jar:vpos/keypad/KeyPad$IFinishInput.class */
    interface IFinishInput {
        void isFinish(int i);
    }

    public KeyPad(Context context) {
        this.mContext = context;
    }

    public int PciVerifyPlainPinSbank(int slot, int minLen, int maxLen, int timeout_s, byte[] IccRsp) {
        Log.e("Robert", "PciVerifyPlainPinSbank-----------------------0");
        PaySys.poskeypad(this.mContext);
        PaySys.SetPadTime(timeout_s);
        byte slotin = (byte) slot;
        int ret = PaySys.OfflinePinPlain(slotin, minLen, maxLen, IccRsp);
        ByteUtil.bytearrayToHexString(IccRsp, MSG_WHAT_CLEAR_BUFFER);
        Log.e("Robert", "PciVerifyPlainPinSbank IccRsp---" + IccRsp);
        return ret;
    }

    public int PciVerifyCipherPinSbank(int slot, int minLen, int maxLen, int timeout_s, byte[] modulus, int moduluslen, byte[] exponent, byte[] IccRandom, int IccRandomLen, byte[] IccRsp) {
        PaySys.poskeypad(this.mContext);
        PaySys.SetPadTime(timeout_s);
        byte slotin = (byte) slot;
        int ret = PaySys.OfflinePinCipher(slotin, minLen, maxLen, modulus, moduluslen, exponent, IccRandom, IccRandomLen, IccRsp);
        return ret;
    }

    public int Settime_ShowKeyPad(int Time_S) {
        TIMEOUT_MS = Time_S * 1000;
        return TIMEOUT_MS;
    }

    public int ShowKeyPad(String tittle, int type, final byte[] input, final byte[] input_len, int Minlength, int Maxlength) {
        this.mIsInputFinish = false;
        this.keyInputMinLength = Minlength;
        this.keyInputMaxLength = Maxlength;
        TYPE = type;
        Log.e("Robert", "showpad-------------------0");
        long startTime = System.currentTimeMillis();
        SendMsg(0, BuildConfig.FLAVOR);
        while (true) {
            if (this.mIsInputFinish) {
                break;
            }
            long currentTime = System.currentTimeMillis();
            setIFinishInput(new IFinishInput() { // from class: vpos.keypad.KeyPad.1
                @Override // vpos.keypad.KeyPad.IFinishInput
                public void isFinish(int finishResult) {
                    KeyPad.this.keyInputResult = finishResult;
                    if (finishResult == 0) {
                        String inputString = KeyPad.this.mEditText.getText().toString();
                        if (inputString.trim().length() == 0) {
                            KeyPad.this.keyInputResult = KeyPad.TAG_INPUT_RESLUT_NOINPUT;
                        }
                        input_len[0] = (byte) inputString.length();
                        System.arraycopy(inputString.getBytes(), 0, input, 0, inputString.length());
                    }
                    KeyPad.this.HideKeyPad();
                }
            });
            if (currentTime - startTime > TIMEOUT_MS) {
                this.keyInputResult = TAG_INPUT_RESLUT_TIMEOUT;
                HideKeyPad();
                break;
            }
            Util.sleepMs(50);
        }
        ClearBuffer();
        return this.keyInputResult;
    }

    public void HideKeyPad() {
        SendMsg(MSG_WHAT_HIDE_DIALOG, BuildConfig.FLAVOR);
        this.mIsInputFinish = true;
    }

    public void ClearBuffer() {
        SendMsg(MSG_WHAT_CLEAR_BUFFER, BuildConfig.FLAVOR);
    }

    public void SendMsg(int iType, String strInfo) {
        if (null != this.handler) {
            Message msg = new Message();
            msg.what = iType;
            Bundle b = new Bundle();
            b.putString("MSG", strInfo);
            msg.setData(b);
            this.handler.sendMessage(msg);
        }
    }

    public void setIFinishInput(IFinishInput iFinishInput) {
        this.mIFinishInput = iFinishInput;
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void randomNumKey() {
        List<Keyboard.Key> keyList = this.mNumKeyboard.getKeys();
        int size = keyList.size() - 4;
        Set<Integer> randomSet = getRandomSet(9, 9);
        Iterator<Integer> it = randomSet.iterator();
        List<Integer> list = new ArrayList<>();
        while (it.hasNext()) {
            list.add(it.next());
        }
        int keyIndex = 0;
        for (int i = 0; i < size; i += MSG_WHAT_HIDE_DIALOG) {
            if (0 <= i && i < 3) {
                keyIndex = i;
            } else if (i >= 3 && i < 6) {
                keyIndex = i + MSG_WHAT_HIDE_DIALOG;
            } else if (6 <= i && i < 9) {
                keyIndex = i + MSG_WHAT_CLEAR_BUFFER;
            }
            keyList.get(keyIndex).codes[0] = list.get(i).intValue() + 48;
            keyList.get(keyIndex).label = BuildConfig.FLAVOR + list.get(i);
        }
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void randomNumKeyPK() {
        List<Keyboard.Key> keyList = this.mNumKeyboard.getKeys();
        int size = keyList.size() - 3;
        Log.e("KeyPad", "size = " + size);
        Set<Integer> randomSet = getRandomSet(9, 9);
        Iterator<Integer> it = randomSet.iterator();
        List<Integer> list = new ArrayList<>();
        while (it.hasNext()) {
            list.add(it.next());
        }
        for (int i = 0; i < size; i += MSG_WHAT_HIDE_DIALOG) {
            keyList.get(i).codes[0] = list.get(i).intValue() + 48;
            keyList.get(i).label = BuildConfig.FLAVOR + list.get(i);
        }
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void randomNumKeyAsqi() {
        List<Keyboard.Key> keyList = this.mNumKeyboard.getKeys();
        int size = keyList.size() - 3;
        Log.e("KeyPad", "size = " + size);
        List<KeyElement> keysElement = getRandomKeyElements(9, 9);
        for (int i = 0; i < keysElement.size(); i += MSG_WHAT_HIDE_DIALOG) {
            Log.e("liuhao KeyPad ", "randomNumKeyAsqi() : i = " + i + "  code : " + keysElement.get(i).getKeyCode());
            keyList.get(i).codes[0] = keysElement.get(i).getKeyCode();
            keyList.get(i).icon = keysElement.get(i).getKeyIcon();
        }
    }

    public Set<Integer> getRandomSetAsqi(int size, int max) {
        Random random = new Random();
        Set<Integer> result = new LinkedHashSet<>();
        while (result.size() < size) {
            Integer next = Integer.valueOf(random.nextInt(max));
            result.add(next);
        }
        return result;
    }

    public List<KeyElement> getRandomKeyElements(int size, int max) {
        Set<Integer> result_int = getRandomSetAsqi(9, 9);
        Iterator<Integer> it = result_int.iterator();
        List<Integer> intList = new ArrayList<>();
        while (it.hasNext()) {
            intList.add(it.next());
        }
        List<Keyboard.Key> keyList = this.mNumKeyboard.getKeys();
        List<KeyElement> keysElement = new ArrayList<>();
        for (int i = 0; i < intList.size(); i += MSG_WHAT_HIDE_DIALOG) {
            int tmpIndex = intList.get(i).intValue();
            Log.e("liuhao getRandomKeyElements() i  = " + i, "intList.get(keyIndex) = " + tmpIndex);
            KeyElement keyElement = new KeyElement();
            keyElement.setKeyCode(keyList.get(tmpIndex).codes[0]);
            keyElement.setKeyIcon(keyList.get(tmpIndex).icon);
            keysElement.add(keyElement);
        }
        return keysElement;
    }

    public Set<Integer> getRandomSet(int size, int max) {
        Random random = new Random();
        Set<Integer> result = new LinkedHashSet<>();
        while (result.size() < size) {
            Integer next = Integer.valueOf(random.nextInt(max) + MSG_WHAT_HIDE_DIALOG);
            result.add(next);
        }
        return result;
    }

    public static int[] randomCommon(int min, int max, int n) {
        if (n > (max - min) + MSG_WHAT_HIDE_DIALOG || max < min) {
            return null;
        }
        int[] result = new int[n];
        int count = 0;
        while (count < n) {
            int num = ((int) (Math.random() * ((double) (max - min)))) + min;
            boolean flag = MSG_WHAT_HIDE_DIALOG;
            int j = 0;
            while (true) {
                if (j >= n) {
                    break;
                }
                if (num != result[j]) {
                    j += MSG_WHAT_HIDE_DIALOG;
                } else {
                    flag = false;
                    break;
                }
            }
            if (flag) {
                result[count] = num;
                count += MSG_WHAT_HIDE_DIALOG;
            }
        }
        return result;
    }

    public static int[] getSequence(int no) {
        int[] sequence = new int[no];
        for (int i = 0; i < no; i += MSG_WHAT_HIDE_DIALOG) {
            sequence[i] = i + MSG_WHAT_HIDE_DIALOG;
        }
        Random random = new Random();
        for (int i2 = 0; i2 < no; i2 += MSG_WHAT_HIDE_DIALOG) {
            int p = random.nextInt(no);
            int tmp = sequence[i2];
            sequence[i2] = sequence[p];
            sequence[p] = tmp;
        }
        return sequence;
    }

    /* JADX INFO: loaded from: classes.jar:vpos/keypad/KeyPad$AsteriskPasswordTransformationMethod.class */
    public class AsteriskPasswordTransformationMethod extends PasswordTransformationMethod {
        public AsteriskPasswordTransformationMethod() {
        }

        @Override // android.text.method.PasswordTransformationMethod, android.text.method.TransformationMethod
        public CharSequence getTransformation(CharSequence source, View view) {
            return new PasswordCharSequence(source);
        }

        /* JADX INFO: loaded from: classes.jar:vpos/keypad/KeyPad$AsteriskPasswordTransformationMethod$PasswordCharSequence.class */
        private class PasswordCharSequence implements CharSequence {
            private CharSequence mSource;

            public PasswordCharSequence(CharSequence source) {
                this.mSource = source;
            }

            @Override // java.lang.CharSequence
            public char charAt(int index) {
                if (this.mSource.charAt(index) > '9' || this.mSource.charAt(index) < '0') {
                    return (char) 0;
                }
                return '*';
            }

            @Override // java.lang.CharSequence
            public int length() {
                return this.mSource.length();
            }

            @Override // java.lang.CharSequence
            public CharSequence subSequence(int start, int end) {
                return this.mSource.subSequence(start, end);
            }
        }
    }
}
