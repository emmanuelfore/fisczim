package com.google.zxing.oned.rss.expanded;

import com.google.zxing.common.BitArray;
import java.util.List;

/* JADX INFO: loaded from: classes.dex */
final class BitArrayBuilder {
    private BitArrayBuilder() {
    }

    static BitArray buildBitArray(List<ExpandedPair> pairs) {
        int charNumber = (pairs.size() << 1) - 1;
        if (pairs.get(pairs.size() - 1).getRightChar() == null) {
            charNumber--;
        }
        int size = charNumber * 12;
        BitArray binary = new BitArray(size);
        int firstValue = pairs.get(0).getRightChar().getValue();
        int accPos = 0;
        for (int accPos2 = 11; accPos2 >= 0; accPos2--) {
            if (((1 << accPos2) & firstValue) != 0) {
                binary.set(accPos);
            }
            accPos++;
        }
        int rightValue = accPos;
        for (int i = 1; i < pairs.size(); i++) {
            ExpandedPair currentPair = pairs.get(i);
            int leftValue = currentPair.getLeftChar().getValue();
            int accPos3 = rightValue;
            for (int accPos4 = 11; accPos4 >= 0; accPos4--) {
                if (((1 << accPos4) & leftValue) != 0) {
                    binary.set(accPos3);
                }
                accPos3++;
            }
            if (currentPair.getRightChar() != null) {
                int rightValue2 = currentPair.getRightChar().getValue();
                int accPos5 = accPos3;
                for (int accPos6 = 11; accPos6 >= 0; accPos6--) {
                    if (((1 << accPos6) & rightValue2) != 0) {
                        binary.set(accPos5);
                    }
                    accPos5++;
                }
                rightValue = accPos5;
            } else {
                rightValue = accPos3;
            }
        }
        return binary;
    }
}
