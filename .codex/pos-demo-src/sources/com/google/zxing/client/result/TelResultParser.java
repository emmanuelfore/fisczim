package com.google.zxing.client.result;

import com.google.zxing.Result;

/* JADX INFO: loaded from: classes.dex */
public final class TelResultParser extends ResultParser {
    @Override // com.google.zxing.client.result.ResultParser
    public TelParsedResult parse(Result result) {
        String telURI;
        String rawText = getMassagedText(result);
        if (!rawText.startsWith("tel:") && !rawText.startsWith("TEL:")) {
            return null;
        }
        if (rawText.startsWith("TEL:")) {
            telURI = "tel:" + rawText.substring(4);
        } else {
            telURI = rawText;
        }
        int queryStart = rawText.indexOf(63, 4);
        String number = queryStart < 0 ? rawText.substring(4) : rawText.substring(4, queryStart);
        return new TelParsedResult(number, telURI, null);
    }
}
