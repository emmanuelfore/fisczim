package com.google.zxing.oned.rss.expanded;

import android.support.v4.media.TransportMediator;
import com.cspos.BuildConfig;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.DecodeHintType;
import com.google.zxing.FormatException;
import com.google.zxing.NotFoundException;
import com.google.zxing.Result;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.BitArray;
import com.google.zxing.common.detector.MathUtils;
import com.google.zxing.oned.rss.AbstractRSSReader;
import com.google.zxing.oned.rss.DataCharacter;
import com.google.zxing.oned.rss.FinderPattern;
import com.google.zxing.oned.rss.RSSUtils;
import com.google.zxing.oned.rss.expanded.decoders.AbstractExpandedDecoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public final class RSSExpandedReader extends AbstractRSSReader {
    private static final int FINDER_PAT_A = 0;
    private static final int FINDER_PAT_B = 1;
    private static final int FINDER_PAT_C = 2;
    private static final int FINDER_PAT_D = 3;
    private static final int FINDER_PAT_E = 4;
    private static final int FINDER_PAT_F = 5;
    private static final int MAX_PAIRS = 11;
    private final List<ExpandedPair> pairs = new ArrayList(11);
    private final List<ExpandedRow> rows = new ArrayList();
    private final int[] startEnd = new int[2];
    private boolean startFromEven;
    private static final int[] SYMBOL_WIDEST = {7, 5, 4, 3, 1};
    private static final int[] EVEN_TOTAL_SUBSET = {4, 20, 52, 104, 204};
    private static final int[] GSUM = {0, 348, 1388, 2948, 3988};
    private static final int[][] FINDER_PATTERNS = {new int[]{1, 8, 4, 1}, new int[]{3, 6, 4, 1}, new int[]{3, 4, 6, 1}, new int[]{3, 2, 8, 1}, new int[]{2, 6, 5, 1}, new int[]{2, 2, 9, 1}};
    private static final int[][] WEIGHTS = {new int[]{1, 3, 9, 27, 81, 32, 96, 77}, new int[]{20, 60, 180, 118, 143, 7, 21, 63}, new int[]{189, 145, 13, 39, 117, 140, 209, 205}, new int[]{193, 157, 49, 147, 19, 57, 171, 91}, new int[]{62, 186, 136, 197, 169, 85, 44, 132}, new int[]{185, 133, 188, 142, 4, 12, 36, 108}, new int[]{113, 128, 173, 97, 80, 29, 87, 50}, new int[]{150, 28, 84, 41, 123, 158, 52, 156}, new int[]{46, 138, 203, 187, 139, 206, 196, 166}, new int[]{76, 17, 51, 153, 37, BuildConfig.VERSION_CODE, 122, 155}, new int[]{43, 129, 176, 106, 107, 110, 119, 146}, new int[]{16, 48, 144, 10, 30, 90, 59, 177}, new int[]{109, 116, 137, 200, 178, 112, 125, 164}, new int[]{70, 210, 208, 202, 184, TransportMediator.KEYCODE_MEDIA_RECORD, 179, 115}, new int[]{134, 191, 151, 31, 93, 68, 204, 190}, new int[]{148, 22, 66, 198, 172, 94, 71, 2}, new int[]{6, 18, 54, 162, 64, 192, 154, 40}, new int[]{120, 149, 25, 75, 14, 42, TransportMediator.KEYCODE_MEDIA_PLAY, 167}, new int[]{79, 26, 78, 23, 69, 207, 199, 175}, new int[]{103, 98, 83, 38, 114, 131, 182, 124}, new int[]{161, 61, 183, TransportMediator.KEYCODE_MEDIA_PAUSE, 170, 88, 53, 159}, new int[]{55, 165, 73, 8, 24, 72, 5, 15}, new int[]{45, 135, 194, 160, 58, 174, 100, 89}};
    private static final int[][] FINDER_PATTERN_SEQUENCES = {new int[]{0, 0}, new int[]{0, 1, 1}, new int[]{0, 2, 1, 3}, new int[]{0, 4, 1, 3, 2}, new int[]{0, 4, 1, 3, 3, 5}, new int[]{0, 4, 1, 3, 4, 5, 5}, new int[]{0, 0, 1, 1, 2, 2, 3, 3}, new int[]{0, 0, 1, 1, 2, 2, 3, 4, 4}, new int[]{0, 0, 1, 1, 2, 2, 3, 4, 5, 5}, new int[]{0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5}};

    @Override // com.google.zxing.oned.OneDReader
    public Result decodeRow(int rowNumber, BitArray row, Map<DecodeHintType, ?> hints) throws NotFoundException, FormatException {
        this.pairs.clear();
        this.startFromEven = false;
        try {
            return constructResult(decodeRow2pairs(rowNumber, row));
        } catch (NotFoundException e) {
            this.pairs.clear();
            this.startFromEven = true;
            return constructResult(decodeRow2pairs(rowNumber, row));
        }
    }

    @Override // com.google.zxing.oned.OneDReader, com.google.zxing.Reader
    public void reset() {
        this.pairs.clear();
        this.rows.clear();
    }

    List<ExpandedPair> decodeRow2pairs(int rowNumber, BitArray row) throws NotFoundException {
        while (true) {
            try {
                ExpandedPair nextPair = retrieveNextPair(row, this.pairs, rowNumber);
                this.pairs.add(nextPair);
            } catch (NotFoundException nfe) {
                if (this.pairs.isEmpty()) {
                    throw nfe;
                }
                if (checkChecksum()) {
                    return this.pairs;
                }
                boolean tryStackedDecode = !this.rows.isEmpty();
                storeRow(rowNumber, false);
                if (tryStackedDecode) {
                    List<ExpandedPair> ps = checkRows(false);
                    if (ps != null) {
                        return ps;
                    }
                    List<ExpandedPair> ps2 = checkRows(true);
                    if (ps2 != null) {
                        return ps2;
                    }
                }
                throw NotFoundException.getNotFoundInstance();
            }
        }
    }

    private List<ExpandedPair> checkRows(boolean reverse) throws NotFoundException {
        if (this.rows.size() > 25) {
            this.rows.clear();
            return null;
        }
        this.pairs.clear();
        if (reverse) {
            Collections.reverse(this.rows);
        }
        List<ExpandedPair> ps = null;
        try {
            ps = checkRows(new ArrayList(), 0);
        } catch (NotFoundException e) {
        }
        if (reverse) {
            Collections.reverse(this.rows);
        }
        return ps;
    }

    private List<ExpandedPair> checkRows(List<ExpandedRow> collectedRows, int currentRow) throws NotFoundException {
        for (int i = currentRow; i < this.rows.size(); i++) {
            ExpandedRow row = this.rows.get(i);
            this.pairs.clear();
            for (ExpandedRow collectedRow : collectedRows) {
                this.pairs.addAll(collectedRow.getPairs());
            }
            this.pairs.addAll(row.getPairs());
            if (isValidSequence(this.pairs)) {
                if (checkChecksum()) {
                    return this.pairs;
                }
                List<ExpandedRow> rs = new ArrayList<>();
                rs.addAll(collectedRows);
                rs.add(row);
                try {
                    return checkRows(rs, i + 1);
                } catch (NotFoundException e) {
                }
            }
        }
        throw NotFoundException.getNotFoundInstance();
    }

    private static boolean isValidSequence(List<ExpandedPair> pairs) {
        for (int[] sequence : FINDER_PATTERN_SEQUENCES) {
            if (pairs.size() <= sequence.length) {
                boolean stop = true;
                int j = 0;
                while (true) {
                    if (j >= pairs.size()) {
                        break;
                    }
                    if (pairs.get(j).getFinderPattern().getValue() == sequence[j]) {
                        j++;
                    } else {
                        stop = false;
                        break;
                    }
                }
                if (stop) {
                    return true;
                }
            }
        }
        return false;
    }

    private void storeRow(int rowNumber, boolean wasReversed) {
        int insertPos = 0;
        boolean prevIsSame = false;
        boolean nextIsSame = false;
        while (true) {
            if (insertPos >= this.rows.size()) {
                break;
            }
            ExpandedRow erow = this.rows.get(insertPos);
            if (erow.getRowNumber() > rowNumber) {
                nextIsSame = erow.isEquivalent(this.pairs);
                break;
            } else {
                prevIsSame = erow.isEquivalent(this.pairs);
                insertPos++;
            }
        }
        if (nextIsSame || prevIsSame || isPartialRow(this.pairs, this.rows)) {
            return;
        }
        this.rows.add(insertPos, new ExpandedRow(this.pairs, rowNumber, wasReversed));
        removePartialRows(this.pairs, this.rows);
    }

    private static void removePartialRows(List<ExpandedPair> pairs, List<ExpandedRow> rows) {
        Iterator<ExpandedRow> iterator = rows.iterator();
        while (iterator.hasNext()) {
            ExpandedRow r = iterator.next();
            if (r.getPairs().size() != pairs.size()) {
                boolean allFound = true;
                Iterator<ExpandedPair> it = r.getPairs().iterator();
                while (true) {
                    if (!it.hasNext()) {
                        break;
                    }
                    ExpandedPair p = it.next();
                    boolean found = false;
                    Iterator<ExpandedPair> it2 = pairs.iterator();
                    while (true) {
                        if (!it2.hasNext()) {
                            break;
                        }
                        ExpandedPair pp = it2.next();
                        if (p.equals(pp)) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        allFound = false;
                        break;
                    }
                }
                if (allFound) {
                    iterator.remove();
                }
            }
        }
    }

    private static boolean isPartialRow(Iterable<ExpandedPair> pairs, Iterable<ExpandedRow> rows) {
        for (ExpandedRow r : rows) {
            boolean allFound = true;
            Iterator<ExpandedPair> it = pairs.iterator();
            while (true) {
                if (!it.hasNext()) {
                    break;
                }
                ExpandedPair p = it.next();
                boolean found = false;
                Iterator<ExpandedPair> it2 = r.getPairs().iterator();
                while (true) {
                    if (!it2.hasNext()) {
                        break;
                    }
                    ExpandedPair pp = it2.next();
                    if (p.equals(pp)) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    allFound = false;
                    break;
                }
            }
            if (allFound) {
                return true;
            }
        }
        return false;
    }

    List<ExpandedRow> getRows() {
        return this.rows;
    }

    static Result constructResult(List<ExpandedPair> pairs) throws NotFoundException, FormatException {
        String resultingString = AbstractExpandedDecoder.createDecoder(BitArrayBuilder.buildBitArray(pairs)).parseInformation();
        ResultPoint[] firstPoints = pairs.get(0).getFinderPattern().getResultPoints();
        ResultPoint[] lastPoints = pairs.get(pairs.size() - 1).getFinderPattern().getResultPoints();
        return new Result(resultingString, null, new ResultPoint[]{firstPoints[0], firstPoints[1], lastPoints[0], lastPoints[1]}, BarcodeFormat.RSS_EXPANDED);
    }

    private boolean checkChecksum() {
        ExpandedPair firstPair = this.pairs.get(0);
        DataCharacter checkCharacter = firstPair.getLeftChar();
        DataCharacter firstCharacter = firstPair.getRightChar();
        if (firstCharacter == null) {
            return false;
        }
        int checksum = firstCharacter.getChecksumPortion();
        int s = 2;
        for (int i = 1; i < this.pairs.size(); i++) {
            ExpandedPair currentPair = this.pairs.get(i);
            checksum += currentPair.getLeftChar().getChecksumPortion();
            s++;
            DataCharacter currentRightChar = currentPair.getRightChar();
            if (currentRightChar != null) {
                checksum += currentRightChar.getChecksumPortion();
                s++;
            }
        }
        return ((s + (-4)) * 211) + (checksum % 211) == checkCharacter.getValue();
    }

    private static int getNextSecondBar(BitArray row, int initialPos) {
        if (row.get(initialPos)) {
            int currentPos = row.getNextUnset(initialPos);
            return row.getNextSet(currentPos);
        }
        int currentPos2 = row.getNextSet(initialPos);
        return row.getNextUnset(currentPos2);
    }

    ExpandedPair retrieveNextPair(BitArray row, List<ExpandedPair> previousPairs, int rowNumber) throws NotFoundException {
        FinderPattern pattern;
        boolean isOddPattern = previousPairs.size() % 2 == 0;
        if (this.startFromEven) {
            isOddPattern = !isOddPattern;
        }
        int forcedOffset = -1;
        DataCharacter rightChar = null;
        boolean keepFinding = true;
        do {
            findNextPair(row, previousPairs, forcedOffset);
            pattern = parseFoundFinderPattern(row, rowNumber, isOddPattern);
            if (pattern == null) {
                forcedOffset = getNextSecondBar(row, this.startEnd[0]);
            } else {
                keepFinding = false;
            }
        } while (keepFinding);
        DataCharacter leftChar = decodeDataCharacter(row, pattern, isOddPattern, true);
        if (!previousPairs.isEmpty() && previousPairs.get(previousPairs.size() - 1).mustBeLast()) {
            throw NotFoundException.getNotFoundInstance();
        }
        try {
            rightChar = decodeDataCharacter(row, pattern, isOddPattern, false);
        } catch (NotFoundException e) {
        }
        return new ExpandedPair(leftChar, rightChar, pattern, true);
    }

    /* JADX WARN: Removed duplicated region for block: B:12:0x0048  */
    /* JADX WARN: Removed duplicated region for block: B:13:0x004a  */
    /* JADX WARN: Removed duplicated region for block: B:16:0x004f  */
    /* JADX WARN: Removed duplicated region for block: B:22:0x0059  */
    /* JADX WARN: Removed duplicated region for block: B:27:0x006c  */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    private void findNextPair(com.google.zxing.common.BitArray r18, java.util.List<com.google.zxing.oned.rss.expanded.ExpandedPair> r19, int r20) throws com.google.zxing.NotFoundException {
        /*
            r17 = this;
            r0 = r17
            r1 = r18
            int[] r2 = r17.getDecodeFinderCounters()
            r3 = 0
            r4 = r3
            r4 = r2
            r5 = 0
            r2[r5] = r5
            r2 = 1
            r4[r2] = r5
            r6 = 2
            r4[r6] = r5
            r7 = 3
            r4[r7] = r5
            int r8 = r18.getSize()
            if (r20 < 0) goto L22
            r3 = r20
        L1f:
            r10 = r19
            goto L41
        L22:
            boolean r9 = r19.isEmpty()
            if (r9 == 0) goto L2a
            r3 = 0
            goto L1f
        L2a:
            int r9 = r19.size()
            int r9 = r9 - r2
            r10 = r19
            java.lang.Object r9 = r10.get(r9)
            com.google.zxing.oned.rss.expanded.ExpandedPair r9 = (com.google.zxing.oned.rss.expanded.ExpandedPair) r9
            com.google.zxing.oned.rss.FinderPattern r9 = r9.getFinderPattern()
            int[] r9 = r9.getStartEnd()
            r3 = r9[r2]
        L41:
            int r9 = r19.size()
            int r9 = r9 % r6
            if (r9 == 0) goto L4a
            r9 = 1
            goto L4b
        L4a:
            r9 = 0
        L4b:
            boolean r11 = r0.startFromEven
            if (r11 == 0) goto L55
            if (r9 != 0) goto L53
            r11 = 1
            goto L54
        L53:
            r11 = 0
        L54:
            r9 = r11
        L55:
            r11 = r3
            r3 = 0
        L57:
            if (r11 >= r8) goto L64
            boolean r12 = r1.get(r11)
            r12 = r12 ^ r2
            r3 = r12
            if (r12 == 0) goto L64
            int r11 = r11 + 1
            goto L57
        L64:
            r12 = 0
            r13 = r11
            r14 = r13
            r13 = r12
            r12 = r3
            r3 = r11
        L6a:
            if (r3 >= r8) goto Lb7
            boolean r15 = r1.get(r3)
            r15 = r15 ^ r12
            if (r15 == 0) goto L79
            r15 = r4[r13]
            int r15 = r15 + r2
            r4[r13] = r15
            goto Lb4
        L79:
            if (r13 != r7) goto Laa
            if (r9 == 0) goto L80
            reverseCounters(r4)
        L80:
            boolean r15 = isFinderPattern(r4)
            if (r15 == 0) goto L8f
            int[] r6 = r0.startEnd
            r6[r5] = r14
            int[] r5 = r0.startEnd
            r5[r2] = r3
            return
        L8f:
            if (r9 == 0) goto L94
            reverseCounters(r4)
        L94:
            r15 = r4[r5]
            r16 = r4[r2]
            int r15 = r15 + r16
            int r14 = r14 + r15
            r15 = r4[r6]
            r4[r5] = r15
            r15 = r4[r7]
            r4[r2] = r15
            r4[r6] = r5
            r4[r7] = r5
            int r13 = r13 + (-1)
            goto Lac
        Laa:
            int r13 = r13 + 1
        Lac:
            r4[r13] = r2
            if (r12 != 0) goto Lb2
            r15 = 1
            goto Lb3
        Lb2:
            r15 = 0
        Lb3:
            r12 = r15
        Lb4:
            int r3 = r3 + 1
            goto L6a
        Lb7:
            com.google.zxing.NotFoundException r2 = com.google.zxing.NotFoundException.getNotFoundInstance()
            throw r2
        */
        throw new UnsupportedOperationException("Method not decompiled: com.google.zxing.oned.rss.expanded.RSSExpandedReader.findNextPair(com.google.zxing.common.BitArray, java.util.List, int):void");
    }

    private static void reverseCounters(int[] counters) {
        int length = counters.length;
        for (int i = 0; i < length / 2; i++) {
            int tmp = counters[i];
            counters[i] = counters[(length - i) - 1];
            counters[(length - i) - 1] = tmp;
        }
    }

    private FinderPattern parseFoundFinderPattern(BitArray row, int rowNumber, boolean oddPattern) {
        int start;
        int end;
        int end2;
        if (oddPattern) {
            int firstElementStart = this.startEnd[0] - 1;
            while (firstElementStart >= 0 && !row.get(firstElementStart)) {
                firstElementStart--;
            }
            int firstElementStart2 = firstElementStart + 1;
            int firstCounter = this.startEnd[0] - firstElementStart2;
            start = firstElementStart2;
            int firstElementStart3 = this.startEnd[1];
            end2 = firstElementStart3;
            end = firstCounter;
        } else {
            start = this.startEnd[0];
            int end3 = row.getNextUnset(this.startEnd[1] + 1);
            end = end3 - this.startEnd[1];
            end2 = end3;
        }
        int start2 = start;
        int[] counters = getDecodeFinderCounters();
        System.arraycopy(counters, 0, counters, 1, counters.length - 1);
        counters[0] = end;
        try {
            int value = parseFinderValue(counters, FINDER_PATTERNS);
            return new FinderPattern(value, new int[]{start2, end2}, start2, end2, rowNumber);
        } catch (NotFoundException e) {
            return null;
        }
    }

    DataCharacter decodeDataCharacter(BitArray bitArray, FinderPattern finderPattern, boolean z, boolean z2) throws NotFoundException {
        int i;
        int[] dataCharacterCounters = getDataCharacterCounters();
        dataCharacterCounters[0] = 0;
        dataCharacterCounters[1] = 0;
        dataCharacterCounters[2] = 0;
        dataCharacterCounters[3] = 0;
        dataCharacterCounters[4] = 0;
        dataCharacterCounters[5] = 0;
        dataCharacterCounters[6] = 0;
        dataCharacterCounters[7] = 0;
        if (z2) {
            recordPatternInReverse(bitArray, finderPattern.getStartEnd()[0], dataCharacterCounters);
        } else {
            recordPattern(bitArray, finderPattern.getStartEnd()[1], dataCharacterCounters);
            int i2 = 0;
            for (int length = dataCharacterCounters.length - 1; i2 < length; length--) {
                int i3 = dataCharacterCounters[i2];
                dataCharacterCounters[i2] = dataCharacterCounters[length];
                dataCharacterCounters[length] = i3;
                i2++;
            }
        }
        float fSum = MathUtils.sum(dataCharacterCounters) / 17.0f;
        float f = (finderPattern.getStartEnd()[1] - finderPattern.getStartEnd()[0]) / 15.0f;
        float f2 = 0.3f;
        if (Math.abs(fSum - f) / f > 0.3f) {
            throw NotFoundException.getNotFoundInstance();
        }
        int[] oddCounts = getOddCounts();
        int[] evenCounts = getEvenCounts();
        float[] oddRoundingErrors = getOddRoundingErrors();
        float[] evenRoundingErrors = getEvenRoundingErrors();
        int i4 = 0;
        float f3 = 0.0f;
        int i5 = 0;
        while (i4 < dataCharacterCounters.length) {
            float f4 = (dataCharacterCounters[i4] * 1.0f) / fSum;
            f3 = f4;
            int i6 = (int) (f4 + 0.5f);
            if (i6 > 0) {
                if (i6 > 8) {
                    if (f3 > 8.7f) {
                        throw NotFoundException.getNotFoundInstance();
                    }
                    i = 8;
                } else {
                    i = i6;
                }
            } else {
                if (f3 < f2) {
                    throw NotFoundException.getNotFoundInstance();
                }
                i = 1;
            }
            int i7 = i4 / 2;
            if ((i4 & 1) == 0) {
                oddCounts[i7] = i;
                oddRoundingErrors[i7] = f3 - i;
            } else {
                evenCounts[i7] = i;
                evenRoundingErrors[i7] = f3 - i;
            }
            i4++;
            i5 = i;
            f2 = 0.3f;
        }
        adjustOddEvenCounts(17);
        int value = (((finderPattern.getValue() * 4) + (z ? 0 : 2)) + (!z2 ? 1 : 0)) - 1;
        int i8 = 0;
        int i9 = 0;
        for (int length2 = oddCounts.length - 1; length2 >= 0; length2--) {
            if (isNotA1left(finderPattern, z, z2)) {
                i9 += oddCounts[length2] * WEIGHTS[value][length2 * 2];
            }
            i8 += oddCounts[length2];
        }
        int i10 = 0;
        for (int length3 = evenCounts.length - 1; length3 >= 0; length3--) {
            if (isNotA1left(finderPattern, z, z2)) {
                i10 += evenCounts[length3] * WEIGHTS[value][(length3 * 2) + 1];
            }
        }
        int i11 = i9 + i10;
        if ((i8 & 1) != 0 || i8 > 13 || i8 < 4) {
            throw NotFoundException.getNotFoundInstance();
        }
        int i12 = (13 - i8) / 2;
        int i13 = SYMBOL_WIDEST[i12];
        return new DataCharacter((RSSUtils.getRSSvalue(oddCounts, i13, true) * EVEN_TOTAL_SUBSET[i12]) + RSSUtils.getRSSvalue(evenCounts, 9 - i13, false) + GSUM[i12], i11);
    }

    private static boolean isNotA1left(FinderPattern pattern, boolean isOddPattern, boolean leftChar) {
        return (pattern.getValue() == 0 && isOddPattern && leftChar) ? false : true;
    }

    private void adjustOddEvenCounts(int numModules) throws NotFoundException {
        int oddSum = MathUtils.sum(getOddCounts());
        int evenSum = MathUtils.sum(getEvenCounts());
        boolean incrementOdd = false;
        boolean decrementOdd = false;
        if (oddSum > 13) {
            decrementOdd = true;
        } else if (oddSum < 4) {
            incrementOdd = true;
        }
        boolean incrementEven = false;
        boolean decrementEven = false;
        if (evenSum > 13) {
            decrementEven = true;
        } else if (evenSum < 4) {
            incrementEven = true;
        }
        int mismatch = (oddSum + evenSum) - numModules;
        boolean oddParityBad = (oddSum & 1) == 1;
        boolean evenParityBad = (evenSum & 1) == 0;
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
