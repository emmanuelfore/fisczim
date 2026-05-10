package com.google.zxing.pdf417.decoder;

import com.google.zxing.ChecksumException;
import com.google.zxing.FormatException;
import com.google.zxing.NotFoundException;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.DecoderResult;
import com.google.zxing.common.detector.MathUtils;
import com.google.zxing.pdf417.PDF417Common;
import com.google.zxing.pdf417.decoder.ec.ErrorCorrection;
import java.lang.reflect.Array;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Formatter;
import java.util.List;

/* JADX INFO: loaded from: classes.dex */
public final class PDF417ScanningDecoder {
    private static final int CODEWORD_SKEW_SIZE = 2;
    private static final int MAX_EC_CODEWORDS = 512;
    private static final int MAX_ERRORS = 3;
    private static final ErrorCorrection errorCorrection = new ErrorCorrection();

    private PDF417ScanningDecoder() {
    }

    public static DecoderResult decode(BitMatrix image, ResultPoint imageTopLeft, ResultPoint imageBottomLeft, ResultPoint imageTopRight, ResultPoint imageBottomRight, int minCodewordWidth, int maxCodewordWidth) throws NotFoundException, ChecksumException, FormatException {
        int maxBarcodeColumn;
        DetectionResultColumn detectionResultColumn;
        int barcodeColumn;
        int imageRow;
        int startColumn;
        BoundingBox boundingBox = new BoundingBox(image, imageTopLeft, imageBottomLeft, imageTopRight, imageBottomRight);
        DetectionResult detectionResult = null;
        DetectionResultRowIndicatorColumn rightRowIndicatorColumn = null;
        DetectionResultRowIndicatorColumn leftRowIndicatorColumn = null;
        BoundingBox boundingBox2 = boundingBox;
        for (int i = 0; i < 2; i++) {
            if (imageTopLeft != null) {
                leftRowIndicatorColumn = getRowIndicatorColumn(image, boundingBox2, imageTopLeft, true, minCodewordWidth, maxCodewordWidth);
            }
            if (imageTopRight != null) {
                rightRowIndicatorColumn = getRowIndicatorColumn(image, boundingBox2, imageTopRight, false, minCodewordWidth, maxCodewordWidth);
            }
            DetectionResult detectionResultMerge = merge(leftRowIndicatorColumn, rightRowIndicatorColumn);
            detectionResult = detectionResultMerge;
            if (detectionResultMerge == null) {
                throw NotFoundException.getNotFoundInstance();
            }
            if (i == 0 && detectionResult.getBoundingBox() != null && (detectionResult.getBoundingBox().getMinY() < boundingBox2.getMinY() || detectionResult.getBoundingBox().getMaxY() > boundingBox2.getMaxY())) {
                boundingBox2 = detectionResult.getBoundingBox();
            } else {
                detectionResult.setBoundingBox(boundingBox2);
                break;
            }
        }
        int i2 = detectionResult.getBarcodeColumnCount();
        boolean z = true;
        int maxBarcodeColumn2 = i2 + 1;
        detectionResult.setDetectionResultColumn(0, leftRowIndicatorColumn);
        detectionResult.setDetectionResultColumn(maxBarcodeColumn2, rightRowIndicatorColumn);
        boolean leftToRight = leftRowIndicatorColumn != null;
        int minCodewordWidth2 = minCodewordWidth;
        int maxCodewordWidth2 = maxCodewordWidth;
        Codeword codeword = null;
        int barcodeColumnCount = 1;
        int previousStartColumn = 0;
        while (barcodeColumnCount <= maxBarcodeColumn2) {
            int barcodeColumn2 = leftToRight ? barcodeColumnCount : maxBarcodeColumn2 - barcodeColumnCount;
            if (detectionResult.getDetectionResultColumn(barcodeColumn2) == null) {
                if (barcodeColumn2 == 0 || barcodeColumn2 == maxBarcodeColumn2) {
                    if (barcodeColumn2 != 0) {
                        z = false;
                    }
                    detectionResultColumn = new DetectionResultRowIndicatorColumn(boundingBox2, z);
                } else {
                    detectionResultColumn = new DetectionResultColumn(boundingBox2);
                }
                detectionResult.setDetectionResultColumn(barcodeColumn2, detectionResultColumn);
                int previousStartColumn2 = previousStartColumn;
                int previousStartColumn3 = -1;
                int imageRow2 = boundingBox2.getMinY();
                Codeword codeword2 = codeword;
                while (true) {
                    int imageRow3 = imageRow2;
                    maxBarcodeColumn = maxBarcodeColumn2;
                    if (imageRow3 > boundingBox2.getMaxY()) {
                        break;
                    }
                    int startColumn2 = getStartColumn(detectionResult, barcodeColumn2, imageRow3, leftToRight);
                    previousStartColumn2 = startColumn2;
                    if (startColumn2 < 0 || previousStartColumn2 > boundingBox2.getMaxX()) {
                        if (previousStartColumn3 != -1) {
                            startColumn = previousStartColumn3;
                        } else {
                            barcodeColumn = barcodeColumn2;
                            imageRow = imageRow3;
                            imageRow2 = imageRow + 1;
                            maxBarcodeColumn2 = maxBarcodeColumn;
                            barcodeColumn2 = barcodeColumn;
                        }
                    } else {
                        startColumn = previousStartColumn2;
                    }
                    int startColumn3 = boundingBox2.getMinX();
                    barcodeColumn = barcodeColumn2;
                    Codeword codeword3 = detectCodeword(image, startColumn3, boundingBox2.getMaxX(), leftToRight, startColumn, imageRow3, minCodewordWidth2, maxCodewordWidth2);
                    if (codeword3 == null) {
                        imageRow = imageRow3;
                        previousStartColumn2 = startColumn;
                        codeword2 = codeword3;
                    } else {
                        imageRow = imageRow3;
                        detectionResultColumn.setCodeword(imageRow, codeword3);
                        previousStartColumn2 = startColumn;
                        int previousStartColumn4 = codeword3.getWidth();
                        minCodewordWidth2 = Math.min(minCodewordWidth2, previousStartColumn4);
                        maxCodewordWidth2 = Math.max(maxCodewordWidth2, codeword3.getWidth());
                        previousStartColumn3 = previousStartColumn2;
                        codeword2 = codeword3;
                    }
                    imageRow2 = imageRow + 1;
                    maxBarcodeColumn2 = maxBarcodeColumn;
                    barcodeColumn2 = barcodeColumn;
                }
                previousStartColumn = previousStartColumn2;
                codeword = codeword2;
            } else {
                maxBarcodeColumn = maxBarcodeColumn2;
            }
            barcodeColumnCount++;
            maxBarcodeColumn2 = maxBarcodeColumn;
            z = true;
        }
        return createDecoderResult(detectionResult);
    }

