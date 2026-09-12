package com.google.zxing.common.detector;

import com.google.zxing.NotFoundException;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.BitMatrix;

/* JADX INFO: loaded from: classes.dex */
@Deprecated
public final class MonochromeRectangleDetector {
    private static final int MAX_MODULES = 32;
    private final BitMatrix image;

    public MonochromeRectangleDetector(BitMatrix image) {
        this.image = image;
    }

    public ResultPoint[] detect() throws NotFoundException {
        int height = this.image.getHeight();
        int width = this.image.getWidth();
        int halfHeight = height / 2;
        int halfWidth = width / 2;
        int deltaY = Math.max(1, height / 256);
        int deltaX = Math.max(1, width / 256);
        int top = ((int) findCornerFromCenter(halfWidth, 0, 0, width, halfHeight, -deltaY, 0, height, halfWidth / 2).getY()) - 1;
        ResultPoint pointB = findCornerFromCenter(halfWidth, -deltaX, 0, width, halfHeight, 0, top, height, halfHeight / 2);
        int left = ((int) pointB.getX()) - 1;
        ResultPoint pointC = findCornerFromCenter(halfWidth, deltaX, left, width, halfHeight, 0, top, height, halfHeight / 2);
        int right = ((int) pointC.getX()) + 1;
        ResultPoint pointD = findCornerFromCenter(halfWidth, 0, left, right, halfHeight, deltaY, top, height, halfWidth / 2);
        int bottom = ((int) pointD.getY()) + 1;
        ResultPoint pointA = findCornerFromCenter(halfWidth, 0, left, right, halfHeight, -deltaY, top, bottom, halfWidth / 4);
        return new ResultPoint[]{pointA, pointB, pointC, pointD};
    }

    private ResultPoint findCornerFromCenter(int centerX, int deltaX, int left, int right, int centerY, int deltaY, int top, int bottom, int maxWhiteRun) throws NotFoundException {
        int[] range;
        int[] lastRange = null;
        int y = centerY;
        int x = centerX;
        while (y < bottom && y >= top && x < right && x >= left) {
            if (deltaX == 0) {
                range = blackWhiteRange(y, maxWhiteRun, left, right, true);
            } else {
                range = blackWhiteRange(x, maxWhiteRun, top, bottom, false);
            }
            if (range == null) {
                if (lastRange == null) {
                    throw NotFoundException.getNotFoundInstance();
                }
                if (deltaX == 0) {
                    int lastY = y - deltaY;
                    if (lastRange[0] < centerX) {
                        if (lastRange[1] > centerX) {
                            return new ResultPoint(lastRange[deltaY > 0 ? (char) 0 : (char) 1], lastY);
                        }
                        return new ResultPoint(lastRange[0], lastY);
                    }
                    return new ResultPoint(lastRange[1], lastY);
                }
                int lastY2 = x - deltaX;
                if (lastRange[0] < centerY) {
                    if (lastRange[1] > centerY) {
                        return new ResultPoint(lastY2, lastRange[deltaX < 0 ? (char) 0 : (char) 1]);
                    }
                    return new ResultPoint(lastY2, lastRange[0]);
                }
                return new ResultPoint(lastY2, lastRange[1]);
            }
            lastRange = range;
            y += deltaY;
            x += deltaX;
        }
        throw NotFoundException.getNotFoundInstance();
    }

    /* JADX WARN: Removed duplicated region for block: B:14:0x0024  */
    /* JADX WARN: Removed duplicated region for block: B:38:0x0062  */
    /* JADX WARN: Removed duplicated region for block: B:67:0x0037 A[EDGE_INSN: B:67:0x0037->B:20:0x0037 BREAK  A[LOOP:1: B:12:0x0020->B:71:0x0020], SYNTHETIC] */
    /* JADX WARN: Removed duplicated region for block: B:84:0x0075 A[EDGE_INSN: B:84:0x0075->B:44:0x0075 BREAK  A[LOOP:3: B:36:0x005f->B:89:0x005f], SYNTHETIC] */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    private int[] blackWhiteRange(int r9, int r10, int r11, int r12, boolean r13) {
        /*
            r8 = this;
            int r0 = r11 + r12
            r1 = 2
            int r0 = r0 / r1
            r2 = 0
            r3 = r2
            r3 = r0
        L7:
            if (r0 < r11) goto L43
            if (r13 == 0) goto L14
            com.google.zxing.common.BitMatrix r4 = r8.image
            boolean r4 = r4.get(r0, r9)
            if (r4 == 0) goto L1f
            goto L1c
        L14:
            com.google.zxing.common.BitMatrix r4 = r8.image
            boolean r4 = r4.get(r9, r0)
            if (r4 == 0) goto L1f
        L1c:
            int r0 = r0 + (-1)
            goto L7
        L1f:
            r4 = r0
        L20:
            int r4 = r4 + (-1)
            if (r4 < r11) goto L37
            if (r13 == 0) goto L2f
            com.google.zxing.common.BitMatrix r5 = r8.image
            boolean r5 = r5.get(r4, r9)
            if (r5 == 0) goto L20
            goto L37
        L2f:
            com.google.zxing.common.BitMatrix r5 = r8.image
            boolean r5 = r5.get(r9, r4)
            if (r5 == 0) goto L20
        L37:
            int r5 = r0 - r4
            if (r4 < r11) goto L41
            if (r5 <= r10) goto L3e
            goto L41
        L3e:
            r0 = r4
            goto L7
        L41:
            r4 = r0
        L43:
            r4 = 1
            int r0 = r0 + r4
            r5 = r3
        L46:
            if (r5 >= r12) goto L81
            if (r13 == 0) goto L53
            com.google.zxing.common.BitMatrix r6 = r8.image
            boolean r6 = r6.get(r5, r9)
            if (r6 == 0) goto L5e
            goto L5b
        L53:
            com.google.zxing.common.BitMatrix r6 = r8.image
            boolean r6 = r6.get(r9, r5)
            if (r6 == 0) goto L5e
        L5b:
            int r5 = r5 + 1
            goto L46
        L5e:
            r6 = r5
        L5f:
            int r6 = r6 + r4
            if (r6 >= r12) goto L75
            if (r13 == 0) goto L6d
            com.google.zxing.common.BitMatrix r7 = r8.image
            boolean r7 = r7.get(r6, r9)
            if (r7 == 0) goto L5f
            goto L75
        L6d:
            com.google.zxing.common.BitMatrix r7 = r8.image
            boolean r7 = r7.get(r9, r6)
            if (r7 == 0) goto L5f
        L75:
            int r7 = r6 - r5
            if (r6 >= r12) goto L7f
            if (r7 <= r10) goto L7c
            goto L7f
        L7c:
            r5 = r6
            goto L46
        L7f:
            r6 = r5
        L81:
            int r5 = r5 + (-1)
            if (r5 <= r0) goto L8c
            int[] r1 = new int[r1]
            r1[r2] = r0
            r1[r4] = r5
            return r1
        L8c:
            r1 = 0
            return r1
        */
        throw new UnsupportedOperationException("Method not decompiled: com.google.zxing.common.detector.MonochromeRectangleDetector.blackWhiteRange(int, int, int, int, boolean):int[]");
    }
}
