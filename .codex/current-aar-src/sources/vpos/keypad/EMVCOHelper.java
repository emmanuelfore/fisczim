package vpos.keypad;

import android.content.Context;
import android.util.Log;
import com.cspos.BuildConfig;
import com.cspos.PaySys;
import java.util.Arrays;
import vpos.apipackage.ByteUtil;
import vpos.apipackage.FileTools;

/* JADX INFO: loaded from: classes.jar:vpos/keypad/EMVCOHelper.class */
public class EMVCOHelper {
    private static EMVCOHelper mInstance;
    private static final Object mLock = new Object();
    private static int aid_addr = 0;
    private static int AidCount = 0;
    private static int CAPKCount = 0;
    private static int EmvConfig_Exist = -1;
    private static int ExtAmount = 0;
    private static int ExtPtcCounter = 10;
    public static int Bauder = 0;
    static int tmp = 0;

    public static EMVCOHelper getInstance() {
        EMVCOHelper eMVCOHelper;
        byte[] baud = {51, 51, 51, 51};
        synchronized (mLock) {
            if (mInstance == null) {
                mInstance = new EMVCOHelper();
            }
            PaySys.LibAdapterUartBaud(baud);
            eMVCOHelper = mInstance;
        }
        return eMVCOHelper;
    }

    public int AdapterUartBaud() {
        byte[] baud = new byte[1];
        int ret = PaySys.LibAdapterUartBaud(baud);
        Log.e("Robert", "AdapterUartBaud= " + ((int) baud[0]));
        if (baud[0] == 9) {
            Bauder = 9;
        } else {
            Bauder = 1;
        }
        return ret;
    }

    public static int EmvGetAllCAPK_Serbank() {
        byte[] poutput = new byte[1024];
        byte[] CAPK_Counter = new byte[10];
        EmvConfigRead(4, CAPK_Counter, 2);
        int Aidtotal = CAPK_Counter[0] & 255;
        for (int index = 1; index < Aidtotal + 1; index++) {
            Arrays.fill(poutput, (byte) 0);
            int retlen = EmvGetOneCAPK(poutput, index);
            PaySys.EmvAddOneCAPK(poutput, retlen);
            ByteUtil.bytearrayToHexString(poutput, retlen);
        }
        return 0;
    }

    public static int EmvGetAllAIDS_Serbank() {
        byte[] poutput = new byte[1024];
        byte[] Aid_Counter = new byte[10];
        byte[] Termpoutput = new byte[1024];
        EmvConfigRead(2, Aid_Counter, 2);
        int Aidtotal = Aid_Counter[0] & 255;
        for (int index = 1; index < Aidtotal + 1; index++) {
            Arrays.fill(poutput, (byte) 0);
            int retlen = EmvGetOneAIDS(poutput, index);
            PaySys.EmvAddOneAIDS(poutput, retlen);
            ByteUtil.bytearrayToHexString(poutput, retlen);
            Arrays.fill(Termpoutput, (byte) 0);
            int retlen2 = EmvGetOneTerm(Termpoutput, index);
            PaySys.EmvSaveTermParas(Termpoutput, retlen2, 0);
            ByteUtil.bytearrayToHexString(poutput, retlen2);
        }
        return 0;
    }

    public static int EmvGetAllTerm_Serbank() {
        byte[] poutput = new byte[1024];
        for (int index = 1; index < 1 + 1; index++) {
            Arrays.fill(poutput, (byte) 0);
            int retlen = EmvGetOneTerm(poutput, 1);
            PaySys.EmvSaveTermParas(poutput, retlen, 1);
            ByteUtil.bytearrayToHexString(poutput, retlen);
        }
        return 0;
    }

    public static int EmvEnvParaInit() {
        PaySys.EmvParaInit();
        return 0;
    }

    public static int EmvKernelInit() {
        return PaySys.EmvContextInit(54, 3);
    }

    public static int EmvSetTransAmount(int amount) {
        ExtAmount = amount;
        return PaySys.EmvSetTransAmount(amount);
    }

    public static int EmvSetPtcCounter(int counter) {
        ExtPtcCounter = counter;
        return 0;
    }

    public static int EmvSetExtTransAmount() {
        return ExtAmount;
    }

    public static int EmvSetExtPtcCounter() {
        return ExtPtcCounter;
    }

