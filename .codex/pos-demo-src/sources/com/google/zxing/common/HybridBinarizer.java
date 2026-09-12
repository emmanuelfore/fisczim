package com.google.zxing.common;

import com.google.zxing.Binarizer;
import com.google.zxing.LuminanceSource;
import com.google.zxing.NotFoundException;
import java.lang.reflect.Array;

/* JADX INFO: loaded from: classes.dex */
public final class HybridBinarizer extends GlobalHistogramBinarizer {
    private static final int BLOCK_SIZE = 8;
    private static final int BLOCK_SIZE_MASK = 7;
    private static final int BLOCK_SIZE_POWER = 3;
    private static final int MINIMUM_DIMENSION = 40;
    private static final int MIN_DYNAMIC_RANGE = 24;
    private BitMatrix matrix;

    public HybridBinarizer(LuminanceSource source) {
        super(source);
    }

    @Override // com.google.zxing.common.GlobalHistogramBinarizer, com.google.zxing.Binarizer
    public BitMatrix getBlackMatrix() throws NotFoundException {
        if (this.matrix != null) {
            return this.matrix;
        }
        LuminanceSource source = getLuminanceSource();
        int width = source.getWidth();
        int height = source.getHeight();
        if (width >= 40 && height >= 40) {
            byte[] luminances = source.getMatrix();
            int subWidth = width >> 3;
            if ((width & 7) != 0) {
                subWidth++;
            }
            int subWidth2 = subWidth;
            int subHeight = height >> 3;
            if ((height & 7) != 0) {
                subHeight++;
            }
            int subHeight2 = subHeight;
            int[][] blackPoints = calculateBlackPoints(luminances, subWidth2, subHeight2, width, height);
            BitMatrix newMatrix = new BitMatrix(width, height);
            calculateThresholdForBlock(luminances, subWidth2, subHeight2, width, height, blackPoints, newMatrix);
            this.matrix = newMatrix;
        } else {
            this.matrix = super.getBlackMatrix();
        }
        return this.matrix;
    }

    @Override // com.google.zxing.common.GlobalHistogramBinarizer, com.google.zxing.Binarizer
    public Binarizer createBinarizer(LuminanceSource source) {
        return new HybridBinarizer(source);
    }

    private static void calculateThresholdForBlock(byte[] luminances, int subWidth, int subHeight, int width, int height, int[][] blackPoints, BitMatrix matrix) {
        for (int y = 0; y < subHeight; y++) {
            int yoffset = y << 3;
            int maxYOffset = height - 8;
            if (yoffset > maxYOffset) {
                yoffset = maxYOffset;
            }
            int x = 0;
            while (true) {
                int x2 = x;
                if (x2 < subWidth) {
                    int xoffset = x2 << 3;
                    int maxXOffset = width - 8;
                    if (xoffset > maxXOffset) {
                        xoffset = maxXOffset;
                    }
                    int xoffset2 = xoffset;
                    int left = cap(x2, 2, subWidth - 3);
                    int top = cap(y, 2, subHeight - 3);
                    int z = -2;
                    int sum = 0;
                    while (true) {
                        int sum2 = z;
                        if (sum2 <= 2) {
                            int[] blackRow = blackPoints[top + sum2];
                            sum += blackRow[left - 2] + blackRow[left - 1] + blackRow[left] + blackRow[left + 1] + blackRow[left + 2];
                            z = sum2 + 1;
                        }
                    }
                    int average = sum / 25;
                    thresholdBlock(luminances, xoffset2, yoffset, average, width, matrix);
                    x = x2 + 1;
                }
            }
        }
    }

    private static int cap(int value, int min, int max) {
        return value < min ? min : value > max ? max : value;
    }

    private static void thresholdBlock(byte[] luminances, int xoffset, int yoffset, int threshold, int stride, BitMatrix matrix) {
        int y = 0;
        int offset = (yoffset * stride) + xoffset;
        while (y < 8) {
            for (int x = 0; x < 8; x++) {
                if ((luminances[offset + x] & 255) <= threshold) {
                    matrix.set(xoffset + x, yoffset + y);
                }
            }
            y++;
            offset += stride;
        }
    }

    private static int[][] calculateBlackPoints(byte[] luminances, int subWidth, int subHeight, int width, int height) {
        int averageNeighborBlackPoint;
        int i = subWidth;
        int i2 = subHeight;
        int[][] blackPoints = (int[][]) Array.newInstance((Class<?>) int.class, i2, i);
        int y = 0;
        while (y < i2) {
            int yoffset = y << 3;
            int maxYOffset = height - 8;
            if (yoffset > maxYOffset) {
                yoffset = maxYOffset;
            }
            int x = 0;
            while (x < i) {
                int xoffset = x << 3;
                int maxXOffset = width - 8;
                if (xoffset > maxXOffset) {
                    xoffset = maxXOffset;
                }
                int min = 0;
                int offset = (yoffset * width) + xoffset;
                int min2 = 255;
                int sum = 0;
                int yy = 0;
                while (true) {
                    int offset2 = offset;
                    if (yy >= 8) {
                        break;
                    }
                    int max = min;
                    int min3 = min2;
                    int min4 = 0;
                    for (int i3 = 8; min4 < i3; i3 = 8) {
                        int pixel = luminances[offset2 + min4] & 255;
                        sum += pixel;
                        if (pixel < min3) {
                            min3 = pixel;
                        }
                        int max2 = max;
                        if (pixel <= max2) {
                            max = max2;
                        } else {
                            max = pixel;
                        }
                        min4++;
                    }
                    int max3 = max;
                    if (max3 - min3 > 24) {
                        while (true) {
                            yy++;
                            offset2 += width;
                            if (yy < 8) {
                                int xx = 0;
                                for (int i4 = 8; xx < i4; i4 = 8) {
                                    sum += luminances[offset2 + xx] & 255;
                                    xx++;
                                }
                            }
                        }
                    }
                    yy++;
                    offset = offset2 + width;
                    min2 = min3;
                    min = max3;
                }
                int average = sum >> 6;
                if (min - min2 <= 24) {
                    average = min2 / 2;
                    if (y > 0 && x > 0 && min2 < (averageNeighborBlackPoint = ((blackPoints[y - 1][x] + (blackPoints[y][x - 1] * 2)) + blackPoints[y - 1][x - 1]) / 4)) {
                        average = averageNeighborBlackPoint;
                    }
                }
                blackPoints[y][x] = average;
                x++;
                i = subWidth;
            }
            y++;
            i = subWidth;
            i2 = subHeight;
        }
        return blackPoints;
    }
}