    private static DetectionResult merge(DetectionResultRowIndicatorColumn leftRowIndicatorColumn, DetectionResultRowIndicatorColumn rightRowIndicatorColumn) throws NotFoundException {
        BarcodeMetadata barcodeMetadata;
        if ((leftRowIndicatorColumn == null && rightRowIndicatorColumn == null) || (barcodeMetadata = getBarcodeMetadata(leftRowIndicatorColumn, rightRowIndicatorColumn)) == null) {
            return null;
        }
        BoundingBox boundingBox = BoundingBox.merge(adjustBoundingBox(leftRowIndicatorColumn), adjustBoundingBox(rightRowIndicatorColumn));
        return new DetectionResult(barcodeMetadata, boundingBox);
    }

    private static BoundingBox adjustBoundingBox(DetectionResultRowIndicatorColumn rowIndicatorColumn) throws NotFoundException {
        int[] rowHeights;
        if (rowIndicatorColumn == null || (rowHeights = rowIndicatorColumn.getRowHeights()) == null) {
            return null;
        }
        int maxRowHeight = getMax(rowHeights);
        int row = 0;
        int missingStartRows = 0;
        for (int rowHeight : rowHeights) {
            missingStartRows += maxRowHeight - rowHeight;
            if (rowHeight > 0) {
                break;
            }
        }
        Codeword[] codewords = rowIndicatorColumn.getCodewords();
        while (true) {
            int row2 = row;
            if (missingStartRows <= 0 || codewords[row2] != null) {
                break;
            }
            missingStartRows--;
            row = row2 + 1;
        }
        int missingEndRows = 0;
        for (int row3 = rowHeights.length - 1; row3 >= 0; row3--) {
            missingEndRows += maxRowHeight - rowHeights[row3];
            if (rowHeights[row3] > 0) {
                break;
            }
        }
        int row4 = codewords.length;
        for (int row5 = row4 - 1; missingEndRows > 0 && codewords[row5] == null; row5--) {
            missingEndRows--;
        }
        return rowIndicatorColumn.getBoundingBox().addMissingRows(missingStartRows, missingEndRows, rowIndicatorColumn.isLeft());
    }