    public static int PayPass_ShowAmount() {
        String PaypssTag_data = BuildConfig.FLAVOR;
        byte[] PaypassTagBuff = new byte[1024];
        int Data_len = PaypassGetTagValue(PaypassTagBuff, 1024, 40706);
        if (Data_len > 0) {
            for (int i = 0; i < Data_len; i++) {
                PaypssTag_data = PaypssTag_data + ByteUtil.byteToHexString(PaypassTagBuff[i]);
            }
            if (Data_len / 2 != 0) {
                PaypssTag_data = PaypssTag_data.substring(0, Data_len * 2);
            }
            ExtAmount = Integer.parseInt(PaypssTag_data);
        } else {
            ExtAmount = 0;
        }
        EmvSetExtTransAmount();
        return 0;
    }

    public static int EmvSetTransAmountBack(int amount) {
        return PaySys.EmvSetTransAmountBack(amount);
    }

    public static int EmvSetCardType(int cardtype) {
        return PaySys.EmvSetCardType(cardtype);
    }

    public static int EmvSetTransType(int TransType) {
        return PaySys.EmvSetTransType(TransType);
    }

    public static int EmvProcess(int KernelType, int FlowType) {
        Log.e("heyp9", "heyp emvprocess");
        return PaySys.EmvProcess(KernelType, FlowType);
    }

    public static int SDKAuthorization() {
        return PaySys.SDKAuthorization();
    }

    public static int EmvGetTagData(byte[] OutPut, int OutputBufSize, int tagname) {
        return PaySys.EmvGetTagData(OutPut, OutputBufSize, tagname);
    }

    public static int EmvPrePare55Field(byte[] OutPut, int OutputBufSize) {
        return PaySys.EmvPrePare55Field(OutPut, OutputBufSize);
    }

    public static int EmvSetOnlineResult(byte[] result, byte[] IsSuerRespData, int IsSuerRespDataLength) {
        return PaySys.EmvSetOnlineResult(result, IsSuerRespData, IsSuerRespDataLength);
    }

    public static int QvsdcSetOnlineResult(byte[] result) {
        return PaySys.QvsdcSetOnlineResult(result);
    }

    public static int EmvFinal() {
        return PaySys.EmvFinal();
    }

    public static int EmvGetVersion(byte[] Output) {
        return PaySys.EmvGetVersion(Output);
    }

    public static int SetPinPadTime(int time_s) {
        return PaySys.SetPadTime(time_s);
    }

    public static int EmvClearAllAIDS() {
        Log.e("Robert", "Emvclear all aids");
        return PaySys.EmvClearAllAIDS();
    }

    public static int EmvClearOneAIDS(byte[] Input, int InLen) {
        return PaySys.EmvClearOneAIDS(Input, InLen);
    }

    public static int EmvAddOneAIDS(byte[] Input, int InLen) {
        return PaySys.EmvAddOneAIDS(Input, InLen);
    }

    public static int EmvGetOneCAPK(byte[] Input, int index) {
        byte[] CAPK_T = new byte[10];
        EmvConfigRead((index * 1024) + 204800, CAPK_T, 8);
        int aid_datalen = ((CAPK_T[6] & 255) * 256) + (CAPK_T[7] & 255);
        EmvConfigRead((index * 1024) + 204800 + 10, Input, aid_datalen);
        return aid_datalen;
    }

    public static int EmvGetOneAIDS(byte[] Input, int index) {
        byte[] Aid_T = new byte[10];
        EmvConfigRead(index * 1024, Aid_T, 8);
        int aid_datalen = ((Aid_T[6] & 255) * 256) + (Aid_T[7] & 255);
        EmvConfigRead((index * 1024) + 10, Input, aid_datalen);
        return aid_datalen;
    }

    public static int EmvGetOneTerm(byte[] Input, int index) {
        byte[] Term_T = new byte[10];
        EmvConfigRead(index * 100 * 1024, Term_T, 8);
        int aid_datalen = ((Term_T[6] & 255) * 256) + (Term_T[7] & 255);
        EmvConfigRead((index * 100 * 1024) + 10, Input, aid_datalen);
        return aid_datalen;
    }

    public static int EmvConfigErase() {
        int ret = PaySys.EmvConfigErase();
        return ret;
    }

    public static int EmvClearAllCapks() {
        return PaySys.EmvClearAllCapks();
    }

    public static int EmvClearOneCapks(byte[] Input, int InLen) {
        return PaySys.EmvClearOneCapks(Input, InLen);
    }

