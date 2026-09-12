package com.google.zxing.oned;

/* JADX INFO: loaded from: classes.dex */
public final class CodaBarWriter extends OneDimensionalCodeWriter {
    private static final char[] START_END_CHARS = {'A', 'B', 'C', 'D'};
    private static final char[] ALT_START_END_CHARS = {'T', 'N', '*', 'E'};
    private static final char[] CHARS_WHICH_ARE_TEN_LENGTH_EACH_AFTER_DECODED = {'/', ':', '+', '.'};
    private static final char DEFAULT_GUARD = START_END_CHARS[0];

    @Override // com.google.zxing.oned.OneDimensionalCodeWriter
    public boolean[] encode(String contents) {
        if (contents.length() < 2) {
            contents = DEFAULT_GUARD + contents + DEFAULT_GUARD;
        } else {
            char firstChar = Character.toUpperCase(contents.charAt(0));
            char lastChar = Character.toUpperCase(contents.charAt(contents.length() - 1));
            boolean startsNormal = CodaBarReader.arrayContains(START_END_CHARS, firstChar);
            boolean endsNormal = CodaBarReader.arrayContains(START_END_CHARS, lastChar);
            boolean startsAlt = CodaBarReader.arrayContains(ALT_START_END_CHARS, firstChar);
            boolean endsAlt = CodaBarReader.arrayContains(ALT_START_END_CHARS, lastChar);
            if (startsNormal) {
                if (!endsNormal) {
                    throw new IllegalArgumentException("Invalid start/end guards: " + contents);
                }
            } else if (startsAlt) {
                if (!endsAlt) {
                    throw new IllegalArgumentException("Invalid start/end guards: " + contents);
                }
            } else {
                if (endsNormal || endsAlt) {
                    throw new IllegalArgumentException("Invalid start/end guards: " + contents);
                }
                contents = DEFAULT_GUARD + contents + DEFAULT_GUARD;
            }
        }
        int resultLength = 20;
        for (int resultLength2 = 1; resultLength2 < contents.length() - 1; resultLength2++) {
            if (Character.isDigit(contents.charAt(resultLength2)) || contents.charAt(resultLength2) == '-' || contents.charAt(resultLength2) == '$') {
                resultLength += 9;
            } else if (CodaBarReader.arrayContains(CHARS_WHICH_ARE_TEN_LENGTH_EACH_AFTER_DECODED, contents.charAt(resultLength2))) {
                resultLength += 10;
            } else {
                throw new IllegalArgumentException("Cannot encode : '" + contents.charAt(resultLength2) + '\'');
            }
        }
        int i = contents.length();
        boolean[] result = new boolean[(i - 1) + resultLength];
        int position = 0;
        for (int position2 = 0; position2 < contents.length(); position2++) {
            char c = Character.toUpperCase(contents.charAt(position2));
            if (position2 == 0 || position2 == contents.length() - 1) {
                if (c == '*') {
                    c = 'C';
                } else if (c == 'E') {
                    c = 'D';
                } else if (c == 'N') {
                    c = 'B';
                } else if (c == 'T') {
                    c = 'A';
                }
            }
            int code = 0;
            int i2 = 0;
            while (true) {
                if (i2 >= CodaBarReader.ALPHABET.length) {
                    break;
                }
                if (c != CodaBarReader.ALPHABET[i2]) {
                    i2++;
                } else {
                    code = CodaBarReader.CHARACTER_ENCODINGS[i2];
                    break;
                }
            }
            int counter = 0;
            boolean color = true;
            int position3 = position;
            int position4 = 0;
            while (position4 < 7) {
                result[position3] = color;
                position3++;
                if (((code >> (6 - position4)) & 1) == 0 || counter == 1) {
                    color = !color;
                    position4++;
                    counter = 0;
                } else {
                    counter++;
                }
            }
            if (position2 < contents.length() - 1) {
                result[position3] = false;
                position3++;
            }
            position = position3;
        }
        return result;
    }
}
