package com.google.zxing.oned;

import android.support.v4.view.MotionEventCompat;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.ChecksumException;
import com.google.zxing.DecodeHintType;
import com.google.zxing.FormatException;
import com.google.zxing.NotFoundException;
import com.google.zxing.Result;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.BitArray;
import java.util.Arrays;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public final class Code39Reader extends OneDReader {
    static final String ALPHABET_STRING = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. *$/+%";
    static final int ASTERISK_ENCODING;
    static final int[] CHARACTER_ENCODINGS;
    private static final String CHECK_DIGIT_STRING = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
    private final int[] counters;
    private final StringBuilder decodeRowResult;
    private final boolean extendedMode;
    private final boolean usingCheckDigit;

    static {
        int[] iArr = {52, 289, 97, 352, 49, 304, 112, 37, 292, 100, 265, 73, 328, 25, 280, 88, 13, 268, 76, 28, 259, 67, 322, 19, 274, 82, 7, 262, 70, 22, 385, 193, 448, 145, 400, 208, 133, 388, 196, 148, 168, 162, 138, 42};
        CHARACTER_ENCODINGS = iArr;
        ASTERISK_ENCODING = iArr[39];
    }

    public Code39Reader() {
        this(false);
    }

    public Code39Reader(boolean usingCheckDigit) {
        this(usingCheckDigit, false);
    }

    public Code39Reader(boolean usingCheckDigit, boolean extendedMode) {
        this.usingCheckDigit = usingCheckDigit;
        this.extendedMode = extendedMode;
        this.decodeRowResult = new StringBuilder(20);
        this.counters = new int[9];
    }

    @Override // com.google.zxing.oned.OneDReader
    public Result decodeRow(int rowNumber, BitArray row, Map<DecodeHintType, ?> hints) throws NotFoundException, ChecksumException, FormatException {
        String resultString;
        Code39Reader code39Reader = this;
        BitArray bitArray = row;
        int[] theCounters = code39Reader.counters;
        Arrays.fill(theCounters, 0);
        StringBuilder result = code39Reader.decodeRowResult;
        result.setLength(0);
        int[] start = findAsteriskPattern(bitArray, theCounters);
        int nextStart = bitArray.getNextSet(start[1]);
        int end = row.getSize();
        while (true) {
            recordPattern(bitArray, nextStart, theCounters);
            int pattern = toNarrowWidePattern(theCounters);
            if (pattern < 0) {
                throw NotFoundException.getNotFoundInstance();
            }
            char decodedChar = patternToChar(pattern);
            result.append(decodedChar);
            int lastStart = nextStart;
            int nextStart2 = nextStart;
            for (int counter : theCounters) {
                nextStart2 += counter;
            }
            nextStart = bitArray.getNextSet(nextStart2);
            if (decodedChar == '*') {
                result.setLength(result.length() - 1);
                int lastPatternSize = 0;
                for (int counter2 : theCounters) {
                    lastPatternSize += counter2;
                }
                int whiteSpaceAfterEnd = (nextStart - lastStart) - lastPatternSize;
                if (nextStart != end && (whiteSpaceAfterEnd << 1) < lastPatternSize) {
                    throw NotFoundException.getNotFoundInstance();
                }
                if (code39Reader.usingCheckDigit) {
                    int max = result.length() - 1;
                    int total = 0;
                    int total2 = 0;
                    while (true) {
                        int i = total2;
                        if (i >= max) {
                            break;
                        }
                        total += CHECK_DIGIT_STRING.indexOf(code39Reader.decodeRowResult.charAt(i));
                        total2 = i + 1;
                    }
                    if (result.charAt(max) != CHECK_DIGIT_STRING.charAt(total % 43)) {
                        throw ChecksumException.getChecksumInstance();
                    }
                    result.setLength(max);
                }
                if (result.length() == 0) {
                    throw NotFoundException.getNotFoundInstance();
                }
                if (code39Reader.extendedMode) {
                    resultString = decodeExtended(result);
                } else {
                    resultString = result.toString();
                }
                float left = (start[1] + start[0]) / 2.0f;
                float right = lastStart + (lastPatternSize / 2.0f);
                return new Result(resultString, null, new ResultPoint[]{new ResultPoint(left, rowNumber), new ResultPoint(right, rowNumber)}, BarcodeFormat.CODE_39);
            }
            code39Reader = this;
            bitArray = row;
        }
    }

    private static int[] findAsteriskPattern(BitArray row, int[] counters) throws NotFoundException {
        int width = row.getSize();
        int rowOffset = row.getNextSet(0);
        boolean isWhite = false;
        int patternLength = counters.length;
        int patternStart = rowOffset;
        int patternStart2 = 0;
        for (int counterPosition = rowOffset; counterPosition < width; counterPosition++) {
            if (row.get(counterPosition) ^ isWhite) {
                counters[patternStart2] = counters[patternStart2] + 1;
            } else {
                if (patternStart2 == patternLength - 1) {
                    if (toNarrowWidePattern(counters) == ASTERISK_ENCODING && row.isRange(Math.max(0, patternStart - ((counterPosition - patternStart) / 2)), patternStart, false)) {
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

    private static int toNarrowWidePattern(int[] counters) {
        int numCounters = counters.length;
        int maxNarrowCounter = 0;
        int i = 0;
        while (true) {
            int minCounter = Integer.MAX_VALUE;
            int counter = i;
            for (int i2 : counters) {
                counter = i2;
                if (i2 < minCounter && counter > maxNarrowCounter) {
                    minCounter = counter;
                }
            }
            maxNarrowCounter = minCounter;
            int pattern = 0;
            int totalWideCountersWidth = 0;
            int wideCounters = 0;
            for (int wideCounters2 = 0; wideCounters2 < numCounters; wideCounters2++) {
                int i3 = counters[wideCounters2];
                counter = i3;
                if (i3 > maxNarrowCounter) {
                    pattern |= 1 << ((numCounters - 1) - wideCounters2);
                    wideCounters++;
                    totalWideCountersWidth += counter;
                }
            }
            if (wideCounters == 3) {
                for (int i4 = 0; i4 < numCounters && wideCounters > 0; i4++) {
                    int counter2 = counters[i4];
                    if (counter2 > maxNarrowCounter) {
                        wideCounters--;
                        if ((counter2 << 1) >= totalWideCountersWidth) {
                            return -1;
                        }
                    }
                }
                return pattern;
            }
            if (wideCounters <= 3) {
                return -1;
            }
            i = counter;
        }
    }

    private static char patternToChar(int pattern) throws NotFoundException {
        for (int i = 0; i < CHARACTER_ENCODINGS.length; i++) {
            if (CHARACTER_ENCODINGS[i] == pattern) {
                return ALPHABET_STRING.charAt(i);
            }
        }
        throw NotFoundException.getNotFoundInstance();
    }

    /* JADX WARN: Can't fix incorrect switch cases order, some code will duplicate */
    private static String decodeExtended(CharSequence encoded) throws FormatException {
        int length = encoded.length();
        StringBuilder decoded = new StringBuilder(length);
        int i = 0;
        while (i < length) {
            char c = encoded.charAt(i);
            if (c == '+' || c == '$' || c == '%' || c == '/') {
                char next = encoded.charAt(i + 1);
                char decodedChar = 0;
                if (c != '+') {
                    if (c != '/') {
                        switch (c) {
                            case MotionEventCompat.AXIS_GENERIC_5 /* 36 */:
                                if (next >= 'A' && next <= 'Z') {
                                    decodedChar = (char) (next - '@');
                                } else {
                                    throw FormatException.getFormatInstance();
                                }
                                break;
                            case MotionEventCompat.AXIS_GENERIC_6 /* 37 */:
                                if (next >= 'A' && next <= 'E') {
                                    decodedChar = (char) (next - '&');
                                } else if (next >= 'F' && next <= 'W') {
                                    decodedChar = (char) (next - 11);
                                } else {
                                    throw FormatException.getFormatInstance();
                                }
                                break;
                        }
                    } else if (next >= 'A' && next <= 'O') {
                        decodedChar = (char) (next - ' ');
                    } else if (next == 'Z') {
                        decodedChar = ':';
                    } else {
                        throw FormatException.getFormatInstance();
                    }
                } else if (next >= 'A' && next <= 'Z') {
                    decodedChar = (char) (next + ' ');
                } else {
                    throw FormatException.getFormatInstance();
                }
                decoded.append(decodedChar);
                i++;
            } else {
                decoded.append(c);
            }
            i++;
        }
        return decoded.toString();
    }
}
