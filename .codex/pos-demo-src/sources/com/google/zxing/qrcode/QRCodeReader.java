package com.google.zxing.qrcode;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.ChecksumException;
import com.google.zxing.DecodeHintType;
import com.google.zxing.FormatException;
import com.google.zxing.NotFoundException;
import com.google.zxing.Reader;
import com.google.zxing.ReaderException;
import com.google.zxing.Result;
import com.google.zxing.ResultMetadataType;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.DecoderResult;
import com.google.zxing.common.DetectorResult;
import com.google.zxing.qrcode.decoder.Decoder;
import com.google.zxing.qrcode.decoder.QRCodeDecoderMetaData;
import com.google.zxing.qrcode.detector.Detector;
import java.util.List;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public class QRCodeReader implements Reader {
    private static final ResultPoint[] NO_POINTS = new ResultPoint[0];
    private final Decoder decoder = new Decoder();

    protected final Decoder getDecoder() {
        return this.decoder;
    }

    @Override // com.google.zxing.Reader
    public Result decode(BinaryBitmap image) throws NotFoundException, ChecksumException, FormatException {
        return decode(image, null);
    }

    @Override // com.google.zxing.Reader
    public final Result decode(BinaryBitmap image, Map<DecodeHintType, ?> hints) throws ReaderException {
        DecoderResult decoderResult;
        ResultPoint[] points;
        if (hints != null && hints.containsKey(DecodeHintType.PURE_BARCODE)) {
            BitMatrix bits = extractPureBits(image.getBlackMatrix());
            decoderResult = this.decoder.decode(bits, hints);
            points = NO_POINTS;
        } else {
            DetectorResult detectorResult = new Detector(image.getBlackMatrix()).detect(hints);
            decoderResult = this.decoder.decode(detectorResult.getBits(), hints);
            points = detectorResult.getPoints();
        }
        if (decoderResult.getOther() instanceof QRCodeDecoderMetaData) {
            ((QRCodeDecoderMetaData) decoderResult.getOther()).applyMirroredCorrection(points);
        }
        Result result = new Result(decoderResult.getText(), decoderResult.getRawBytes(), points, BarcodeFormat.QR_CODE);
        List<byte[]> byteSegments = decoderResult.getByteSegments();
        if (byteSegments != null) {
            result.putMetadata(ResultMetadataType.BYTE_SEGMENTS, byteSegments);
        }
        String ecLevel = decoderResult.getECLevel();
        if (ecLevel != null) {
            result.putMetadata(ResultMetadataType.ERROR_CORRECTION_LEVEL, ecLevel);
        }
        if (decoderResult.hasStructuredAppend()) {
            result.putMetadata(ResultMetadataType.STRUCTURED_APPEND_SEQUENCE, Integer.valueOf(decoderResult.getStructuredAppendSequenceNumber()));
            result.putMetadata(ResultMetadataType.STRUCTURED_APPEND_PARITY, Integer.valueOf(decoderResult.getStructuredAppendParity()));
        }
        return result;
    }

    @Override // com.google.zxing.Reader
    public void reset() {
    }

    private static BitMatrix extractPureBits(BitMatrix image) throws NotFoundException {
        int[] leftTopBlack;
        int[] leftTopBlack2 = image.getTopLeftOnBit();
        int[] rightBottomBlack = image.getBottomRightOnBit();
        if (leftTopBlack2 == null || rightBottomBlack == null) {
            throw NotFoundException.getNotFoundInstance();
        }
        float moduleSize = moduleSize(leftTopBlack2, image);
        int top = leftTopBlack2[1];
        int bottom = rightBottomBlack[1];
        int left = leftTopBlack2[0];
        int right = rightBottomBlack[0];
        if (left >= right || top >= bottom) {
            throw NotFoundException.getNotFoundInstance();
        }
        if (bottom - top != right - left) {
            int i = (bottom - top) + left;
            right = i;
            if (i >= image.getWidth()) {
                throw NotFoundException.getNotFoundInstance();
            }
        }
        int matrixWidth = Math.round(((right - left) + 1) / moduleSize);
        int matrixHeight = Math.round(((bottom - top) + 1) / moduleSize);
        if (matrixWidth <= 0 || matrixHeight <= 0) {
            throw NotFoundException.getNotFoundInstance();
        }
        if (matrixHeight != matrixWidth) {
            throw NotFoundException.getNotFoundInstance();
        }
        int nudge = (int) (moduleSize / 2.0f);
        int top2 = top + nudge;
        int i2 = left + nudge;
        int left2 = i2;
        int nudgedTooFarRight = (i2 + ((int) ((matrixWidth - 1) * moduleSize))) - right;
        if (nudgedTooFarRight > 0) {
            if (nudgedTooFarRight > nudge) {
                throw NotFoundException.getNotFoundInstance();
            }
            left2 -= nudgedTooFarRight;
        }
        int nudgedTooFarDown = (((int) ((matrixHeight - 1) * moduleSize)) + top2) - bottom;
        if (nudgedTooFarDown > 0) {
            if (nudgedTooFarDown > nudge) {
                throw NotFoundException.getNotFoundInstance();
            }
            top2 -= nudgedTooFarDown;
        }
        BitMatrix bits = new BitMatrix(matrixWidth, matrixHeight);
        int y = 0;
        while (y < matrixHeight) {
            int iOffset = ((int) (y * moduleSize)) + top2;
            int x = 0;
            while (true) {
                int x2 = x;
                leftTopBlack = leftTopBlack2;
                if (x2 < matrixWidth) {
                    int[] rightBottomBlack2 = rightBottomBlack;
                    if (image.get(((int) (x2 * moduleSize)) + left2, iOffset)) {
                        bits.set(x2, y);
                    }
                    x = x2 + 1;
                    leftTopBlack2 = leftTopBlack;
                    rightBottomBlack = rightBottomBlack2;
                }
            }
            y++;
            leftTopBlack2 = leftTopBlack;
        }
        return bits;
    }

    private static float moduleSize(int[] leftTopBlack, BitMatrix image) throws NotFoundException {
        int height = image.getHeight();
        int width = image.getWidth();
        int x = leftTopBlack[0];
        int y = leftTopBlack[1];
        boolean inBlack = true;
        int y2 = y;
        int y3 = x;
        int transitions = 0;
        while (y3 < width && y2 < height) {
            if (inBlack != image.get(y3, y2)) {
                transitions++;
                if (transitions == 5) {
                    break;
                }
                inBlack = !inBlack;
            }
            y3++;
            y2++;
        }
        if (y3 == width || y2 == height) {
            throw NotFoundException.getNotFoundInstance();
        }
        return (y3 - leftTopBlack[0]) / 7.0f;
    }
}
