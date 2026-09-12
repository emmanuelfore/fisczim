package com.google.zxing.oned;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.NotFoundException;
import com.google.zxing.Result;
import com.google.zxing.ResultMetadataType;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.BitArray;
import java.util.EnumMap;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
final class UPCEANExtension5Support {
    private static final int[] CHECK_DIGIT_ENCODINGS = {24, 20, 18, 17, 12, 6, 3, 10, 9, 5};
    private final int[] decodeMiddleCounters = new int[4];
    private final StringBuilder decodeRowStringBuffer = new StringBuilder();

    UPCEANExtension5Support() {
    }

    Result decodeRow(int rowNumber, BitArray row, int[] extensionStartRange) throws NotFoundException {
        StringBuilder result = this.decodeRowStringBuffer;
        result.setLength(0);
        int end = decodeMiddle(row, extensionStartRange, result);
        String resultString = result.toString();
        Map<ResultMetadataType, Object> extensionData = parseExtensionString(resultString);
        Result extensionResult = new Result(resultString, null, new ResultPoint[]{new ResultPoint((extensionStartRange[0] + extensionStartRange[1]) / 2.0f, rowNumber), new ResultPoint(end, rowNumber)}, BarcodeFormat.UPC_EAN_EXTENSION);
        if (extensionData != null) {
            extensionResult.putAllMetadata(extensionData);
        }
        return extensionResult;
    }

    private int decodeMiddle(BitArray row, int[] startRange, StringBuilder resultString) throws NotFoundException {
        int[] counters = this.decodeMiddleCounters;
        counters[0] = 0;
        counters[1] = 0;
        counters[2] = 0;
        counters[3] = 0;
        int end = row.getSize();
        int rowOffset = startRange[1];
        int lgPatternFound = 0;
        int rowOffset2 = rowOffset;
        for (int rowOffset3 = 0; rowOffset3 < 5 && rowOffset2 < end; rowOffset3++) {
            int bestMatch = UPCEANReader.decodeDigit(row, counters, rowOffset2, UPCEANReader.L_AND_G_PATTERNS);
            resultString.append((char) ((bestMatch % 10) + 48));
            int rowOffset4 = rowOffset2;
            for (int counter : counters) {
                rowOffset4 += counter;
            }
            if (bestMatch >= 10) {
                lgPatternFound |= 1 << (4 - rowOffset3);
            }
            if (rowOffset3 == 4) {
                rowOffset2 = rowOffset4;
            } else {
                rowOffset2 = row.getNextUnset(row.getNextSet(rowOffset4));
            }
        }
        if (resultString.length() != 5) {
            throw NotFoundException.getNotFoundInstance();
        }
        int checkDigit = determineCheckDigit(lgPatternFound);
        if (extensionChecksum(resultString.toString()) != checkDigit) {
            throw NotFoundException.getNotFoundInstance();
        }
        return rowOffset2;
    }

    private static int extensionChecksum(CharSequence s) {
        int length = s.length();
        int sum = 0;
        for (int i = length - 2; i >= 0; i -= 2) {
            sum += s.charAt(i) - '0';
        }
        int sum2 = sum * 3;
        for (int i2 = length - 1; i2 >= 0; i2 -= 2) {
            sum2 += s.charAt(i2) - '0';
        }
        int i3 = sum2 * 3;
        return i3 % 10;
    }

    private static int determineCheckDigit(int lgPatternFound) throws NotFoundException {
        for (int d = 0; d < 10; d++) {
            if (lgPatternFound == CHECK_DIGIT_ENCODINGS[d]) {
                return d;
            }
        }
        throw NotFoundException.getNotFoundInstance();
    }

    private static Map<ResultMetadataType, Object> parseExtensionString(String raw) {
        Object extension5String;
        if (raw.length() != 5 || (extension5String = parseExtension5String(raw)) == null) {
            return null;
        }
        Map<ResultMetadataType, Object> result = new EnumMap<>(ResultMetadataType.class);
        result.put(ResultMetadataType.SUGGESTED_PRICE, extension5String);
        return result;
    }

    private static String parseExtension5String(String raw) {
        String currency;
        String hundredthsString;
        char cCharAt = raw.charAt(0);
        if (cCharAt == '0') {
            currency = "£";
        } else if (cCharAt == '5') {
            currency = "$";
        } else if (cCharAt == '9') {
            if ("90000".equals(raw)) {
                return null;
            }
            if ("99991".equals(raw)) {
                return "0.00";
            }
            if ("99990".equals(raw)) {
                return "Used";
            }
            currency = "";
        } else {
            currency = "";
        }
        int rawAmount = Integer.parseInt(raw.substring(1));
        String unitsString = String.valueOf(rawAmount / 100);
        int hundredths = rawAmount % 100;
        if (hundredths < 10) {
            hundredthsString = "0" + hundredths;
        } else {
            hundredthsString = String.valueOf(hundredths);
        }
        return currency + unitsString + '.' + hundredthsString;
    }
}
