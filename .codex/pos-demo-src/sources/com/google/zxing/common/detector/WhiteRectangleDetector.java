package com.google.zxing.common.detector;

import com.google.zxing.NotFoundException;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.BitMatrix;

/* JADX INFO: loaded from: classes.dex */
public final class WhiteRectangleDetector {
    private static final int CORR = 1;
    private static final int INIT_SIZE = 10;
    private final int downInit;
    private final int height;
    private final BitMatrix image;
    private final int leftInit;
    private final int rightInit;
    private final int upInit;
    private final int width;

    public WhiteRectangleDetector(BitMatrix image) throws NotFoundException {
        this(image, 10, image.getWidth() / 2, image.getHeight() / 2);
    }

    public WhiteRectangleDetector(BitMatrix image, int initSize, int x, int y) throws NotFoundException {
        this.image = image;
        this.height = image.getHeight();
        this.width = image.getWidth();
        int halfsize = initSize / 2;
        this.leftInit = x - halfsize;
        this.rightInit = x + halfsize;
        this.upInit = y - halfsize;
        this.downInit = y + halfsize;
        if (this.upInit < 0 || this.leftInit < 0 || this.downInit >= this.height || this.rightInit >= this.width) {
            throw NotFoundException.getNotFoundInstance();
        }
    }

    public ResultPoint[] detect() throws NotFoundException {
        int down;
        int right;
        int left = this.leftInit;
        int right2 = this.rightInit;
        int up = this.upInit;
        int down2 = this.downInit;
        boolean sizeExceeded = false;
        boolean aBlackPointFoundOnBorder = true;
        boolean atLeastOneBlackPointFoundOnRight = false;
        boolean atLeastOneBlackPointFoundOnBottom = false;
        boolean atLeastOneBlackPointFoundOnLeft = false;
        boolean z = false;
        boolean atLeastOneBlackPointFoundOnBorder = false;
        int left2 = left;
        int left3 = 0;
        while (true) {
            if (!aBlackPointFoundOnBorder) {
                down = down2;
                right = right2;
                break;
            }
            boolean aBlackPointFoundOnBorder2 = false;
            right = right2;
            boolean rightBorderNotWhite = true;
            while (true) {
                if ((!rightBorderNotWhite && atLeastOneBlackPointFoundOnRight) || right >= this.width) {
                    break;
                }
                boolean zContainsBlackPoint = containsBlackPoint(up, down2, right, z);
                rightBorderNotWhite = zContainsBlackPoint;
                if (zContainsBlackPoint) {
                    right++;
                    aBlackPointFoundOnBorder2 = true;
                    atLeastOneBlackPointFoundOnRight = true;
                } else if (!atLeastOneBlackPointFoundOnRight) {
                    right++;
                }
            }
            if (right >= this.width) {
                sizeExceeded = true;
                down = down2;
                break;
            }
            boolean aBlackPointFoundOnBorder3 = aBlackPointFoundOnBorder2;
            down = down2;
            boolean bottomBorderNotWhite = true;
            while (true) {
                if ((!bottomBorderNotWhite && atLeastOneBlackPointFoundOnBottom) || down >= this.height) {
                    break;
                }
                boolean zContainsBlackPoint2 = containsBlackPoint(left2, right, down, true);
                bottomBorderNotWhite = zContainsBlackPoint2;
                if (zContainsBlackPoint2) {
                    down++;
                    aBlackPointFoundOnBorder3 = true;
                    atLeastOneBlackPointFoundOnBottom = true;
                } else if (!atLeastOneBlackPointFoundOnBottom) {
                    down++;
                }
            }
            if (down >= this.height) {
                sizeExceeded = true;
                break;
            }
            int left4 = left2;
            boolean leftBorderNotWhite = true;
            while (true) {
                if ((!leftBorderNotWhite && atLeastOneBlackPointFoundOnLeft) || left4 < 0) {
                    break;
                }
                boolean zContainsBlackPoint3 = containsBlackPoint(up, down, left4, false);
                leftBorderNotWhite = zContainsBlackPoint3;
                if (zContainsBlackPoint3) {
                    left4--;
                    aBlackPointFoundOnBorder3 = true;
                    atLeastOneBlackPointFoundOnLeft = true;
                } else if (!atLeastOneBlackPointFoundOnLeft) {
                    left4--;
                }
            }
            if (left4 < 0) {
                sizeExceeded = true;
                left2 = left4;
                break;
            }
            boolean aBlackPointFoundOnBorder4 = aBlackPointFoundOnBorder3;
            int up2 = up;
            int up3 = left3;
            boolean topBorderNotWhite = true;
            while (true) {
                if ((!topBorderNotWhite && up3 != 0) || up2 < 0) {
                    break;
                }
                boolean zContainsBlackPoint4 = containsBlackPoint(left4, right, up2, true);
                topBorderNotWhite = zContainsBlackPoint4;
                if (zContainsBlackPoint4) {
                    up2--;
                    aBlackPointFoundOnBorder4 = true;
                    up3 = 1;
                } else if (up3 == 0) {
                    up2--;
                }
            }
            if (up2 < 0) {
                sizeExceeded = true;
                left3 = up3;
                left2 = left4;
                up = up2;
                break;
            }
            if (aBlackPointFoundOnBorder4) {
                atLeastOneBlackPointFoundOnBorder = true;
            }
            left3 = up3;
            right2 = right;
            left2 = left4;
            down2 = down;
            up = up2;
            aBlackPointFoundOnBorder = aBlackPointFoundOnBorder4;
            z = false;
        }
        if (sizeExceeded || !atLeastOneBlackPointFoundOnBorder) {
            throw NotFoundException.getNotFoundInstance();
        }
        int maxSize = right - left2;
        ResultPoint z2 = null;
        int i = 1;
        while (z2 == null && i < maxSize) {
            z2 = getBlackPointOnSegment(left2, down - i, left2 + i, down);
            i++;
            left3 = left3;
            sizeExceeded = sizeExceeded;
            atLeastOneBlackPointFoundOnRight = atLeastOneBlackPointFoundOnRight;
        }
        if (z2 == null) {
            throw NotFoundException.getNotFoundInstance();
        }
        ResultPoint t = null;
        int i2 = 1;
        while (t == null && i2 < maxSize) {
            t = getBlackPointOnSegment(left2, up + i2, left2 + i2, up);
            i2++;
            left2 = left2;
        }
        if (t == null) {
            throw NotFoundException.getNotFoundInstance();
        }
        ResultPoint x = null;
        int i3 = 1;
        while (x == null && i3 < maxSize) {
            x = getBlackPointOnSegment(right, up + i3, right - i3, up);
            i3++;
            atLeastOneBlackPointFoundOnBottom = atLeastOneBlackPointFoundOnBottom;
        }
        if (x == null) {
            throw NotFoundException.getNotFoundInstance();
        }
        ResultPoint y = null;
        int i4 = 1;
        while (true) {
            int i5 = i4;
            if (y != null || i5 >= maxSize) {
                break;
            }
            y = getBlackPointOnSegment(right, down - i5, right - i5, down);
            i4 = i5 + 1;
            maxSize = maxSize;
        }
        if (y != null) {
            return centerEdges(y, z2, x, t);
        }
        throw NotFoundException.getNotFoundInstance();
    }

