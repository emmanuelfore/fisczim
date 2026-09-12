package com.google.zxing.aztec.encoder;

import android.support.v4.media.TransportMediator;
import com.google.zxing.common.BitArray;
import java.lang.reflect.Array;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;

/* JADX INFO: loaded from: classes.dex */
public final class HighLevelEncoder {
    private static final int[][] CHAR_MAP;
    static final int MODE_DIGIT = 2;
    static final int MODE_LOWER = 1;
    static final int MODE_MIXED = 3;
    static final int MODE_PUNCT = 4;
    static final int MODE_UPPER = 0;
    static final int[][] SHIFT_TABLE;
    private final byte[] text;
    static final String[] MODE_NAMES = {"UPPER", "LOWER", "DIGIT", "MIXED", "PUNCT"};
    static final int[][] LATCH_TABLE = {new int[]{0, 327708, 327710, 327709, 656318}, new int[]{590318, 0, 327710, 327709, 656318}, new int[]{262158, 590300, 0, 590301, 932798}, new int[]{327709, 327708, 656318, 0, 327710}, new int[]{327711, 656380, 656382, 656381, 0}};

    static {
        int[][] iArr = (int[][]) Array.newInstance((Class<?>) int.class, 5, 256);
        CHAR_MAP = iArr;
        iArr[0][32] = 1;
        for (int c = 65; c <= 90; c++) {
            CHAR_MAP[0][c] = (c - 65) + 2;
        }
        CHAR_MAP[1][32] = 1;
        for (int c2 = 97; c2 <= 122; c2++) {
            CHAR_MAP[1][c2] = (c2 - 97) + 2;
        }
        CHAR_MAP[2][32] = 1;
        for (int c3 = 48; c3 <= 57; c3++) {
            CHAR_MAP[2][c3] = (c3 - 48) + 2;
        }
        CHAR_MAP[2][44] = 12;
        CHAR_MAP[2][46] = 13;
        int[] mixedTable = {0, 32, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 27, 28, 29, 30, 31, 64, 92, 94, 95, 96, 124, TransportMediator.KEYCODE_MEDIA_PLAY, TransportMediator.KEYCODE_MEDIA_PAUSE};
        for (int i = 0; i < 28; i++) {
            CHAR_MAP[3][mixedTable[i]] = i;
        }
        int[] punctTable = {0, 13, 0, 0, 0, 0, 33, 39, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 58, 59, 60, 61, 62, 63, 91, 93, 123, 125};
        for (int i2 = 0; i2 < 31; i2++) {
            if (punctTable[i2] > 0) {
                CHAR_MAP[4][punctTable[i2]] = i2;
            }
        }
        int[][] iArr2 = (int[][]) Array.newInstance((Class<?>) int.class, 6, 6);
        SHIFT_TABLE = iArr2;
        for (int[] iArr3 : iArr2) {
            Arrays.fill(iArr3, -1);
        }
        SHIFT_TABLE[0][4] = 0;
        SHIFT_TABLE[1][4] = 0;
        SHIFT_TABLE[1][0] = 28;
        SHIFT_TABLE[3][4] = 0;
        SHIFT_TABLE[2][4] = 0;
        SHIFT_TABLE[2][0] = 15;
    }

    public HighLevelEncoder(byte[] text) {
        this.text = text;
    }

    public BitArray encode() {
        int pairCode;
        Collection<State> states = Collections.singletonList(State.INITIAL_STATE);
        Collection<State> states2 = states;
        int index = 0;
        while (index < this.text.length) {
            int nextChar = index + 1 < this.text.length ? this.text[index + 1] : 0;
            byte b = this.text[index];
            if (b == 13) {
                pairCode = nextChar == 10 ? 2 : 0;
            } else if (b == 44) {
                pairCode = nextChar == 32 ? 4 : 0;
            } else if (b == 46) {
                pairCode = nextChar == 32 ? 3 : 0;
            } else {
                pairCode = (b == 58 && nextChar == 32) ? 5 : 0;
            }
            if (pairCode > 0) {
                states2 = updateStateListForPair(states2, index, pairCode);
                index++;
            } else {
                states2 = updateStateListForChar(states2, index);
            }
            index++;
        }
        return ((State) Collections.min(states2, new Comparator<State>() { // from class: com.google.zxing.aztec.encoder.HighLevelEncoder.1
            @Override // java.util.Comparator
            public int compare(State a, State b2) {
                return a.getBitCount() - b2.getBitCount();
            }
        })).toBitArray(this.text);
    }

    private Collection<State> updateStateListForChar(Iterable<State> states, int index) {
        Collection<State> result = new LinkedList<>();
        for (State state : states) {
            updateStateForChar(state, index, result);
        }
        return simplifyStates(result);
    }

    private void updateStateForChar(State state, int index, Collection<State> result) {
        char ch = (char) (this.text[index] & 255);
        boolean charInCurrentTable = CHAR_MAP[state.getMode()][ch] > 0;
        State stateNoBinary = null;
        for (int mode = 0; mode <= 4; mode++) {
            int charInMode = CHAR_MAP[mode][ch];
            if (charInMode > 0) {
                if (stateNoBinary == null) {
                    stateNoBinary = state.endBinaryShift(index);
                }
                if (!charInCurrentTable || mode == state.getMode() || mode == 2) {
                    State latchState = stateNoBinary.latchAndAppend(mode, charInMode);
                    result.add(latchState);
                }
                if (!charInCurrentTable && SHIFT_TABLE[state.getMode()][mode] >= 0) {
                    State shiftState = stateNoBinary.shiftAndAppend(mode, charInMode);
                    result.add(shiftState);
                }
            }
        }
        int mode2 = state.getBinaryShiftByteCount();
        if (mode2 > 0 || CHAR_MAP[state.getMode()][ch] == 0) {
            State binaryState = state.addBinaryShiftChar(index);
            result.add(binaryState);
        }
    }

    private static Collection<State> updateStateListForPair(Iterable<State> states, int index, int pairCode) {
        Collection<State> result = new LinkedList<>();
        Iterator<State> it = states.iterator();
        while (it.hasNext()) {
            updateStateForPair(it.next(), index, pairCode, result);
        }
        return simplifyStates(result);
    }

    private static void updateStateForPair(State state, int index, int pairCode, Collection<State> result) {
        State stateNoBinary = state.endBinaryShift(index);
        result.add(stateNoBinary.latchAndAppend(4, pairCode));
        if (state.getMode() != 4) {
            result.add(stateNoBinary.shiftAndAppend(4, pairCode));
        }
        if (pairCode == 3 || pairCode == 4) {
            State digitState = stateNoBinary.latchAndAppend(2, 16 - pairCode).latchAndAppend(2, 1);
            result.add(digitState);
        }
        if (state.getBinaryShiftByteCount() > 0) {
            State binaryState = state.addBinaryShiftChar(index).addBinaryShiftChar(index + 1);
            result.add(binaryState);
        }
    }

    private static Collection<State> simplifyStates(Iterable<State> states) {
        List<State> result = new LinkedList<>();
        for (State newState : states) {
            boolean add = true;
            Iterator<State> iterator = result.iterator();
            while (true) {
                if (!iterator.hasNext()) {
                    break;
                }
                State oldState = iterator.next();
                if (oldState.isBetterThanOrEqualTo(newState)) {
                    add = false;
                    break;
                }
                if (newState.isBetterThanOrEqualTo(oldState)) {
                    iterator.remove();
                }
            }
            if (add) {
                result.add(newState);
            }
        }
        return result;
    }
}