    private static int getMax(int[] values) {
        int maxValue = -1;
        for (int value : values) {
            maxValue = Math.max(maxValue, value);
        }
        return maxValue;
    }

    private static BarcodeMetadata getBarcodeMetadata(DetectionResultRowIndicatorColumn leftRowIndicatorColumn, DetectionResultRowIndicatorColumn rightRowIndicatorColumn) {
        BarcodeMetadata leftBarcodeMetadata;
        BarcodeMetadata rightBarcodeMetadata;
        if (leftRowIndicatorColumn == null || (leftBarcodeMetadata = leftRowIndicatorColumn.getBarcodeMetadata()) == null) {
            if (rightRowIndicatorColumn == null) {
                return null;
            }
            return rightRowIndicatorColumn.getBarcodeMetadata();
        }
        if (rightRowIndicatorColumn == null || (rightBarcodeMetadata = rightRowIndicatorColumn.getBarcodeMetadata()) == null || leftBarcodeMetadata.getColumnCount() == rightBarcodeMetadata.getColumnCount() || leftBarcodeMetadata.getErrorCorrectionLevel() == rightBarcodeMetadata.getErrorCorrectionLevel() || leftBarcodeMetadata.getRowCount() == rightBarcodeMetadata.getRowCount()) {
            return leftBarcodeMetadata;
        }
        return null;
    }

    private static DetectionResultRowIndicatorColumn getRowIndicatorColumn(BitMatrix image, BoundingBox boundingBox, ResultPoint startPoint, boolean leftToRight, int minCodewordWidth, int maxCodewordWidth) {
        DetectionResultRowIndicatorColumn rowIndicatorColumn = new DetectionResultRowIndicatorColumn(boundingBox, leftToRight);
        Codeword codeword = null;
        int i = 0;
        while (true) {
            int i2 = i;
            if (i2 >= 2) {
                return rowIndicatorColumn;
            }
            int increment = i2 == 0 ? 1 : -1;
            int startColumn = (int) startPoint.getX();
            int imageRow = (int) startPoint.getY();
            Codeword codeword2 = codeword;
            int startColumn2 = startColumn;
            while (true) {
                int imageRow2 = imageRow;
                if (imageRow2 > boundingBox.getMaxY() || imageRow2 < boundingBox.getMinY()) {
                    break;
                }
                Codeword codewordDetectCodeword = detectCodeword(image, 0, image.getWidth(), leftToRight, startColumn2, imageRow2, minCodewordWidth, maxCodewordWidth);
                codeword2 = codewordDetectCodeword;
                if (codewordDetectCodeword != null) {
                    rowIndicatorColumn.setCodeword(imageRow2, codeword2);
                    if (leftToRight) {
                        startColumn2 = codeword2.getStartX();
                    } else {
                        startColumn2 = codeword2.getEndX();
                    }
                }
                imageRow = imageRow2 + increment;
            }
            i = i2 + 1;
            codeword = codeword2;
        }
    }

    private static void adjustCodewordCount(DetectionResult detectionResult, BarcodeValue[][] barcodeMatrix) throws NotFoundException {
        int[] numberOfCodewords = barcodeMatrix[0][1].getValue();
        int calculatedNumberOfCodewords = (detectionResult.getBarcodeColumnCount() * detectionResult.getBarcodeRowCount()) - getNumberOfECCodeWords(detectionResult.getBarcodeECLevel());
        if (numberOfCodewords.length == 0) {
            if (calculatedNumberOfCodewords <= 0 || calculatedNumberOfCodewords > 928) {
                throw NotFoundException.getNotFoundInstance();
            }
            barcodeMatrix[0][1].setValue(calculatedNumberOfCodewords);
            return;
        }
        if (numberOfCodewords[0] != calculatedNumberOfCodewords) {
            barcodeMatrix[0][1].setValue(calculatedNumberOfCodewords);
        }
    }

