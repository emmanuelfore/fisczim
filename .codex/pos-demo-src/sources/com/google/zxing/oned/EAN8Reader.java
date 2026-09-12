package com.google.zxing.oned;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.NotFoundException;
import com.google.zxing.common.BitArray;

/* JADX INFO: loaded from: classes.dex */
public final class EAN8Reader extends UPCEANReader {
    private final int[] decodeMiddleCounters = new int[4];

    @Override // com.google.zxing.oned.UPCEANReader
    protected int decodeMiddle(BitArray row, int[] startRange, StringBuilder result) throws NotFoundException {
        int[] counters = this.decodeMiddleCounters;
        counters[0] = 0;
        counters[1] = 0;
        counters[2] = 0;
        counters[3] = 0;
        int end = row.getSize();
        int rowOffset = startRange[1];
        int rowOffset2 = rowOffset;
        int rowOffset3 = 0;
        while (rowOffset3 < 4 && rowOffset2 < end) {
            int bestMatch = decodeDigit(row, counters, rowOffset2, L_PATTERNS);
            result.append((char) (bestMatch + 48));
            int rowOffset4 = rowOffset2;
            for (int counter : counters) {
                rowOffset4 += counter;
            }
            rowOffset3++;
            rowOffset2 = rowOffset4;
        }
        int rowOffset5 = findGuardPattern(row, rowOffset2, true, MIDDLE_PATTERN)[1];
        int rowOffset6 = 0;
        while (rowOffset6 < 4 && rowOffset5 < end) {
            int bestMatch2 = decodeDigit(row, counters, rowOffset5, L_PATTERNS);
            result.append((char) (bestMatch2 + 48));
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
        return BarcodeFormat.EAN_8;
    }
}
