package com.google.zxing.aztec.decoder;

import com.google.zxing.FormatException;
import com.google.zxing.aztec.AztecDetectorResult;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.DecoderResult;
import com.google.zxing.common.reedsolomon.GenericGF;
import com.google.zxing.common.reedsolomon.ReedSolomonDecoder;
import com.google.zxing.common.reedsolomon.ReedSolomonException;
import java.util.Arrays;

/* JADX INFO: loaded from: classes.dex */
public final class Decoder {
    private AztecDetectorResult ddata;
    private static final String[] UPPER_TABLE = {"CTRL_PS", " ", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "CTRL_LL", "CTRL_ML", "CTRL_DL", "CTRL_BS"};
    private static final String[] LOWER_TABLE = {"CTRL_PS", " ", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "CTRL_US", "CTRL_ML", "CTRL_DL", "CTRL_BS"};
    private static final String[] MIXED_TABLE = {"CTRL_PS", " ", "\u0001", "\u0002", "\u0003", "\u0004", "\u0005", "\u0006", "\u0007", "\b", "\t", "\n", "\u000b", "\f", "\r", "\u001b", "\u001c", "\u001d", "\u001e", "\u001f", "@", "\\", "^", "_", "`", "|", "~", "\u007f", "CTRL_LL", "CTRL_UL", "CTRL_PL", "CTRL_BS"};
    private static final String[] PUNCT_TABLE = {"", "\r", "\r\n", ". ", ", ", ": ", "!", "\"", "#", "$", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/", ":", ";", "<", "=", ">", "?", "[", "]", "{", "}", "CTRL_UL"};
    private static final String[] DIGIT_TABLE = {"CTRL_PS", " ", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ",", ".", "CTRL_UL", "CTRL_US"};

    private enum Table {
        UPPER,
        LOWER,
        MIXED,
        DIGIT,
        PUNCT,
        BINARY
    }

    public DecoderResult decode(AztecDetectorResult detectorResult) throws FormatException {
        this.ddata = detectorResult;
        BitMatrix matrix = detectorResult.getBits();
        boolean[] rawbits = extractBits(matrix);
        boolean[] correctedBits = correctBits(rawbits);
        byte[] rawBytes = convertBoolArrayToByteArray(correctedBits);
        String result = getEncodedData(correctedBits);
        DecoderResult decoderResult = new DecoderResult(rawBytes, result, null, null);
        decoderResult.setNumBits(correctedBits.length);
        return decoderResult;
    }

    public static String highLevelDecode(boolean[] correctedBits) {
        return getEncodedData(correctedBits);
    }

    private static String getEncodedData(boolean[] correctedBits) {
        int endIndex = correctedBits.length;
        Table latchTable = Table.UPPER;
        Table shiftTable = Table.UPPER;
        StringBuilder result = new StringBuilder(20);
        Table latchTable2 = latchTable;
        int index = 0;
        while (index < endIndex) {
            if (shiftTable == Table.BINARY) {
                if (endIndex - index < 5) {
                    break;
                }
                int length = readCode(correctedBits, index, 5);
                int index2 = index + 5;
                if (length == 0) {
                    if (endIndex - index2 < 11) {
                        break;
                    }
                    length = readCode(correctedBits, index2, 11) + 31;
                    index2 += 11;
                }
                int index3 = index2;
                int index4 = 0;
                while (true) {
                    if (index4 >= length) {
                        break;
                    }
                    if (endIndex - index3 < 8) {
                        index3 = endIndex;
                        break;
                    }
                    int code = readCode(correctedBits, index3, 8);
                    result.append((char) code);
                    index3 += 8;
                    index4++;
                }
                index = index3;
                shiftTable = latchTable2;
            } else {
                int size = shiftTable == Table.DIGIT ? 4 : 5;
                if (endIndex - index < size) {
                    break;
                }
                int code2 = readCode(correctedBits, index, size);
                index += size;
                String str = getCharacter(shiftTable, code2);
                if (str.startsWith("CTRL_")) {
                    latchTable2 = shiftTable;
                    shiftTable = getTable(str.charAt(5));
                    if (str.charAt(6) == 'L') {
                        latchTable2 = shiftTable;
                    }
                } else {
                    result.append(str);
                    shiftTable = latchTable2;
                }
            }
        }
        return result.toString();
    }

    private static Table getTable(char t) {
        if (t == 'B') {
            return Table.BINARY;
        }
        if (t == 'D') {
            return Table.DIGIT;
        }
        if (t != 'P') {
            switch (t) {
                case 'L':
                    return Table.LOWER;
                case 'M':
                    return Table.MIXED;
                default:
                    return Table.UPPER;
            }
        }
        return Table.PUNCT;
    }

    private static String getCharacter(Table table, int code) {
        switch (table) {
            case UPPER:
                return UPPER_TABLE[code];
            case LOWER:
                return LOWER_TABLE[code];
            case MIXED:
                return MIXED_TABLE[code];
            case PUNCT:
                return PUNCT_TABLE[code];
            case DIGIT:
                return DIGIT_TABLE[code];
            default:
                throw new IllegalStateException("Bad table");
        }
    }

    /* JADX WARN: Multi-variable type inference failed */
    private boolean[] correctBits(boolean[] zArr) throws FormatException {
        int i;
        GenericGF genericGF;
        if (this.ddata.getNbLayers() <= 2) {
            i = 6;
            genericGF = GenericGF.AZTEC_DATA_6;
        } else if (this.ddata.getNbLayers() <= 8) {
            i = 8;
            genericGF = GenericGF.AZTEC_DATA_8;
        } else if (this.ddata.getNbLayers() <= 22) {
            i = 10;
            genericGF = GenericGF.AZTEC_DATA_10;
        } else {
            i = 12;
            genericGF = GenericGF.AZTEC_DATA_12;
        }
        int i2 = i;
        int nbDatablocks = this.ddata.getNbDatablocks();
        int length = zArr.length / i2;
        if (length < nbDatablocks) {
            throw FormatException.getFormatInstance();
        }
        int[] iArr = new int[length];
        int length2 = zArr.length % i2;
        int i3 = 0;
        while (i3 < length) {
            iArr[i3] = readCode(zArr, length2, i2);
            i3++;
            length2 += i2;
        }
        try {
            new ReedSolomonDecoder(genericGF).decode(iArr, length - nbDatablocks);
            int i4 = 1;
            int i5 = (1 << i2) - 1;
            int i6 = 0;
            for (int i7 = 0; i7 < nbDatablocks; i7++) {
                int i8 = iArr[i7];
                if (i8 == 0 || i8 == i5) {
                    throw FormatException.getFormatInstance();
                }
                if (i8 == 1 || i8 == i5 - 1) {
                    i6++;
                }
            }
            boolean[] zArr2 = new boolean[(nbDatablocks * i2) - i6];
            int i9 = 0;
            int i10 = 0;
            while (i10 < nbDatablocks) {
                int i11 = iArr[i10];
                if (i11 == i4 || i11 == i5 - 1) {
                    int i12 = (i9 + i2) - (i4 == true ? 1 : 0);
                    boolean z = i4;
                    if (i11 <= i4) {
                        z = 0;
                    }
                    Arrays.fill(zArr2, i9, i12, z);
                    i9 += i2 - 1;
                } else {
                    int i13 = i2 - 1;
                    while (i13 >= 0) {
                        int i14 = i9 + 1;
                        zArr2[i9] = (i11 & ((i4 == true ? 1 : 0) << i13)) != 0;
                        i13--;
                        i9 = i14;
                    }
                }
                i10++;
                i4 = 1;
            }
            return zArr2;
        } catch (ReedSolomonException e) {
            throw FormatException.getFormatInstance(e);
        }
    }

    private boolean[] extractBits(BitMatrix matrix) {
        boolean compact = this.ddata.isCompact();
        int layers = this.ddata.getNbLayers();
        int baseMatrixSize = (compact ? 11 : 14) + (layers << 2);
        int[] alignmentMap = new int[baseMatrixSize];
        boolean[] rawbits = new boolean[totalBitsInLayer(layers, compact)];
        int i = 2;
        if (compact) {
            for (int i2 = 0; i2 < alignmentMap.length; i2++) {
                alignmentMap[i2] = i2;
            }
        } else {
            int i3 = baseMatrixSize + 1;
            int matrixSize = i3 + ((((baseMatrixSize / 2) - 1) / 15) * 2);
            int origCenter = baseMatrixSize / 2;
            int center = matrixSize / 2;
            for (int i4 = 0; i4 < origCenter; i4++) {
                int newOffset = (i4 / 15) + i4;
                alignmentMap[(origCenter - i4) - 1] = (center - newOffset) - 1;
                alignmentMap[origCenter + i4] = center + newOffset + 1;
            }
        }
        int i5 = 0;
        int rowOffset = 0;
        while (i5 < layers) {
            int rowSize = ((layers - i5) << i) + (compact ? 9 : 12);
            int low = i5 << 1;
            int high = (baseMatrixSize - 1) - low;
            int j = 0;
            while (j < rowSize) {
                int columnOffset = j << 1;
                int k = 0;
                while (true) {
                    int k2 = k;
                    if (k2 < i) {
                        rawbits[rowOffset + columnOffset + k2] = matrix.get(alignmentMap[low + k2], alignmentMap[low + j]);
                        rawbits[(rowSize * 2) + rowOffset + columnOffset + k2] = matrix.get(alignmentMap[low + j], alignmentMap[high - k2]);
                        rawbits[(rowSize * 4) + rowOffset + columnOffset + k2] = matrix.get(alignmentMap[high - k2], alignmentMap[high - j]);
                        rawbits[(rowSize * 6) + rowOffset + columnOffset + k2] = matrix.get(alignmentMap[high - j], alignmentMap[low + k2]);
                        k = k2 + 1;
                        compact = compact;
                        i = 2;
                    }
                }
                j++;
                i = 2;
            }
            rowOffset += rowSize << 3;
            i5++;
            i = 2;
        }
        return rawbits;
    }

    private static int readCode(boolean[] rawbits, int startIndex, int length) {
        int res = 0;
        for (int res2 = startIndex; res2 < startIndex + length; res2++) {
            res <<= 1;
            if (rawbits[res2]) {
                res |= 1;
            }
        }
        return res;
    }

    private static byte readByte(boolean[] rawbits, int startIndex) {
        int n = rawbits.length - startIndex;
        if (n < 8) {
            return (byte) (readCode(rawbits, startIndex, n) << (8 - n));
        }
        return (byte) readCode(rawbits, startIndex, 8);
    }

    static byte[] convertBoolArrayToByteArray(boolean[] boolArr) {
        byte[] byteArr = new byte[(boolArr.length + 7) / 8];
        for (int i = 0; i < byteArr.length; i++) {
            byteArr[i] = readByte(boolArr, i << 3);
        }
        return byteArr;
    }

    private static int totalBitsInLayer(int layers, boolean compact) {
        return ((compact ? 88 : 112) + (layers << 4)) * layers;
    }
}
