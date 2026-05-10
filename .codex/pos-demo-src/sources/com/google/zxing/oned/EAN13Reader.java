package com.google.zxing.oned;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.NotFoundException;
import com.google.zxing.common.BitArray;

/* JADX INFO: loaded from: classes.dex */
public final class EAN13Reader extends UPCEANReader {
    static final int[] FIRST_DIGIT_ENCODINGS = {0, 11, 13, 14, 19, 25, 28, 21, 22, 26};
    private final int[] decodeMiddleCounters = new int[4];

    @Override // com.google.zxing.oned.UPCEANReader
    protected int decodeMiddle(BitArray row, int[] startRange, StringBuilder resultString) throws NotFoundException {
        int[] counters = this.decodeMiddleCounters;
        counters[0] = 0;
        counters[1] = 0;
        counters[2] = 0;
        counters[3] = 0;
        int end = row.getSize();
        int rowOffset = startRange[1];
        int lgPatternFound = 0;
        int lgPatternFound2 = rowOffset;
        int rowOffset2 = 0;
        while (rowOffset2 < 6 && lgPatternFound2 < end) {
            int bestMatch = decodeDigit(row, counters, lgPatternFound2, L_AND_G_PATTERNS);
            resultString.append((char) ((bestMatch % 10) + 48));
            int rowOffset3 = lgPatternFound2;
            for (int counter : counters) {
                rowOffset3 += counter;
            }
            if (bestMatch >= 10) {
                lgPatternFound = (1 << (5 - rowOffset2)) | lgPatternFound;
            }
            rowOffset2++;
            lgPatternFound2 = rowOffset3;
        }
        determineFirstDigit(resultString, lgPatternFound);
        int rowOffset4 = findGuardPattern(row, lgPatternFound2, true, MIDDLE_PATTERN)[1];
        int rowOffset5 = rowOffset4;
        int rowOffset6 = 0;
        while (rowOffset6 < 6 && rowOffset5 < end) {
            resultString.append((char) (decodeDigit(row, counters, rowOffset5, L_PATTERNS) + 48));
            int rowOffset7 = rowOffset5;
            for (int counter2 : counters) {
                rowOffset7 += counter2;
            }
            rowOffset6++;
            rowOffset5 = rowOffset7;
        }
        return rowOffset5;
    }

    @Override // com.google.zxing.oned.UPCEANReader
    BarcodeFormat getBarcodeFormat() {
        return BarcodeFormat.EAN_13;
    }

    private static void determineFirstDigit(StringBuilder resultString, int lgPatternFound) throws NotFoundException {
        for (int d = 0; d < 10; d++) {
            if (lgPatternFound == FIRST_DIGIT_ENCODINGS[d]) {
                resultString.insert(0, (char) (d + 48));
                return;
            }
        }
        throw NotFoundException.getNotFoundInstance();
    }
}
