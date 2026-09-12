package com.google.zxing.datamatrix.decoder;

import com.google.zxing.FormatException;
import com.google.zxing.common.BitSource;
import java.io.UnsupportedEncodingException;
import java.util.Collection;

/* JADX INFO: loaded from: classes.dex */
final class DecodedBitStreamParser {
    private static final char[] C40_BASIC_SET_CHARS = {'*', '*', '*', ' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'};
    private static final char[] C40_SHIFT2_SET_CHARS = {'!', '\"', '#', '$', '%', '&', '\'', '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '@', '[', '\\', ']', '^', '_'};
    private static final char[] TEXT_BASIC_SET_CHARS = {'*', '*', '*', ' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'};
    private static final char[] TEXT_SHIFT2_SET_CHARS = C40_SHIFT2_SET_CHARS;
    private static final char[] TEXT_SHIFT3_SET_CHARS = {'`', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '{', '|', '}', '~', 127};

    private enum Mode {
        PAD_ENCODE,
        ASCII_ENCODE,
        C40_ENCODE,
        TEXT_ENCODE,
        ANSIX12_ENCODE,
        EDIFACT_ENCODE,
        BASE256_ENCODE
    }

    private DecodedBitStreamParser() {
    }

    /* JADX WARN: Removed duplicated region for block: B:22:0x0059  */
    /* JADX WARN: Removed duplicated region for block: B:25:0x0069  */
    /* JADX WARN: Removed duplicated region for block: B:26:0x006b  */
    /*
        Code decompiled incorrectly, please refer to instructions dump.
        To view partially-correct add '--show-bad-code' argument
    */
    static com.google.zxing.common.DecoderResult decode(byte[] r9) throws com.google.zxing.FormatException {
        /*
            com.google.zxing.common.BitSource r0 = new com.google.zxing.common.BitSource
            r0.<init>(r9)
            java.lang.StringBuilder r1 = new java.lang.StringBuilder
            r2 = 100
            r1.<init>(r2)
            java.lang.StringBuilder r2 = new java.lang.StringBuilder
            r3 = 0
            r2.<init>(r3)
            java.util.ArrayList r3 = new java.util.ArrayList
            r4 = 1
            r3.<init>(r4)
            com.google.zxing.datamatrix.decoder.DecodedBitStreamParser$Mode r4 = com.google.zxing.datamatrix.decoder.DecodedBitStreamParser.Mode.ASCII_ENCODE
        L1a:
            com.google.zxing.datamatrix.decoder.DecodedBitStreamParser$Mode r5 = com.google.zxing.datamatrix.decoder.DecodedBitStreamParser.Mode.ASCII_ENCODE
            if (r4 != r5) goto L23
            com.google.zxing.datamatrix.decoder.DecodedBitStreamParser$Mode r4 = decodeAsciiSegment(r0, r1, r2)
            goto L49
        L23:
            int[] r5 = com.google.zxing.datamatrix.decoder.DecodedBitStreamParser.AnonymousClass1.$SwitchMap$com$google$zxing$datamatrix$decoder$DecodedBitStreamParser$Mode
            int r6 = r4.ordinal()
            r5 = r5[r6]
            switch(r5) {
                case 1: goto L43;
                case 2: goto L3f;
                case 3: goto L3b;
                case 4: goto L37;
                case 5: goto L33;
                default: goto L2e;
            }
        L2e:
            com.google.zxing.FormatException r5 = com.google.zxing.FormatException.getFormatInstance()
            throw r5
        L33:
            decodeBase256Segment(r0, r1, r3)
            goto L47
        L37:
            decodeEdifactSegment(r0, r1)
            goto L47
        L3b:
            decodeAnsiX12Segment(r0, r1)
            goto L47
        L3f:
            decodeTextSegment(r0, r1)
            goto L47
        L43:
            decodeC40Segment(r0, r1)
        L47:
            com.google.zxing.datamatrix.decoder.DecodedBitStreamParser$Mode r4 = com.google.zxing.datamatrix.decoder.DecodedBitStreamParser.Mode.ASCII_ENCODE
        L49:
            com.google.zxing.datamatrix.decoder.DecodedBitStreamParser$Mode r5 = com.google.zxing.datamatrix.decoder.DecodedBitStreamParser.Mode.PAD_ENCODE
            if (r4 == r5) goto L53
            int r5 = r0.available()
            if (r5 > 0) goto L1a
        L53:
            int r5 = r2.length()
            if (r5 <= 0) goto L5c
            r1.append(r2)
        L5c:
            com.google.zxing.common.DecoderResult r5 = new com.google.zxing.common.DecoderResult
            java.lang.String r6 = r1.toString()
            boolean r7 = r3.isEmpty()
            r8 = 0
            if (r7 == 0) goto L6b
            r7 = r8
            goto L6c
        L6b:
            r7 = r3
        L6c:
            r5.<init>(r9, r6, r7, r8)
            return r5
        */
        throw new UnsupportedOperationException("Method not decompiled: com.google.zxing.datamatrix.decoder.DecodedBitStreamParser.decode(byte[]):com.google.zxing.common.DecoderResult");
    }

    private static Mode decodeAsciiSegment(BitSource bits, StringBuilder result, StringBuilder resultTrailer) throws FormatException {
        boolean upperShift = false;
        do {
            int bits2 = bits.readBits(8);
            int oneByte = bits2;
            if (bits2 == 0) {
                throw FormatException.getFormatInstance();
            }
            if (oneByte <= 128) {
                if (upperShift) {
                    oneByte += 128;
                }
                result.append((char) (oneByte - 1));
                return Mode.ASCII_ENCODE;
            }
            if (oneByte == 129) {
                return Mode.PAD_ENCODE;
            }
            if (oneByte <= 229) {
                int value = oneByte - 130;
                if (value < 10) {
                    result.append('0');
                }
                result.append(value);
            } else {
                if (oneByte == 230) {
                    return Mode.C40_ENCODE;
                }
                if (oneByte == 231) {
                    return Mode.BASE256_ENCODE;
                }
                if (oneByte == 232) {
                    result.append((char) 29);
                } else if (oneByte != 233 && oneByte != 234) {
                    if (oneByte == 235) {
                        upperShift = true;
                    } else if (oneByte == 236) {
                        result.append("[)>\u001e05\u001d");
                        resultTrailer.insert(0, "\u001e\u0004");
                    } else if (oneByte == 237) {
                        result.append("[)>\u001e06\u001d");
                        resultTrailer.insert(0, "\u001e\u0004");
                    } else {
                        if (oneByte == 238) {
                            return Mode.ANSIX12_ENCODE;
                        }
                        if (oneByte == 239) {
                            return Mode.TEXT_ENCODE;
                        }
                        if (oneByte == 240) {
                            return Mode.EDIFACT_ENCODE;
                        }
                        if (oneByte != 241 && oneByte >= 242 && (oneByte != 254 || bits.available() != 0)) {
                            throw FormatException.getFormatInstance();
                        }
                    }
                }
            }
        } while (bits.available() > 0);
        return Mode.ASCII_ENCODE;
    }

    private static void decodeC40Segment(BitSource bits, StringBuilder result) throws FormatException {
        int firstByte;
        int[] cValues = new int[3];
        boolean upperShift = false;
        int shift = 0;
        while (bits.available() != 8 && (firstByte = bits.readBits(8)) != 254) {
            parseTwoBytes(firstByte, bits.readBits(8), cValues);
            boolean upperShift2 = upperShift;
            int shift2 = shift;
            for (int shift3 = 0; shift3 < 3; shift3++) {
                int cValue = cValues[shift3];
                switch (shift2) {
                    case 0:
                        if (cValue < 3) {
                            shift2 = cValue + 1;
                        } else if (cValue < C40_BASIC_SET_CHARS.length) {
                            char c40char = C40_BASIC_SET_CHARS[cValue];
                            if (upperShift2) {
                                result.append((char) (c40char + 128));
                                upperShift2 = false;
                            } else {
                                result.append(c40char);
                            }
                        } else {
                            throw FormatException.getFormatInstance();
                        }
                        break;
                    case 1:
                        if (upperShift2) {
                            result.append((char) (cValue + 128));
                            upperShift2 = false;
                        } else {
                            result.append((char) cValue);
                        }
                        shift2 = 0;
                        break;
                    case 2:
                        if (cValue < C40_SHIFT2_SET_CHARS.length) {
                            char c40char2 = C40_SHIFT2_SET_CHARS[cValue];
                            if (upperShift2) {
                                result.append((char) (c40char2 + 128));
                                upperShift2 = false;
                            } else {
                                result.append(c40char2);
                            }
                        } else if (cValue == 27) {
                            result.append((char) 29);
                        } else if (cValue == 30) {
                            upperShift2 = true;
                        } else {
                            throw FormatException.getFormatInstance();
                        }
                        shift2 = 0;
                        break;
                    case 3:
                        if (upperShift2) {
                            result.append((char) (cValue + 224));
                            upperShift2 = false;
                        } else {
                            result.append((char) (cValue + 96));
                        }
                        shift2 = 0;
                        break;
                    default:
                        throw FormatException.getFormatInstance();
                }
            }
            int i = bits.available();
            if (i > 0) {
                shift = shift2;
                upperShift = upperShift2;
            } else {
                return;
            }
        }
    }

    private static void decodeTextSegment(BitSource bits, StringBuilder result) throws FormatException {
        int firstByte;
        int[] cValues = new int[3];
        boolean upperShift = false;
        int shift = 0;
        while (bits.available() != 8 && (firstByte = bits.readBits(8)) != 254) {
            parseTwoBytes(firstByte, bits.readBits(8), cValues);
            boolean upperShift2 = upperShift;
            int shift2 = shift;
            for (int shift3 = 0; shift3 < 3; shift3++) {
                int cValue = cValues[shift3];
                switch (shift2) {
                    case 0:
                        if (cValue < 3) {
                            shift2 = cValue + 1;
                        } else if (cValue < TEXT_BASIC_SET_CHARS.length) {
                            char textChar = TEXT_BASIC_SET_CHARS[cValue];
                            if (upperShift2) {
                                result.append((char) (textChar + 128));
                                upperShift2 = false;
                            } else {
                                result.append(textChar);
                            }
                        } else {
                            throw FormatException.getFormatInstance();
                        }
                        break;
                    case 1:
                        if (upperShift2) {
                            result.append((char) (cValue + 128));
                            upperShift2 = false;
                        } else {
                            result.append((char) cValue);
                        }
                        shift2 = 0;
                        break;
                    case 2:
                        if (cValue < TEXT_SHIFT2_SET_CHARS.length) {
                            char textChar2 = TEXT_SHIFT2_SET_CHARS[cValue];
                            if (upperShift2) {
                                result.append((char) (textChar2 + 128));
                                upperShift2 = false;
                            } else {
                                result.append(textChar2);
                            }
                        } else if (cValue == 27) {
                            result.append((char) 29);
                        } else if (cValue == 30) {
                            upperShift2 = true;
                        } else {
                            throw FormatException.getFormatInstance();
                        }
                        shift2 = 0;
                        break;
                    case 3:
                        if (cValue < TEXT_SHIFT3_SET_CHARS.length) {
                            char textChar3 = TEXT_SHIFT3_SET_CHARS[cValue];
                            if (upperShift2) {
                                result.append((char) (textChar3 + 128));
                                upperShift2 = false;
                            } else {
                                result.append(textChar3);
                            }
                            shift2 = 0;
                        } else {
                            throw FormatException.getFormatInstance();
                        }
                        break;
                    default:
                        throw FormatException.getFormatInstance();
                }
            }
            int i = bits.available();
            if (i > 0) {
                shift = shift2;
                upperShift = upperShift2;
            } else {
                return;
            }
        }
    }

    private static void decodeAnsiX12Segment(BitSource bits, StringBuilder result) throws FormatException {
        int firstByte;
        int[] cValues = new int[3];
        int i = 0;
        while (bits.available() != 8 && (firstByte = bits.readBits(8)) != 254) {
            parseTwoBytes(firstByte, bits.readBits(8), cValues);
            int cValue = i;
            for (int i2 = 0; i2 < 3; i2++) {
                int i3 = cValues[i2];
                cValue = i3;
                if (i3 == 0) {
                    result.append('\r');
                } else if (cValue == 1) {
                    result.append('*');
                } else if (cValue == 2) {
                    result.append('>');
                } else if (cValue == 3) {
                    result.append(' ');
                } else if (cValue < 14) {
                    result.append((char) (cValue + 44));
                } else if (cValue < 40) {
                    result.append((char) (cValue + 51));
                } else {
                    throw FormatException.getFormatInstance();
                }
            }
            int i4 = bits.available();
            if (i4 > 0) {
                i = cValue;
            } else {
                return;
            }
        }
    }

    private static void parseTwoBytes(int firstByte, int secondByte, int[] result) {
        int fullBitValue = ((firstByte << 8) + secondByte) - 1;
        int temp = fullBitValue / 1600;
        result[0] = temp;
        int fullBitValue2 = fullBitValue - (temp * 1600);
        int temp2 = fullBitValue2 / 40;
        result[1] = temp2;
        result[2] = fullBitValue2 - (temp2 * 40);
    }

    private static void decodeEdifactSegment(BitSource bits, StringBuilder result) {
        int i = 0;
        while (bits.available() > 16) {
            int edifactValue = i;
            for (int i2 = 0; i2 < 4; i2++) {
                int bits2 = bits.readBits(6);
                edifactValue = bits2;
                if (bits2 == 31) {
                    int bitsLeft = 8 - bits.getBitOffset();
                    if (bitsLeft != 8) {
                        bits.readBits(bitsLeft);
                        return;
                    }
                    return;
                }
                if ((edifactValue & 32) == 0) {
                    edifactValue |= 64;
                }
                result.append((char) edifactValue);
            }
            int i3 = bits.available();
            if (i3 > 0) {
                i = edifactValue;
            } else {
                return;
            }
        }
    }

    private static void decodeBase256Segment(BitSource bits, StringBuilder result, Collection<byte[]> byteSegments) throws FormatException {
        int count;
        int codewordPosition = bits.getByteOffset() + 1;
        int codewordPosition2 = codewordPosition + 1;
        int codewordPosition3 = unrandomize255State(bits.readBits(8), codewordPosition);
        int i = 0;
        if (codewordPosition3 == 0) {
            count = bits.available() / 8;
        } else if (codewordPosition3 < 250) {
            count = codewordPosition3;
        } else {
            count = unrandomize255State(bits.readBits(8), codewordPosition2) + ((codewordPosition3 - 249) * 250);
            codewordPosition2++;
        }
        if (count < 0) {
            throw FormatException.getFormatInstance();
        }
        byte[] bytes = new byte[count];
        while (i < count) {
            if (bits.available() < 8) {
                throw FormatException.getFormatInstance();
            }
            bytes[i] = (byte) unrandomize255State(bits.readBits(8), codewordPosition2);
            i++;
            codewordPosition2++;
        }
        byteSegments.add(bytes);
        try {
            result.append(new String(bytes, "ISO8859_1"));
        } catch (UnsupportedEncodingException uee) {
            throw new IllegalStateException("Platform does not support required encoding: " + uee);
        }
    }

    private static int unrandomize255State(int randomizedBase256Codeword, int base256CodewordPosition) {
        int pseudoRandomNumber = ((base256CodewordPosition * 149) % 255) + 1;
        int tempVariable = randomizedBase256Codeword - pseudoRandomNumber;
        return tempVariable >= 0 ? tempVariable : tempVariable + 256;
    }
}
