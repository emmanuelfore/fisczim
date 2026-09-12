package com.google.zxing.oned;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.DecodeHintType;
import com.google.zxing.NotFoundException;
import com.google.zxing.Result;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.BitArray;
import java.util.Arrays;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public final class CodaBarReader extends OneDReader {
    private static final float MAX_ACCEPTABLE = 2.0f;
    private static final int MIN_CHARACTER_LENGTH = 3;
    private static final float PADDING = 1.5f;
    private static final String ALPHABET_STRING = "0123456789-$:/.+ABCD";
    static final char[] ALPHABET = ALPHABET_STRING.toCharArray();
    static final int[] CHARACTER_ENCODINGS = {3, 6, 9, 96, 18, 66, 33, 36, 48, 72, 12, 24, 69, 81, 84, 21, 26, 41, 11, 14};
    private static final char[] STARTEND_ENCODING = {'A', 'B', 'C', 'D'};
    private final StringBuilder decodeRowResult = new StringBuilder(20);
    private int[] counters = new int[80];
    private int counterLength = 0;

    @Override // com.google.zxing.oned.OneDReader
    public Result decodeRow(int rowNumber, BitArray row, Map<DecodeHintType, ?> hints) throws NotFoundException {
        CodaBarReader codaBarReader = this;
        Map<DecodeHintType, ?> map = hints;
        Arrays.fill(codaBarReader.counters, 0);
        codaBarReader.setCounters(row);
        int nextStart = findStartPattern();
        codaBarReader.decodeRowResult.setLength(0);
        while (true) {
            int charOffset = codaBarReader.toNarrowWidePattern(nextStart);
            if (charOffset != -1) {
                codaBarReader.decodeRowResult.append((char) charOffset);
                nextStart += 8;
                if ((codaBarReader.decodeRowResult.length() > 1 && arrayContains(STARTEND_ENCODING, ALPHABET[charOffset])) || nextStart >= codaBarReader.counterLength) {
                    break;
                }
                codaBarReader = this;
                map = hints;
            } else {
                throw NotFoundException.getNotFoundInstance();
            }
        }
        int trailingWhitespace = codaBarReader.counters[nextStart - 1];
        int lastPatternSize = 0;
        for (int i = -8; i < -1; i++) {
            lastPatternSize += codaBarReader.counters[nextStart + i];
        }
        if (nextStart < codaBarReader.counterLength && trailingWhitespace < lastPatternSize / 2) {
            throw NotFoundException.getNotFoundInstance();
        }
        codaBarReader.validatePattern(nextStart);
        for (int i2 = 0; i2 < codaBarReader.decodeRowResult.length(); i2++) {
            codaBarReader.decodeRowResult.setCharAt(i2, ALPHABET[codaBarReader.decodeRowResult.charAt(i2)]);
        }
        char startchar = codaBarReader.decodeRowResult.charAt(0);
        if (!arrayContains(STARTEND_ENCODING, startchar)) {
            throw NotFoundException.getNotFoundInstance();
        }
        char endchar = codaBarReader.decodeRowResult.charAt(codaBarReader.decodeRowResult.length() - 1);
        if (!arrayContains(STARTEND_ENCODING, endchar)) {
            throw NotFoundException.getNotFoundInstance();
        }
        if (codaBarReader.decodeRowResult.length() <= 3) {
            throw NotFoundException.getNotFoundInstance();
        }
        if (map == null || !map.containsKey(DecodeHintType.RETURN_CODABAR_START_END)) {
            codaBarReader.decodeRowResult.deleteCharAt(codaBarReader.decodeRowResult.length() - 1);
            codaBarReader.decodeRowResult.deleteCharAt(0);
        }
        int runningCount = 0;
        for (int runningCount2 = 0; runningCount2 < nextStart; runningCount2++) {
            runningCount += codaBarReader.counters[runningCount2];
        }
        float left = runningCount;
        int runningCount3 = runningCount;
        for (int runningCount4 = nextStart; runningCount4 < nextStart - 1; runningCount4++) {
            runningCount3 += codaBarReader.counters[runningCount4];
        }
        float right = runningCount3;
        return new Result(codaBarReader.decodeRowResult.toString(), null, new ResultPoint[]{new ResultPoint(left, rowNumber), new ResultPoint(right, rowNumber)}, BarcodeFormat.CODABAR);
    }

    /* JADX WARN: Code restructure failed: missing block: B:21:0x00c1, code lost:
    
        throw com.google.zxing.NotFoundException.getNotFoundInstance();
     */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    private void validatePattern(int r15) throws com.google.zxing.NotFoundException {
        /*
            Method dump skipped, instruction units count: 228
            To view this dump add '--comments-level debug' option
        */
        throw new UnsupportedOperationException("Method not decompiled: com.google.zxing.oned.CodaBarReader.validatePattern(int):void");
    }

    private void setCounters(BitArray row) throws NotFoundException {
        this.counterLength = 0;
        int i = row.getNextUnset(0);
        int end = row.getSize();
        if (i >= end) {
            throw NotFoundException.getNotFoundInstance();
        }
        boolean isWhite = true;
        int count = 0;
        for (int i2 = i; i2 < end; i2++) {
            if (row.get(i2) ^ isWhite) {
                count++;
            } else {
                counterAppend(count);
                count = 1;
                isWhite = !isWhite;
            }
        }
        counterAppend(count);
    }

    private void counterAppend(int e) {
        this.counters[this.counterLength] = e;
        this.counterLength++;
        if (this.counterLength >= this.counters.length) {
            int[] temp = new int[this.counterLength << 1];
            System.arraycopy(this.counters, 0, temp, 0, this.counterLength);
            this.counters = temp;
        }
    }

    private int findStartPattern() throws NotFoundException {
        for (int i = 1; i < this.counterLength; i += 2) {
            int charOffset = toNarrowWidePattern(i);
            if (charOffset != -1 && arrayContains(STARTEND_ENCODING, ALPHABET[charOffset])) {
                int patternSize = 0;
                for (int patternSize2 = i; patternSize2 < i + 7; patternSize2++) {
                    patternSize += this.counters[patternSize2];
                }
                if (i == 1 || this.counters[i - 1] >= patternSize / 2) {
                    return i;
                }
            }
        }
        throw NotFoundException.getNotFoundInstance();
    }

    static boolean arrayContains(char[] array, char key) {
        if (array != null) {
            for (char c : array) {
                if (c == key) {
                    return true;
                }
            }
        }
        return false;
    }

    private int toNarrowWidePattern(int position) {
        int end = position + 7;
        if (end >= this.counterLength) {
            return -1;
        }
        int[] theCounters = this.counters;
        int maxBar = 0;
        int minBar = Integer.MAX_VALUE;
        for (int maxBar2 = position; maxBar2 < end; maxBar2 += 2) {
            int currentCounter = theCounters[maxBar2];
            if (currentCounter < minBar) {
                minBar = currentCounter;
            }
            if (currentCounter > maxBar) {
                maxBar = currentCounter;
            }
        }
        int j = minBar + maxBar;
        int thresholdBar = j / 2;
        int minSpace = Integer.MAX_VALUE;
        int maxSpace = 0;
        for (int j2 = position + 1; j2 < end; j2 += 2) {
            int currentCounter2 = theCounters[j2];
            if (currentCounter2 < minSpace) {
                minSpace = currentCounter2;
            }
            if (currentCounter2 > maxSpace) {
                maxSpace = currentCounter2;
            }
        }
        int thresholdSpace = (minSpace + maxSpace) / 2;
        int pattern = 0;
        int bitmask = 128;
        for (int bitmask2 = 0; bitmask2 < 7; bitmask2++) {
            int threshold = (bitmask2 & 1) == 0 ? thresholdBar : thresholdSpace;
            bitmask >>= 1;
            if (theCounters[position + bitmask2] > threshold) {
                pattern |= bitmask;
            }
        }
        int i = 0;
        while (true) {
            int i2 = i;
            if (i2 >= CHARACTER_ENCODINGS.length) {
                return -1;
            }
            if (CHARACTER_ENCODINGS[i2] != pattern) {
                i = i2 + 1;
            } else {
                return i2;
            }
        }
    }
}
