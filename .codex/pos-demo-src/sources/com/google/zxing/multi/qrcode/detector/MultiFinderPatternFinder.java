package com.google.zxing.multi.qrcode.detector;

import com.google.zxing.DecodeHintType;
import com.google.zxing.NotFoundException;
import com.google.zxing.ResultPoint;
import com.google.zxing.ResultPointCallback;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.detector.FinderPattern;
import com.google.zxing.qrcode.detector.FinderPatternFinder;
import com.google.zxing.qrcode.detector.FinderPatternInfo;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
final class MultiFinderPatternFinder extends FinderPatternFinder {
    private static final float DIFF_MODSIZE_CUTOFF = 0.5f;
    private static final float DIFF_MODSIZE_CUTOFF_PERCENT = 0.05f;
    private static final FinderPatternInfo[] EMPTY_RESULT_ARRAY = new FinderPatternInfo[0];
    private static final float MAX_MODULE_COUNT_PER_EDGE = 180.0f;
    private static final float MIN_MODULE_COUNT_PER_EDGE = 9.0f;

    private static final class ModuleSizeComparator implements Serializable, Comparator<FinderPattern> {
        private ModuleSizeComparator() {
        }

        @Override // java.util.Comparator
        public int compare(FinderPattern center1, FinderPattern center2) {
            float value = center2.getEstimatedModuleSize() - center1.getEstimatedModuleSize();
            if (value < 0.0d) {
                return -1;
            }
            return ((double) value) > 0.0d ? 1 : 0;
        }
    }

    MultiFinderPatternFinder(BitMatrix image) {
        super(image);
    }

    MultiFinderPatternFinder(BitMatrix image, ResultPointCallback resultPointCallback) {
        super(image, resultPointCallback);
    }

    private FinderPattern[][] selectMutipleBestPatterns() throws NotFoundException {
        List<FinderPattern> possibleCenters;
        List<FinderPattern> possibleCenters2 = getPossibleCenters();
        List<FinderPattern> possibleCenters3 = possibleCenters2;
        int size = possibleCenters2.size();
        if (size < 3) {
            throw NotFoundException.getNotFoundInstance();
        }
        if (size == 3) {
            return new FinderPattern[][]{new FinderPattern[]{possibleCenters3.get(0), possibleCenters3.get(1), possibleCenters3.get(2)}};
        }
        Collections.sort(possibleCenters3, new ModuleSizeComparator());
        List<FinderPattern[]> results = new ArrayList<>();
        int i1 = 0;
        while (i1 < size - 2) {
            FinderPattern p1 = possibleCenters3.get(i1);
            if (p1 != null) {
                int i2 = i1 + 1;
                while (i2 < size - 1) {
                    FinderPattern p2 = possibleCenters3.get(i2);
                    if (p2 != null) {
                        float vModSize12 = (p1.getEstimatedModuleSize() - p2.getEstimatedModuleSize()) / Math.min(p1.getEstimatedModuleSize(), p2.getEstimatedModuleSize());
                        float fAbs = Math.abs(p1.getEstimatedModuleSize() - p2.getEstimatedModuleSize());
                        float f = DIFF_MODSIZE_CUTOFF_PERCENT;
                        if (fAbs <= DIFF_MODSIZE_CUTOFF || vModSize12 < DIFF_MODSIZE_CUTOFF_PERCENT) {
                            int i3 = i2 + 1;
                            while (i3 < size) {
                                FinderPattern p3 = possibleCenters3.get(i3);
                                if (p3 == null) {
                                    possibleCenters = possibleCenters3;
                                } else {
                                    float vModSize23 = (p2.getEstimatedModuleSize() - p3.getEstimatedModuleSize()) / Math.min(p2.getEstimatedModuleSize(), p3.getEstimatedModuleSize());
                                    if (Math.abs(p2.getEstimatedModuleSize() - p3.getEstimatedModuleSize()) <= DIFF_MODSIZE_CUTOFF || vModSize23 < f) {
                                        FinderPattern[] test2 = {p1, p2, p3};
                                        ResultPoint.orderBestPatterns(test2);
                                        FinderPatternInfo info = new FinderPatternInfo(test2);
                                        float dA = ResultPoint.distance(info.getTopLeft(), info.getBottomLeft());
                                        float dC = ResultPoint.distance(info.getTopRight(), info.getBottomLeft());
                                        possibleCenters = possibleCenters3;
                                        float dB = ResultPoint.distance(info.getTopLeft(), info.getTopRight());
                                        float estimatedModuleCount = (dA + dB) / (p1.getEstimatedModuleSize() * 2.0f);
                                        if (estimatedModuleCount <= MAX_MODULE_COUNT_PER_EDGE && estimatedModuleCount >= MIN_MODULE_COUNT_PER_EDGE && Math.abs((dA - dB) / Math.min(dA, dB)) < 0.1f) {
                                            float dCpy = (float) Math.sqrt((dA * dA) + (dB * dB));
                                            if (Math.abs((dC - dCpy) / Math.min(dC, dCpy)) < 0.1f) {
                                                results.add(test2);
                                            }
                                        }
                                    }
                                }
                                i3++;
                                possibleCenters3 = possibleCenters;
                                f = DIFF_MODSIZE_CUTOFF_PERCENT;
                            }
                        }
                    }
                    i2++;
                    possibleCenters3 = possibleCenters3;
                }
            }
            i1++;
            possibleCenters3 = possibleCenters3;
        }
        if (!results.isEmpty()) {
            return (FinderPattern[][]) results.toArray(new FinderPattern[results.size()][]);
        }
        throw NotFoundException.getNotFoundInstance();
    }