    private static DecoderResult createDecoderResult(DetectionResult detectionResult) throws NotFoundException, ChecksumException, FormatException {
        BarcodeValue[][] barcodeMatrix = createBarcodeMatrix(detectionResult);
        adjustCodewordCount(detectionResult, barcodeMatrix);
        Collection<Integer> erasures = new ArrayList<>();
        int[] codewords = new int[detectionResult.getBarcodeRowCount() * detectionResult.getBarcodeColumnCount()];
        List<int[]> ambiguousIndexValuesList = new ArrayList<>();
        List<Integer> ambiguousIndexesList = new ArrayList<>();
        for (int row = 0; row < detectionResult.getBarcodeRowCount(); row++) {
            for (int column = 0; column < detectionResult.getBarcodeColumnCount(); column++) {
                int[] values = barcodeMatrix[row][column + 1].getValue();
                int codewordIndex = (detectionResult.getBarcodeColumnCount() * row) + column;
                if (values.length == 0) {
                    erasures.add(Integer.valueOf(codewordIndex));
                } else if (values.length == 1) {
                    codewords[codewordIndex] = values[0];
                } else {
                    ambiguousIndexesList.add(Integer.valueOf(codewordIndex));
                    ambiguousIndexValuesList.add(values);
                }
            }
        }
        int row2 = ambiguousIndexValuesList.size();
        int[][] ambiguousIndexValues = new int[row2][];
        for (int i = 0; i < ambiguousIndexValues.length; i++) {
            ambiguousIndexValues[i] = ambiguousIndexValuesList.get(i);
        }
        int i2 = detectionResult.getBarcodeECLevel();
        return createDecoderResultFromAmbiguousValues(i2, codewords, PDF417Common.toIntArray(erasures), PDF417Common.toIntArray(ambiguousIndexesList), ambiguousIndexValues);
    }

    /* JADX WARN: Code restructure failed: missing block: B:25:0x0047, code lost:
    
        r1 = r2;
     */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    private static com.google.zxing.common.DecoderResult createDecoderResultFromAmbiguousValues(int r7, int[] r8, int[] r9, int[] r10, int[][] r11) throws com.google.zxing.ChecksumException, com.google.zxing.FormatException {
        /*
            int r0 = r10.length
            int[] r0 = new int[r0]
            r1 = 100
        L5:
            int r2 = r1 + (-1)
            if (r1 <= 0) goto L4e
            r1 = 0
            r3 = 0
        Lb:
            int r4 = r0.length
            if (r3 >= r4) goto L1b
            r4 = r10[r3]
            r5 = r11[r3]
            r6 = r0[r3]
            r5 = r5[r6]
            r8[r4] = r5
            int r3 = r3 + 1
            goto Lb
        L1b:
            com.google.zxing.common.DecoderResult r3 = decodeCodewords(r8, r7, r9)     // Catch: com.google.zxing.ChecksumException -> L20
            return r3
        L20:
            r3 = move-exception
            int r3 = r0.length
            if (r3 == 0) goto L49
            r3 = 0
        L25:
            int r4 = r0.length
            if (r3 >= r4) goto L47
            r4 = r0[r3]
            r5 = r11[r3]
            int r5 = r5.length
            int r5 = r5 + (-1)
            if (r4 >= r5) goto L38
            r1 = r0[r3]
            int r1 = r1 + 1
            r0[r3] = r1
            goto L47
        L38:
            r0[r3] = r1
            int r4 = r0.length
            int r4 = r4 + (-1)
            if (r3 == r4) goto L42
            int r3 = r3 + 1
            goto L25
        L42:
            com.google.zxing.ChecksumException r1 = com.google.zxing.ChecksumException.getChecksumInstance()
            throw r1
        L47:
            r1 = r2
            goto L5
        L49:
            com.google.zxing.ChecksumException r1 = com.google.zxing.ChecksumException.getChecksumInstance()
            throw r1
        L4e:
            com.google.zxing.ChecksumException r1 = com.google.zxing.ChecksumException.getChecksumInstance()
            throw r1
        */
        throw new UnsupportedOperationException("Method not decompiled: com.google.zxing.pdf417.decoder.PDF417ScanningDecoder.createDecoderResultFromAmbiguousValues(int, int[], int[], int[], int[][]):com.google.zxing.common.DecoderResult");
    }

