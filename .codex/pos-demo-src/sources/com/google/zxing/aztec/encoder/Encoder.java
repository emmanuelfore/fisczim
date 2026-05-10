package com.google.zxing.aztec.encoder;

import com.google.zxing.common.BitArray;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.reedsolomon.GenericGF;
import com.google.zxing.common.reedsolomon.ReedSolomonEncoder;

/* JADX INFO: loaded from: classes.dex */
public final class Encoder {
    public static final int DEFAULT_AZTEC_LAYERS = 0;
    public static final int DEFAULT_EC_PERCENT = 33;
    private static final int MAX_NB_BITS = 32;
    private static final int MAX_NB_BITS_COMPACT = 4;
    private static final int[] WORD_SIZE = {4, 6, 6, 8, 8, 8, 8, 8, 8, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12};

    private Encoder() {
    }

    public static AztecCode encode(byte[] data) {
        return encode(data, 33, 0);
    }

    public static AztecCode encode(byte[] data, int minECCPercent, int userSpecifiedLayers) {
        int wordSize;
        boolean compact;
        int layers;
        int totalBitsInLayer;
        int eccBits;
        BitArray bits;
        int totalSizeBits;
        BitArray stuffedBits;
        int matrixSize;
        BitArray bits2;
        int totalSizeBits2;
        int wordSize2;
        BitArray bitArrayEncode = new HighLevelEncoder(data).encode();
        BitArray bits3 = bitArrayEncode;
        int i = ((bitArrayEncode.getSize() * minECCPercent) / 100) + 11;
        int totalSizeBits3 = bits3.getSize() + i;
        boolean z = false;
        if (userSpecifiedLayers != 0) {
            boolean compact2 = userSpecifiedLayers < 0;
            int layers2 = Math.abs(userSpecifiedLayers);
            if (layers2 > (compact2 ? 4 : 32)) {
                throw new IllegalArgumentException(String.format("Illegal value %s for layers", Integer.valueOf(userSpecifiedLayers)));
            }
            int totalBitsInLayer2 = totalBitsInLayer(layers2, compact2);
            wordSize = WORD_SIZE[layers2];
            int usableBitsInLayers = totalBitsInLayer2 - (totalBitsInLayer2 % wordSize);
            BitArray stuffedBits2 = stuffBits(bits3, wordSize);
            if (stuffedBits2.getSize() + i > usableBitsInLayers) {
                throw new IllegalArgumentException("Data to large for user specified layer");
            }
            if (compact2 && stuffedBits2.getSize() > (wordSize << 6)) {
                throw new IllegalArgumentException("Data to large for user specified layer");
            }
            totalBitsInLayer = totalBitsInLayer2;
            layers = layers2;
            stuffedBits = stuffedBits2;
            compact = compact2;
        } else {
            BitArray stuffedBits3 = null;
            wordSize = 0;
            int wordSize3 = 0;
            while (wordSize3 <= i) {
                boolean z2 = wordSize3 <= 3;
                compact = z2;
                int i2 = z2 ? wordSize3 + 1 : wordSize3;
                layers = i2;
                totalBitsInLayer = totalBitsInLayer(i2, compact);
                if (totalSizeBits3 > totalBitsInLayer) {
                    eccBits = i;
                    bits = bits3;
                    totalSizeBits = totalSizeBits3;
                } else {
                    if (wordSize != WORD_SIZE[layers]) {
                        int wordSize4 = WORD_SIZE[layers];
                        stuffedBits3 = stuffBits(bits3, wordSize4);
                        wordSize = wordSize4;
                    }
                    BitArray stuffedBits4 = stuffedBits3;
                    int usableBitsInLayers2 = totalBitsInLayer - (totalBitsInLayer % wordSize);
                    if ((compact && stuffedBits4.getSize() > (wordSize << 6)) || stuffedBits4.getSize() + i > usableBitsInLayers2) {
                        eccBits = i;
                        bits = bits3;
                        totalSizeBits = totalSizeBits3;
                        stuffedBits3 = stuffedBits4;
                    } else {
                        stuffedBits = stuffedBits4;
                    }
                }
                wordSize3++;
                i = eccBits;
                bits3 = bits;
                totalSizeBits3 = totalSizeBits;
                i = 32;
                z = false;
            }
            throw new IllegalArgumentException("Data too large for an Aztec code");
        }
        BitArray messageBits = generateCheckWords(stuffedBits, totalBitsInLayer, wordSize);
        int messageSizeInWords = stuffedBits.getSize() / wordSize;
        BitArray modeMessage = generateModeMessage(compact, layers, messageSizeInWords);
        int baseMatrixSize = (compact ? 11 : 14) + (layers << 2);
        int[] alignmentMap = new int[baseMatrixSize];
        if (!compact) {
            matrixSize = baseMatrixSize + 1 + ((((baseMatrixSize / 2) - 1) / 15) * 2);
            int origCenter = baseMatrixSize / 2;
            int center = matrixSize / 2;
            int i3 = 0;
            while (true) {
                int i4 = i3;
                int eccBits2 = i;
                if (i4 >= origCenter) {
                    break;
                }
                int newOffset = i4 + (i4 / 15);
                alignmentMap[(origCenter - i4) - 1] = (center - newOffset) - 1;
                alignmentMap[origCenter + i4] = center + newOffset + 1;
                i3 = i4 + 1;
                i = eccBits2;
            }
        } else {
            matrixSize = baseMatrixSize;
            int i5 = 0;
            while (true) {
                int i6 = i5;
                if (i6 >= alignmentMap.length) {
                    break;
                }
                alignmentMap[i6] = i6;
                i5 = i6 + 1;
            }
        }
        int matrixSize2 = matrixSize;
        BitMatrix matrix = new BitMatrix(matrixSize2);
        int i7 = 0;
        int rowOffset = 0;
        while (i7 < layers) {
            BitArray stuffedBits5 = stuffedBits;
            int rowSize = ((layers - i7) << 2) + (compact ? 9 : 12);
            int j = 0;
            while (true) {
                int j2 = j;
                bits2 = bits3;
                if (j2 < rowSize) {
                    int columnOffset = j2 << 1;
                    int k = 0;
                    while (true) {
                        int k2 = k;
                        totalSizeBits2 = totalSizeBits3;
                        if (k2 < 2) {
                            if (messageBits.get(rowOffset + columnOffset + k2)) {
                                int i8 = alignmentMap[(i7 << 1) + k2];
                                wordSize2 = wordSize;
                                int wordSize5 = alignmentMap[(i7 << 1) + j2];
                                matrix.set(i8, wordSize5);
                            } else {
                                wordSize2 = wordSize;
                            }
                            if (messageBits.get((rowSize << 1) + rowOffset + columnOffset + k2)) {
                                matrix.set(alignmentMap[(i7 << 1) + j2], alignmentMap[((baseMatrixSize - 1) - (i7 << 1)) - k2]);
                            }
                            if (messageBits.get((rowSize << 2) + rowOffset + columnOffset + k2)) {
                                matrix.set(alignmentMap[((baseMatrixSize - 1) - (i7 << 1)) - k2], alignmentMap[((baseMatrixSize - 1) - (i7 << 1)) - j2]);
                            }
                            if (messageBits.get((rowSize * 6) + rowOffset + columnOffset + k2)) {
                                matrix.set(alignmentMap[((baseMatrixSize - 1) - (i7 << 1)) - j2], alignmentMap[(i7 << 1) + k2]);
                            }
                            k = k2 + 1;
                            totalSizeBits3 = totalSizeBits2;
                            wordSize = wordSize2;
                        }
                    }
                    j = j2 + 1;
                    bits3 = bits2;
                    totalSizeBits3 = totalSizeBits2;
                }
            }
            rowOffset += rowSize << 3;
            i7++;
            stuffedBits = stuffedBits5;
            bits3 = bits2;
        }
        drawModeMessage(matrix, compact, matrixSize2, modeMessage);
        if (compact) {
            drawBullsEye(matrix, matrixSize2 / 2, 5);
        } else {
            drawBullsEye(matrix, matrixSize2 / 2, 7);
            int i9 = 0;
            int j3 = 0;
            while (true) {
                int j4 = j3;
                if (i9 >= (baseMatrixSize / 2) - 1) {
                    break;
                }
                for (int k3 = (matrixSize2 / 2) & 1; k3 < matrixSize2; k3 += 2) {
                    matrix.set((matrixSize2 / 2) - j4, k3);
                    matrix.set((matrixSize2 / 2) + j4, k3);
                    matrix.set(k3, (matrixSize2 / 2) - j4);
                    matrix.set(k3, (matrixSize2 / 2) + j4);
                }
                i9 += 15;
                j3 = j4 + 16;
            }
        }
        AztecCode aztec = new AztecCode();
        aztec.setCompact(compact);
        aztec.setSize(matrixSize2);
        aztec.setLayers(layers);
        aztec.setCodeWords(messageSizeInWords);
        aztec.setMatrix(matrix);
        return aztec;
    }

