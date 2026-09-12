package com.google.zxing.datamatrix.decoder;

import com.google.zxing.datamatrix.decoder.Version;

/* JADX INFO: loaded from: classes.dex */
final class DataBlock {
    private final byte[] codewords;
    private final int numDataCodewords;

    private DataBlock(int numDataCodewords, byte[] codewords) {
        this.numDataCodewords = numDataCodewords;
        this.codewords = codewords;
    }

    static DataBlock[] getDataBlocks(byte[] rawCodewords, Version version) {
        Version.ECBlocks ecBlocks;
        int jOffset;
        int iOffset;
        Version.ECBlocks ecBlocks2 = version.getECBlocks();
        Version.ECB[] ecBlockArray = ecBlocks2.getECBlocks();
        int length = ecBlockArray.length;
        int totalBlocks = 0;
        int totalBlocks2 = 0;
        while (totalBlocks2 < length) {
            totalBlocks += ecBlockArray[totalBlocks2].getCount();
            totalBlocks2++;
        }
        DataBlock[] result = new DataBlock[totalBlocks];
        int length2 = ecBlockArray.length;
        int numResultBlocks = 0;
        int numResultBlocks2 = 0;
        while (numResultBlocks2 < length2) {
            Version.ECB ecBlock = ecBlockArray[numResultBlocks2];
            int numResultBlocks3 = numResultBlocks;
            int numResultBlocks4 = 0;
            while (numResultBlocks4 < ecBlock.getCount()) {
                int numDataCodewords = ecBlock.getDataCodewords();
                int numBlockCodewords = ecBlocks2.getECCodewords() + numDataCodewords;
                result[numResultBlocks3] = new DataBlock(numDataCodewords, new byte[numBlockCodewords]);
                numResultBlocks4++;
                numResultBlocks3++;
            }
            numResultBlocks2++;
            numResultBlocks = numResultBlocks3;
        }
        int longerBlocksNumDataCodewords = result[0].codewords.length - ecBlocks2.getECCodewords();
        int shorterBlocksNumDataCodewords = longerBlocksNumDataCodewords - 1;
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
        int rawCodewordsOffset5 = version.getVersionNumber();
        boolean z = rawCodewordsOffset5 == 24;
        boolean specialVersion = z;
        int numLongerBlocks = z ? 8 : numResultBlocks;
        int rawCodewordsOffset6 = rawCodewordsOffset;
        int rawCodewordsOffset7 = 0;
        while (rawCodewordsOffset7 < numLongerBlocks) {
            result[rawCodewordsOffset7].codewords[longerBlocksNumDataCodewords - 1] = rawCodewords[rawCodewordsOffset6];
            rawCodewordsOffset7++;
            rawCodewordsOffset6++;
        }
        int max = result[0].codewords.length;
        int rawCodewordsOffset8 = rawCodewordsOffset6;
        int rawCodewordsOffset9 = longerBlocksNumDataCodewords;
        while (rawCodewordsOffset9 < max) {
            int rawCodewordsOffset10 = rawCodewordsOffset8;
            int rawCodewordsOffset11 = 0;
            while (rawCodewordsOffset11 < numResultBlocks) {
                int jOffset2 = specialVersion ? (rawCodewordsOffset11 + 8) % numResultBlocks : rawCodewordsOffset11;
                if (specialVersion) {
                    ecBlocks = ecBlocks2;
                    jOffset = jOffset2;
                    if (jOffset > 7) {
                        iOffset = rawCodewordsOffset9 - 1;
                    }
                    int longerBlocksTotalCodewords = totalBlocks2;
                    result[jOffset].codewords[iOffset] = rawCodewords[rawCodewordsOffset10];
                    rawCodewordsOffset11++;
                    rawCodewordsOffset10++;
                    ecBlocks2 = ecBlocks;
                    totalBlocks2 = longerBlocksTotalCodewords;
                } else {
                    ecBlocks = ecBlocks2;
                    jOffset = jOffset2;
                }
                iOffset = rawCodewordsOffset9;
                int longerBlocksTotalCodewords2 = totalBlocks2;
                result[jOffset].codewords[iOffset] = rawCodewords[rawCodewordsOffset10];
                rawCodewordsOffset11++;
                rawCodewordsOffset10++;
                ecBlocks2 = ecBlocks;
                totalBlocks2 = longerBlocksTotalCodewords2;
            }
            rawCodewordsOffset9++;
            rawCodewordsOffset8 = rawCodewordsOffset10;
        }
        if (rawCodewordsOffset8 != rawCodewords.length) {
            throw new IllegalArgumentException();
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
