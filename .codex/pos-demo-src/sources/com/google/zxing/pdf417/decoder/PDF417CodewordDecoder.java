package com.google.zxing.pdf417.decoder;

import com.google.zxing.common.detector.MathUtils;
import com.google.zxing.pdf417.PDF417Common;
import java.lang.reflect.Array;

/* JADX INFO: loaded from: classes.dex */
final class PDF417CodewordDecoder {
    private static final float[][] RATIOS_TABLE = (float[][]) Array.newInstance((Class<?>) float.class, PDF417Common.SYMBOL_TABLE.length, 8);

    static {
        for (int i = 0; i < PDF417Common.SYMBOL_TABLE.length; i++) {
            int currentSymbol = PDF417Common.SYMBOL_TABLE[i];
            int currentBit = currentSymbol & 1;
            int currentBit2 = currentBit;
            int currentSymbol2 = currentSymbol;
            for (int currentSymbol3 = 0; currentSymbol3 < 8; currentSymbol3++) {
                float size = 0.0f;
                while ((currentSymbol2 & 1) == currentBit2) {
                    size += 1.0f;
                    currentSymbol2 >>= 1;
                }
                currentBit2 = currentSymbol2 & 1;
                RATIOS_TABLE[i][(8 - currentSymbol3) - 1] = size / 17.0f;
            }
        }
    }

    private PDF417CodewordDecoder() {
    }

    static int getDecodedValue(int[] moduleBitCount) {
        int decodedValue = getDecodedCodewordValue(sampleBitCounts(moduleBitCount));
        if (decodedValue != -1) {
            return decodedValue;
        }
        return getClosestDecodedValue(moduleBitCount);
    }

    private static int[] sampleBitCounts(int[] moduleBitCount) {
        float bitCountSum = MathUtils.sum(moduleBitCount);
        int[] result = new int[8];
        int bitCountIndex = 0;
        int sumPreviousBits = 0;
        for (int i = 0; i < 17; i++) {
            float sampleIndex = (bitCountSum / 34.0f) + ((i * bitCountSum) / 17.0f);
            if (moduleBitCount[bitCountIndex] + sumPreviousBits <= sampleIndex) {
                sumPreviousBits += moduleBitCount[bitCountIndex];
                bitCountIndex++;
            }
            result[bitCountIndex] = result[bitCountIndex] + 1;
        }
        return result;
    }

    private static int getDecodedCodewordValue(int[] moduleBitCount) {
        int decodedValue = getBitValue(moduleBitCount);
        if (PDF417Common.getCodeword(decodedValue) == -1) {
            return -1;
        }
        return decodedValue;
    }

    private static int getBitValue(int[] moduleBitCount) {
        long result = 0;
        for (int i = 0; i < moduleBitCount.length; i++) {
            for (int bit = 0; bit < moduleBitCount[i]; bit++) {
                int i2 = 1;
                long j = result << 1;
                if (i % 2 != 0) {
                    i2 = 0;
                }
                result = j | ((long) i2);
            }
        }
        int i3 = (int) result;
        return i3;
    }

    private static int getClosestDecodedValue(int[] moduleBitCount) {
        int bitCountSum = MathUtils.sum(moduleBitCount);
        float[] bitCountRatios = new float[8];
        for (int i = 0; i < 8; i++) {
            bitCountRatios[i] = moduleBitCount[i] / bitCountSum;
        }
        int bestMatch = -1;
        float bestMatchError = Float.MAX_VALUE;
        for (int j = 0; j < RATIOS_TABLE.length; j++) {
            float[] ratioTableRow = RATIOS_TABLE[j];
            float error = 0.0f;
            for (int k = 0; k < 8; k++) {
                float diff = ratioTableRow[k] - bitCountRatios[k];
                float f = (diff * diff) + error;
                error = f;
                if (f >= bestMatchError) {
                    break;
                }
            }
            if (error < bestMatchError) {
                bestMatchError = error;
                bestMatch = PDF417Common.SYMBOL_TABLE[j];
            }
        }
        return bestMatch;
    }
}