    public FinderPatternInfo[] findMulti(Map<DecodeHintType, ?> hints) throws NotFoundException {
        int i = 0;
        boolean tryHarder = hints != null && hints.containsKey(DecodeHintType.TRY_HARDER);
        boolean pureBarcode = hints != null && hints.containsKey(DecodeHintType.PURE_BARCODE);
        BitMatrix image = getImage();
        int maxI = image.getHeight();
        int maxJ = image.getWidth();
        int i2 = (int) ((maxI / 228.0f) * 3.0f);
        int iSkip = i2;
        char c = 3;
        if (i2 < 3 || tryHarder) {
            iSkip = 3;
        }
        int[] stateCount = new int[5];
        int i3 = iSkip - 1;
        while (i3 < maxI) {
            stateCount[0] = 0;
            stateCount[1] = 0;
            stateCount[2] = 0;
            stateCount[c] = 0;
            stateCount[4] = 0;
            int currentState = 0;
            int currentState2 = 0;
            while (true) {
                int j = currentState2;
                if (j >= maxJ) {
                    break;
                }
                if (image.get(j, i3)) {
                    if ((currentState & 1) == 1) {
                        currentState++;
                    }
                    stateCount[currentState] = stateCount[currentState] + 1;
                } else if ((currentState & 1) != 0) {
                    stateCount[currentState] = stateCount[currentState] + 1;
                } else if (currentState != 4) {
                    currentState++;
                    stateCount[currentState] = stateCount[currentState] + 1;
                } else if (foundPatternCross(stateCount) && handlePossibleCenter(stateCount, i3, j, pureBarcode)) {
                    currentState = 0;
                    stateCount[0] = 0;
                    stateCount[1] = 0;
                    stateCount[2] = 0;
                    stateCount[3] = 0;
                    stateCount[4] = 0;
                } else {
                    stateCount[0] = stateCount[2];
                    stateCount[1] = stateCount[3];
                    stateCount[2] = stateCount[4];
                    stateCount[3] = 1;
                    stateCount[4] = 0;
                    currentState = 3;
                }
                currentState2 = j + 1;
            }
            if (foundPatternCross(stateCount)) {
                handlePossibleCenter(stateCount, i3, maxJ, pureBarcode);
            }
            i3 += iSkip;
            c = 3;
        }
        FinderPattern[][] patternInfo = selectMutipleBestPatterns();
        List<FinderPatternInfo> result = new ArrayList<>();
        int length = patternInfo.length;
        FinderPattern[] finderPatternArr = null;
        while (i < length) {
            FinderPattern[] pattern = patternInfo[i];
            ResultPoint.orderBestPatterns(pattern);
            result.add(new FinderPatternInfo(pattern));
            i++;
            finderPatternArr = pattern;
        }
        if (result.isEmpty()) {
            return EMPTY_RESULT_ARRAY;
        }
        return (FinderPatternInfo[]) result.toArray(new FinderPatternInfo[result.size()]);
    }
}
