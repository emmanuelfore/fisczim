package com.google.zxing.common;

import com.google.zxing.Binarizer;
import com.google.zxing.LuminanceSource;
import com.google.zxing.NotFoundException;

/* JADX INFO: loaded from: classes.dex */
public class GlobalHistogramBinarizer extends Binarizer {
    private static final byte[] EMPTY = new byte[0];
    private static final int LUMINANCE_BITS = 5;
    private static final int LUMINANCE_BUCKETS = 32;
    private static final int LUMINANCE_SHIFT = 3;
    private final int[] buckets;
    private byte[] luminances;

    public GlobalHistogramBinarizer(LuminanceSource source) {
        super(source);
        this.luminances = EMPTY;
        this.buckets = new int[32];
    }

    @Override // com.google.zxing.Binarizer
    public BitArray getBlackRow(int y, BitArray row) throws NotFoundException {
        int x;
        LuminanceSource source = getLuminanceSource();
        int width = source.getWidth();
        if (row == null || row.getSize() < width) {
            row = new BitArray(width);
        } else {
            row.clear();
        }
        initArrays(width);
        byte[] localLuminances = source.getRow(y, this.luminances);
        int[] localBuckets = this.buckets;
        int x2 = 0;
        while (true) {
            if (x2 >= width) {
                break;
            }
            int i = (localLuminances[x2] & 255) >> 3;
            localBuckets[i] = localBuckets[i] + 1;
            x2++;
        }
        int blackPoint = estimateBlackPoint(localBuckets);
        if (width < 3) {
            for (int x3 = 0; x3 < width; x3++) {
                if ((localLuminances[x3] & 255) < blackPoint) {
                    row.set(x3);
                }
            }
        } else {
            int x4 = localLuminances[0];
            int left = x4 & 255;
            int center = localLuminances[1] & 255;
            for (x = 1; x < width - 1; x++) {
                int right = localLuminances[x + 1] & 255;
                if ((((center << 2) - left) - right) / 2 < blackPoint) {
                    row.set(x);
                }
                left = center;
                center = right;
            }
        }
        return row;
    }

    @Override // com.google.zxing.Binarizer
    public BitMatrix getBlackMatrix() throws NotFoundException {
        LuminanceSource source = getLuminanceSource();
        int width = source.getWidth();
        int height = source.getHeight();
        BitMatrix matrix = new BitMatrix(width, height);
        initArrays(width);
        int[] localBuckets = this.buckets;
        int pixel = 0;
        for (int y = 1; y < 5; y++) {
            int row = (height * y) / 5;
            byte[] localLuminances = source.getRow(row, this.luminances);
            int right = (width << 2) / 5;
            for (int x = width / 5; x < right; x++) {
                pixel = localLuminances[x] & 255;
                int i = pixel >> 3;
                localBuckets[i] = localBuckets[i] + 1;
            }
        }
        int blackPoint = estimateBlackPoint(localBuckets);
        byte[] localLuminances2 = source.getMatrix();
        int i2 = pixel;
        int y2 = 0;
        while (y2 < height) {
            int offset = y2 * width;
            int i3 = i2;
            for (int x2 = 0; x2 < width; x2++) {
                if ((localLuminances2[offset + x2] & 255) < blackPoint) {
                    matrix.set(x2, y2);
                }
            }
            y2++;
            i2 = i3;
        }
        return matrix;
    }

    @Override // com.google.zxing.Binarizer
    public Binarizer createBinarizer(LuminanceSource source) {
        return new GlobalHistogramBinarizer(source);
    }

    private void initArrays(int luminanceSize) {
        if (this.luminances.length < luminanceSize) {
            this.luminances = new byte[luminanceSize];
        }
        for (int x = 0; x < 32; x++) {
            this.buckets[x] = 0;
        }
    }

    private static int estimateBlackPoint(int[] buckets) throws NotFoundException {
        int numBuckets = buckets.length;
        int firstPeak = 0;
        int firstPeakSize = 0;
        int maxBucketCount = 0;
        for (int maxBucketCount2 = 0; maxBucketCount2 < numBuckets; maxBucketCount2++) {
            if (buckets[maxBucketCount2] > firstPeakSize) {
                firstPeak = maxBucketCount2;
                firstPeakSize = buckets[maxBucketCount2];
            }
            if (buckets[maxBucketCount2] > maxBucketCount) {
                maxBucketCount = buckets[maxBucketCount2];
            }
        }
        int secondPeak = 0;
        int secondPeakScore = 0;
        for (int secondPeak2 = 0; secondPeak2 < numBuckets; secondPeak2++) {
            int distanceToBiggest = secondPeak2 - firstPeak;
            int score = buckets[secondPeak2] * distanceToBiggest * distanceToBiggest;
            if (score > secondPeakScore) {
                secondPeak = secondPeak2;
                secondPeakScore = score;
            }
        }
        if (firstPeak > secondPeak) {
            int temp = firstPeak;
            firstPeak = secondPeak;
            secondPeak = temp;
        }
        int temp2 = secondPeak - firstPeak;
        if (temp2 <= numBuckets / 16) {
            throw NotFoundException.getNotFoundInstance();
        }
        int bestValley = secondPeak - 1;
        int bestValleyScore = -1;
        for (int x = secondPeak - 1; x > firstPeak; x--) {
            int i = x - firstPeak;
            int score2 = i * i * (secondPeak - x) * (maxBucketCount - buckets[x]);
            if (score2 > bestValleyScore) {
                bestValley = x;
                bestValleyScore = score2;
            }
        }
        return bestValley << 3;
    }
}
