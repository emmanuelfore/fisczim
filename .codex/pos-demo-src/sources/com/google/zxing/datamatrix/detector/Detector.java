package com.google.zxing.datamatrix.detector;

import com.google.zxing.NotFoundException;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.DetectorResult;
import com.google.zxing.common.GridSampler;
import com.google.zxing.common.detector.MathUtils;
import com.google.zxing.common.detector.WhiteRectangleDetector;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public final class Detector {
    private final BitMatrix image;
    private final WhiteRectangleDetector rectangleDetector;

    public Detector(BitMatrix image) throws NotFoundException {
        this.image = image;
        this.rectangleDetector = new WhiteRectangleDetector(image);
    }

    public DetectorResult detect() throws NotFoundException {
        ResultPoint topRight;
        char c;
        ResultPoint bottomRight;
        BitMatrix bits;
        ResultPoint correctedTopRight;
        ResultPoint correctedTopRight2;
        ResultPoint[] cornerPoints = this.rectangleDetector.detect();
        ResultPoint pointA = cornerPoints[0];
        ResultPoint pointB = cornerPoints[1];
        ResultPoint pointC = cornerPoints[2];
        ResultPoint pointD = cornerPoints[3];
        List<ResultPointsAndTransitions> transitions = new ArrayList<>(4);
        transitions.add(transitionsBetween(pointA, pointB));
        transitions.add(transitionsBetween(pointA, pointC));
        transitions.add(transitionsBetween(pointB, pointD));
        transitions.add(transitionsBetween(pointC, pointD));
        Collections.sort(transitions, new ResultPointsAndTransitionsComparator());
        ResultPointsAndTransitions lSideOne = transitions.get(0);
        ResultPointsAndTransitions lSideTwo = transitions.get(1);
        Map<ResultPoint, Integer> pointCount = new HashMap<>();
        increment(pointCount, lSideOne.getFrom());
        increment(pointCount, lSideOne.getTo());
        increment(pointCount, lSideTwo.getFrom());
        increment(pointCount, lSideTwo.getTo());
        ResultPoint bottomLeft = null;
        ResultPoint maybeBottomRight = null;
        ResultPoint maybeBottomRight2 = null;
        for (Map.Entry<ResultPoint, Integer> entry : pointCount.entrySet()) {
            ResultPoint point = entry.getKey();
            if (entry.getValue().intValue() == 2) {
                bottomLeft = point;
            } else if (maybeBottomRight2 == null) {
                maybeBottomRight2 = point;
            } else {
                maybeBottomRight = point;
            }
        }
        if (maybeBottomRight2 == null || bottomLeft == null || maybeBottomRight == null) {
            throw NotFoundException.getNotFoundInstance();
        }
        ResultPoint[] corners = {maybeBottomRight2, bottomLeft, maybeBottomRight};
        ResultPoint.orderBestPatterns(corners);
        ResultPoint bottomRight2 = corners[0];
        ResultPoint bottomLeft2 = corners[1];
        ResultPoint topLeft = corners[2];
        if (!pointCount.containsKey(pointA)) {
            topRight = pointA;
        } else if (!pointCount.containsKey(pointB)) {
            topRight = pointB;
        } else if (!pointCount.containsKey(pointC)) {
            topRight = pointC;
        } else {
            topRight = pointD;
        }
        int dimensionTop = transitionsBetween(topLeft, topRight).getTransitions();
        int dimensionRight = transitionsBetween(bottomRight2, topRight).getTransitions();
        if ((dimensionTop & 1) == 1) {
            dimensionTop++;
        }
        int dimensionTop2 = dimensionTop + 2;
        if ((dimensionRight & 1) == 1) {
            dimensionRight++;
        }
        int dimensionRight2 = dimensionRight + 2;
        if (dimensionTop2 * 4 >= dimensionRight2 * 7 || dimensionRight2 * 4 >= dimensionTop2 * 7) {
            ResultPoint topRight2 = topRight;
            ResultPoint pointD2 = topLeft;
            bottomRight = bottomRight2;
            ResultPoint topLeft2 = pointD2;
            c = 3;
            ResultPoint correctedTopRight3 = correctTopRightRectangular(bottomLeft2, bottomRight2, pointD2, topRight2, dimensionTop2, dimensionRight2);
            if (correctedTopRight3 == null) {
                correctedTopRight2 = topRight2;
            } else {
                correctedTopRight2 = correctedTopRight3;
            }
            correctedTopRight = topLeft2;
            int dimensionTop3 = transitionsBetween(correctedTopRight, correctedTopRight2).getTransitions();
            int dimensionRight3 = transitionsBetween(bottomRight, correctedTopRight2).getTransitions();
            if ((dimensionTop3 & 1) == 1) {
                dimensionTop3++;
            }
            if ((dimensionRight3 & 1) == 1) {
                dimensionRight3++;
            }
            bits = sampleGrid(this.image, correctedTopRight, bottomLeft2, bottomRight, correctedTopRight2, dimensionTop3, dimensionRight3);
            ResultPoint[] resultPointArr = new ResultPoint[4];
            resultPointArr[0] = correctedTopRight;
            resultPointArr[1] = bottomLeft2;
            resultPointArr[2] = bottomRight;
            resultPointArr[c] = correctedTopRight2;
            return new DetectorResult(bits, resultPointArr);
        }
        int dimension = Math.min(dimensionRight2, dimensionTop2);
        ResultPoint topRight3 = topRight;
        ResultPoint correctedTopRight4 = correctTopRight(bottomLeft2, bottomRight2, topLeft, topRight3, dimension);
        if (correctedTopRight4 == null) {
            correctedTopRight2 = topRight3;
        } else {
            correctedTopRight2 = correctedTopRight4;
        }
        int dimensionCorrected = Math.max(transitionsBetween(topLeft, correctedTopRight2).getTransitions(), transitionsBetween(bottomRight2, correctedTopRight2).getTransitions()) + 1;
        if ((dimensionCorrected & 1) == 1) {
            dimensionCorrected++;
        }
        bottomRight = bottomRight2;
        c = 3;
        bits = sampleGrid(this.image, topLeft, bottomLeft2, bottomRight2, correctedTopRight2, dimensionCorrected, dimensionCorrected);
        correctedTopRight = topLeft;
        ResultPoint[] resultPointArr2 = new ResultPoint[4];
        resultPointArr2[0] = correctedTopRight;
        resultPointArr2[1] = bottomLeft2;
        resultPointArr2[2] = bottomRight;
        resultPointArr2[c] = correctedTopRight2;
        return new DetectorResult(bits, resultPointArr2);
    }

    private ResultPoint correctTopRightRectangular(ResultPoint bottomLeft, ResultPoint bottomRight, ResultPoint topLeft, ResultPoint topRight, int dimensionTop, int dimensionRight) {
        float corr = distance(bottomLeft, bottomRight) / dimensionTop;
        int norm = distance(topLeft, topRight);
        float cos = (topRight.getX() - topLeft.getX()) / norm;
        float sin = (topRight.getY() - topLeft.getY()) / norm;
        ResultPoint c1 = new ResultPoint(topRight.getX() + (corr * cos), topRight.getY() + (corr * sin));
        float corr2 = distance(bottomLeft, topLeft) / dimensionRight;
        int norm2 = distance(bottomRight, topRight);
        float cos2 = (topRight.getX() - bottomRight.getX()) / norm2;
        float cos3 = topRight.getY();
        float sin2 = (cos3 - bottomRight.getY()) / norm2;
        ResultPoint c2 = new ResultPoint(topRight.getX() + (corr2 * cos2), topRight.getY() + (corr2 * sin2));
        if (!isValid(c1)) {
            if (isValid(c2)) {
                return c2;
            }
            return null;
        }
        if (!isValid(c2)) {
            return c1;
        }
        int l1 = Math.abs(dimensionTop - transitionsBetween(topLeft, c1).getTransitions()) + Math.abs(dimensionRight - transitionsBetween(bottomRight, c1).getTransitions());
        int l2 = Math.abs(dimensionTop - transitionsBetween(topLeft, c2).getTransitions()) + Math.abs(dimensionRight - transitionsBetween(bottomRight, c2).getTransitions());
        if (l1 <= l2) {
            return c1;
        }
        return c2;
    }

    private ResultPoint correctTopRight(ResultPoint bottomLeft, ResultPoint bottomRight, ResultPoint topLeft, ResultPoint topRight, int dimension) {
        float corr = distance(bottomLeft, bottomRight) / dimension;
        int norm = distance(topLeft, topRight);
        float cos = (topRight.getX() - topLeft.getX()) / norm;
        float sin = (topRight.getY() - topLeft.getY()) / norm;
        ResultPoint c1 = new ResultPoint(topRight.getX() + (corr * cos), topRight.getY() + (corr * sin));
        float corr2 = distance(bottomLeft, topLeft) / dimension;
        int norm2 = distance(bottomRight, topRight);
        float cos2 = (topRight.getX() - bottomRight.getX()) / norm2;
        float cos3 = topRight.getY();
        float sin2 = (cos3 - bottomRight.getY()) / norm2;
        ResultPoint c2 = new ResultPoint(topRight.getX() + (corr2 * cos2), topRight.getY() + (corr2 * sin2));
        if (!isValid(c1)) {
            if (isValid(c2)) {
                return c2;
            }
            return null;
        }
        if (!isValid(c2)) {
            return c1;
        }
        int l1 = Math.abs(transitionsBetween(topLeft, c1).getTransitions() - transitionsBetween(bottomRight, c1).getTransitions());
        int l2 = Math.abs(transitionsBetween(topLeft, c2).getTransitions() - transitionsBetween(bottomRight, c2).getTransitions());
        return l1 <= l2 ? c1 : c2;
    }

    private boolean isValid(ResultPoint p) {
        return p.getX() >= 0.0f && p.getX() < ((float) this.image.getWidth()) && p.getY() > 0.0f && p.getY() < ((float) this.image.getHeight());
    }

    private static int distance(ResultPoint a, ResultPoint b) {
        return MathUtils.round(ResultPoint.distance(a, b));
    }

    private static void increment(Map<ResultPoint, Integer> table, ResultPoint key) {
        Integer value = table.get(key);
        table.put(key, Integer.valueOf(value != null ? 1 + value.intValue() : 1));
    }

    private static BitMatrix sampleGrid(BitMatrix image, ResultPoint topLeft, ResultPoint bottomLeft, ResultPoint bottomRight, ResultPoint topRight, int dimensionX, int dimensionY) throws NotFoundException {
        return GridSampler.getInstance().sampleGrid(image, dimensionX, dimensionY, 0.5f, 0.5f, dimensionX - 0.5f, 0.5f, dimensionX - 0.5f, dimensionY - 0.5f, 0.5f, dimensionY - 0.5f, topLeft.getX(), topLeft.getY(), topRight.getX(), topRight.getY(), bottomRight.getX(), bottomRight.getY(), bottomLeft.getX(), bottomLeft.getY());
    }

    private ResultPointsAndTransitions transitionsBetween(ResultPoint from, ResultPoint to) {
        int fromY;
        int fromY2;
        Detector detector = this;
        int fromX = (int) from.getX();
        int fromY3 = (int) from.getY();
        int toX = (int) to.getX();
        int y = (int) to.getY();
        int toY = y;
        boolean z = Math.abs(y - fromY3) > Math.abs(toX - fromX);
        boolean steep = z;
        if (z) {
            fromX = fromY3;
            fromY3 = fromX;
            toX = toY;
            toY = toX;
        }
        int temp = toX - fromX;
        int dx = Math.abs(temp);
        int dy = Math.abs(toY - fromY3);
        int error = (-dx) / 2;
        int ystep = fromY3 < toY ? 1 : -1;
        int xstep = fromX >= toX ? -1 : 1;
        int transitions = 0;
        boolean inBlack = detector.image.get(steep ? fromY3 : fromX, steep ? fromX : fromY3);
        int x = fromX;
        int y2 = fromY3;
        int error2 = error;
        boolean isBlack = false;
        while (x != toX) {
            int fromX2 = fromX;
            BitMatrix bitMatrix = detector.image;
            int i = steep ? y2 : x;
            if (steep) {
                fromY = fromY3;
                fromY2 = x;
            } else {
                fromY = fromY3;
                fromY2 = y2;
            }
            boolean z2 = bitMatrix.get(i, fromY2);
            isBlack = z2;
            if (z2 != inBlack) {
                transitions++;
                inBlack = isBlack;
            }
            int i2 = error2 + dy;
            error2 = i2;
            if (i2 > 0) {
                if (y2 == toY) {
                    break;
                }
                y2 += ystep;
                error2 -= dx;
            }
            x += xstep;
            fromX = fromX2;
            fromY3 = fromY;
            detector = this;
        }
        return new ResultPointsAndTransitions(from, to, transitions);
    }

    private static final class ResultPointsAndTransitions {
        private final ResultPoint from;
        private final ResultPoint to;
        private final int transitions;

        private ResultPointsAndTransitions(ResultPoint from, ResultPoint to, int transitions) {
            this.from = from;
            this.to = to;
            this.transitions = transitions;
        }

        ResultPoint getFrom() {
            return this.from;
        }

        ResultPoint getTo() {
            return this.to;
        }

        int getTransitions() {
            return this.transitions;
        }

        public String toString() {
            return this.from + "/" + this.to + '/' + this.transitions;
        }
    }

    private static final class ResultPointsAndTransitionsComparator implements Serializable, Comparator<ResultPointsAndTransitions> {
        private ResultPointsAndTransitionsComparator() {
        }

        @Override // java.util.Comparator
        public int compare(ResultPointsAndTransitions o1, ResultPointsAndTransitions o2) {
            return o1.getTransitions() - o2.getTransitions();
        }
    }
}
