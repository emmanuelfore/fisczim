package com.google.zxing.pdf417.decoder;

import com.google.zxing.FormatException;
import com.google.zxing.pdf417.PDF417ResultMetadata;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.Charset;
import java.util.Arrays;

/* JADX INFO: loaded from: classes.dex */
final class DecodedBitStreamParser {
    private static final int AL = 28;
    private static final int AS = 27;
    private static final int BEGIN_MACRO_PDF417_CONTROL_BLOCK = 928;
    private static final int BEGIN_MACRO_PDF417_OPTIONAL_FIELD = 923;
    private static final int BYTE_COMPACTION_MODE_LATCH = 901;
    private static final int BYTE_COMPACTION_MODE_LATCH_6 = 924;
    private static final int ECI_CHARSET = 927;
    private static final int ECI_GENERAL_PURPOSE = 926;
    private static final int ECI_USER_DEFINED = 925;
    private static final BigInteger[] EXP900;
    private static final int LL = 27;
    private static final int MACRO_PDF417_TERMINATOR = 922;
    private static final int MAX_NUMERIC_CODEWORDS = 15;
    private static final int ML = 28;
    private static final int MODE_SHIFT_TO_BYTE_COMPACTION_MODE = 913;
    private static final int NUMBER_OF_SEQUENCE_CODEWORDS = 2;
    private static final int NUMERIC_COMPACTION_MODE_LATCH = 902;
    private static final int PAL = 29;
    private static final int PL = 25;
    private static final int PS = 29;
    private static final int TEXT_COMPACTION_MODE_LATCH = 900;
    private static final char[] PUNCT_CHARS = ";<>@[\\]_`~!\r\t,:\n-.$/\"|*()?{}'".toCharArray();
    private static final char[] MIXED_CHARS = "0123456789&\r\t,:#-.$/+%*=^".toCharArray();
    private static final Charset DEFAULT_ENCODING = Charset.forName("ISO-8859-1");

    private enum Mode {
        ALPHA,
        LOWER,
        MIXED,
        PUNCT,
        ALPHA_SHIFT,
        PUNCT_SHIFT
    }

    static {
        BigInteger[] bigIntegerArr = new BigInteger[16];
        EXP900 = bigIntegerArr;
        bigIntegerArr[0] = BigInteger.ONE;
        BigInteger nineHundred = BigInteger.valueOf(900L);
        EXP900[1] = nineHundred;
        for (int i = 2; i < EXP900.length; i++) {
            EXP900[i] = EXP900[i - 1].multiply(nineHundred);
        }
    }

    private DecodedBitStreamParser() {
    }

