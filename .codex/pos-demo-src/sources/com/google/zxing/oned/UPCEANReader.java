package com.google.zxing.oned;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.ChecksumException;
import com.google.zxing.DecodeHintType;
import com.google.zxing.FormatException;
import com.google.zxing.NotFoundException;
import com.google.zxing.ReaderException;
import com.google.zxing.Result;
import com.google.zxing.ResultMetadataType;
import com.google.zxing.ResultPoint;
import com.google.zxing.ResultPointCallback;
import com.google.zxing.common.BitArray;
import java.util.Arrays;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public abstract class UPCEANReader extends OneDReader {
    private static final float MAX_AVG_VARIANCE = 0.48f;
    private static final float MAX_INDIVIDUAL_VARIANCE = 0.7f;
    static final int[] START_END_PATTERN = {1, 1, 1};
    static final int[] MIDDLE_PATTERN = {1, 1, 1, 1, 1};
    static final int[] END_PATTERN = {1, 1, 1, 1, 1, 1};
    static final int[][] L_PATTERNS = {new int[]{3, 2, 1, 1}, new int[]{2, 2, 2, 1}, new int[]{2, 1, 2, 2}, new int[]{1, 4, 1, 1}, new int[]{1, 1, 3, 2}, new int[]{1, 2, 3, 1}, new int[]{1, 1, 1, 4}, new int[]{1, 3, 1, 2}, new int[]{1, 2, 1, 3}, new int[]{3, 1, 1, 2}};
    static final int[][] L_AND_G_PATTERNS = new int[20][];
    private final StringBuilder decodeRowStringBuffer = new StringBuilder(20);
    private final UPCEANExtensionSupport extensionReader = new UPCEANExtensionSupport();
    private final EANManufacturerOrgSupport eanManSupport = new EANManufacturerOrgSupport();

    protected abstract int decodeMiddle(BitArray bitArray, int[] iArr, StringBuilder sb) throws NotFoundException;

    abstract BarcodeFormat getBarcodeFormat();

    static {
        int i = 10;
        System.arraycopy(L_PATTERNS, 0, L_AND_G_PATTERNS, 0, 10);
        while (true) {
            int i2 = i;
            if (i2 < 20) {
                int[] widths = L_PATTERNS[i2 - 10];
                int[] reversedWidths = new int[widths.length];
                for (int j = 0; j < widths.length; j++) {
                    reversedWidths[j] = widths[(widths.length - j) - 1];
                }
                L_AND_G_PATTERNS[i2] = reversedWidths;
                i = i2 + 1;
            } else {
                return;
            }
        }
    }

    protected UPCEANReader() {
    }

    static int[] findStartGuardPattern(BitArray row) throws NotFoundException {
        boolean foundStart = false;
        int[] startRange = null;
        int nextStart = 0;
        int[] counters = new int[START_END_PATTERN.length];
        while (!foundStart) {
            Arrays.fill(counters, 0, START_END_PATTERN.length, 0);
            int[] iArrFindGuardPattern = findGuardPattern(row, nextStart, false, START_END_PATTERN, counters);
            startRange = iArrFindGuardPattern;
            int start = iArrFindGuardPattern[0];
            nextStart = startRange[1];
            int quietStart = start - (nextStart - start);
            if (quietStart >= 0) {
                foundStart = row.isRange(quietStart, start, false);
            }
        }
        return startRange;
    }

    @Override // com.google.zxing.oned.OneDReader
    public Result decodeRow(int rowNumber, BitArray row, Map<DecodeHintType, ?> hints) throws NotFoundException, ChecksumException, FormatException {
        return decodeRow(rowNumber, row, findStartGuardPattern(row), hints);
    }

    public Result decodeRow(int rowNumber, BitArray row, int[] startGuardRange, Map<DecodeHintType, ?> hints) throws NotFoundException, ChecksumException, FormatException {
        Result extensionResult;
        String countryID;
        boolean valid;
        ResultPointCallback resultPointCallback = hints == null ? null : (ResultPointCallback) hints.get(DecodeHintType.NEED_RESULT_POINT_CALLBACK);
        ResultPointCallback resultPointCallback2 = resultPointCallback;
        if (resultPointCallback != null) {
            resultPointCallback2.foundPossibleResultPoint(new ResultPoint((startGuardRange[0] + startGuardRange[1]) / 2.0f, rowNumber));
        }
        StringBuilder result = this.decodeRowStringBuffer;
        result.setLength(0);
        int endStart = decodeMiddle(row, startGuardRange, result);
        if (resultPointCallback2 != null) {
            resultPointCallback2.foundPossibleResultPoint(new ResultPoint(endStart, rowNumber));
        }
        int[] endRange = decodeEnd(row, endStart);
        if (resultPointCallback2 != null) {
            resultPointCallback2.foundPossibleResultPoint(new ResultPoint((endRange[0] + endRange[1]) / 2.0f, rowNumber));
        }
        int end = endRange[1];
        int quietEnd = end + (end - endRange[0]);
        if (quietEnd >= row.getSize() || !row.isRange(end, quietEnd, false)) {
            throw NotFoundException.getNotFoundInstance();
        }
        String resultString = result.toString();
        if (resultString.length() < 8) {
            throw FormatException.getFormatInstance();
        }
        if (!checkChecksum(resultString)) {
            throw ChecksumException.getChecksumInstance();
        }
        float left = (startGuardRange[1] + startGuardRange[0]) / 2.0f;
        float right = (endRange[1] + endRange[0]) / 2.0f;
        BarcodeFormat format = getBarcodeFormat();
        Result decodeResult = new Result(resultString, null, new ResultPoint[]{new ResultPoint(left, rowNumber), new ResultPoint(right, rowNumber)}, format);
        int extensionLength = 0;
        try {
            extensionResult = this.extensionReader.decodeRow(rowNumber, row, endRange[1]);
            try {
                decodeResult.putMetadata(ResultMetadataType.UPC_EAN_EXTENSION, extensionResult.getText());
                decodeResult.putAllMetadata(extensionResult.getResultMetadata());
                decodeResult.addResultPoints(extensionResult.getResultPoints());
                extensionLength = extensionResult.getText().length();
            } catch (ReaderException e) {
            }
        } catch (ReaderException e2) {
            extensionResult = null;
        }
        int[] iArr = hints == null ? null : (int[]) hints.get(DecodeHintType.ALLOWED_EAN_EXTENSIONS);
        int[] allowedExtensions = iArr;
        if (iArr != null) {
            int length = allowedExtensions.length;
            int i = 0;
            while (true) {
                if (i < length) {
                    int length2 = allowedExtensions[i];
                    if (extensionLength != length2) {
                        i++;
                    } else {
                        valid = true;
                        break;
                    }
                } else {
                    valid = false;
                    break;
                }
            }
            if (!valid) {
                throw NotFoundException.getNotFoundInstance();
            }
        }
        if ((format == BarcodeFormat.EAN_13 || format == BarcodeFormat.UPC_A) && (countryID = this.eanManSupport.lookupCountryIdentifier(resultString)) != null) {
            decodeResult.putMetadata(ResultMetadataType.POSSIBLE_COUNTRY, countryID);
        }
        return decodeResult;
    }

    boolean checkChecksum(String s) throws FormatException {
        return checkStandardUPCEANChecksum(s);
    }

    static boolean checkStandardUPCEANChecksum(CharSequence s) throws FormatException {
        int length = s.length();
        if (length == 0) {
            return false;
        }
        int sum = 0;
        for (int i = length - 2; i >= 0; i -= 2) {
            int digit = s.charAt(i) - '0';
            if (digit < 0 || digit > 9) {
                throw FormatException.getFormatInstance();
            }
            sum += digit;
        }
        int sum2 = sum * 3;
        for (int i2 = length - 1; i2 >= 0; i2 -= 2) {
            int digit2 = s.charAt(i2) - '0';
            if (digit2 < 0 || digit2 > 9) {
                throw FormatException.getFormatInstance();
            }
            sum2 += digit2;
        }
        return sum2 % 10 == 0;
    }

    int[] decodeEnd(BitArray row, int endStart) throws NotFoundException {
        return findGuardPattern(row, endStart, false, START_END_PATTERN);
    }

    static int[] findGuardPattern(BitArray row, int rowOffset, boolean whiteFirst, int[] pattern) throws NotFoundException {
        return findGuardPattern(row, rowOffset, whiteFirst, pattern, new int[pattern.length]);
    }

    private static int[] findGuardPattern(BitArray row, int rowOffset, boolean whiteFirst, int[] pattern, int[] counters) throws NotFoundException {
        int width = row.getSize();
        int rowOffset2 = whiteFirst ? row.getNextUnset(rowOffset) : row.getNextSet(rowOffset);
        int patternLength = pattern.length;
        boolean isWhite = whiteFirst;
        int patternStart = rowOffset2;
        int patternStart2 = 0;
        for (int counterPosition = rowOffset2; counterPosition < width; counterPosition++) {
            if (row.get(counterPosition) ^ isWhite) {
                counters[patternStart2] = counters[patternStart2] + 1;
            } else {
                if (patternStart2 == patternLength - 1) {
                    if (patternMatchVariance(counters, pattern, MAX_INDIVIDUAL_VARIANCE) < MAX_AVG_VARIANCE) {
                        return new int[]{patternStart, counterPosition};
                    }
                    patternStart += counters[0] + counters[1];
                    System.arraycopy(counters, 2, counters, 0, patternLength - 2);
                    counters[patternLength - 2] = 0;
                    counters[patternLength - 1] = 0;
                    patternStart2--;
                } else {
                    patternStart2++;
                }
                counters[patternStart2] = 1;
                isWhite = isWhite ? false : true;
            }
        }
        throw NotFoundException.getNotFoundInstance();
    }

    static int decodeDigit(BitArray row, int[] counters, int rowOffset, int[][] patterns) throws NotFoundException {
        recordPattern(row, rowOffset, counters);
        float bestVariance = MAX_AVG_VARIANCE;
        int bestMatch = -1;
        int max = patterns.length;
        for (int i = 0; i < max; i++) {
            int[] pattern = patterns[i];
            float variance = patternMatchVariance(counters, pattern, MAX_INDIVIDUAL_VARIANCE);
            if (variance < bestVariance) {
                bestVariance = variance;
                bestMatch = i;
            }
        }
        if (bestMatch >= 0) {
            return bestMatch;
        }
        throw NotFoundException.getNotFoundInstance();
    }
}
