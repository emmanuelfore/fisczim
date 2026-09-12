package com.google.zxing.qrcode.detector;

import com.google.zxing.DecodeHintType;
import com.google.zxing.NotFoundException;
import com.google.zxing.ResultPoint;
import com.google.zxing.ResultPointCallback;
import com.google.zxing.common.BitMatrix;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public class FinderPatternFinder {
    private static final int CENTER_QUORUM = 2;
    protected static final int MAX_MODULES = 57;
    protected static final int MIN_SKIP = 3;
    private final int[] crossCheckStateCount;
    private boolean hasSkipped;
    private final BitMatrix image;
    private final List<FinderPattern> possibleCenters;
    private final ResultPointCallback resultPointCallback;

    public FinderPatternFinder(BitMatrix image) {
        this(image, null);
    }

    public FinderPatternFinder(BitMatrix image, ResultPointCallback resultPointCallback) {
        this.image = image;
        this.possibleCenters = new ArrayList();
        this.crossCheckStateCount = new int[5];
        this.resultPointCallback = resultPointCallback;
    }

    protected final BitMatrix getImage() {
        return this.image;
    }

    protected final List<FinderPattern> getPossibleCenters() {
        return this.possibleCenters;
    }

    final FinderPatternInfo find(Map<DecodeHintType, ?> hints) throws NotFoundException {
        boolean tryHarder = hints != null && hints.containsKey(DecodeHintType.TRY_HARDER);
        boolean pureBarcode = hints != null && hints.containsKey(DecodeHintType.PURE_BARCODE);
        int maxI = this.image.getHeight();
        int maxJ = this.image.getWidth();
        int i = (maxI * 3) / 228;
        int currentState = i;
        char c = 3;
        if (i < 3 || tryHarder) {
            currentState = 3;
        }
        boolean confirmed = false;
        int[] stateCount = new int[5];
        int i2 = currentState - 1;
        int i3 = 0;
        while (i2 < maxI && !confirmed) {
            stateCount[0] = 0;
            stateCount[1] = 0;
            stateCount[2] = 0;
            stateCount[c] = 0;
            int i4 = 4;
            stateCount[4] = 0;
            int rowSkip = i3;
            int iSkip = currentState;
            int currentState2 = 0;
            boolean done = confirmed;
            int j = 0;
            while (j < maxJ) {
                if (this.image.get(j, i2)) {
                    if ((currentState2 & 1) == 1) {
                        currentState2++;
                    }
                    stateCount[currentState2] = stateCount[currentState2] + 1;
                } else if ((currentState2 & 1) != 0) {
                    stateCount[currentState2] = stateCount[currentState2] + 1;
                } else if (currentState2 != i4) {
                    currentState2++;
                    stateCount[currentState2] = stateCount[currentState2] + 1;
                } else if (!foundPatternCross(stateCount)) {
                    stateCount[0] = stateCount[2];
                    stateCount[1] = stateCount[3];
                    stateCount[2] = stateCount[4];
                    stateCount[3] = 1;
                    stateCount[4] = 0;
                    currentState2 = 3;
                } else if (handlePossibleCenter(stateCount, i2, j, pureBarcode)) {
                    if (this.hasSkipped) {
                        done = haveMultiplyConfirmedCenters();
                    } else {
                        int iFindRowSkip = findRowSkip();
                        rowSkip = iFindRowSkip;
                        if (iFindRowSkip > stateCount[2]) {
                            i2 += (rowSkip - stateCount[2]) - 2;
                            j = maxJ - 1;
                        }
                    }
                    currentState2 = 0;
                    stateCount[0] = 0;
                    stateCount[1] = 0;
                    stateCount[2] = 0;
                    stateCount[3] = 0;
                    stateCount[4] = 0;
                    iSkip = 2;
                } else {
                    stateCount[0] = stateCount[2];
                    stateCount[1] = stateCount[3];
                    stateCount[2] = stateCount[4];
                    stateCount[3] = 1;
                    stateCount[4] = 0;
                    currentState2 = 3;
                }
                j++;
                i4 = 4;
            }
            if (foundPatternCross(stateCount) && handlePossibleCenter(stateCount, i2, maxJ, pureBarcode)) {
                int iSkip2 = stateCount[0];
                if (this.hasSkipped) {
                    confirmed = haveMultiplyConfirmedCenters();
                    currentState = iSkip2;
                    i2 += currentState;
                    i3 = rowSkip;
                    c = 3;
                } else {
                    currentState = iSkip2;
                }
            } else {
                currentState = iSkip;
            }
            confirmed = done;
            i2 += currentState;
            i3 = rowSkip;
            c = 3;
        }
        FinderPattern[] patternInfo = selectBestPatterns();
        ResultPoint.orderBestPatterns(patternInfo);
        return new FinderPatternInfo(patternInfo);
    }

    private static float centerFromEnd(int[] stateCount, int end) {
        return ((end - stateCount[4]) - stateCount[3]) - (stateCount[2] / 2.0f);
    }

    protected static boolean foundPatternCross(int[] iArr) {
        int i = 0;
        for (int i2 = 0; i2 < 5; i2++) {
            int i3 = iArr[i2];
            if (i3 == 0) {
                return false;
            }
            i += i3;
        }
        if (i < 7) {
            return false;
        }
        float f = i / 7.0f;
        float f2 = f / 2.0f;
        return Math.abs(f - ((float) iArr[0])) < f2 && Math.abs(f - ((float) iArr[1])) < f2 && Math.abs((f * 3.0f) - ((float) iArr[2])) < 3.0f * f2 && Math.abs(f - ((float) iArr[3])) < f2 && Math.abs(f - ((float) iArr[4])) < f2;
    }

    private int[] getCrossCheckStateCount() {
        this.crossCheckStateCount[0] = 0;
        this.crossCheckStateCount[1] = 0;
        this.crossCheckStateCount[2] = 0;
        this.crossCheckStateCount[3] = 0;
        this.crossCheckStateCount[4] = 0;
        return this.crossCheckStateCount;
    }

    private boolean crossCheckDiagonal(int startI, int centerJ, int maxCount, int originalStateCountTotal) {
        int[] stateCount = getCrossCheckStateCount();
        int i = 0;
        while (startI >= i && centerJ >= i && this.image.get(centerJ - i, startI - i)) {
            stateCount[2] = stateCount[2] + 1;
            i++;
        }
        if (startI < i || centerJ < i) {
            return false;
        }
        while (startI >= i && centerJ >= i && !this.image.get(centerJ - i, startI - i) && stateCount[1] <= maxCount) {
            stateCount[1] = stateCount[1] + 1;
            i++;
        }
        if (startI < i || centerJ < i || stateCount[1] > maxCount) {
            return false;
        }
        while (startI >= i && centerJ >= i && this.image.get(centerJ - i, startI - i) && stateCount[0] <= maxCount) {
            stateCount[0] = stateCount[0] + 1;
            i++;
        }
        if (stateCount[0] > maxCount) {
            return false;
        }
        int maxI = this.image.getHeight();
        int maxJ = this.image.getWidth();
        int i2 = 1;
        while (startI + i2 < maxI && centerJ + i2 < maxJ && this.image.get(centerJ + i2, startI + i2)) {
            stateCount[2] = stateCount[2] + 1;
            i2++;
        }
        if (startI + i2 >= maxI || centerJ + i2 >= maxJ) {
            return false;
        }
        while (startI + i2 < maxI && centerJ + i2 < maxJ && !this.image.get(centerJ + i2, startI + i2) && stateCount[3] < maxCount) {
            stateCount[3] = stateCount[3] + 1;
            i2++;
        }
        if (startI + i2 >= maxI || centerJ + i2 >= maxJ || stateCount[3] >= maxCount) {
            return false;
        }
        while (startI + i2 < maxI && centerJ + i2 < maxJ && this.image.get(centerJ + i2, startI + i2) && stateCount[4] < maxCount) {
            stateCount[4] = stateCount[4] + 1;
            i2++;
        }
        return stateCount[4] < maxCount && Math.abs(((((stateCount[0] + stateCount[1]) + stateCount[2]) + stateCount[3]) + stateCount[4]) - originalStateCountTotal) < originalStateCountTotal * 2 && foundPatternCross(stateCount);
    }

    private float crossCheckVertical(int startI, int centerJ, int maxCount, int originalStateCountTotal) {
        BitMatrix image = this.image;
        int maxI = image.getHeight();
        int[] stateCount = getCrossCheckStateCount();
        int i = startI;
        while (i >= 0 && image.get(centerJ, i)) {
            stateCount[2] = stateCount[2] + 1;
            i--;
        }
        if (i < 0) {
            return Float.NaN;
        }
        while (i >= 0 && !image.get(centerJ, i) && stateCount[1] <= maxCount) {
            stateCount[1] = stateCount[1] + 1;
            i--;
        }
        if (i >= 0 && stateCount[1] <= maxCount) {
            while (i >= 0 && image.get(centerJ, i) && stateCount[0] <= maxCount) {
                stateCount[0] = stateCount[0] + 1;
                i--;
            }
            if (stateCount[0] > maxCount) {
                return Float.NaN;
            }
            int i2 = startI + 1;
            while (i2 < maxI && image.get(centerJ, i2)) {
                stateCount[2] = stateCount[2] + 1;
                i2++;
            }
            if (i2 != maxI) {
                while (i2 < maxI && !image.get(centerJ, i2) && stateCount[3] < maxCount) {
                    stateCount[3] = stateCount[3] + 1;
                    i2++;
                }
                if (i2 != maxI && stateCount[3] < maxCount) {
                    while (i2 < maxI && image.get(centerJ, i2) && stateCount[4] < maxCount) {
                        stateCount[4] = stateCount[4] + 1;
                        i2++;
                    }
                    if (stateCount[4] >= maxCount) {
                        return Float.NaN;
                    }
                    int stateCountTotal = stateCount[0] + stateCount[1] + stateCount[2] + stateCount[3] + stateCount[4];
                    if (Math.abs(stateCountTotal - originalStateCountTotal) * 5 < originalStateCountTotal * 2 && foundPatternCross(stateCount)) {
                        return centerFromEnd(stateCount, i2);
                    }
                    return Float.NaN;
                }
                return Float.NaN;
            }
            return Float.NaN;
        }
        return Float.NaN;
    }

    private float crossCheckHorizontal(int startJ, int centerI, int maxCount, int originalStateCountTotal) {
        BitMatrix image = this.image;
        int maxJ = image.getWidth();
        int[] stateCount = getCrossCheckStateCount();
        int j = startJ;
        while (j >= 0 && image.get(j, centerI)) {
            stateCount[2] = stateCount[2] + 1;
            j--;
        }
        if (j < 0) {
            return Float.NaN;
        }
        while (j >= 0 && !image.get(j, centerI) && stateCount[1] <= maxCount) {
            stateCount[1] = stateCount[1] + 1;
            j--;
        }
        if (j >= 0 && stateCount[1] <= maxCount) {
            while (j >= 0 && image.get(j, centerI) && stateCount[0] <= maxCount) {
                stateCount[0] = stateCount[0] + 1;
                j--;
            }
            if (stateCount[0] > maxCount) {
                return Float.NaN;
            }
            int j2 = startJ + 1;
            while (j2 < maxJ && image.get(j2, centerI)) {
                stateCount[2] = stateCount[2] + 1;
                j2++;
            }
            if (j2 != maxJ) {
                while (j2 < maxJ && !image.get(j2, centerI) && stateCount[3] < maxCount) {
                    stateCount[3] = stateCount[3] + 1;
                    j2++;
                }
                if (j2 != maxJ && stateCount[3] < maxCount) {
                    while (j2 < maxJ && image.get(j2, centerI) && stateCount[4] < maxCount) {
                        stateCount[4] = stateCount[4] + 1;
                        j2++;
                    }
                    if (stateCount[4] >= maxCount) {
                        return Float.NaN;
                    }
                    int stateCountTotal = stateCount[0] + stateCount[1] + stateCount[2] + stateCount[3] + stateCount[4];
                    if (Math.abs(stateCountTotal - originalStateCountTotal) * 5 < originalStateCountTotal && foundPatternCross(stateCount)) {
                        return centerFromEnd(stateCount, j2);
                    }
                    return Float.NaN;
                }
                return Float.NaN;
            }
            return Float.NaN;
        }
        return Float.NaN;
    }

    protected final boolean handlePossibleCenter(int[] stateCount, int i, int j, boolean pureBarcode) {
        int index = 0;
        int stateCountTotal = stateCount[0] + stateCount[1] + stateCount[2] + stateCount[3] + stateCount[4];
        float centerJ = centerFromEnd(stateCount, j);
        float centerI = crossCheckVertical(i, (int) centerJ, stateCount[2], stateCountTotal);
        if (!Float.isNaN(centerI)) {
            float centerJ2 = crossCheckHorizontal((int) centerJ, (int) centerI, stateCount[2], stateCountTotal);
            if (!Float.isNaN(centerJ2) && (!pureBarcode || crossCheckDiagonal((int) centerI, (int) centerJ2, stateCount[2], stateCountTotal))) {
                float estimatedModuleSize = stateCountTotal / 7.0f;
                boolean found = false;
                while (true) {
                    if (index >= this.possibleCenters.size()) {
                        break;
                    }
                    FinderPattern center = this.possibleCenters.get(index);
                    if (center.aboutEquals(estimatedModuleSize, centerI, centerJ2)) {
                        this.possibleCenters.set(index, center.combineEstimate(centerI, centerJ2, estimatedModuleSize));
                        found = true;
                        break;
                    }
                    index++;
                }
                if (!found) {
                    FinderPattern point = new FinderPattern(centerJ2, centerI, estimatedModuleSize);
                    this.possibleCenters.add(point);
                    if (this.resultPointCallback != null) {
                        this.resultPointCallback.foundPossibleResultPoint(point);
                    }
                }
                return true;
            }
        }
        return false;
    }

    private int findRowSkip() {
        if (this.possibleCenters.size() <= 1) {
            return 0;
        }
        ResultPoint firstConfirmedCenter = null;
        for (FinderPattern center : this.possibleCenters) {
            if (center.getCount() >= 2) {
                if (firstConfirmedCenter == null) {
                    firstConfirmedCenter = center;
                } else {
                    this.hasSkipped = true;
                    return ((int) (Math.abs(firstConfirmedCenter.getX() - center.getX()) - Math.abs(firstConfirmedCenter.getY() - center.getY()))) / 2;
                }
            }
        }
        return 0;
    }

    private boolean haveMultiplyConfirmedCenters() {
        int confirmedCount = 0;
        float totalModuleSize = 0.0f;
        int max = this.possibleCenters.size();
        for (FinderPattern pattern : this.possibleCenters) {
            if (pattern.getCount() >= 2) {
                confirmedCount++;
                totalModuleSize += pattern.getEstimatedModuleSize();
            }
        }
        if (confirmedCount < 3) {
            return false;
        }
        float average = totalModuleSize / max;
        float totalDeviation = 0.0f;
        Iterator<FinderPattern> it = this.possibleCenters.iterator();
        while (it.hasNext()) {
            totalDeviation += Math.abs(it.next().getEstimatedModuleSize() - average);
        }
        return totalDeviation <= 0.05f * totalModuleSize;
    }

    private FinderPattern[] selectBestPatterns() throws NotFoundException {
        int startSize = this.possibleCenters.size();
        if (startSize >= 3) {
            if (startSize > 3) {
                Iterator<FinderPattern> it = this.possibleCenters.iterator();
                float square = 0.0f;
                float square2 = 0.0f;
                while (it.hasNext()) {
                    float size = it.next().getEstimatedModuleSize();
                    square2 += size;
                    square += size * size;
                }
                float average = square2 / startSize;
                float stdDev = (float) Math.sqrt((square / startSize) - (average * average));
                Collections.sort(this.possibleCenters, new FurthestFromAverageComparator(average));
                float limit = Math.max(0.2f * average, stdDev);
                int i = 0;
                while (i < this.possibleCenters.size() && this.possibleCenters.size() > 3) {
                    if (Math.abs(this.possibleCenters.get(i).getEstimatedModuleSize() - average) > limit) {
                        this.possibleCenters.remove(i);
                        i--;
                    }
                    i++;
                }
            }
            if (this.possibleCenters.size() > 3) {
                float totalModuleSize = 0.0f;
                for (FinderPattern possibleCenter : this.possibleCenters) {
                    totalModuleSize += possibleCenter.getEstimatedModuleSize();
                }
                Collections.sort(this.possibleCenters, new CenterComparator(totalModuleSize / this.possibleCenters.size()));
                this.possibleCenters.subList(3, this.possibleCenters.size()).clear();
            }
            return new FinderPattern[]{this.possibleCenters.get(0), this.possibleCenters.get(1), this.possibleCenters.get(2)};
        }
        throw NotFoundException.getNotFoundInstance();
    }

    private static final class FurthestFromAverageComparator implements Serializable, Comparator<FinderPattern> {
        private final float average;

        private FurthestFromAverageComparator(float f) {
            this.average = f;
        }

        @Override // java.util.Comparator
        public int compare(FinderPattern center1, FinderPattern center2) {
            float dA = Math.abs(center2.getEstimatedModuleSize() - this.average);
            float dB = Math.abs(center1.getEstimatedModuleSize() - this.average);
            if (dA < dB) {
                return -1;
            }
            return dA == dB ? 0 : 1;
        }
    }

    private static final class CenterComparator implements Serializable, Comparator<FinderPattern> {
        private final float average;

        private CenterComparator(float f) {
            this.average = f;
        }

        @Override // java.util.Comparator
        public int compare(FinderPattern center1, FinderPattern center2) {
            if (center2.getCount() == center1.getCount()) {
                float dA = Math.abs(center2.getEstimatedModuleSize() - this.average);
                float dB = Math.abs(center1.getEstimatedModuleSize() - this.average);
                if (dA < dB) {
                    return 1;
                }
                return dA == dB ? 0 : -1;
            }
            return center2.getCount() - center1.getCount();
        }
    }
}
