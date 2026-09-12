package com.google.zxing.qrcode.decoder;

import com.google.zxing.ChecksumException;
import com.google.zxing.DecodeHintType;
import com.google.zxing.FormatException;
import com.google.zxing.ReaderException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.DecoderResult;
import com.google.zxing.common.reedsolomon.GenericGF;
import com.google.zxing.common.reedsolomon.ReedSolomonDecoder;
import com.google.zxing.common.reedsolomon.ReedSolomonException;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public final class Decoder {
    private final ReedSolomonDecoder rsDecoder = new ReedSolomonDecoder(GenericGF.QR_CODE_FIELD_256);

    public DecoderResult decode(boolean[][] image) throws ChecksumException, FormatException {
        return decode(image, (Map<DecodeHintType, ?>) null);
    }

    public DecoderResult decode(boolean[][] image, Map<DecodeHintType, ?> hints) throws ChecksumException, FormatException {
        int dimension = image.length;
        BitMatrix bits = new BitMatrix(dimension);
        for (int i = 0; i < dimension; i++) {
            for (int j = 0; j < dimension; j++) {
                if (image[i][j]) {
                    bits.set(j, i);
                }
            }
        }
        return decode(bits, hints);
    }

    public DecoderResult decode(BitMatrix bits) throws ChecksumException, FormatException {
        return decode(bits, (Map<DecodeHintType, ?>) null);
    }

    public DecoderResult decode(BitMatrix bits, Map<DecodeHintType, ?> hints) throws ReaderException {
        BitMatrixParser parser = new BitMatrixParser(bits);
        FormatException fe = null;
        ChecksumException ce = null;
        try {
            return decode(parser, hints);
        } catch (ChecksumException e) {
            ce = e;
            try {
                parser.remask();
                parser.setMirror(true);
                parser.readVersion();
                parser.readFormatInformation();
                parser.mirror();
                DecoderResult result = decode(parser, hints);
                result.setOther(new QRCodeDecoderMetaData(true));
                return result;
            } catch (ChecksumException | FormatException e2) {
                if (fe != null) {
                    throw fe;
                }
                if (ce != null) {
                    throw ce;
                }
                throw e2;
            }
        } catch (FormatException e3) {
            fe = e3;
            parser.remask();
            parser.setMirror(true);
            parser.readVersion();
            parser.readFormatInformation();
            parser.mirror();
            DecoderResult result2 = decode(parser, hints);
            result2.setOther(new QRCodeDecoderMetaData(true));
            return result2;
        }
    }

    private DecoderResult decode(BitMatrixParser parser, Map<DecodeHintType, ?> hints) throws ChecksumException, FormatException {
        Version version = parser.readVersion();
        ErrorCorrectionLevel ecLevel = parser.readFormatInformation().getErrorCorrectionLevel();
        DataBlock[] dataBlocks = DataBlock.getDataBlocks(parser.readCodewords(), version, ecLevel);
        int totalBytes = 0;
        for (DataBlock dataBlock : dataBlocks) {
            totalBytes += dataBlock.getNumDataCodewords();
        }
        byte[] resultBytes = new byte[totalBytes];
        int length = dataBlocks.length;
        int resultOffset = 0;
        int resultOffset2 = 0;
        while (resultOffset2 < length) {
            DataBlock dataBlock2 = dataBlocks[resultOffset2];
            byte[] codewordBytes = dataBlock2.getCodewords();
            int numDataCodewords = dataBlock2.getNumDataCodewords();
            correctErrors(codewordBytes, numDataCodewords);
            int resultOffset3 = resultOffset;
            int resultOffset4 = 0;
            while (resultOffset4 < numDataCodewords) {
                resultBytes[resultOffset3] = codewordBytes[resultOffset4];
                resultOffset4++;
                resultOffset3++;
            }
            resultOffset2++;
            resultOffset = resultOffset3;
        }
        return DecodedBitStreamParser.decode(resultBytes, version, ecLevel, hints);
    }

    private void correctErrors(byte[] codewordBytes, int numDataCodewords) throws ChecksumException {
        int numCodewords = codewordBytes.length;
        int[] codewordsInts = new int[numCodewords];
        for (int i = 0; i < numCodewords; i++) {
            codewordsInts[i] = codewordBytes[i] & 255;
        }
        try {
            this.rsDecoder.decode(codewordsInts, codewordBytes.length - numDataCodewords);
            for (int i2 = 0; i2 < numDataCodewords; i2++) {
                codewordBytes[i2] = (byte) codewordsInts[i2];
            }
        } catch (ReedSolomonException e) {
            throw ChecksumException.getChecksumInstance();
        }
    }
}