    private static void drawBullsEye(BitMatrix matrix, int center, int size) {
        for (int i = 0; i < size; i += 2) {
            for (int j = center - i; j <= center + i; j++) {
                matrix.set(j, center - i);
                matrix.set(j, center + i);
                matrix.set(center - i, j);
                matrix.set(center + i, j);
            }
        }
        int i2 = center - size;
        matrix.set(i2, center - size);
        matrix.set((center - size) + 1, center - size);
        matrix.set(center - size, (center - size) + 1);
        matrix.set(center + size, center - size);
        matrix.set(center + size, (center - size) + 1);
        matrix.set(center + size, (center + size) - 1);
    }

    static BitArray generateModeMessage(boolean compact, int layers, int messageSizeInWords) {
        BitArray modeMessage = new BitArray();
        if (compact) {
            modeMessage.appendBits(layers - 1, 2);
            modeMessage.appendBits(messageSizeInWords - 1, 6);
            return generateCheckWords(modeMessage, 28, 4);
        }
        modeMessage.appendBits(layers - 1, 5);
        modeMessage.appendBits(messageSizeInWords - 1, 11);
        return generateCheckWords(modeMessage, 40, 4);
    }

    private static void drawModeMessage(BitMatrix matrix, boolean compact, int matrixSize, BitArray modeMessage) {
        int center = matrixSize / 2;
        int i = 0;
        if (compact) {
            while (i < 7) {
                int offset = (center - 3) + i;
                if (modeMessage.get(i)) {
                    matrix.set(offset, center - 5);
                }
                if (modeMessage.get(i + 7)) {
                    matrix.set(center + 5, offset);
                }
                if (modeMessage.get(20 - i)) {
                    matrix.set(offset, center + 5);
                }
                if (modeMessage.get(27 - i)) {
                    matrix.set(center - 5, offset);
                }
                i++;
            }
            return;
        }
        while (i < 10) {
            int offset2 = (center - 5) + i + (i / 5);
            if (modeMessage.get(i)) {
                matrix.set(offset2, center - 7);
            }
            if (modeMessage.get(i + 10)) {
                matrix.set(center + 7, offset2);
            }
            if (modeMessage.get(29 - i)) {
                matrix.set(offset2, center + 7);
            }
            if (modeMessage.get(39 - i)) {
                matrix.set(center - 7, offset2);
            }
            i++;
        }
    }