    private static BarcodeValue[][] createBarcodeMatrix(DetectionResult detectionResult) {
        BarcodeValue[][] barcodeMatrix = (BarcodeValue[][]) Array.newInstance((Class<?>) BarcodeValue.class, detectionResult.getBarcodeRowCount(), detectionResult.getBarcodeColumnCount() + 2);
        for (int row = 0; row < barcodeMatrix.length; row++) {
            for (int column = 0; column < barcodeMatrix[row].length; column++) {
                barcodeMatrix[row][column] = new BarcodeValue();
            }
        }
        int column2 = 0;
        int i = 0;
        for (DetectionResultColumn detectionResultColumn : detectionResult.getDetectionResultColumns()) {
            if (detectionResultColumn != null) {
                int rowNumber = i;
                for (Codeword codeword : detectionResultColumn.getCodewords()) {
                    if (codeword != null) {
                        int rowNumber2 = codeword.getRowNumber();
                        rowNumber = rowNumber2;
                        if (rowNumber2 >= 0 && rowNumber < barcodeMatrix.length) {
                            barcodeMatrix[rowNumber][column2].setValue(codeword.getValue());
                        }
                    }
                }
                i = rowNumber;
            }
            column2++;
        }
        return barcodeMatrix;
    }

    private static boolean isValidBarcodeColumn(DetectionResult detectionResult, int barcodeColumn) {
        return barcodeColumn >= 0 && barcodeColumn <= detectionResult.getBarcodeColumnCount() + 1;
    }

    private static int getStartColumn(DetectionResult detectionResult, int barcodeColumn, int imageRow, boolean leftToRight) {
        int offset = leftToRight ? 1 : -1;
        Codeword codeword = null;
        if (isValidBarcodeColumn(detectionResult, barcodeColumn - offset)) {
            codeword = detectionResult.getDetectionResultColumn(barcodeColumn - offset).getCodeword(imageRow);
        }
        if (codeword != null) {
            return leftToRight ? codeword.getEndX() : codeword.getStartX();
        }
        Codeword codewordNearby = detectionResult.getDetectionResultColumn(barcodeColumn).getCodewordNearby(imageRow);
        Codeword codeword2 = codewordNearby;
        if (codewordNearby != null) {
            return leftToRight ? codeword2.getStartX() : codeword2.getEndX();
        }
        if (isValidBarcodeColumn(detectionResult, barcodeColumn - offset)) {
            codeword2 = detectionResult.getDetectionResultColumn(barcodeColumn - offset).getCodewordNearby(imageRow);
        }
        if (codeword2 != null) {
            return leftToRight ? codeword2.getEndX() : codeword2.getStartX();
        }
        Codeword codeword3 = null;
        int barcodeColumn2 = barcodeColumn;
        int barcodeColumn3 = 0;
        while (isValidBarcodeColumn(detectionResult, barcodeColumn2 - offset)) {
            barcodeColumn2 -= offset;
            Codeword previousRowCodeword = codeword3;
            for (Codeword codeword4 : detectionResult.getDetectionResultColumn(barcodeColumn2).getCodewords()) {
                previousRowCodeword = codeword4;
                if (codeword4 != null) {
                    return (leftToRight ? previousRowCodeword.getEndX() : previousRowCodeword.getStartX()) + (offset * barcodeColumn3 * (previousRowCodeword.getEndX() - previousRowCodeword.getStartX()));
                }
            }
            barcodeColumn3++;
            codeword3 = previousRowCodeword;
        }
        return leftToRight ? detectionResult.getBoundingBox().getMinX() : detectionResult.getBoundingBox().getMaxX();
    }