    /* JADX WARN: Can't fix incorrect switch cases order, some code will duplicate */
    /* JADX WARN: Removed duplicated region for block: B:17:0x0051  */
    /* JADX WARN: Removed duplicated region for block: B:23:0x0068 A[LOOP:0: B:3:0x0015->B:23:0x0068, LOOP_END] */
    /* JADX WARN: Removed duplicated region for block: B:34:0x006e A[SYNTHETIC] */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    static com.google.zxing.common.DecoderResult decode(int[] r9, java.lang.String r10) throws com.google.zxing.FormatException {
        /*
            java.lang.StringBuilder r0 = new java.lang.StringBuilder
            int r1 = r9.length
            r2 = 1
            int r1 = r1 << r2
            r0.<init>(r1)
            java.nio.charset.Charset r1 = com.google.zxing.pdf417.decoder.DecodedBitStreamParser.DEFAULT_ENCODING
            r3 = 1
            int r3 = r3 + r2
            r2 = r9[r2]
            com.google.zxing.pdf417.PDF417ResultMetadata r4 = new com.google.zxing.pdf417.PDF417ResultMetadata
            r4.<init>()
            r5 = 0
            r6 = r5
        L15:
            r7 = 0
            r7 = r9[r7]
            if (r3 >= r7) goto L73
            r7 = 913(0x391, float:1.28E-42)
            if (r2 == r7) goto L5b
            switch(r2) {
                case 900: goto L56;
                case 901: goto L51;
                case 902: goto L4c;
                default: goto L21;
            }
        L21:
            switch(r2) {
                case 922: goto L47;
                case 923: goto L47;
                case 924: goto L51;
                case 925: goto L44;
                case 926: goto L41;
                case 927: goto L30;
                case 928: goto L2b;
                default: goto L24;
            }
        L24:
            int r3 = r3 + (-1)
            int r3 = textCompaction(r9, r3, r0)
            goto L65
        L2b:
            int r3 = decodeMacroBlock(r9, r3, r4)
            goto L65
        L30:
            int r7 = r3 + 1
            r3 = r9[r3]
            com.google.zxing.common.CharacterSetECI r3 = com.google.zxing.common.CharacterSetECI.getCharacterSetECIByValue(r3)
            java.lang.String r3 = r3.name()
            java.nio.charset.Charset r1 = java.nio.charset.Charset.forName(r3)
            goto L64
        L41:
            int r3 = r3 + 2
            goto L65
        L44:
            int r3 = r3 + 1
            goto L65
        L47:
            com.google.zxing.FormatException r5 = com.google.zxing.FormatException.getFormatInstance()
            throw r5
        L4c:
            int r3 = numericCompaction(r9, r3, r0)
            goto L65
        L51:
            int r3 = byteCompaction(r2, r9, r1, r3, r0)
            goto L65
        L56:
            int r3 = textCompaction(r9, r3, r0)
            goto L65
        L5b:
            int r7 = r3 + 1
            r3 = r9[r3]
            char r3 = (char) r3
            r0.append(r3)
        L64:
            r3 = r7
        L65:
            int r7 = r9.length
            if (r3 >= r7) goto L6e
            int r7 = r3 + 1
            r2 = r9[r3]
            r3 = r7
            goto L15
        L6e:
            com.google.zxing.FormatException r5 = com.google.zxing.FormatException.getFormatInstance()
            throw r5
        L73:
            int r7 = r0.length()
            if (r7 == 0) goto L88
            com.google.zxing.common.DecoderResult r7 = new com.google.zxing.common.DecoderResult
            java.lang.String r8 = r0.toString()
            r7.<init>(r5, r8, r5, r10)
            r5 = r6
            r5 = r7
            r7.setOther(r4)
            return r5
        L88:
            com.google.zxing.FormatException r5 = com.google.zxing.FormatException.getFormatInstance()
            throw r5
        */
        throw new UnsupportedOperationException("Method not decompiled: com.google.zxing.pdf417.decoder.DecodedBitStreamParser.decode(int[], java.lang.String):com.google.zxing.common.DecoderResult");
    }

    private static int decodeMacroBlock(int[] codewords, int codeIndex, PDF417ResultMetadata resultMetadata) throws FormatException {
        if (codeIndex + 2 > codewords[0]) {
            throw FormatException.getFormatInstance();
        }
        int[] segmentIndexArray = new int[2];
        int codeIndex2 = codeIndex;
        int codeIndex3 = 0;
        while (codeIndex3 < 2) {
            segmentIndexArray[codeIndex3] = codewords[codeIndex2];
            codeIndex3++;
            codeIndex2++;
        }
        resultMetadata.setSegmentIndex(Integer.parseInt(decodeBase900toBase10(segmentIndexArray, 2)));
        StringBuilder fileId = new StringBuilder();
        int codeIndex4 = textCompaction(codewords, codeIndex2, fileId);
        resultMetadata.setFileId(fileId.toString());
        if (codewords[codeIndex4] == BEGIN_MACRO_PDF417_OPTIONAL_FIELD) {
            int codeIndex5 = codeIndex4 + 1;
            int[] additionalOptionCodeWords = new int[codewords[0] - codeIndex5];
            int additionalOptionCodeWordsIndex = 0;
            int additionalOptionCodeWordsIndex2 = codeIndex5;
            int codeIndex6 = 0;
            while (additionalOptionCodeWordsIndex2 < codewords[0] && codeIndex6 == 0) {
                int codeIndex7 = additionalOptionCodeWordsIndex2 + 1;
                int codeIndex8 = codewords[additionalOptionCodeWordsIndex2];
                if (codeIndex8 < TEXT_COMPACTION_MODE_LATCH) {
                    additionalOptionCodeWords[additionalOptionCodeWordsIndex] = codeIndex8;
                    additionalOptionCodeWordsIndex++;
                    additionalOptionCodeWordsIndex2 = codeIndex7;
                } else if (codeIndex8 == MACRO_PDF417_TERMINATOR) {
                    resultMetadata.setLastSegment(true);
                    additionalOptionCodeWordsIndex2 = codeIndex7 + 1;
                    codeIndex6 = 1;
                } else {
                    throw FormatException.getFormatInstance();
                }
            }
            resultMetadata.setOptionalData(Arrays.copyOf(additionalOptionCodeWords, additionalOptionCodeWordsIndex));
            return additionalOptionCodeWordsIndex2;
        }
        if (codewords[codeIndex4] == MACRO_PDF417_TERMINATOR) {
            resultMetadata.setLastSegment(true);
            return codeIndex4 + 1;
        }
        return codeIndex4;
    }

