package com.google.zxing.datamatrix.decoder;

import com.google.zxing.FormatException;

/* JADX INFO: loaded from: classes.dex */
public final class Version {
    private static final Version[] VERSIONS = buildVersions();
    private final int dataRegionSizeColumns;
    private final int dataRegionSizeRows;
    private final ECBlocks ecBlocks;
    private final int symbolSizeColumns;
    private final int symbolSizeRows;
    private final int totalCodewords;
    private final int versionNumber;

    private Version(int versionNumber, int symbolSizeRows, int symbolSizeColumns, int dataRegionSizeRows, int dataRegionSizeColumns, ECBlocks ecBlocks) {
        this.versionNumber = versionNumber;
        this.symbolSizeRows = symbolSizeRows;
        this.symbolSizeColumns = symbolSizeColumns;
        this.dataRegionSizeRows = dataRegionSizeRows;
        this.dataRegionSizeColumns = dataRegionSizeColumns;
        this.ecBlocks = ecBlocks;
        int total = 0;
        int ecCodewords = ecBlocks.getECCodewords();
        for (ECB ecBlock : ecBlocks.getECBlocks()) {
            total += ecBlock.getCount() * (ecBlock.getDataCodewords() + ecCodewords);
        }
        this.totalCodewords = total;
    }

    public int getVersionNumber() {
        return this.versionNumber;
    }

    public int getSymbolSizeRows() {
        return this.symbolSizeRows;
    }

    public int getSymbolSizeColumns() {
        return this.symbolSizeColumns;
    }

    public int getDataRegionSizeRows() {
        return this.dataRegionSizeRows;
    }

    public int getDataRegionSizeColumns() {
        return this.dataRegionSizeColumns;
    }

    public int getTotalCodewords() {
        return this.totalCodewords;
    }

    ECBlocks getECBlocks() {
        return this.ecBlocks;
    }

    public static Version getVersionForDimensions(int numRows, int numColumns) throws FormatException {
        if ((numRows & 1) != 0 || (numColumns & 1) != 0) {
            throw FormatException.getFormatInstance();
        }
        for (Version version : VERSIONS) {
            if (version.symbolSizeRows == numRows && version.symbolSizeColumns == numColumns) {
                return version;
            }
        }
        throw FormatException.getFormatInstance();
    }

    static final class ECBlocks {
        private final ECB[] ecBlocks;
        private final int ecCodewords;

        private ECBlocks(int ecCodewords, ECB ecBlocks) {
            this.ecCodewords = ecCodewords;
            this.ecBlocks = new ECB[]{ecBlocks};
        }

        private ECBlocks(int ecCodewords, ECB ecBlocks1, ECB ecBlocks2) {
            this.ecCodewords = ecCodewords;
            this.ecBlocks = new ECB[]{ecBlocks1, ecBlocks2};
        }

        int getECCodewords() {
            return this.ecCodewords;
        }

        ECB[] getECBlocks() {
            return this.ecBlocks;
        }
    }

    static final class ECB {
        private final int count;
        private final int dataCodewords;

        private ECB(int count, int dataCodewords) {
            this.count = count;
            this.dataCodewords = dataCodewords;
        }

        int getCount() {
            return this.count;
        }

        int getDataCodewords() {
            return this.dataCodewords;
        }
    }

    public String toString() {
        return String.valueOf(this.versionNumber);
    }

    private static Version[] buildVersions() {
        int i = 1;
        int i2 = 5;
        int i3 = 8;
        int i4 = 7;
        Version version = new Version(3, 14, 14, 12, 12, new ECBlocks(10, new ECB(i, i3)));
        int i5 = 2;
        int i6 = 12;
        int i7 = 18;
        Version version2 = new Version(5, 18, 18, 16, 16, new ECBlocks(14, new ECB(i, 18)));
        int i8 = 4;
        Version version3 = new Version(7, 22, 22, 20, 20, new ECBlocks(20, new ECB(i, 30)));
        int i9 = 6;
        ECB ecb = new ECB(i, 36);
        ECB ecb2 = new ECB(i, 44);
        ECB ecb3 = new ECB(i, 62);
        ECB ecb4 = new ECB(i, 86);
        ECB ecb5 = new ECB(i, 114);
        ECB ecb6 = new ECB(i, 144);
        int i10 = 56;
        ECB ecb7 = new ECB(i, 174);
        Version version4 = new Version(15, 52, 52, 24, 24, new ECBlocks(42, new ECB(i5, 102)));
        ECB ecb8 = new ECB(i8, 92);
        ECB ecb9 = new ECB(i8, 114);
        ECB ecb10 = new ECB(i8, 174);
        ECB ecb11 = new ECB(i9, 175);
        return new Version[]{new Version(1, 10, 10, 8, 8, new ECBlocks(i2, new ECB(i, 3))), new Version(2, 12, 12, 10, 10, new ECBlocks(i4, new ECB(i, i2))), version, new Version(4, 16, 16, 14, 14, new ECBlocks(i6, new ECB(i, i6))), version2, new Version(6, 20, 20, 18, 18, new ECBlocks(i7, new ECB(i, 22))), version3, new Version(8, 24, 24, 22, 22, new ECBlocks(24, ecb)), new Version(9, 26, 26, 24, 24, new ECBlocks(28, ecb2)), new Version(10, 32, 32, 14, 14, new ECBlocks(36, ecb3)), new Version(11, 36, 36, 16, 16, new ECBlocks(42, ecb4)), new Version(12, 40, 40, 18, 18, new ECBlocks(48, ecb5)), new Version(13, 44, 44, 20, 20, new ECBlocks(56, ecb6)), new Version(14, 48, 48, 22, 22, new ECBlocks(68, ecb7)), version4, new Version(16, 64, 64, 14, 14, new ECBlocks(i10, new ECB(i5, 140))), new Version(17, 72, 72, 16, 16, new ECBlocks(36, ecb8)), new Version(18, 80, 80, 18, 18, new ECBlocks(48, ecb9)), new Version(19, 88, 88, 20, 20, new ECBlocks(i10, new ECB(i8, 144))), new Version(20, 96, 96, 22, 22, new ECBlocks(68, ecb10)), new Version(21, 104, 104, 24, 24, new ECBlocks(i10, new ECB(i9, 136))), new Version(22, 120, 120, 18, 18, new ECBlocks(68, ecb11)), new Version(23, 132, 132, 20, 20, new ECBlocks(62, new ECB(i3, 163))), new Version(24, 144, 144, 22, 22, new ECBlocks(62, new ECB(i3, 156), new ECB(i5, 155))), new Version(25, 8, 18, 6, 16, new ECBlocks(i4, new ECB(i, i2))), new Version(26, 8, 32, 6, 14, new ECBlocks(11, new ECB(i, 10))), new Version(27, 12, 26, 10, 24, new ECBlocks(14, new ECB(i, 16))), new Version(28, 12, 36, 10, 16, new ECBlocks(i7, new ECB(i, 22))), new Version(29, 16, 36, 14, 16, new ECBlocks(24, new ECB(i, 32))), new Version(30, 16, 48, 14, 22, new ECBlocks(28, new ECB(i, 49)))};
    }
}
