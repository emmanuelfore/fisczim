package com.google.zxing.qrcode.encoder;

/* JADX INFO: loaded from: classes.dex */
final class MaskUtil {
    private static final int N1 = 3;
    private static final int N2 = 3;
    private static final int N3 = 40;
    private static final int N4 = 10;

    private MaskUtil() {
    }

    static int applyMaskPenaltyRule1(ByteMatrix matrix) {
        return applyMaskPenaltyRule1Internal(matrix, true) + applyMaskPenaltyRule1Internal(matrix, false);
    }

    static int applyMaskPenaltyRule2(ByteMatrix matrix) {
        byte[][] array = matrix.getArray();
        int width = matrix.getWidth();
        int height = matrix.getHeight();
        int penalty = 0;
        int penalty2 = 0;
        while (penalty2 < height - 1) {
            int penalty3 = penalty;
            for (int penalty4 = 0; penalty4 < width - 1; penalty4++) {
                int value = array[penalty2][penalty4];
                if (value == array[penalty2][penalty4 + 1] && value == array[penalty2 + 1][penalty4] && value == array[penalty2 + 1][penalty4 + 1]) {
                    penalty3++;
                }
            }
            penalty2++;
            penalty = penalty3;
        }
        int y = penalty * 3;
        return y;
    }

    static int applyMaskPenaltyRule3(ByteMatrix matrix) {
        byte[][] array = matrix.getArray();
        int width = matrix.getWidth();
        int height = matrix.getHeight();
        int numPenalties = 0;
        int numPenalties2 = 0;
        while (numPenalties2 < height) {
            int numPenalties3 = numPenalties;
            for (int numPenalties4 = 0; numPenalties4 < width; numPenalties4++) {
                byte[] arrayY = array[numPenalties2];
                if (numPenalties4 + 6 < width && arrayY[numPenalties4] == 1 && arrayY[numPenalties4 + 1] == 0 && arrayY[numPenalties4 + 2] == 1 && arrayY[numPenalties4 + 3] == 1 && arrayY[numPenalties4 + 4] == 1 && arrayY[numPenalties4 + 5] == 0 && arrayY[numPenalties4 + 6] == 1 && (isWhiteHorizontal(arrayY, numPenalties4 - 4, numPenalties4) || isWhiteHorizontal(arrayY, numPenalties4 + 7, numPenalties4 + 11))) {
                    numPenalties3++;
                }
                if (numPenalties2 + 6 < height && array[numPenalties2][numPenalties4] == 1 && array[numPenalties2 + 1][numPenalties4] == 0 && array[numPenalties2 + 2][numPenalties4] == 1 && array[numPenalties2 + 3][numPenalties4] == 1 && array[numPenalties2 + 4][numPenalties4] == 1 && array[numPenalties2 + 5][numPenalties4] == 0 && array[numPenalties2 + 6][numPenalties4] == 1 && (isWhiteVertical(array, numPenalties4, numPenalties2 - 4, numPenalties2) || isWhiteVertical(array, numPenalties4, numPenalties2 + 7, numPenalties2 + 11))) {
                    numPenalties3++;
                }
            }
            numPenalties2++;
            numPenalties = numPenalties3;
        }
        int y = numPenalties * 40;
        return y;
    }

    private static boolean isWhiteHorizontal(byte[] rowArray, int from, int to) {
        int from2 = Math.max(from, 0);
        int to2 = Math.min(to, rowArray.length);
        for (int i = from2; i < to2; i++) {
            if (rowArray[i] == 1) {
                return false;
            }
        }
        return true;
    }

    private static boolean isWhiteVertical(byte[][] array, int col, int from, int to) {
        int from2 = Math.max(from, 0);
        int to2 = Math.min(to, array.length);
        for (int i = from2; i < to2; i++) {
            if (array[i][col] == 1) {
                return false;
            }
        }
        return true;
    }

    static int applyMaskPenaltyRule4(ByteMatrix matrix) {
        byte[][] array = matrix.getArray();
        int width = matrix.getWidth();
        int height = matrix.getHeight();
        int numDarkCells = 0;
        int numDarkCells2 = 0;
        while (numDarkCells2 < height) {
            byte[] arrayY = array[numDarkCells2];
            int numDarkCells3 = numDarkCells;
            for (int numDarkCells4 = 0; numDarkCells4 < width; numDarkCells4++) {
                if (arrayY[numDarkCells4] == 1) {
                    numDarkCells3++;
                }
            }
            numDarkCells2++;
            numDarkCells = numDarkCells3;
        }
        int y = matrix.getHeight();
        int numTotalCells = y * matrix.getWidth();
        return ((Math.abs((numDarkCells << 1) - numTotalCells) * 10) / numTotalCells) * 10;
    }

    static boolean getDataMaskBit(int maskPattern, int x, int y) {
        int intermediate;
        switch (maskPattern) {
            case 0:
                int intermediate2 = y + x;
                intermediate = intermediate2 & 1;
                break;
            case 1:
                intermediate = y & 1;
                break;
            case 2:
                intermediate = x % 3;
                break;
            case 3:
                int intermediate3 = y + x;
                intermediate = intermediate3 % 3;
                break;
            case 4:
                int intermediate4 = y / 2;
                intermediate = (intermediate4 + (x / 3)) & 1;
                break;
            case 5:
                int intermediate5 = y * x;
                intermediate = (intermediate5 & 1) + (intermediate5 % 3);
                break;
            case 6:
                int intermediate6 = y * x;
                intermediate = ((intermediate6 & 1) + (intermediate6 % 3)) & 1;
                break;
            case 7:
                intermediate = (((y * x) % 3) + ((y + x) & 1)) & 1;
                break;
            default:
                throw new IllegalArgumentException("Invalid mask pattern: " + maskPattern);
        }
        return intermediate == 0;
    }

    private static int applyMaskPenaltyRule1Internal(ByteMatrix matrix, boolean isHorizontal) {
        int iLimit = isHorizontal ? matrix.getHeight() : matrix.getWidth();
        int jLimit = isHorizontal ? matrix.getWidth() : matrix.getHeight();
        byte[][] array = matrix.getArray();
        int penalty = 0;
        int penalty2 = 0;
        int i = 0;
        while (penalty2 < iLimit) {
            int numSameBitCells = 0;
            int prevBit = -1;
            int bit = i;
            int penalty3 = penalty;
            for (int penalty4 = 0; penalty4 < jLimit; penalty4++) {
                int i2 = isHorizontal ? array[penalty2][penalty4] : array[penalty4][penalty2];
                bit = i2;
                if (i2 == prevBit) {
                    numSameBitCells++;
                } else {
                    if (numSameBitCells >= 5) {
                        penalty3 += (numSameBitCells - 5) + 3;
                    }
                    numSameBitCells = 1;
                    prevBit = bit;
                }
            }
            if (numSameBitCells >= 5) {
                penalty3 += (numSameBitCells - 5) + 3;
            }
            penalty = penalty3;
            penalty2++;
            i = bit;
        }
        return penalty;
    }
}
