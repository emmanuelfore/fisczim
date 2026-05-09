package com.google.zxing.oned;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public final class Code39Writer extends OneDimensionalCodeWriter {
    @Override // com.google.zxing.oned.OneDimensionalCodeWriter, com.google.zxing.Writer
    public BitMatrix encode(String contents, BarcodeFormat format, int width, int height, Map<EncodeHintType, ?> hints) throws WriterException {
        if (format != BarcodeFormat.CODE_39) {
            throw new IllegalArgumentException("Can only encode CODE_39, but got " + format);
        }
        return super.encode(contents, format, width, height, hints);
    }

    @Override // com.google.zxing.oned.OneDimensionalCodeWriter
    public boolean[] encode(String contents) {
        int length = contents.length();
        if (length > 80) {
            throw new IllegalArgumentException("Requested contents should be less than 80 digits long, but got " + length);
        }
        int[] widths = new int[9];
        int codeWidth = length + 25;
        int codeWidth2 = codeWidth;
        int codeWidth3 = 0;
        while (codeWidth3 < length) {
            int indexInString = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. *$/+%".indexOf(contents.charAt(codeWidth3));
            if (indexInString >= 0) {
                toIntArray(Code39Reader.CHARACTER_ENCODINGS[indexInString], widths);
                int codeWidth4 = codeWidth2;
                for (int codeWidth5 = 0; codeWidth5 < 9; codeWidth5++) {
                    int width = widths[codeWidth5];
                    codeWidth4 += width;
                }
                codeWidth3++;
                codeWidth2 = codeWidth4;
            } else {
                throw new IllegalArgumentException("Bad contents: " + contents);
            }
        }
        boolean[] result = new boolean[codeWidth2];
        toIntArray(Code39Reader.ASTERISK_ENCODING, widths);
        int pos = appendPattern(result, 0, widths, true);
        int[] narrowWhite = {1};
        int pos2 = pos + appendPattern(result, pos, narrowWhite, false);
        for (int pos3 = 0; pos3 < length; pos3++) {
            toIntArray(Code39Reader.CHARACTER_ENCODINGS["0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. *$/+%".indexOf(contents.charAt(pos3))], widths);
            int pos4 = appendPattern(result, pos2, widths, true) + pos2;
            pos2 = pos4 + appendPattern(result, pos4, narrowWhite, false);
        }
        toIntArray(Code39Reader.ASTERISK_ENCODING, widths);
        appendPattern(result, pos2, widths, true);
        return result;
    }

    private static void toIntArray(int a, int[] toReturn) {
        for (int i = 0; i < 9; i++) {
            int i2 = 1;
            int temp = (1 << (8 - i)) & a;
            if (temp != 0) {
                i2 = 2;
            }
            toReturn[i] = i2;
        }
    }
}
