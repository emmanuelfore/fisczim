package com.google.zxing.oned;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public final class Code128Writer extends OneDimensionalCodeWriter {
    private static final int CODE_CODE_B = 100;
    private static final int CODE_CODE_C = 99;
    private static final int CODE_FNC_1 = 102;
    private static final int CODE_FNC_2 = 97;
    private static final int CODE_FNC_3 = 96;
    private static final int CODE_FNC_4_B = 100;
    private static final int CODE_START_B = 104;
    private static final int CODE_START_C = 105;
    private static final int CODE_STOP = 106;
    private static final char ESCAPE_FNC_1 = 241;
    private static final char ESCAPE_FNC_2 = 242;
    private static final char ESCAPE_FNC_3 = 243;
    private static final char ESCAPE_FNC_4 = 244;

    private enum CType {
        UNCODABLE,
        ONE_DIGIT,
        TWO_DIGITS,
        FNC_1
    }

    @Override // com.google.zxing.oned.OneDimensionalCodeWriter, com.google.zxing.Writer
    public BitMatrix encode(String contents, BarcodeFormat format, int width, int height, Map<EncodeHintType, ?> hints) throws WriterException {
        if (format != BarcodeFormat.CODE_128) {
            throw new IllegalArgumentException("Can only encode CODE_128, but got " + format);
        }
        return super.encode(contents, format, width, height, hints);
    }

    @Override // com.google.zxing.oned.OneDimensionalCodeWriter
    public boolean[] encode(String contents) {
        int patternIndex;
        int patternIndex2;
        int length = contents.length();
        if (length <= 0 || length > 80) {
            throw new IllegalArgumentException("Contents length should be between 1 and 80 characters, but got " + length);
        }
        for (int i = 0; i < length; i++) {
            char c = contents.charAt(i);
            if (c < ' ' || c > '~') {
                switch (c) {
                    case 241:
                    case 242:
                    case 243:
                    case 244:
                        break;
                    default:
                        throw new IllegalArgumentException("Bad character in input: " + c);
                }
            }
        }
        Collection<int[]> patterns = new ArrayList<>();
        int codeSet = 0;
        int checkSum = 0;
        int checkWeight = 1;
        int position = 0;
        while (position < length) {
            int newCodeSet = chooseCode(contents, position, codeSet);
            if (newCodeSet == codeSet) {
                switch (contents.charAt(position)) {
                    case 241:
                        patternIndex2 = CODE_FNC_1;
                        break;
                    case 242:
                        patternIndex2 = CODE_FNC_2;
                        break;
                    case 243:
                        patternIndex2 = CODE_FNC_3;
                        break;
                    case 244:
                        patternIndex2 = 100;
                        break;
                    default:
                        if (codeSet == 100) {
                            patternIndex2 = contents.charAt(position) - ' ';
                        } else {
                            int patternIndex3 = position + 2;
                            patternIndex2 = Integer.parseInt(contents.substring(position, patternIndex3));
                            position++;
                        }
                        break;
                }
                position++;
            } else {
                if (codeSet == 0) {
                    if (newCodeSet == 100) {
                        patternIndex = CODE_START_B;
                    } else {
                        patternIndex = CODE_START_C;
                    }
                } else {
                    patternIndex = newCodeSet;
                }
                patternIndex2 = patternIndex;
                codeSet = newCodeSet;
            }
            patterns.add(Code128Reader.CODE_PATTERNS[patternIndex2]);
            checkSum += patternIndex2 * checkWeight;
            if (position != 0) {
                checkWeight++;
            }
        }
        patterns.add(Code128Reader.CODE_PATTERNS[checkSum % 103]);
        patterns.add(Code128Reader.CODE_PATTERNS[CODE_STOP]);
        int codeWidth = 0;
        for (int[] iArr : patterns) {
            int codeWidth2 = codeWidth;
            for (int width : iArr) {
                codeWidth2 += width;
            }
            codeWidth = codeWidth2;
        }
        boolean[] result = new boolean[codeWidth];
        int pos = 0;
        for (int[] pattern : patterns) {
            pos += appendPattern(result, pos, pattern, true);
        }
        return result;
    }

    private static CType findCType(CharSequence value, int start) {
        int last = value.length();
        if (start >= last) {
            return CType.UNCODABLE;
        }
        char c = value.charAt(start);
        if (c != 241) {
            if (c < '0' || c > '9') {
                return CType.UNCODABLE;
            }
            if (start + 1 >= last) {
                return CType.ONE_DIGIT;
            }
            char c2 = value.charAt(start + 1);
            if (c2 < '0' || c2 > '9') {
                return CType.ONE_DIGIT;
            }
            return CType.TWO_DIGITS;
        }
        return CType.FNC_1;
    }

    private static int chooseCode(CharSequence value, int start, int oldCode) {
        CType lookahead;
        CType lookahead2;
        CType cTypeFindCType = findCType(value, start);
        CType lookahead3 = cTypeFindCType;
        if (cTypeFindCType == CType.UNCODABLE || lookahead3 == CType.ONE_DIGIT) {
            return 100;
        }
        if (oldCode == CODE_CODE_C) {
            return oldCode;
        }
        if (oldCode == 100) {
            if (lookahead3 != CType.FNC_1 && (lookahead = findCType(value, start + 2)) != CType.UNCODABLE && lookahead != CType.ONE_DIGIT) {
                if (lookahead == CType.FNC_1) {
                    if (findCType(value, start + 3) == CType.TWO_DIGITS) {
                        return CODE_CODE_C;
                    }
                    return 100;
                }
                int index = start + 4;
                while (true) {
                    lookahead2 = findCType(value, index);
                    if (lookahead2 != CType.TWO_DIGITS) {
                        break;
                    }
                    index += 2;
                }
                if (lookahead2 == CType.ONE_DIGIT) {
                    return 100;
                }
                return CODE_CODE_C;
            }
            return oldCode;
        }
        if (lookahead3 == CType.FNC_1) {
            lookahead3 = findCType(value, start + 1);
        }
        if (lookahead3 == CType.TWO_DIGITS) {
            return CODE_CODE_C;
        }
        return 100;
    }
}