    public static int PaypassProcess() {
        Log.e("heyp", "PaypassProcess11111");
        AidCount = 0;
        CAPKCount = 0;
        Log.e("heyp", "PaypassProcess2222");
        int ret = PaySys.PaypassTest();
        return ret;
    }

    public static int PaypassGetTagValue(byte[] OutPut, int OutputBufSize, int tagname) {
        int ret = PaySys.PaypassGetTagValue(OutPut, OutputBufSize, tagname);
        return ret;
    }

    public static int PaypassFinal() {
        PaySys.PaypassOff();
        return 0;
    }

    public static int PaypassKernelInit() {
        PaySys.PaypassKernelInit();
        return 0;
    }

    public static int PaypassAidSet(String Aid_Input) {
        return PaySys.PapassAidSet(Aid_Input);
    }

    public static int PaypassCapkSet(String Capk_Input) {
        return PaySys.PapassCapkSet(Capk_Input);
    }

    public static int PaypassKernelSet(String Kernel_Input) {
        return PaySys.PapassKernelSet(Kernel_Input);
    }

    public static int PaypassReaderSet(String Reader_Input) {
        return PaySys.PapassReaderSet(Reader_Input);
    }

    public static int PaypassTransSet(String Trans_Input) {
        Bauder = 9;
        return PaySys.PapassTransSet(Trans_Input, Bauder);
    }

    public static int PaypassAllLoad() {
        String Aid_data = FileTools.read("Paypassconfig_Aid", 0L);
        PaySys.PapassAidSet(Aid_data);
        String Capk_data = FileTools.read("Paypassconfig_Capk", 0L);
        PaySys.PapassCapkSet(Capk_data);
        String Kernel_data = FileTools.read("Paypassconfig_Kernel", 0L);
        PaySys.PapassKernelSet(Kernel_data);
        String Reader_data = FileTools.read("PaypassReaderSet", 0L);
        PaySys.PapassReaderSet(Reader_data);
        String Trans_data = FileTools.read("PaypassTransSet", 0L);
        Bauder = 9;
        PaySys.PapassTransSet(Trans_data, Bauder);
        return 0;
    }

    public static int EmvAddOneCAPK(byte[] Input, int InLen) {
        return PaySys.EmvAddOneCAPK(Input, InLen);
    }

    public static int EmvAddOneCAPKString(String Input) {
        return PaySys.EmvAddOneCAPKString(Input);
    }

    public static int EmvConfigRead(int uReadAddr, byte[] pReadBuf, int uReadLen) {
        return PaySys.EmvConfigRead(uReadAddr, pReadBuf, uReadLen);
    }

    public static int EmvConfigWrite(int uWriteAddr, byte[] pWriteBuf, int uWriteLen) {
        return PaySys.EmvConfigWrite(uWriteAddr, pWriteBuf, uWriteLen);
    }

    public static int EmvReadTermPar(byte[] Input, int InLen, byte[] OutPut, int OutBufSize) {
        return PaySys.EmvReadTermPar(Input, InLen, OutPut, OutBufSize);
    }

    public static int EmvSaveTermParas(byte[] Input, int InLen, int index) {
        return PaySys.EmvSaveTermParas(Input, InLen, index);
    }

    public static int EmvModifyAllTermParasTag(byte[] TAG_Input, int Tag_name) {
        return PaySys.EmvModifyTermParasTag(TAG_Input, Tag_name);
    }

    public static int EmvKeyPadInit(Context ctx) {
        return PaySys.poskeypad(ctx);
    }

    public static int EmvGetPinBlock(Context ctx, int type, int pinkey_n, byte[] card_no, byte[] mode, byte[] pin_block, int timeout) {
        EmvKeyPadInit(ctx);
        PaySys.SetPadTime(timeout);
        return PaySys.Getpinblock(type, pinkey_n, card_no, mode, pin_block);
    }

    public static int EmvGetKLKPinBlock(Context ctx, int type, int pinkey_n, byte[] card_no, byte[] mode, byte[] pin_block, int timeout) {
        EmvKeyPadInit(ctx);
        PaySys.SetPadTime(timeout);
        EmvSetPtcCounter(10);
        return PaySys.GetKLKpinblock(type, pinkey_n, card_no, mode, pin_block);
    }

    public static int EmvShowKeyPad(Context ctx, byte[] password, int type) {
        EmvKeyPadInit(ctx);
        return PaySys.CallKeyPad(password, type);
    }