    private static int textCompaction(int[] codewords, int codeIndex, StringBuilder result) {
        int[] textCompactionData = new int[(codewords[0] - codeIndex) << 1];
        int[] byteCompactionData = new int[(codewords[0] - codeIndex) << 1];
        int index = 0;
        int index2 = codeIndex;
        int codeIndex2 = 0;
        while (index2 < codewords[0] && codeIndex2 == 0) {
            int codeIndex3 = index2 + 1;
            int codeIndex4 = codewords[index2];
            if (codeIndex4 >= TEXT_COMPACTION_MODE_LATCH) {
                if (codeIndex4 != MODE_SHIFT_TO_BYTE_COMPACTION_MODE) {
                    if (codeIndex4 != 928) {
                        switch (codeIndex4) {
                            case TEXT_COMPACTION_MODE_LATCH /* 900 */:
                                textCompactionData[index] = TEXT_COMPACTION_MODE_LATCH;
                                index++;
                                break;
                            case BYTE_COMPACTION_MODE_LATCH /* 901 */:
                            case NUMERIC_COMPACTION_MODE_LATCH /* 902 */:
                                break;
                            default:
                                switch (codeIndex4) {
                                    case MACRO_PDF417_TERMINATOR /* 922 */:
                                    case BEGIN_MACRO_PDF417_OPTIONAL_FIELD /* 923 */:
                                    case BYTE_COMPACTION_MODE_LATCH_6 /* 924 */:
                                        break;
                                    default:
                                        index2 = codeIndex3;
                                        continue;
                                }
                                break;
                        }
                    }
                    index2 = codeIndex3 - 1;
                    codeIndex2 = 1;
                } else {
                    textCompactionData[index] = MODE_SHIFT_TO_BYTE_COMPACTION_MODE;
                    index2 = codeIndex3 + 1;
                    int code = codewords[codeIndex3];
                    byteCompactionData[index] = code;
                    index++;
                }
            } else {
                textCompactionData[index] = codeIndex4 / 30;
                textCompactionData[index + 1] = codeIndex4 % 30;
                index += 2;
            }
            index2 = codeIndex3;
        }
        decodeTextCompaction(textCompactionData, byteCompactionData, index, result);
        return index2;
    }