    private static BitArray generateCheckWords(BitArray bitArray, int totalBits, int wordSize) {
        int messageSizeInWords = bitArray.getSize() / wordSize;
        ReedSolomonEncoder rs = new ReedSolomonEncoder(getGF(wordSize));
        int totalWords = totalBits / wordSize;
        int[] messageWords = bitsToWords(bitArray, wordSize, totalWords);
        rs.encode(messageWords, totalWords - messageSizeInWords);
        int startPad = totalBits % wordSize;
        BitArray messageBits = new BitArray();
        messageBits.appendBits(0, startPad);
        for (int messageWord : messageWords) {
            messageBits.appendBits(messageWord, wordSize);
        }
        return messageBits;
    }

    private static int[] bitsToWords(BitArray stuffedBits, int wordSize, int totalWords) {
        int[] message = new int[totalWords];
        int n = stuffedBits.getSize() / wordSize;
        for (int i = 0; i < n; i++) {
            int value = 0;
            for (int value2 = 0; value2 < wordSize; value2++) {
                value |= stuffedBits.get((i * wordSize) + value2) ? 1 << ((wordSize - value2) - 1) : 0;
            }
            message[i] = value;
        }
        return message;
    }

    private static GenericGF getGF(int wordSize) {
        if (wordSize == 4) {
            return GenericGF.AZTEC_PARAM;
        }
        if (wordSize == 6) {
            return GenericGF.AZTEC_DATA_6;
        }
        if (wordSize == 8) {
            return GenericGF.AZTEC_DATA_8;
        }
        if (wordSize == 10) {
            return GenericGF.AZTEC_DATA_10;
        }
        if (wordSize == 12) {
            return GenericGF.AZTEC_DATA_12;
        }
        throw new IllegalArgumentException("Unsupported word size " + wordSize);
    }

    static BitArray stuffBits(BitArray bits, int wordSize) {
        BitArray out = new BitArray();
        int n = bits.getSize();
        int mask = (1 << wordSize) - 2;
        int i = 0;
        while (i < n) {
            int word = 0;
            for (int word2 = 0; word2 < wordSize; word2++) {
                if (i + word2 >= n || bits.get(i + word2)) {
                    word |= 1 << ((wordSize - 1) - word2);
                }
            }
            int j = word & mask;
            if (j == mask) {
                out.appendBits(word & mask, wordSize);
                i--;
            } else if ((word & mask) == 0) {
                out.appendBits(word | 1, wordSize);
                i--;
            } else {
                out.appendBits(word, wordSize);
            }
            i += wordSize;
        }
        return out;
    }

    private static int totalBitsInLayer(int layers, boolean compact) {
        return ((compact ? 88 : 112) + (layers << 4)) * layers;
    }
}
