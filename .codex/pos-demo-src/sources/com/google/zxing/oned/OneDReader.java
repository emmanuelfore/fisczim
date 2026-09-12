package com.google.zxing.oned;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.ChecksumException;
import com.google.zxing.DecodeHintType;
import com.google.zxing.FormatException;
import com.google.zxing.NotFoundException;
import com.google.zxing.Reader;
import com.google.zxing.Result;
import com.google.zxing.ResultMetadataType;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.BitArray;
import java.util.Arrays;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public abstract class OneDReader implements Reader {
    public abstract Result decodeRow(int i, BitArray bitArray, Map<DecodeHintType, ?> map) throws NotFoundException, ChecksumException, FormatException;

    @Override // com.google.zxing.Reader
    public Result decode(BinaryBitmap image) throws NotFoundException, FormatException {
        return decode(image, null);
    }

    @Override // com.google.zxing.Reader
    public Result decode(BinaryBitmap image, Map<DecodeHintType, ?> hints) throws NotFoundException, ChecksumException, FormatException {
        try {
            return doDecode(image, hints);
        } catch (NotFoundException nfe) {
            if ((hints != null && hints.containsKey(DecodeHintType.TRY_HARDER)) && image.isRotateSupported()) {
                BinaryBitmap rotatedImage = image.rotateCounterClockwise();
                Result result = doDecode(rotatedImage, hints);
                Map<ResultMetadataType, ?> metadata = result.getResultMetadata();
                int orientation = 270;
                if (metadata != null && metadata.containsKey(ResultMetadataType.ORIENTATION)) {
                    orientation = (((Integer) metadata.get(ResultMetadataType.ORIENTATION)).intValue() + 270) % 360;
                }
                result.putMetadata(ResultMetadataType.ORIENTATION, Integer.valueOf(orientation));
                ResultPoint[] points = result.getResultPoints();
                if (points != null) {
                    int height = rotatedImage.getHeight();
                    for (int i = 0; i < points.length; i++) {
                        points[i] = new ResultPoint((height - points[i].getY()) - 1.0f, points[i].getX());
                    }
                }
                return result;
            }
            throw nfe;
        }
    }

    @Override // com.google.zxing.Reader
    public void reset() {
    }

    /* JADX WARN: Code restructure failed: missing block: B:73:0x012f, code lost:
    
        throw com.google.zxing.NotFoundException.getNotFoundInstance();
     */
    /* JADX WARN: Multi-variable type inference failed */
    /* JADX WARN: Type inference failed for: r13v0 */
    /* JADX WARN: Type inference failed for: r13v1 */
    /* JADX WARN: Type inference failed for: r13v10 */
    /* JADX WARN: Type inference failed for: r13v11 */
    /* JADX WARN: Type inference failed for: r13v12 */
    /* JADX WARN: Type inference failed for: r13v13 */
    /* JADX WARN: Type inference failed for: r13v14 */
    /* JADX WARN: Type inference failed for: r13v2 */
    /* JADX WARN: Type inference failed for: r13v3 */
    /* JADX WARN: Type inference failed for: r13v4 */
    /* JADX WARN: Type inference failed for: r13v5 */
    /* JADX WARN: Type inference failed for: r13v6, types: [com.google.zxing.Result] */
    /* JADX WARN: Type inference failed for: r13v8 */
    /* JADX WARN: Type inference failed for: r13v9 */
    /* JADX WARN: Type inference failed for: r4v13 */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    private com.google.zxing.Result doDecode(com.google.zxing.BinaryBitmap r25, java.util.Map<com.google.zxing.DecodeHintType, ?> r26) throws com.google.zxing.NotFoundException, com.google.zxing.ChecksumException, com.google.zxing.FormatException {
        /*
            Method dump skipped, instruction units count: 304
            To view this dump add '--comments-level debug' option
        */
        throw new UnsupportedOperationException("Method not decompiled: com.google.zxing.oned.OneDReader.doDecode(com.google.zxing.BinaryBitmap, java.util.Map):com.google.zxing.Result");
    }

    protected static void recordPattern(BitArray row, int start, int[] counters) throws NotFoundException {
        int numCounters = counters.length;
        Arrays.fill(counters, 0, numCounters, 0);
        int end = row.getSize();
        if (start >= end) {
            throw NotFoundException.getNotFoundInstance();
        }
        boolean isWhite = !row.get(start);
        int counterPosition = 0;
        boolean isWhite2 = isWhite;
        int i = start;
        while (i < end) {
            if (row.get(i) ^ isWhite2) {
                counters[counterPosition] = counters[counterPosition] + 1;
            } else {
                counterPosition++;
                if (counterPosition == numCounters) {
                    break;
                }
                counters[counterPosition] = 1;
                isWhite2 = !isWhite2;
            }
            i++;
        }
        if (counterPosition != numCounters) {
            if (counterPosition != numCounters - 1 || i != end) {
                throw NotFoundException.getNotFoundInstance();
            }
        }
    }

    protected static void recordPatternInReverse(BitArray row, int start, int[] counters) throws NotFoundException {
        int numTransitionsLeft = counters.length;
        boolean last = row.get(start);
        while (start > 0 && numTransitionsLeft >= 0) {
            start--;
            if (row.get(start) != last) {
                numTransitionsLeft--;
                last = !last;
            }
        }
        if (numTransitionsLeft >= 0) {
            throw NotFoundException.getNotFoundInstance();
        }
        recordPattern(row, start + 1, counters);
    }

    protected static float patternMatchVariance(int[] counters, int[] pattern, float maxIndividualVariance) {
        int numCounters = counters.length;
        int patternLength = 0;
        int patternLength2 = 0;
        for (int total = 0; total < numCounters; total++) {
            patternLength2 += counters[total];
            patternLength += pattern[total];
        }
        if (patternLength2 < patternLength) {
            return Float.POSITIVE_INFINITY;
        }
        float unitBarWidth = patternLength2 / patternLength;
        float maxIndividualVariance2 = maxIndividualVariance * unitBarWidth;
        float totalVariance = 0.0f;
        for (int x = 0; x < numCounters; x++) {
            int counter = counters[x];
            float scaledPattern = pattern[x] * unitBarWidth;
            float f = ((float) counter) > scaledPattern ? counter - scaledPattern : scaledPattern - counter;
            float variance = f;
            if (f > maxIndividualVariance2) {
                return Float.POSITIVE_INFINITY;
            }
            totalVariance += variance;
        }
        return totalVariance / patternLength2;
    }
}