    private static void decodeTextCompaction(int[] textCompactionData, int[] byteCompactionData, int length, StringBuilder result) {
        Mode subMode = Mode.ALPHA;
        Mode priorToShiftMode = Mode.ALPHA;
        for (int i = 0; i < length; i++) {
            int subModeCh = textCompactionData[i];
            char ch = 0;
            switch (subMode) {
                case ALPHA:
                    if (subModeCh < 26) {
                        ch = (char) (subModeCh + 65);
                    } else if (subModeCh == 26) {
                        ch = ' ';
                    } else if (subModeCh == 27) {
                        subMode = Mode.LOWER;
                    } else if (subModeCh == 28) {
                        subMode = Mode.MIXED;
                    } else if (subModeCh == 29) {
                        priorToShiftMode = subMode;
                        subMode = Mode.PUNCT_SHIFT;
                    } else if (subModeCh == MODE_SHIFT_TO_BYTE_COMPACTION_MODE) {
                        result.append((char) byteCompactionData[i]);
                    } else if (subModeCh == TEXT_COMPACTION_MODE_LATCH) {
                        subMode = Mode.ALPHA;
                    }
                    break;
                case LOWER:
                    if (subModeCh < 26) {
                        ch = (char) (subModeCh + 97);
                    } else if (subModeCh == 26) {
                        ch = ' ';
                    } else if (subModeCh == 27) {
                        priorToShiftMode = subMode;
                        subMode = Mode.ALPHA_SHIFT;
                    } else if (subModeCh == 28) {
                        subMode = Mode.MIXED;
                    } else if (subModeCh == 29) {
                        priorToShiftMode = subMode;
                        subMode = Mode.PUNCT_SHIFT;
                    } else if (subModeCh == MODE_SHIFT_TO_BYTE_COMPACTION_MODE) {
                        result.append((char) byteCompactionData[i]);
                    } else if (subModeCh == TEXT_COMPACTION_MODE_LATCH) {
                        subMode = Mode.ALPHA;
                    }
                    break;
                case MIXED:
                    if (subModeCh < 25) {
                        ch = MIXED_CHARS[subModeCh];
                    } else if (subModeCh == 25) {
                        subMode = Mode.PUNCT;
                    } else if (subModeCh == 26) {
                        ch = ' ';
                    } else if (subModeCh == 27) {
                        subMode = Mode.LOWER;
                    } else if (subModeCh == 28) {
                        subMode = Mode.ALPHA;
                    } else if (subModeCh == 29) {
                        priorToShiftMode = subMode;
                        subMode = Mode.PUNCT_SHIFT;
                    } else if (subModeCh == MODE_SHIFT_TO_BYTE_COMPACTION_MODE) {
                        result.append((char) byteCompactionData[i]);
                    } else if (subModeCh == TEXT_COMPACTION_MODE_LATCH) {
                        subMode = Mode.ALPHA;
                    }
                    break;
                case PUNCT:
                    if (subModeCh < 29) {
                        ch = PUNCT_CHARS[subModeCh];
                    } else if (subModeCh == 29) {
                        subMode = Mode.ALPHA;
                    } else if (subModeCh == MODE_SHIFT_TO_BYTE_COMPACTION_MODE) {
                        result.append((char) byteCompactionData[i]);
                    } else if (subModeCh == TEXT_COMPACTION_MODE_LATCH) {
                        subMode = Mode.ALPHA;
                    }
                    break;
                case ALPHA_SHIFT:
                    subMode = priorToShiftMode;
                    if (subModeCh < 26) {
                        ch = (char) (subModeCh + 65);
                    } else if (subModeCh == 26) {
                        ch = ' ';
                    } else if (subModeCh == TEXT_COMPACTION_MODE_LATCH) {
                        subMode = Mode.ALPHA;
                    }
                    break;
                case PUNCT_SHIFT:
                    subMode = priorToShiftMode;
                    if (subModeCh < 29) {
                        ch = PUNCT_CHARS[subModeCh];
                    } else if (subModeCh == 29) {
                        subMode = Mode.ALPHA;
                    } else if (subModeCh == MODE_SHIFT_TO_BYTE_COMPACTION_MODE) {
                        result.append((char) byteCompactionData[i]);
                    } else if (subModeCh == TEXT_COMPACTION_MODE_LATCH) {
                        subMode = Mode.ALPHA;
                    }
                    break;
            }
            if (ch != 0) {
                result.append(ch);
            }
        }
    }

