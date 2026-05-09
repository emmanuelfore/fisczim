package com.google.zxing.qrcode.decoder;

import com.google.zxing.qrcode.decoder.Version;

/* JADX INFO: loaded from: classes.dex */
final class DataBlock {
    private final byte[] codewords;
    private final int numDataCodewords;

    private DataBlock(int numDataCodewords, byte[] codewords) {
        this.numDataCodewords = numDataCodewords;
        this.codewords = codewords;
    }

    static DataBlock[] getDataBlocks(byte[] rawCodewords, Version version, ErrorCorrectionLevel ecLevel) {
        if (rawCodewords.length != version.getTotalCodewords()) {
            throw new IllegalArgumentException();
        }
        Version.ECBlocks ecBlocks = version.getECBlocksForLevel(ecLevel);
        Version.ECB[] ecBlockArray = ecBlocks.getECBlocks();
        int totalBlocks = 0;
        for (Version.ECB ecb : ecBlockArray) {
            totalBlocks += ecb.getCount();
        }
        DataBlock[] result = new DataBlock[totalBlocks];
        int length = ecBlockArray.length;
        int numResultBlocks = 0;
        int numResultBlocks2 = 0;
        while (numResultBlocks2 < length) {
            Version.ECB ecBlock = ecBlockArray[numResultBlocks2];
            int numResultBlocks3 = numResultBlocks;
            int numResultBlocks4 = 0;
            while (numResultBlocks4 < ecBlock.getCount()) {
                int numDataCodewords = ecBlock.getDataCodewords();
                int numBlockCodewords = ecBlocks.getECCodewordsPerBlock() + numDataCodewords;
                result[numResultBlocks3] = new DataBlock(numDataCodewords, new byte[numBlockCodewords]);
                numResultBlocks4++;
                numResultBlocks3++;
            }
            numResultBlocks2++;
            numResultBlocks = numResultBlocks3;
        }
        int shorterBlocksTotalCodewords = result[0].codewords.length;
        int longerBlocksStartAt = result.length - 1;
        while (longerBlocksStartAt >= 0 && result[longerBlocksStartAt].codewords.length != shorterBlocksTotalCodewords) {
            longerBlocksStartAt--;
        }
        int longerBlocksStartAt2 = longerBlocksStartAt + 1;
        int shorterBlocksNumDataCodewords = shorterBlocksTotalCodewords - ecBlocks.getECCodewordsPerBlock();
        int rawCodewordsOffset = 0;
        int rawCodewordsOffset2 = 0;
        while (rawCodewordsOffset2 < shorterBlocksNumDataCodewords) {
            int rawCodewordsOffset3 = rawCodewordsOffset;
            int rawCodewordsOffset4 = 0;
            while (rawCodewordsOffset4 < numResultBlocks) {
                result[rawCodewordsOffset4].codewords[rawCodewordsOffset2] = rawCodewords[rawCodewordsOffset3];
                rawCodewordsOffset4++;
                rawCodewordsOffset3++;
            }
            rawCodewordsOffset2++;
            rawCodewordsOffset = rawCodewordsOffset3;
        }
        int j = longerBlocksStartAt2;
        while (j < numResultBlocks) {
            result[j].codewords[shorterBlocksNumDataCodewords] = rawCodewords[rawCodewordsOffset];
            j++;
            rawCodewordsOffset++;
        }
        int max = result[0].codewords.length;
        int rawCodewordsOffset5 = rawCodewordsOffset;
        int rawCodewordsOffset6 = shorterBlocksNumDataCodewords;
        while (rawCodewordsOffset6 < max) {
            int rawCodewordsOffset7 = rawCodewordsOffset5;
            int rawCodewordsOffset8 = 0;
            while (rawCodewordsOffset8 < numResultBlocks) {
                int iOffset = rawCodewordsOffset8 < longerBlocksStartAt2 ? rawCodewordsOffset6 : rawCodewordsOffset6 + 1;
                result[rawCodewordsOffset8].codewords[iOffset] = rawCodewords[rawCodewordsOffset7];
                rawCodewordsOffset8++;
                rawCodewordsOffset7++;
            }
            rawCodewordsOffset6++;
            rawCodewordsOffset5 = rawCodewordsOffset7;
        }
        return result;
    }

    int getNumDataCodewords() {
        return this.numDataCodewords;
    }

    byte[] getCodewords() {
        return this.codewords;
    }
}