    public static String EmvPin_PlanText(Context ctx, int type, int counter, int timeout_s) {
        byte[] password = new byte[56];
        EmvKeyPadInit(ctx);
        EmvSetPtcCounter(counter);
        PaySys.SetPadTime(timeout_s);
        int ret = PaySys.CallKeyPad(password, type);
        if (ret == -1) {
            return "time_out";
        }
        String strPwd = ByteUtil.bytesToString(password);
        if (strPwd.trim().length() <= 0) {
            return "*******";
        }
        return strPwd;
    }

    private static String format2(String PIN) {
        return "2" + Integer.toHexString(PIN.length()) + String.format("%-14s", PIN).replace(' ', 'F');
    }

    public static int Emv_GetPinblock2(Context ctx, byte keyNo, byte[] pin_block, int timeout) {
        byte[] password = new byte[56];
        byte[] pingblockmode = {12};
        Log.e("Getpinblock2", "start");
        EmvKeyPadInit(ctx);
        PaySys.SetPadTime(timeout);
        int ret = PaySys.CallKeyPad(password, 0);
        if (ret == -1) {
            return -1;
        }
        String strPwd = ByteUtil.bytesToString(password);
        String Pinblock2 = format2(strPwd);
        byte[] inData = Pinblock2.getBytes();
        PaySys.GetSelPalpinblock(0, keyNo, inData, pingblockmode, pin_block);
        return 0;
    }

    public static int EmvPinbyPass() {
        byte[] TagPinbyPass_Data = new byte[56];
        EmvGetTagData(TagPinbyPass_Data, 56, 149);
        Log.e("EMV PinData", "bypass0----" + ((int) TagPinbyPass_Data[2]));
        char pinpass = (char) TagPinbyPass_Data[2];
        if ((pinpass & '\b') == 8) {
            return 1;
        }
        return 0;
    }

    public static int SetPinPadType(int type) {
        PaySys.SetPinType(type);
        return 0;
    }

    public static int PayWaveAddAids(String AID_input) {
        int ret = PaySys.PayWaveDownloadAIDS(AID_input);
        return ret;
    }

    public static int PayWaveAddCapks(String CAPK_input) {
        int ret = PaySys.PayWaveDownloadCapks(CAPK_input);
        return ret;
    }

    public static int PayWaveAddTerms(String Reader_input) {
        int ret = PaySys.PayWaveDownloadTerm(Reader_input);
        return ret;
    }

    public static int PayWaveSetTransType(int Type) {
        int ret = PaySys.PayWaveSetTransType(Type);
        return ret;
    }

    public static int PayWaveSetTransAmount(int Amount) {
        ExtAmount = Amount;
        int ret = PaySys.PayWaveSetTransAmount(Amount);
        return ret;
    }

    public static int PayWaveTransProcess() {
        int ret = PaySys.PayWaveTrans();
        return ret;
    }

    public static int PayWaveGetTagData(byte[] OutPut, int OutputBufSize, int tagname) {
        return PaySys.PayWaveGetTagData(OutPut, OutputBufSize, tagname);
    }

    public static int PayWaveFinal() {
        return PaySys.PayWaveFinal();
    }

    public static int PayWaveClearAllCapk() {
        return PaySys.PayWaveClearAllCapk();
    }

    public static int PayWaveClearAllTerm() {
        return PaySys.PayWaveClearAllTerm();
    }

    public static int PayWaveClearAllAIDS() {
        return PaySys.PayWaveClearAllAIDS();
    }

    public static int PayWaveKernelInit() {
        return PaySys.PayWaveKernelInit();
    }

    public static int PciVerifyPlainPin(Context ctx, byte slot, int minLen, int maxLen, int timeout_s, byte[] IccRsp) {
        Log.e("Robert", "PciVerifyPlainPin-----------------------0");
        EmvKeyPadInit(ctx);
        PaySys.SetPadTime(timeout_s);
        int ret = PaySys.OfflinePinPlain(slot, minLen, maxLen, IccRsp);
        return ret;
    }

    public static int PciVerifyCipherPin(Context ctx, byte slot, int minLen, int maxLen, int timeout_s, byte[] modulus, int moduluslen, byte[] exponent, byte[] IccRandom, int IccRandomLen, byte[] IccRsp) {
        EmvKeyPadInit(ctx);
        PaySys.SetPadTime(timeout_s);
        int ret = PaySys.OfflinePinCipher(slot, minLen, maxLen, modulus, moduluslen, exponent, IccRandom, IccRandomLen, IccRsp);
        return ret;
    }
}