    private static Codeword detectCodeword(BitMatrix image, int minColumn, int maxColumn, boolean leftToRight, int startColumn, int imageRow, int minCodewordWidth, int maxCodewordWidth) {
        int endColumn;
        int decodedValue;
        int codeword;
        int startColumn2 = adjustCodewordStartColumn(image, minColumn, maxColumn, leftToRight, startColumn, imageRow);
        int[] moduleBitCount = getModuleBitCount(image, minColumn, maxColumn, leftToRight, startColumn2, imageRow);
        if (moduleBitCount == null) {
            return null;
        }
        int codewordBitCount = MathUtils.sum(moduleBitCount);
        if (leftToRight) {
            endColumn = startColumn2 + codewordBitCount;
        } else {
            int tmpCount = 0;
            for (int i = 0; i < moduleBitCount.length / 2; i++) {
                tmpCount = moduleBitCount[i];
                moduleBitCount[i] = moduleBitCount[(moduleBitCount.length - 1) - i];
                moduleBitCount[(moduleBitCount.length - 1) - i] = tmpCount;
            }
            startColumn2 -= codewordBitCount;
            endColumn = startColumn2;
        }
        if (checkCodewordSkew(codewordBitCount, minCodewordWidth, maxCodewordWidth) && (codeword = PDF417Common.getCodeword((decodedValue = PDF417CodewordDecoder.getDecodedValue(moduleBitCount)))) != -1) {
            return new Codeword(startColumn2, endColumn, getCodewordBucketNumber(decodedValue), codeword);
        }
        return null;
    }

    /* JADX WARN: Removed duplicated region for block: B:11:0x0016  */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    private static int[] getModuleBitCount(com.google.zxing.common.BitMatrix r8, int r9, int r10, boolean r11, int r12, int r13) {
        /*
            r0 = r12
            r1 = 8
            int[] r2 = new int[r1]
            r3 = 0
            r4 = 1
            if (r11 == 0) goto Lb
            r5 = 1
            goto Lc
        Lb:
            r5 = -1
        Lc:
            r6 = r3
            r3 = r0
            r0 = r11
        Lf:
            if (r11 == 0) goto L14
            if (r3 >= r10) goto L2e
            goto L16
        L14:
            if (r3 < r9) goto L2e
        L16:
            if (r6 >= r1) goto L2e
            boolean r7 = r8.get(r3, r13)
            if (r7 != r0) goto L25
            r7 = r2[r6]
            int r7 = r7 + r4
            r2[r6] = r7
            int r3 = r3 + r5
            goto Lf
        L25:
            int r6 = r6 + 1
            if (r0 != 0) goto L2b
            r7 = 1
            goto L2c
        L2b:
            r7 = 0
        L2c:
            r0 = r7
            goto Lf
        L2e:
            if (r6 == r1) goto L3d
            if (r11 == 0) goto L34
            r1 = r10
            goto L35
        L34:
            r1 = r9
        L35:
            if (r3 != r1) goto L3b
            r1 = 7
            if (r6 != r1) goto L3b
            goto L3d
        L3b:
            r1 = 0
            return r1
        L3d:
            return r2
        */
        throw new UnsupportedOperationException("Method not decompiled: com.google.zxing.pdf417.decoder.PDF417ScanningDecoder.getModuleBitCount(com.google.zxing.common.BitMatrix, int, int, boolean, int, int):int[]");
    }

    private static int getNumberOfECCodeWords(int barcodeECLevel) {
        return 2 << barcodeECLevel;
    }

    /* JADX WARN: Removed duplicated region for block: B:13:0x0015  */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    private static int adjustCodewordStartColumn(com.google.zxing.common.BitMatrix r7, int r8, int r9, boolean r10, int r11, int r12) {
        /*
            r0 = r11
            r1 = 1
            if (r10 == 0) goto L6
            r2 = -1
            goto L7
        L6:
            r2 = 1
        L7:
            r3 = 0
            r4 = r2
            r2 = r10
            r10 = 0
        Lb:
            r5 = 2
            if (r10 >= r5) goto L30
        Le:
            if (r2 == 0) goto L13
            if (r0 < r8) goto L26
            goto L15
        L13:
            if (r0 >= r9) goto L26
        L15:
            boolean r6 = r7.get(r0, r12)
            if (r2 != r6) goto L26
            int r6 = r11 - r0
            int r6 = java.lang.Math.abs(r6)
            if (r6 <= r5) goto L24
            return r11
        L24:
            int r0 = r0 + r4
            goto Le
        L26:
            int r4 = -r4
            if (r2 != 0) goto L2b
            r5 = 1
            goto L2c
        L2b:
            r5 = 0
        L2c:
            r2 = r5
            int r10 = r10 + 1
            goto Lb
        L30:
            return r0
        */
        throw new UnsupportedOperationException("Method not decompiled: com.google.zxing.pdf417.decoder.PDF417ScanningDecoder.adjustCodewordStartColumn(com.google.zxing.common.BitMatrix, int, int, boolean, int, int):int");
    }