    private static int byteCompaction(int mode, int[] codewords, Charset encoding, int codeIndex, StringBuilder result) {
        int codeIndex2;
        int codeIndex3;
        int count;
        ByteArrayOutputStream decodedBytes = new ByteArrayOutputStream();
        int i = BEGIN_MACRO_PDF417_OPTIONAL_FIELD;
        int i2 = 928;
        int i3 = NUMERIC_COMPACTION_MODE_LATCH;
        long j = 900;
        int i4 = BYTE_COMPACTION_MODE_LATCH_6;
        int i5 = 0;
        if (mode != BYTE_COMPACTION_MODE_LATCH) {
            if (mode == BYTE_COMPACTION_MODE_LATCH_6) {
                long value = 0;
                boolean end = false;
                int count2 = 0;
                int count3 = codeIndex;
                while (count3 < codewords[i5] && !end) {
                    int codeIndex4 = count3 + 1;
                    int codeIndex5 = codewords[count3];
                    if (codeIndex5 < TEXT_COMPACTION_MODE_LATCH) {
                        count2++;
                        value = (value * 900) + ((long) codeIndex5);
                    } else if (codeIndex5 != TEXT_COMPACTION_MODE_LATCH && codeIndex5 != BYTE_COMPACTION_MODE_LATCH && codeIndex5 != i3 && codeIndex5 != i4 && codeIndex5 != 928) {
                        if (codeIndex5 == BEGIN_MACRO_PDF417_OPTIONAL_FIELD || codeIndex5 == MACRO_PDF417_TERMINATOR) {
                            codeIndex4--;
                            end = true;
                        }
                    } else {
                        codeIndex4--;
                        end = true;
                    }
                    if (count2 % 5 != 0 || count2 <= 0) {
                        codeIndex3 = codeIndex4;
                    } else {
                        int j2 = 0;
                        while (true) {
                            int j3 = j2;
                            if (j3 >= 6) {
                                break;
                            }
                            decodedBytes.write((byte) (value >> ((5 - j3) * 8)));
                            j2 = j3 + 1;
                            codeIndex4 = codeIndex4;
                        }
                        codeIndex3 = codeIndex4;
                        value = 0;
                        count2 = 0;
                    }
                    count3 = codeIndex3;
                    i3 = NUMERIC_COMPACTION_MODE_LATCH;
                    i4 = BYTE_COMPACTION_MODE_LATCH_6;
                    i5 = 0;
                }
                codeIndex2 = count3;
            } else {
                codeIndex2 = codeIndex;
            }
        } else {
            int[] byteCompactedCodewords = new int[6];
            boolean end2 = false;
            int nextCode = codewords[codeIndex];
            int count4 = 0;
            codeIndex2 = codeIndex + 1;
            long value2 = 0;
            while (codeIndex2 < codewords[0] && !end2) {
                int count5 = count4 + 1;
                byteCompactedCodewords[count4] = nextCode;
                value2 = (value2 * j) + ((long) nextCode);
                int codeIndex6 = codeIndex2 + 1;
                int i6 = codewords[codeIndex2];
                nextCode = i6;
                if (i6 == TEXT_COMPACTION_MODE_LATCH || nextCode == BYTE_COMPACTION_MODE_LATCH || nextCode == NUMERIC_COMPACTION_MODE_LATCH || nextCode == BYTE_COMPACTION_MODE_LATCH_6 || nextCode == i2 || nextCode == i || nextCode == MACRO_PDF417_TERMINATOR) {
                    codeIndex2 = codeIndex6 - 1;
                    end2 = true;
                } else if (count5 % 5 != 0 || count5 <= 0) {
                    codeIndex2 = codeIndex6;
                } else {
                    for (int j4 = 0; j4 < 6; j4++) {
                        decodedBytes.write((byte) (value2 >> ((5 - j4) * 8)));
                    }
                    value2 = 0;
                    count4 = 0;
                    codeIndex2 = codeIndex6;
                    i = BEGIN_MACRO_PDF417_OPTIONAL_FIELD;
                    i2 = 928;
                    j = 900;
                }
                count4 = count5;
                i = BEGIN_MACRO_PDF417_OPTIONAL_FIELD;
                i2 = 928;
                j = 900;
            }
            if (codeIndex2 == codewords[0] && nextCode < TEXT_COMPACTION_MODE_LATCH) {
                count = count4 + 1;
                byteCompactedCodewords[count4] = nextCode;
            } else {
                count = count4;
            }
            while (true) {
                int i7 = i5;
                if (i7 >= count) {
                    break;
                }
                decodedBytes.write((byte) byteCompactedCodewords[i7]);
                i5 = i7 + 1;
            }
        }
        result.append(new String(decodedBytes.toByteArray(), encoding));
        return codeIndex2;
    }

    private static int numericCompaction(int[] codewords, int code, StringBuilder result) throws FormatException {
        int count = 0;
        boolean end = false;
        int[] numericCodewords = new int[15];
        while (code < codewords[0] && !end) {
            int codeIndex = code + 1;
            int code2 = codewords[code];
            if (codeIndex == codewords[0]) {
                end = true;
            }
            if (code2 < TEXT_COMPACTION_MODE_LATCH) {
                numericCodewords[count] = code2;
                count++;
            } else if (code2 == TEXT_COMPACTION_MODE_LATCH || code2 == BYTE_COMPACTION_MODE_LATCH || code2 == BYTE_COMPACTION_MODE_LATCH_6 || code2 == 928 || code2 == BEGIN_MACRO_PDF417_OPTIONAL_FIELD || code2 == MACRO_PDF417_TERMINATOR) {
                codeIndex--;
                end = true;
            }
            if ((count % 15 == 0 || code2 == NUMERIC_COMPACTION_MODE_LATCH || end) && count > 0) {
                String s = decodeBase900toBase10(numericCodewords, count);
                result.append(s);
                count = 0;
            }
            code = codeIndex;
        }
        return code;
    }

    private static String decodeBase900toBase10(int[] codewords, int count) throws FormatException {
        BigInteger result = BigInteger.ZERO;
        BigInteger result2 = result;
        for (int i = 0; i < count; i++) {
            result2 = result2.add(EXP900[(count - i) - 1].multiply(BigInteger.valueOf(codewords[i])));
        }
        String resultString = result2.toString();
        if (resultString.charAt(0) != '1') {
            throw FormatException.getFormatInstance();
        }
        return resultString.substring(1);
    }
}