    private ResultPoint getBlackPointOnSegment(float aX, float aY, float bX, float bY) {
        int dist = MathUtils.round(MathUtils.distance(aX, aY, bX, bY));
        float xStep = (bX - aX) / dist;
        float yStep = (bY - aY) / dist;
        for (int i = 0; i < dist; i++) {
            int x = MathUtils.round((i * xStep) + aX);
            int y = MathUtils.round((i * yStep) + aY);
            if (this.image.get(x, y)) {
                return new ResultPoint(x, y);
            }
        }
        return null;
    }

    private ResultPoint[] centerEdges(ResultPoint y, ResultPoint z, ResultPoint x, ResultPoint t) {
        float yi = y.getX();
        float yj = y.getY();
        float zi = z.getX();
        float zj = z.getY();
        float xi = x.getX();
        float xj = x.getY();
        float ti = t.getX();
        float tj = t.getY();
        if (yi < this.width / 2.0f) {
            return new ResultPoint[]{new ResultPoint(ti - 1.0f, tj + 1.0f), new ResultPoint(zi + 1.0f, zj + 1.0f), new ResultPoint(xi - 1.0f, xj - 1.0f), new ResultPoint(yi + 1.0f, yj - 1.0f)};
        }
        return new ResultPoint[]{new ResultPoint(ti + 1.0f, tj + 1.0f), new ResultPoint(zi + 1.0f, zj - 1.0f), new ResultPoint(xi - 1.0f, xj + 1.0f), new ResultPoint(yi - 1.0f, yj - 1.0f)};
    }

    private boolean containsBlackPoint(int a, int b, int fixed, boolean horizontal) {
        if (horizontal) {
            for (int x = a; x <= b; x++) {
                if (this.image.get(x, fixed)) {
                    return true;
                }
            }
            return false;
        }
        for (int y = a; y <= b; y++) {
            if (this.image.get(fixed, y)) {
                return true;
            }
        }
        return false;
    }
}