    private static boolean checkCodewordSkew(int codewordSize, int minCodewordWidth, int maxCodewordWidth) {
        return minCodewordWidth + (-2) <= codewordSize && codewordSize <= maxCodewordWidth + 2;
    }

    private static DecoderResult decodeCodewords(int[] codewords, int ecLevel, int[] erasures) throws ChecksumException, FormatException {
        if (codewords.length == 0) {
            throw FormatException.getFormatInstance();
        }
        int numECCodewords = 1 << (ecLevel + 1);
        int correctedErrorsCount = correctErrors(codewords, erasures, numECCodewords);
        verifyCodewordCount(codewords, numECCodewords);
        DecoderResult decoderResult = DecodedBitStreamParser.decode(codewords, String.valueOf(ecLevel));
        decoderResult.setErrorsCorrected(Integer.valueOf(correctedErrorsCount));
        decoderResult.setErasures(Integer.valueOf(erasures.length));
        return decoderResult;
    }

    private static int correctErrors(int[] codewords, int[] erasures, int numECCodewords) throws ChecksumException {
        if ((erasures != null && erasures.length > (numECCodewords / 2) + 3) || numECCodewords < 0 || numECCodewords > 512) {
            throw ChecksumException.getChecksumInstance();
        }
        return errorCorrection.decode(codewords, numECCodewords, erasures);
    }

    private static void verifyCodewordCount(int[] codewords, int numECCodewords) throws FormatException {
        if (codewords.length < 4) {
            throw FormatException.getFormatInstance();
        }
        int numberOfCodewords = codewords[0];
        if (numberOfCodewords > codewords.length) {
            throw FormatException.getFormatInstance();
        }
        if (numberOfCodewords == 0) {
            if (numECCodewords < codewords.length) {
                codewords[0] = codewords.length - numECCodewords;
                return;
            }
            throw FormatException.getFormatInstance();
        }
    }

    private static int[] getBitCountForCodeword(int codeword) {
        int[] result = new int[8];
        int previousValue = 0;
        int i = 7;
        while (true) {
            if ((codeword & 1) != previousValue) {
                previousValue = codeword & 1;
                i--;
                if (i < 0) {
                    return result;
                }
            }
            result[i] = result[i] + 1;
            codeword >>= 1;
        }
    }

    private static int getCodewordBucketNumber(int codeword) {
        return getCodewordBucketNumber(getBitCountForCodeword(codeword));
    }

    private static int getCodewordBucketNumber(int[] moduleBitCount) {
        return ((((moduleBitCount[0] - moduleBitCount[2]) + moduleBitCount[4]) - moduleBitCount[6]) + 9) % 9;
    }

    public static String toString(BarcodeValue[][] barcodeMatrix) {
        Formatter formatter = new Formatter();
        BarcodeValue barcodeValue = null;
        int row = 0;
        while (row < barcodeMatrix.length) {
            formatter.format("Row %2d: ", Integer.valueOf(row));
            BarcodeValue barcodeValue2 = barcodeValue;
            for (int column = 0; column < barcodeMatrix[row].length; column++) {
                BarcodeValue barcodeValue3 = barcodeMatrix[row][column];
                barcodeValue2 = barcodeValue3;
                if (barcodeValue3.getValue().length == 0) {
                    formatter.format("        ", null);
                } else {
                    formatter.format("%4d(%2d)", Integer.valueOf(barcodeValue2.getValue()[0]), barcodeValue2.getConfidence(barcodeValue2.getValue()[0]));
                }
            }
            formatter.format("%n", new Object[0]);
            row++;
            barcodeValue = barcodeValue2;
        }
        String result = formatter.toString();
        formatter.close();
        return result;
    }
}
