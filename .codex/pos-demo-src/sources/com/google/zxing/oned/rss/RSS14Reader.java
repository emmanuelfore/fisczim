package com.google.zxing.oned.rss;

import android.support.v4.media.TransportMediator;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.DecodeHintType;
import com.google.zxing.NotFoundException;
import com.google.zxing.Result;
import com.google.zxing.ResultPoint;
import com.google.zxing.ResultPointCallback;
import com.google.zxing.common.BitArray;
import com.google.zxing.common.detector.MathUtils;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public final class RSS14Reader extends AbstractRSSReader {
    private final List<Pair> possibleLeftPairs = new ArrayList();
    private final List<Pair> possibleRightPairs = new ArrayList();
    private static final int[] OUTSIDE_EVEN_TOTAL_SUBSET = {1, 10, 34, 70, TransportMediator.KEYCODE_MEDIA_PLAY};
    private static final int[] INSIDE_ODD_TOTAL_SUBSET = {4, 20, 48, 81};
    private static final int[] OUTSIDE_GSUM = {0, 161, 961, 2015, 2715};
    private static final int[] INSIDE_GSUM = {0, 336, 1036, 1516};
    private static final int[] OUTSIDE_ODD_WIDEST = {8, 6, 4, 3, 1};
    private static final int[] INSIDE_ODD_WIDEST = {2, 4, 6, 8};
    private static final int[][] FINDER_PATTERNS = {new int[]{3, 8, 2, 1}, new int[]{3, 5, 5, 1}, new int[]{3, 3, 7, 1}, new int[]{3, 1, 9, 1}, new int[]{2, 7, 4, 1}, new int[]{2, 5, 6, 1}, new int[]{2, 3, 8, 1}, new int[]{1, 5, 7, 1}, new int[]{1, 3, 9, 1}};

    @Override // com.google.zxing.oned.OneDReader
    public Result decodeRow(int rowNumber, BitArray row, Map<DecodeHintType, ?> hints) throws NotFoundException {
        Pair leftPair = decodePair(row, false, rowNumber, hints);
        addOrTally(this.possibleLeftPairs, leftPair);
        row.reverse();
        Pair rightPair = decodePair(row, true, rowNumber, hints);
        addOrTally(this.possibleRightPairs, rightPair);
        row.reverse();
        for (Pair left : this.possibleLeftPairs) {
            if (left.getCount() > 1) {
                for (Pair right : this.possibleRightPairs) {
                    if (right.getCount() > 1 && checkChecksum(left, right)) {
                        return constructResult(left, right);
                    }
                }
            }
        }
        throw NotFoundException.getNotFoundInstance();
    }

    private static void addOrTally(Collection<Pair> possiblePairs, Pair pair) {
        if (pair == null) {
            return;
        }
        boolean found = false;
        Iterator<Pair> it = possiblePairs.iterator();
        while (true) {
            if (!it.hasNext()) {
                break;
            }
            Pair other = it.next();
            if (other.getValue() == pair.getValue()) {
                other.incrementCount();
                found = true;
                break;
            }
        }
        if (!found) {
            possiblePairs.add(pair);
        }
    }

    @Override // com.google.zxing.oned.OneDReader, com.google.zxing.Reader
    public void reset() {
        this.possibleLeftPairs.clear();
        this.possibleRightPairs.clear();
    }

    private static Result constructResult(Pair leftPair, Pair rightPair) {
        String text = String.valueOf((((long) leftPair.getValue()) * 4537077) + ((long) rightPair.getValue()));
        StringBuilder buffer = new StringBuilder(14);
        for (int i = 13 - text.length(); i > 0; i--) {
            buffer.append('0');
        }
        buffer.append(text);
        int checkDigit = 0;
        for (int checkDigit2 = 0; checkDigit2 < 13; checkDigit2++) {
            int digit = buffer.charAt(checkDigit2) - '0';
            checkDigit += (checkDigit2 & 1) == 0 ? digit * 3 : digit;
        }
        int i2 = checkDigit % 10;
        int i3 = 10 - i2;
        int checkDigit3 = i3;
        if (i3 == 10) {
            checkDigit3 = 0;
        }
        buffer.append(checkDigit3);
        ResultPoint[] leftPoints = leftPair.getFinderPattern().getResultPoints();
        ResultPoint[] rightPoints = rightPair.getFinderPattern().getResultPoints();
        return new Result(String.valueOf(buffer.toString()), null, new ResultPoint[]{leftPoints[0], leftPoints[1], rightPoints[0], rightPoints[1]}, BarcodeFormat.RSS_14);
    }

    private static boolean checkChecksum(Pair leftPair, Pair rightPair) {
        int checkValue = (leftPair.getChecksumPortion() + (rightPair.getChecksumPortion() * 16)) % 79;
        int value = (leftPair.getFinderPattern().getValue() * 9) + rightPair.getFinderPattern().getValue();
        int targetCheckValue = value;
        if (value > 72) {
            targetCheckValue--;
        }
        if (targetCheckValue > 8) {
            targetCheckValue--;
        }
        return checkValue == targetCheckValue;
    }

    private Pair decodePair(BitArray row, boolean right, int rowNumber, Map<DecodeHintType, ?> hints) {
        int[] startEnd;
        try {
            startEnd = findFinderPattern(row, 0, right);
        } catch (NotFoundException e) {
            startEnd = null;
        }
        try {
            FinderPattern pattern = parseFoundFinderPattern(row, rowNumber, right, startEnd);
            ResultPointCallback resultPointCallback = hints == null ? null : (ResultPointCallback) hints.get(DecodeHintType.NEED_RESULT_POINT_CALLBACK);
            ResultPointCallback resultPointCallback2 = resultPointCallback;
            if (resultPointCallback != null) {
                float center = (startEnd[0] + startEnd[1]) / 2.0f;
                if (right) {
                    center = (row.getSize() - 1) - center;
                }
                resultPointCallback2.foundPossibleResultPoint(new ResultPoint(center, rowNumber));
            }
            DataCharacter outside = decodeDataCharacter(row, pattern, true);
            DataCharacter inside = decodeDataCharacter(row, pattern, false);
            return new Pair((outside.getValue() * 1597) + inside.getValue(), outside.getChecksumPortion() + (inside.getChecksumPortion() * 4), pattern);
        } catch (NotFoundException e2) {
            return null;
        }
    }

    /* JADX WARN: Removed duplicated region for block: B:23:0x008c  */
    /* JADX WARN: Removed duplicated region for block: B:24:0x0094  */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    private com.google.zxing.oned.rss.DataCharacter decodeDataCharacter(com.google.zxing.common.BitArray r28, com.google.zxing.oned.rss.FinderPattern r29, boolean r30) throws com.google.zxing.NotFoundException {
        /*
            Method dump skipped, instruction units count: 339
            To view this dump add '--comments-level debug' option
        */
        throw new UnsupportedOperationException("Method not decompiled: com.google.zxing.oned.rss.RSS14Reader.decodeDataCharacter(com.google.zxing.common.BitArray, com.google.zxing.oned.rss.FinderPattern, boolean):com.google.zxing.oned.rss.DataCharacter");
    }

    private int[] findFinderPattern(BitArray row, int rowOffset, boolean rightFinderPattern) throws NotFoundException {
        int[] counters = getDecodeFinderCounters();
        counters[0] = 0;
        counters[1] = 0;
        counters[2] = 0;
        counters[3] = 0;
        int width = row.getSize();
        int rowOffset2 = rowOffset;
        boolean isWhite = false;
        while (rowOffset2 < width) {
            isWhite = !row.get(rowOffset2);
            if (rightFinderPattern == isWhite) {
                break;
            }
            rowOffset2++;
        }
        int patternStart = rowOffset2;
        int patternStart2 = patternStart;
        int patternStart3 = 0;
        boolean isWhite2 = isWhite;
        for (int x = rowOffset2; x < width; x++) {
            if (row.get(x) ^ isWhite2) {
                counters[patternStart3] = counters[patternStart3] + 1;
            } else {
                if (patternStart3 == 3) {
                    if (!isFinderPattern(counters)) {
                        patternStart2 += counters[0] + counters[1];
                        counters[0] = counters[2];
                        counters[1] = counters[3];
                        counters[2] = 0;
                        counters[3] = 0;
                        patternStart3--;
                    } else {
                        return new int[]{patternStart2, x};
                    }
                } else {
                    patternStart3++;
                }
                counters[patternStart3] = 1;
                isWhite2 = !isWhite2;
            }
        }
        throw NotFoundException.getNotFoundInstance();
    }

    private FinderPattern parseFoundFinderPattern(BitArray row, int rowNumber, boolean right, int[] startEnd) throws NotFoundException {
        int start;
        int end;
        boolean firstIsBlack = row.get(startEnd[0]);
        int firstElementStart = startEnd[0] - 1;
        while (firstElementStart >= 0 && (row.get(firstElementStart) ^ firstIsBlack)) {
            firstElementStart--;
        }
        int firstElementStart2 = firstElementStart + 1;
        int firstCounter = startEnd[0] - firstElementStart2;
        int[] counters = getDecodeFinderCounters();
        System.arraycopy(counters, 0, counters, 1, counters.length - 1);
        counters[0] = firstCounter;
        int value = parseFinderValue(counters, FINDER_PATTERNS);
        int end2 = startEnd[1];
        if (right) {
            int start2 = (row.getSize() - 1) - firstElementStart2;
            int start3 = row.getSize();
            end = (start3 - 1) - end2;
            start = start2;
        } else {
            start = firstElementStart2;
            end = end2;
        }
        return new FinderPattern(value, new int[]{firstElementStart2, startEnd[1]}, start, end, rowNumber);
    }

    private void adjustOddEvenCounts(boolean outsideChar, int numModules) throws NotFoundException {
        int oddSum = MathUtils.sum(getOddCounts());
        int evenSum = MathUtils.sum(getEvenCounts());
        boolean incrementOdd = false;
        boolean decrementOdd = false;
        boolean incrementEven = false;
        boolean decrementEven = false;
        if (outsideChar) {
            if (oddSum > 12) {
                decrementOdd = true;
            } else if (oddSum < 4) {
                incrementOdd = true;
            }
            if (evenSum > 12) {
                decrementEven = true;
            } else if (evenSum < 4) {
                incrementEven = true;
            }
        } else {
            if (oddSum > 11) {
                decrementOdd = true;
            } else if (oddSum < 5) {
                incrementOdd = true;
            }
            if (evenSum > 10) {
                decrementEven = true;
            } else if (evenSum < 4) {
                incrementEven = true;
            }
        }
        int mismatch = (oddSum + evenSum) - numModules;
        boolean oddParityBad = (oddSum & 1) == outsideChar;
        boolean evenParityBad = (evenSum & 1) == 1;
        if (mismatch == 1) {
            if (oddParityBad) {
                if (evenParityBad) {
                    throw NotFoundException.getNotFoundInstance();
                }
                decrementOdd = true;
            } else {
                if (!evenParityBad) {
                    throw NotFoundException.getNotFoundInstance();
                }
                decrementEven = true;
            }
        } else if (mismatch == -1) {
            if (oddParityBad) {
                if (evenParityBad) {
                    throw NotFoundException.getNotFoundInstance();
                }
                incrementOdd = true;
            } else {
                if (!evenParityBad) {
                    throw NotFoundException.getNotFoundInstance();
                }
                incrementEven = true;
            }
        } else if (mismatch == 0) {
            if (oddParityBad) {
                if (!evenParityBad) {
                    throw NotFoundException.getNotFoundInstance();
                }
                if (oddSum < evenSum) {
                    incrementOdd = true;
                    decrementEven = true;
                } else {
                    decrementOdd = true;
                    incrementEven = true;
                }
            } else if (evenParityBad) {
                throw NotFoundException.getNotFoundInstance();
            }
        } else {
            throw NotFoundException.getNotFoundInstance();
        }
        if (incrementOdd) {
            if (decrementOdd) {
                throw NotFoundException.getNotFoundInstance();
            }
            increment(getOddCounts(), getOddRoundingErrors());
        }
        if (decrementOdd) {
            decrement(getOddCounts(), getOddRoundingErrors());
        }
        if (incrementEven) {
            if (decrementEven) {
                throw NotFoundException.getNotFoundInstance();
            }
            increment(getEvenCounts(), getOddRoundingErrors());
        }
        if (decrementEven) {
            decrement(getEvenCounts(), getEvenRoundingErrors());
        }
    }
}
